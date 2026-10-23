import type { BundlePlan, LiaraPlan } from "./types";

export type TrafficLevel = "low" | "medium" | "high" | "very_high";

export type PlanAdvisorInput = {
  framework: string;
  traffic?: TrafficLevel;
  expectedVisitorsPerDay?: number;
  hasDatabase?: boolean;
  databaseType?: string;
  needsPersistentDisk?: boolean;
  diskGb?: number;
  budgetMonthlyToman?: number;
  needsZeroDowntime?: boolean;
  logsRetentionDays?: number;
  region?: string;
};

export type PlanOption = {
  plan: LiaraPlan;
  bundle: BundlePlan & { bundlePlanID: string };
  totalMonthlyToman: number;
  totalHourlyToman: number;
  reasons: string[];
  tradeoffs: string[];
  fitsBudget: boolean;
};

export type PlanRecommendation = {
  summary: string;
  recommended: PlanOption;
  alternatives: PlanOption[];
  assumptions: string[];
  notes: string[];
  profile: {
    framework: string;
    traffic: TrafficLevel;
    expectedVisitorsPerDay?: number;
    memoryFloorGb: number;
    cpuFloor: number;
    diskFloorGb: number;
    needsZeroDowntime: boolean;
    logsRetentionDays: number;
  };
};

type Need = {
  memoryGb: number;
  cpu: number;
  diskGb: number;
  reasons: string[];
};

const LIGHT_FRAMEWORKS = new Set(["static", "react", "vue", "angular"]);
const HEAVY_FRAMEWORKS = new Set(["docker", "next", "laravel", "django", "dotnet"]);

const TRAFFIC_FACTOR: Record<TrafficLevel, number> = {
  low: 1,
  medium: 1.6,
  high: 2.6,
  very_high: 4,
};

export function trafficFromVisitors(
  visitorsPerDay?: number,
): TrafficLevel {
  if (!visitorsPerDay || visitorsPerDay <= 1000) return "low";
  if (visitorsPerDay <= 20_000) return "medium";
  if (visitorsPerDay <= 100_000) return "high";
  return "very_high";
}

function computeNeed(input: PlanAdvisorInput): Need {
  const traffic =
    input.traffic ?? trafficFromVisitors(input.expectedVisitorsPerDay);
  const factor = TRAFFIC_FACTOR[traffic];
  const reasons: string[] = [];

  let memory = 0.5;
  let cpu = 0.5;
  let disk = 5;

  if (LIGHT_FRAMEWORKS.has(input.framework)) {
    memory = 0.5;
    cpu = 0.5;
    disk = 5;
    reasons.push("پروژه‌ی سبک است و به منابع پایه نیاز دارد.");
  } else if (input.framework === "next") {
    memory = 1;
    cpu = 1;
    disk = 10;
    reasons.push("Next.js در زمان اجرا و بیلد به حافظه‌ی بیشتری نیاز دارد.");
  } else if (HEAVY_FRAMEWORKS.has(input.framework)) {
    memory = 1;
    cpu = 1;
    disk = 10;
    reasons.push(`${input.framework} برای اجرای پایدار به منابع بیشتری نیاز دارد.`);
  } else {
    memory = 1;
    cpu = 1;
    disk = 10;
  }

  memory = Math.max(0.5, memory * factor);
  cpu = Math.max(0.5, cpu * Math.max(1, factor * 0.6));
  disk = Math.max(5, disk * Math.min(2.5, factor));
  reasons.push(`سطح ترافیک «${trafficLabel(traffic)}» در محاسبه‌ی منابع لحاظ شد.`);

  if (input.hasDatabase) {
    memory += 0.5;
    cpu += 0.25;
    reasons.push("دیتابیس/اتصال دیتابیس سربار حافظه و اتصال دارد.");
  }

  if (input.needsPersistentDisk) {
    disk = Math.max(disk, input.diskGb ?? 10);
    reasons.push("دیسک پایدار برای فایل‌های آپلودی یا داده‌های محلی در نظر گرفته شد.");
  }

  if (input.expectedVisitorsPerDay && input.expectedVisitorsPerDay > 20_000) {
    memory += 1;
    cpu += 0.5;
    reasons.push("برای بازدید روزانه‌ی بالا، حاشیه‌ی اطمینان منابع اضافه شد.");
  }

  return {
    memoryGb: roundUp(memory, 0.5),
    cpu: roundUp(cpu, 0.5),
    diskGb: Math.ceil(disk),
    reasons,
  };
}

