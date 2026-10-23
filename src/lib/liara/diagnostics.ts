import { diskUsagePercent } from "./client";
import type {
  Applet,
  Domain,
  LiaraPlan,
  LogEntry,
  MetricsSummary,
  ProjectDetail,
  Release,
} from "./types";

export type Severity = "critical" | "warning" | "healthy" | "unknown";

export type DiagnosisAction = {
  actionType:
    | "restart_app"
    | "scale_app"
    | "change_plan"
    | "update_envs"
    | "deploy_source"
    | "add_domain"
    | "enable_ssl"
    | "create_disk"
    | "resize_disk";
  risk: "medium" | "high";
  title: string;
  why: string;
  params: Record<string, unknown>;
  automatic: boolean;
};

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  confidence: number;
  explanation: string;
  evidence: string[];
  recommendations: DiagnosisAction[];
};

export type DiagnosisResult = {
  severity: Severity;
  headline: string;
  summary: string;
  confidence: number;
  findings: Finding[];
  signals: {
    cpuPercent: number | null;
    cpuPeakPercent: number | null;
    memoryPercent: number | null;
    memoryPeakPercent: number | null;
    diskPercent: number | null;
    errorCount: number;
    logCount: number;
    releaseState: string | null;
    appState: string;
    scale: number;
  };
  generatedAt: string;
};

export type DiagnosisInput = {
  project: ProjectDetail;
  plan?: LiaraPlan;
  releases: Release[];
  applets: Applet[];
  logs: LogEntry[];
  metrics: MetricsSummary;
  domains: Domain[];
  now?: number;
};

const PATTERNS = {
  oom: /out of memory|oomkill|oom killed|heap out of memory|javascript heap|allocation failed|memory limit/i,
  db: /econnrefused|etimedout|enotfound|connection refused|connection timeout|too many connections|could not connect|database.*(error|unreachable)|mongo|postgres|mysql|redis/i,
  dbError: /econnrefused|etimedout|enotfound|connection refused|too many connections|authentication failed|could not connect/i,
  env: /missing env|environment variable|undefined env|is not defined|not configured|no such file or directory.*\.env/i,
  port: /eaddrinuse|address already in use|listen eacces|port.*in use|health ?check failed|unhealthy|connection reset/i,
  disk: /enospc|no space left|disk full|quota exceeded/i,
  build: /build failed|npm err|elifecycle|yarn.*error|compilation failed|cannot find module|module not found/i,
  auth: /unauthorized|forbidden|invalid token|jwt expired|401|403/i,
  cors: /cors|access-control-allow-origin/i,
  tls: /certificate|ssl|tls handshake|self signed/i,
  error5xx: /\b5\d\d\b|internal server error|bad gateway|service unavailable|gateway timeout/i,
  crash: /segmentation fault|panic|fatal|uncaught exception|unhandled rejection|process exited|restarting/i,
} as const;

const SIGNAL_LABELS: Array<[keyof typeof PATTERNS, string]> = [
  ["oom", "خطای کمبود حافظه"],
  ["db", "خطای دیتابیس/اتصال"],
  ["env", "متغیر محیطی ناقص"],
  ["port", "پورت یا health check"],
  ["disk", "کمبود دیسک"],
  ["build", "خطای بیلد"],
  ["auth", "خطای احراز هویت"],
  ["cors", "خطای CORS"],
  ["tls", "خطای SSL/TLS"],
  ["error5xx", "خطای 5xx"],
  ["crash", "کرش/خروج فرایند"],
];