export function recommendPlan(
  input: PlanAdvisorInput,
  plans: LiaraPlan[],
  bundles: BundlePlan[],
): PlanRecommendation {
  const traffic =
    input.traffic ?? trafficFromVisitors(input.expectedVisitorsPerDay);
  const need = computeNeed(input);
  const logsRetentionDays = input.logsRetentionDays ?? 7;
  const needsZeroDowntime = input.needsZeroDowntime ?? traffic !== "low";
  const region =
    input.region ??
    (plans.some((plan) => plan.available && plan.region === "iran")
      ? "iran"
      : undefined);
  const currentGeneration = (plan: LiaraPlan) =>
    plan.id === "free" || plan.id.includes("g2");

  const candidates = plans
    .filter((plan) => plan.available)
    .filter(currentGeneration)
    .filter((plan) => !region || !plan.region || plan.region === region)
    .filter(
      (plan) =>
        plan.ram >= need.memoryGb &&
        plan.cpu >= need.cpu &&
        plan.disk >= Math.min(need.diskGb, plan.disk),
    )
    .sort((a, b) => {
      if (a.monthlyPrice !== b.monthlyPrice) return a.monthlyPrice - b.monthlyPrice;
      return a.ram - b.ram;
    });

  const fallback = plans
    .filter((plan) => plan.available)
    .filter(currentGeneration)
    .filter((plan) => !region || !plan.region || plan.region === region)
    .sort(
      (a, b) =>
        b.ram - a.ram ||
        b.cpu - a.cpu ||
        a.monthlyPrice - b.monthlyPrice,
    );

  const anyAvailable = plans
    .filter((plan) => plan.available)
    .filter((plan) => !region || !plan.region || plan.region === region)
    .sort(
      (a, b) =>
        b.ram - a.ram ||
        b.cpu - a.cpu ||
        a.monthlyPrice - b.monthlyPrice,
    );
  const pool = candidates.length ? candidates : fallback.length ? fallback : anyAvailable;
  if (!pool.length) {
    throw new Error(
      "هیچ پلن فعالی از لیارا دریافت نشد. دسترسی کلید API یا وضعیت پلن‌ها را بررسی کنید.",
    );
  }

  const options = pool.slice(0, 3).map((plan, index) => {
    const bundle = chooseBundle(
      bundles,
      plan,
      {
        needsZeroDowntime,
        logsRetentionDays,
        sourceSizeMb: 128,
        domains: traffic === "low" ? 2 : 5,
      },
    );

    // /v1/me returns the feature-bundle price as the total for the plan+bundle.
    const totalMonthlyToman =
      bundle.monthlyPrice > 0 ? bundle.monthlyPrice : plan.monthlyPrice;
    const fitsBudget =
      input.budgetMonthlyToman === undefined ||
      totalMonthlyToman <= input.budgetMonthlyToman;

    const reasons = [...need.reasons];
    if (plan.ram > need.memoryGb) {
      reasons.push(
        `حافظه‌ی ${plan.ram} گیگابایت برای رشد و اوج ترافیک جا دارد.`,
      );
    }
    if (plan.cpu > need.cpu) {
      reasons.push(`${plan.cpu} هسته CPU برای اوج پردازش کافی است.`);
    }
    if (bundle.zeroDowntime) {
      reasons.push("استقرار بدون اختلال برای انتشار نسخه‌ی جدید فعال است.");
    }
    if (bundle.maxLogsRetentionDays >= logsRetentionDays) {
      reasons.push(
        `لاگ‌ها تا ${bundle.maxLogsRetentionDays} روز نگه‌داری می‌شوند.`,
      );
    }

    const tradeoffs: string[] = [];
    if (plan.ram < need.memoryGb) {
      tradeoffs.push(
        `حافظه‌ی این پلن (${plan.ram} GB) کمتر از برآورد نیاز (${need.memoryGb} GB) است.`,
      );
    }
    if (plan.cpu < need.cpu) {
      tradeoffs.push(
        `CPU این پلن (${plan.cpu} هسته) کمتر از برآورد نیاز (${need.cpu} هسته) است.`,
      );
    }
    if (index === 0 && candidates.length > 1) {
      tradeoffs.push("اقتصادی‌ترین گزینه‌ی مناسب است؛ برای رشد سریع ممکن است زود به سقف برسد.");
    }
    if (!fitsBudget && input.budgetMonthlyToman !== undefined) {
      tradeoffs.push(
        `از بودجه‌ی اعلام‌شده (${input.budgetMonthlyToman.toLocaleString("fa-IR")} تومان) بیشتر است.`,
      );
    }
    if (bundle.maxLogsRetentionDays < logsRetentionDays) {
      tradeoffs.push("مدت نگه‌داری لاگ کمتر از چیزی است که خواسته‌اید.");
    }
    if (!bundle.zeroDowntime) {
      tradeoffs.push("استقرار بدون اختلال در این بسته‌ی امکانات فعال نیست.");
    }

    return {
      plan,
      bundle: { ...bundle, bundlePlanID: bundle.bundleID },
      totalMonthlyToman,
      totalHourlyToman:
        Math.round(
          (bundle.hourlyPrice > 0 ? bundle.hourlyPrice : plan.hourlyPrice) * 100,
        ) / 100,
      reasons,
      tradeoffs,
      fitsBudget,
    } satisfies PlanOption;
  });

  const recommended = options[0];
  const alternatives = options.slice(1);

  // If the strict recommendation is above budget (or all alternatives are
  // more expensive), add the most affordable plan below it so the user always
  // sees a cheaper trade-off.
  if (input.budgetMonthlyToman !== undefined) {
    const cheaper = plans
      .filter((plan) => plan.available)
      .filter((plan) => plan.monthlyPrice < recommended.totalMonthlyToman)
      .filter((plan) => plan.monthlyPrice <= (input.budgetMonthlyToman ?? Infinity))
      .sort((a, b) => b.ram - a.ram || b.monthlyPrice - a.monthlyPrice)[0];
    if (cheaper) {
      const bundle = chooseBundle(bundles, cheaper, {
        needsZeroDowntime,
        logsRetentionDays,
        sourceSizeMb: 128,
        domains: 2,
      });
      const total = bundle.monthlyPrice > 0 ? bundle.monthlyPrice : cheaper.monthlyPrice;
      if (!alternatives.some((option) => option.plan.id === cheaper.id)) {
        alternatives.unshift({
          plan: cheaper,
          bundle: { ...bundle, bundlePlanID: bundle.bundleID },
          totalMonthlyToman: total,
          totalHourlyToman:
            Math.round(
              (bundle.hourlyPrice > 0 ? bundle.hourlyPrice : cheaper.hourlyPrice) * 100,
            ) / 100,
          reasons: [
            `اقتصادی‌تر از پیشنهاد اصلی (${cheaper.ram} GB RAM، ${cheaper.cpu} CPU).`,
          ],
          tradeoffs: [
            need.memoryGb > cheaper.ram
              ? "حافظه‌ی این پلن کمتر از برآورد نیاز است؛ فقط برای شروع یا ترافیک سبک مناسب است."
              : "منابع کمتر از پیشنهاد اصلی دارد.",
          ],
          fitsBudget: true,
        });
      }
    }
  }

  return {
    summary:
      `برای ${input.framework} با ترافیک ${trafficLabel(traffic)}، ` +
      `پلن ${recommended.plan.id} با بسته‌ی ${recommended.bundle.bundleID} ` +
      `مناسب‌ترین تعادل قیمت و منابع است.`,
    recommended,
    alternatives,
    assumptions: [
      `حافظه‌ی موردنیاز حدود ${need.memoryGb} گیگابایت و CPU حدود ${need.cpu} هسته برآورد شد.`,
      needsZeroDowntime
        ? "استقرار بدون اختلال لازم در نظر گرفته شد."
        : "برای این سطح، استقرار بدون اختلال ضروری فرض نشد.",
      input.hasDatabase
        ? "دیتابیس به‌عنوان سرویس جداگانه یا اتصال شبکه‌ای در نظر گرفته شد."
        : "دیتابیس مدیریت‌شده‌ی اضافه‌ای فرض نشد.",
    ],
    notes: [
      "قیمت‌ها از پاسخ زنده‌ی /v1/me خوانده شده‌اند و ممکن است تغییر کنند.",
      candidates.length === 0
        ? "هیچ پلن موجودی کاملاً نیاز برآوردشده را پوشش نمی‌دهد؛ نزدیک‌ترین گزینه نمایش داده شد."
        : "اگر ترافیک یا مصرف حافظه بیشتر شد، assistant می‌تواند با تأیید شما پلن را ارتقا دهد.",
    ],
    profile: {
      framework: input.framework,
      traffic,
      expectedVisitorsPerDay: input.expectedVisitorsPerDay,
      memoryFloorGb: need.memoryGb,
      cpuFloor: need.cpu,
      diskFloorGb: need.diskGb,
      needsZeroDowntime,
      logsRetentionDays,
    },
  };
}