export function diagnose(input: DiagnosisInput): DiagnosisResult {
  const { project, plan, releases, applets, logs, metrics, domains } = input;
  const findings: Finding[] = [];
  const cleanLogs = logs.map((l) => ({ ...l, message: redactLog(l.message) }));
  const errorLines = cleanLogs.filter((l) => PATTERNS.error5xx.test(l.message));
  const signalCounts = countSignals(cleanLogs);

  const cpuStats = stats(metrics.cpu);
  const memoryStats = stats(metrics.memory);
  const cpuPercent = cpuLevel(cpuStats.avg, plan);
  const cpuPeakPercent = cpuLevel(cpuStats.max, plan);
  const memoryPercent = memoryLevel(memoryStats.avg, plan);
  const memoryPeakPercent = memoryLevel(memoryStats.max, plan);
  const diskPercent = worstDiskPercent(metrics);

  const latestRelease = releases[0];
  const releaseState = latestRelease?.state ?? null;

  // --- hard state findings ---

  if (project.scale === 0) {
    findings.push({
      id: "app_stopped",
      title: "برنامه خاموش است",
      severity: "critical",
      confidence: 0.98,
      explanation:
        "مقدار scale برنامه صفر است؛ یعنی کانتینر برنامه در حال اجرا نیست و هر درخواست کاربر با خطا مواجه می‌شود.",
      evidence: [`scale = ${project.scale}`, `وضعیت: ${project.status}`],
      recommendations: [
        {
          actionType: "scale_app",
          risk: "high",
          title: "روشن کردن برنامه",
          why: "برنامه باید حداقل با یک نمونه اجرا شود تا درخواست‌ها پاسخ بگیرند.",
          params: { app: project.name, scale: 1 },
          automatic: false,
        },
      ],
    });
  }

  if (releaseState && ["FAILED", "UNHEALTHY", "CANCELED", "TIMEDOUT"].includes(releaseState)) {
    findings.push({
      id: "release_failed",
      title:
        releaseState === "UNHEALTHY"
          ? "نسخه‌ی جدید ناسالم است"
          : "آخرین استقرار ناموفق بوده",
      severity: "critical",
      confidence: 0.95,
      explanation:
        "آخرین release در وضعیت پایانی ناموفق قرار دارد. این وضعیت معمولاً یعنی بیلد یا اجرای کانتینر شکست خورده و ترافیک روی نسخه‌ی قبلی یا هیچ نسخه‌ای نیست.",
      evidence: [
        `release: ${latestRelease?.id ?? "—"}`,
        `state: ${releaseState}`,
        ...(latestRelease?.failReason ? [`failReason: ${latestRelease.failReason}`] : []),
      ],
      recommendations: [
        {
          actionType: "deploy_source",
          risk: "high",
          title: "استقرار مجدد پس از رفع خطا",
          why: "پس از اصلاح علت شکست بیلد، یک استقرار جدید انجام دهید.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  const unhealthyApplets = applets.filter((applet) =>
    /FAILED|ERROR|UNHEALTHY|CRASH|STOPPED/i.test(applet.state),
  );
  if (unhealthyApplets.length) {
    findings.push({
      id: "applet_unhealthy",
      title: "نمونه‌ی در حال اجرا سالم نیست",
      severity: unhealthyApplets.some((a) => /FAILED|ERROR|CRASH/i.test(a.state))
        ? "critical"
        : "warning",
      confidence: 0.82,
      explanation:
        "وضعیت appletهای برنامه سالم نیست. ممکن است کانتینر در حال restart باشد یا health check را رد کرده باشد.",
      evidence: unhealthyApplets.slice(0, 4).map(
        (applet) =>
          `${applet.name || applet.id}: ${applet.state}${applet.reason ? ` (${applet.reason})` : ""}`,
      ),
      recommendations: [
        {
          actionType: "restart_app",
          risk: "medium",
          title: "ری‌استارت کنترل‌شده",
          why: "اگر applet در وضعیت نامناسب گیر کرده است، یک restart وضعیت را بازنشانی می‌کند.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  if (releaseState && ["BUILDING", "DEPLOYING", "QUEUED"].includes(releaseState)) {
    findings.push({
      id: "release_in_progress",
      title: "استقرار در جریان است",
      severity: "warning",
      confidence: 0.9,
      explanation:
        "یک نسخه‌ی جدید در حال بیلد یا انتشار است. تا پایان آن، وضعیت سرویس ممکن است ناپایدار باشد.",
      evidence: [`state: ${releaseState}`],
      recommendations: [],
    });
  }

  // --- resource findings ---

  const memoryPressure = Math.max(memoryPercent ?? 0, memoryPeakPercent ?? 0);
  if (memoryPressure >= 85) {
    findings.push({
      id: "memory_pressure",
      title: "فشار حافظه",
      severity: memoryPressure >= 95 ? "critical" : "warning",
      confidence: memoryPressure >= 95 ? 0.88 : 0.78,
      explanation:
        "مصرف حافظه به سقف پلن نزدیک شده است. این وضعیت می‌تواند باعث کندی، restart شدن کانتینر یا خطای 502/500 شود.",
      evidence: [
        `میانگین مصرف حافظه: ${Math.round(memoryPercent ?? 0)}٪`,
        `اوج مصرف: ${Math.round(memoryPeakPercent ?? memoryPercent ?? 0)}٪`,
        plan ? `حافظه‌ی پلن: ${plan.ram} گیگابایت` : "اطلاعات پلن در دسترس نیست",
        ...(signalCounts.oom ? ["در لاگ‌ها نشانه‌ی OOM دیده شد."] : []),
      ],
      recommendations: [
        ...(plan
          ? [
              {
                actionType: "change_plan" as const,
                risk: "high" as const,
                title: "ارتقای پلن",
                why: "اگر مصرف حافظه پایدار است، ارتقای پلن سریع‌ترین راه جلوگیری از کرش است.",
                params: { app: project.name, currentPlanID: plan.id },
                automatic: false,
              },
            ]
          : []),
        {
          actionType: "restart_app",
          risk: "medium",
          title: "ری‌استارت برنامه",
          why: "برای آزادسازی حافظه‌ی تجمع‌یافته، اگر مشکل حاد است.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  const cpuPressure = Math.max(cpuPercent ?? 0, cpuPeakPercent ?? 0);
  if (cpuPressure >= 85) {
    findings.push({
      id: "cpu_saturation",
      title: "اشباع CPU",
      severity: cpuPressure >= 95 ? "critical" : "warning",
      confidence: cpuPressure >= 95 ? 0.85 : 0.72,
      explanation:
        "مصرف CPU به سقف پلن نزدیک است. این وضعیت باعث افزایش زمان پاسخ و تایم‌اوت می‌شود.",
      evidence: [
        `میانگین مصرف CPU: ${Math.round(cpuPercent ?? 0)}٪`,
        `اوج: ${Math.round(cpuPeakPercent ?? cpuPercent ?? 0)}٪`,
        plan ? `CPU پلن: ${plan.cpu} هسته` : "اطلاعات پلن در دسترس نیست",
      ],
      recommendations: plan
        ? [
            {
              actionType: "change_plan",
              risk: "high",
              title: "ارتقای پلن یا افزایش منابع",
              why: "برای ترافیک پایدار، ارتقای CPU/حافظه توصیه می‌شود.",
              params: { app: project.name, currentPlanID: plan.id },
              automatic: false,
            },
          ]
        : [],
    });
  }

  if (diskPercent !== null && diskPercent >= 80) {
    findings.push({
      id: "disk_pressure",
      title: "کمبود فضای دیسک",
      severity: diskPercent >= 90 ? "critical" : "warning",
      confidence: 0.82,
      explanation:
        "فضای دیسک در حال پر شدن است. اگر به 100٪ برسد، نوشتن فایل، آپلود و گاهی اجرای برنامه مختل می‌شود.",
      evidence: [
        ...metrics.disks.map((d) => `${d.name}: ${d.usage} از ${d.size}`),
      ],
      recommendations: [
        {
          actionType: "create_disk",
          risk: "high",
          title: "افزودن یا بزرگ‌کردن دیسک",
          why: "برای داده‌های پایدار، فضای بیشتری اختصاص دهید.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  // --- log findings ---

  if (signalCounts.oom) {
    findings.push({
      id: "oom_signal",
      title: "نشانه‌ی تمام‌شدن حافظه در لاگ",
      severity: "critical",
      confidence: 0.9,
      explanation:
        "پیام‌های OOM یا heap out of memory نشان می‌دهند فرایند به سقف حافظه رسیده است. این می‌تواند ناشی از نشتی حافظه یا پلن کوچک باشد.",
      evidence: evidenceFor(cleanLogs, PATTERNS.oom),
      recommendations: [
        {
          actionType: "restart_app",
          risk: "medium",
          title: "ری‌استارت موقت",
          why: "برای بازگرداندن سرویس در کوتاه‌مدت.",
          params: { app: project.name },
          automatic: false,
        },
        ...(plan
          ? [
              {
                actionType: "change_plan" as const,
                risk: "high" as const,
                title: "ارتقای پلن",
                why: "اگر مصرف حافظه به‌طور پایدار بالاست.",
                params: { app: project.name, currentPlanID: plan.id },
                automatic: false,
              },
            ]
          : []),
      ],
    });
  }

  if (signalCounts.dbError) {
    findings.push({
      id: "database_connectivity",
      title: "خطای اتصال به دیتابیس",
      severity: "critical",
      confidence: 0.84,
      explanation:
        "لاگ‌ها خطای اتصال/تایم‌اوت دیتابیس را نشان می‌دهند. ممکن است دیتابیس خاموش باشد، رشته‌ی اتصال اشتباه باشد یا محدودیت اتصال فعال شده باشد.",
      evidence: evidenceFor(cleanLogs, PATTERNS.dbError),
      recommendations: [
        {
          actionType: "update_envs",
          risk: "high",
          title: "بررسی و اصلاح متغیرهای اتصال",
          why: "مقدارهای DATABASE_URL و شبکه‌ی خصوصی/عمومی را بررسی کنید.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  if (signalCounts.env) {
    findings.push({
      id: "missing_env",
      title: "متغیر محیطی ناقص",
      severity: "warning",
      confidence: 0.72,
      explanation:
        "لاگ‌ها به متغیر محیطی تعریف‌نشده یا ناقص اشاره می‌کنند. برنامه بدون مقدار درست نمی‌تواند اجرا شود.",
      evidence: evidenceFor(cleanLogs, PATTERNS.env),
      recommendations: [
        {
          actionType: "update_envs",
          risk: "high",
          title: "تنظیم متغیرهای محیطی",
          why: "کلیدهای لازم را با تأیید شما اضافه یا اصلاح می‌کنیم.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  if (signalCounts.port) {
    findings.push({
      id: "port_or_healthcheck",
      title: "احتمال اشتباه بودن پورت یا health check",
      severity: "warning",
      confidence: 0.68,
      explanation:
        "برنامه ممکن است روی پورتی غیر از پورت اعلام‌شده گوش ندهد یا health check شکست بخورد. این حالت معمولاً باعث 502/504 می‌شود.",
      evidence: evidenceFor(cleanLogs, PATTERNS.port),
      recommendations: [],
    });
  }

  if (signalCounts.build) {
    findings.push({
      id: "build_error",
      title: "خطای بیلد در لاگ",
      severity: "warning",
      confidence: 0.7,
      explanation:
        "خطاهای بیلد معمولاً به وابستگی، نسخه‌ی Node/PHP/Python یا فایل‌های ناقص مربوط هستند.",
      evidence: evidenceFor(cleanLogs, PATTERNS.build),
      recommendations: [],
    });
  }

  if (signalCounts.crash) {
    findings.push({
      id: "crash_loop",
      title: "کرش یا خروج غیرمنتظره‌ی فرایند",
      severity: "critical",
      confidence: 0.82,
      explanation:
        "لاگ‌ها خروج فرایند، panic یا unhandled exception را نشان می‌دهند. کانتینر ممکن است در حلقه‌ی restart باشد.",
      evidence: evidenceFor(cleanLogs, PATTERNS.crash),
      recommendations: [
        {
          actionType: "restart_app",
          risk: "medium",
          title: "ری‌استارت کنترل‌شده",
          why: "اگر کانتینر در وضعیت نامناسب گیر کرده است.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  if (errorLines.length >= 3) {
    const rate = cleanLogs.length ? (errorLines.length / cleanLogs.length) * 100 : 0;
    findings.push({
      id: "http_5xx",
      title: "خطاهای 5xx در لاگ",
      severity: rate >= 10 ? "critical" : "warning",
      confidence: rate >= 10 ? 0.8 : 0.62,
      explanation:
        "تعداد خطاهای 5xx در بازه‌ی بررسی‌شده قابل توجه است. علت می‌تواند خطای برنامه، دیتابیس، تایم‌اوت یا منابع باشد.",
      evidence: [
        `${errorLines.length} خطای 5xx از ${cleanLogs.length} خط لاگ (${Math.round(rate)}٪)`,
        ...evidenceFor(cleanLogs, PATTERNS.error5xx, 3),
      ],
      recommendations: [],
    });
  }

  if (signalCounts.tls) {
    findings.push({
      id: "tls_error",
      title: "خطای SSL/TLS",
      severity: "warning",
      confidence: 0.65,
      explanation:
        "لاگ‌ها یا وضعیت دامنه به مشکل گواهی اشاره می‌کند. ممکن است رکورد DNS یا صدور گواهی کامل نشده باشد.",
      evidence: evidenceFor(cleanLogs, PATTERNS.tls),
      recommendations: [
        {
          actionType: "enable_ssl",
          risk: "medium",
          title: "بررسی و فعال‌سازی SSL",
          why: "گواهی دامنه را از لیارا درخواست و وضعیت آن را بررسی کنید.",
          params: { app: project.name },
          automatic: false,
        },
      ],
    });
  }

  const trafficSpike = detectTrafficSpike(metrics);
  if (trafficSpike) {
    findings.push({
      id: "traffic_spike",
      title: "افزایش ناگهانی ترافیک",
      severity: "warning",
      confidence: 0.6,
      explanation:
        "حجم ترافیک شبکه در نیمه‌ی دوم بازه، رشد چشمگیری داشته است. اگر با کندی همزمان است، احتمالاً به منابع بیشتری نیاز دارید.",
      evidence: [trafficSpike],
      recommendations: plan
        ? [
            {
              actionType: "change_plan",
              risk: "high",
              title: "ارتقای پلن",
              why: "برای جذب ترافیک بیشتر بدون افت کیفیت.",
              params: { app: project.name, currentPlanID: plan.id },
              automatic: false,
            },
          ]
        : [],
    });
  }

  // --- domain findings ---

  const pendingDomains = domains.filter(
    (d) => d.status !== "ACTIVE" || (d.certificatesStatus && d.certificatesStatus !== "ACTIVE"),
  );
  if (pendingDomains.length && project.isDeployed) {
    findings.push({
      id: "domain_pending",
      title: "دامنه یا گواهی هنوز فعال نشده",
      severity: "warning",
      confidence: 0.75,
      explanation:
        "یک یا چند دامنه در وضعیت فعال نیستند. معمولاً رکورد DNS هنوز در ثبت‌کننده تنظیم نشده یا انتشار آن زمان می‌برد.",
      evidence: pendingDomains.map(
        (d) =>
          `${d.name}: status=${d.status}${d.certificatesStatus ? `, ssl=${d.certificatesStatus}` : ""}`,
      ),
      recommendations: [
        {
          actionType: "add_domain",
          risk: "medium",
          title: "بررسی رکوردهای دامنه",
          why: "رکوردهای لازم را نمایش می‌دهیم و وضعیت را دوباره بررسی می‌کنیم.",
          params: { app: project.name, domain: pendingDomains[0]?.name },
          automatic: false,
        },
      ],
    });
  }

  // --- no-data / healthy ---

  if (!findings.length) {
    if (!project.isDeployed) {
      findings.push({
        id: "not_deployed",
        title: "هنوز استقراری انجام نشده",
        severity: "unknown",
        confidence: 0.9,
        explanation:
          "برنامه ساخته شده اما هیچ نسخه‌ی موفقی برای آن مستقر نشده است. برای دیدن سایت، اولین استقرار را انجام دهید.",
        evidence: [`isDeployed = false`, `releaseState = ${releaseState ?? "—"}`],
        recommendations: [
          {
            actionType: "deploy_source",
            risk: "high",
            title: "اولین استقرار",
            why: "سورس پروژه را آپلود و نسخه‌ی اول را منتشر می‌کنیم.",
            params: { app: project.name },
            automatic: false,
          },
        ],
      });
    } else if (!logs.length && !metrics.cpu.length) {
      findings.push({
        id: "no_telemetry",
        title: "داده‌ی کافی برای تشخیص نیست",
        severity: "unknown",
        confidence: 0.5,
        explanation:
          "لاگ یا متریک تازه‌ای در بازه‌ی انتخابی دریافت نشد. ممکن است برنامه ترافیک نداشته باشد یا بازه‌ی نگه‌داری لاگ کوتاه باشد.",
        evidence: ["logs = 0", `cpuPoints = ${metrics.cpu.length}`],
        recommendations: [],
      });
    } else {
      findings.push({
        id: "healthy",
        title: "نشانه‌ای از مشکل حاد دیده نمی‌شود",
        severity: "healthy",
        confidence: 0.7,
        explanation:
          "در بازه‌ی بررسی‌شده، خطای 5xx قابل توجه، فشار منابع یا خطای استقرار پیدا نشد.",
        evidence: [
          `${cleanLogs.length} خط لاگ بررسی شد`,
          cpuPercent !== null ? `CPU: ${Math.round(cpuPercent)}٪` : "CPU: —",
          memoryPercent !== null ? `حافظه: ${Math.round(memoryPercent)}٪` : "حافظه: —",
        ],
        recommendations: [],
      });
    }
  }

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence);
  const top = findings[0];
  const severity = top?.severity ?? "unknown";
  return {
    severity,
    headline: top?.title ?? "وضعیت نامشخص",
    summary:
      findings.length === 1
        ? top?.explanation ?? ""
        : `${findings.length} یافته بررسی شد؛ مهم‌ترین آن: ${top?.title ?? "—"}.`,
    confidence: top?.confidence ?? 0.3,
    findings,
    signals: {
      cpuPercent: cpuPercent === null ? null : Math.round(cpuPercent),
      cpuPeakPercent: cpuPeakPercent === null ? null : Math.round(cpuPeakPercent),
      memoryPercent: memoryPercent === null ? null : Math.round(memoryPercent),
      memoryPeakPercent:
        memoryPeakPercent === null ? null : Math.round(memoryPeakPercent),
      diskPercent,
      errorCount: errorLines.length,
      logCount: cleanLogs.length,
      releaseState,
      appState: project.status,
      scale: project.scale,
    },
    generatedAt: new Date().toISOString(),
  };
}

function severityRank(severity: Severity): number {
  return { critical: 4, warning: 3, unknown: 2, healthy: 1 }[severity];
}

function countSignals(logs: LogEntry[]): Record<keyof typeof PATTERNS, number> {
  const result = {} as Record<keyof typeof PATTERNS, number>;
  for (const key of Object.keys(PATTERNS) as Array<keyof typeof PATTERNS>) {
    result[key] = logs.filter((l) => PATTERNS[key].test(l.message)).length;
  }
  return result;
}

function evidenceFor(
  logs: LogEntry[],
  pattern: RegExp,
  limit = 4,
): string[] {
  return logs
    .filter((l) => pattern.test(l.message))
    .slice(-limit)
    .map((l) => `«${truncate(l.message.replace(/\s+/g, " "), 220)}»`);
}

function redactLog(message: string): string {
  return message
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1•••")
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "sk-•••")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      "$1•••",
    )
    .replace(
      /((?:mongodb|postgres|postgresql|mysql|redis):\/\/[^:\s]+:)[^@\s]+(@)/gi,
      "$1•••$2",
    );
}

function stats(points: Array<{ value: number }>): {
  avg: number;
  max: number;
  min: number;
  count: number;
} {
  if (!points.length) return { avg: 0, max: 0, min: 0, count: 0 };
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const point of points) {
    sum += point.value;
    if (point.value > max) max = point.value;
    if (point.value < min) min = point.value;
  }
  return {
    avg: sum / points.length,
    max,
    min,
    count: points.length,
  };
}

function cpuLevel(value: number, plan?: LiaraPlan): number | null {
  if (!value) return null;
  if (!plan || !plan.cpu) return value > 0 && value <= 100 ? value : null;
  if (value > 100 && value <= plan.cpu * 1000) {
    return Math.min(100, (value / 1000 / plan.cpu) * 100);
  }
  if (value > 100) return Math.min(100, value);
  return Math.min(100, (value / plan.cpu) * 100);
}

export function memoryValueToGb(
  value: number,
  planRamGb?: number,
): number {
  if (value > 100_000_000) return value / 1024 ** 3;
  if (planRamGb && value > planRamGb * 2 && value <= planRamGb * 1024 * 1.5) {
    return value / 1024;
  }
  if (!planRamGb && value > 1024) return value / 1024;
  return value;
}

function memoryLevel(value: number, plan?: LiaraPlan): number | null {
  if (!value) return null;
  const gb = memoryValueToGb(value, plan?.ram);
  if (!plan || !plan.ram) return null;
  return Math.min(100, (gb / plan.ram) * 100);
}

function worstDiskPercent(metrics: MetricsSummary): number | null {
  let worst: number | null = null;
  for (const disk of metrics.disks) {
    const percent = diskUsagePercent(disk.usage, disk.size);
    if (percent !== null && (worst === null || percent > worst)) worst = percent;
  }
  return worst;
}

function detectTrafficSpike(metrics: MetricsSummary): string | null {
  const series = metrics.networkReceive.length
    ? metrics.networkReceive
    : metrics.networkTransmit;
  if (series.length < 6) return null;
  const mid = Math.floor(series.length / 2);
  const first = series.slice(0, mid).reduce((s, p) => s + p.value, 0);
  const second = series.slice(mid).reduce((s, p) => s + p.value, 0);
  if (first <= 0 || second <= first * 2 || second < 1_000_000) return null;
  return `ترافیک نیمه‌ی دوم ${(second / first).toFixed(1)} برابر نیمه‌ی اول شد.`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export { SIGNAL_LABELS };