function chooseBundle(
  bundles: BundlePlan[],
  plan: LiaraPlan,
  need: {
    needsZeroDowntime: boolean;
    logsRetentionDays: number;
    sourceSizeMb: number;
    domains: number;
  },
): BundlePlan & { bundlePlanID: string } {
  const variants = bundles.filter(
    (bundle) =>
      bundle.planID === plan.id &&
      bundle.available &&
      (!need.needsZeroDowntime || bundle.zeroDowntime) &&
      bundle.maxLogsRetentionDays >= need.logsRetentionDays,
  );

  const preferredOrder = ["standard", "pro", "basic", "free"];
  const sorted = [...variants].sort((a, b) => {
    const ai = preferredOrder.indexOf(a.bundleID);
    const bi = preferredOrder.indexOf(b.bundleID);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.monthlyPrice - b.monthlyPrice;
  });

  const chosen =
    sorted[0] ??
    bundles
      .filter((b) => b.planID === plan.id && b.available)
      .sort((a, b) => a.monthlyPrice - b.monthlyPrice)[0];

  if (!chosen) {
    // Older plans may not have bundle metadata in /v1/me. Use a safe default.
    return {
      id: `${plan.id}:standard`,
      planID: plan.id,
      bundleID: "standard",
      bundlePlanID: "standard",
      available: true,
      monthlyPrice: 0,
      hourlyPrice: 0,
      buildTimeoutMinutes: 15,
      maxLogsRetentionDays: 30,
      maxReportRetentionDays: 30,
      maxDomains: 5,
      maxDeploymentsPerDay: 50,
      zeroDowntime: true,
      rollback: true,
      maxSourceSizeMb: 256,
      maxDiskPerProject: 5,
    };
  }

  return { ...chosen, bundlePlanID: chosen.bundleID };
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function trafficLabel(traffic: TrafficLevel): string {
  const labels: Record<TrafficLevel, string> = {
    low: "کم",
    medium: "متوسط",
    high: "زیاد",
    very_high: "بسیار زیاد",
  };
  return labels[traffic];
}
