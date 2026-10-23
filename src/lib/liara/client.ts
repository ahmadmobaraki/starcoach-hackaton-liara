import type {
  AccountPlanData,
  Applet,
  BundlePlan,
  Database,
  Disk,
  Domain,
  LiaraPlan,
  LogEntry,
  MeResponse,
  MetricPoint,
  MetricsSummary,
  ProjectDetail,
  ProjectSummary,
  RawBundlePlan,
  RawPlan,
  Release,
  ReleaseWaitResult,
  SourceUpload,
  Vm,
  VmPlan,
} from "./types";

export const PAAS_BASE = "https://api.liara.ir";
export const IAAS_BASE = "https://iaas-api.liara.ir";
export const DNS_BASE = "https://dns-service.liara.ir";

const DEFAULT_TIMEOUT = 30_000;
const TERMINAL_RELEASE_STATES = new Set([
  "READY",
  "FAILED",
  "UNHEALTHY",
  "CANCELED",
  "CANCELLED",
  "TIMEDOUT",
  "TIMEOUT",
]);

export class LiaraError extends Error {
  status: number;
  code?: string;
  body?: unknown;

  constructor(message: string, status = 0, code?: string, body?: unknown) {
    super(message);
    this.name = "LiaraError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
  retries?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  g2_plan_unavailable:
    "پلن g2 برای این حساب یا پلتفرم در دسترس نیست. ممکن است به حداقل اعتبار یا شرایط پلن نیاز باشد؛ موجودی و پلن را در کنسول لیارا بررسی کنید یا پلن دیگری انتخاب کنید.",
  free_plan_platform: "پلن رایگان برای این پلتفرم در دسترس نیست.",
  free_plan_count: "با پلن رایگان فقط می‌توانید یک برنامه بسازید.",
  not_enough_balance:
    "موجودی حساب برای این عملیات کافی نیست. از کنسول لیارا کیف پول را شارژ کنید.",
  insufficient_balance:
    "موجودی حساب برای این عملیات کافی نیست. از کنسول لیارا کیف پول را شارژ کنید.",
  max_source_size: "حجم سورس بیش از حد مجاز بسته‌ی امکانات است.",
  max_deploy_per_day: "سقف استقرار روزانه پر شده است؛ فردا دوباره تلاش کنید.",
  project_not_found: "برنامه پیدا نشد یا دسترسی به آن ندارید.",
  unauthorized: "کلید API لیارا معتبر نیست یا دسترسی لازم را ندارد.",
};

function errorFromBody(body: unknown, status: number): LiaraError {
  const record = asRecord(body);
  const data = asRecord(record.data);
  const code =
    text(data.code) || text(record.code) || text(record.errorCode) || undefined;
  const message =
    (code ? KNOWN_ERROR_MESSAGES[code] : undefined) ||
    text(record.message) ||
    text(record.error) ||
    text(data.message) ||
    text(data.reason) ||
    (status === 402
      ? "موجودی حساب کافی نیست؛ کیف پول لیارا را شارژ کنید."
      : `Liara API returned HTTP ${status}`);
  return new LiaraError(message, status, code, body);
}

export type LiaraClientOptions = {
  apiKey: string;
  teamId?: string;
  paasBase?: string;
  iaasBase?: string;
  dnsBase?: string;
  fetchImpl?: typeof fetch;
};

export class LiaraClient {
  private apiKey: string;
  private teamId?: string;
  private paasBase: string;
  private iaasBase: string;
  private dnsBase: string;
  private fetchImpl: typeof fetch;
  private meCache: { at: number; data: MeResponse } | null = null;

  constructor(options: LiaraClientOptions) {
    this.apiKey = options.apiKey;
    this.teamId = options.teamId;
    this.paasBase = options.paasBase ?? PAAS_BASE;
    this.iaasBase = options.iaasBase ?? IAAS_BASE;
    this.dnsBase = options.dnsBase ?? DNS_BASE;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(
    base: string,
    path: string,
    query?: RequestOptions["query"],
  ): string {
    const url = new URL(path.replace(/^\//, ""), `${base.replace(/\/$/, "")}/`);
    if (this.teamId) url.searchParams.set("teamID", this.teamId);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request<T>(
    base: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const {
      method = "GET",
      query,
      body,
      formData,
      timeoutMs = DEFAULT_TIMEOUT,
      retries = method === "GET" ? 2 : 0,
    } = options;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "User-Agent": "raahbar-liara/0.1",
        };
        let payload: BodyInit | undefined;
        if (formData) {
          payload = formData;
        } else if (body !== undefined) {
          headers["Content-Type"] = "application/json";
          payload = JSON.stringify(body);
        }

        const response = await this.fetchImpl(
          this.url(base, path, query),
          {
            method,
            headers,
            body: payload,
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
          },
        );

        const responseText = await response.text();
        let parsed: unknown = undefined;
        if (responseText) {
          try {
            parsed = JSON.parse(responseText);
          } catch {
            parsed = responseText;
          }
        }

        if (!response.ok) {
          const err = errorFromBody(parsed, response.status);
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt < retries
          ) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          throw err;
        }

        return parsed as T;
      } catch (error) {
        lastError = error;
        if (error instanceof LiaraError) throw error;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        const message =
          error instanceof Error ? error.message : "Unknown Liara API error";
        throw new LiaraError(message, 0, "network_error");
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new LiaraError("Liara request failed");
  }

  // ---------- account & plans ----------

  async getMe(force = false): Promise<MeResponse> {
    if (
      !force &&
      this.meCache &&
      Date.now() - this.meCache.at < 60_000
    ) {
      return this.meCache.data;
    }
    const data = await this.request<MeResponse>(this.paasBase, "v1/me");
    this.meCache = { at: Date.now(), data };
    return data;
  }

  async getAccountSummary() {
    const me = await this.getMe();
    const user = asRecord(me.user);
    return {
      id: text(user._id),
      fullname: text(user.fullname) || "کاربر لیارا",
      emailMasked: maskEmail(text(user.email)),
      phoneMasked: maskPhone(text(user.phone)),
      isTeam: bool(user.isTeam),
      accountType: text(user.accountType),
      isVerified: bool(user.isVerified),
      privateNetwork: bool(user.privateNetworkFeature),
      team: me.team ? asRecord(me.team) : null,
    };
  }

  async getPlanData(): Promise<{
    projects: LiaraPlan[];
    bundles: BundlePlan[];
    raw: AccountPlanData | undefined;
  }> {
    const me = await this.getMe();
    const plans = (me.plans ?? {}) as AccountPlanData;
    const projects = Object.entries(plans.projects ?? {}).map(([id, raw]) =>
      normalizePlan(id, raw),
    );
    const bundles = normalizeBundles(plans.projectBundlePlans ?? {});
    return { projects, bundles, raw: plans };
  }

  async getBilling(): Promise<unknown> {
    try {
      return await this.request<unknown>(this.paasBase, "v1/billing");
    } catch {
      return null;
    }
  }

  // ---------- PaaS projects ----------

  async listProjects(): Promise<ProjectSummary[]> {
    const data = await this.request<{ projects?: unknown[] }>(
      this.paasBase,
      "v1/projects",
    );
    return asArray(data?.projects).map(normalizeProjectSummary);
  }

  async getProject(name: string): Promise<ProjectDetail> {
    const data = await this.request<{ project?: unknown }>(
      this.paasBase,
      `v1/projects/${encodeURIComponent(name)}`,
    );
    return normalizeProjectDetail(name, data?.project);
  }

  async createProject(input: {
    name: string;
    planID: string;
    platform: string;
    bundlePlanID?: string;
    network?: string;
    readOnlyRootFilesystem?: boolean;
  }): Promise<void> {
    await this.request(this.paasBase, "v1/projects", {
      method: "POST",
      body: {
        name: input.name,
        planID: input.planID,
        platform: input.platform,
        bundlePlanID: input.bundlePlanID,
        ...(input.network ? { network: input.network } : {}),
        ...(input.readOnlyRootFilesystem !== undefined
          ? { readOnlyRootFilesystem: input.readOnlyRootFilesystem }
          : {}),
      },
    });
  }

  async deleteProject(name: string): Promise<void> {
    await this.request(this.paasBase, `v1/projects/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }

  async restartProject(name: string): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(name)}/actions/restart`,
      { method: "POST" },
    );
  }

  async scaleProject(name: string, scale: 0 | 1): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(name)}/actions/scale`,
      { method: "POST", body: { scale } },
    );
  }

  async resizeProject(name: string, planID: string): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(name)}/resize`,
      { method: "POST", body: { planID } },
    );
  }

  async updateEnvs(
    project: string,
    variables: Array<{ key: string; value: string }>,
  ): Promise<{ message?: string }> {
    return this.request(this.paasBase, "v1/projects/update-envs", {
      method: "POST",
      body: { project, variables },
    });
  }

  async setZeroDowntime(projectId: string, enabled: boolean): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(projectId)}/zero-downtime/${enabled ? "true" : "false"}`,
      { method: "POST" },
    );
  }

  async setDefaultSubdomain(projectId: string, enabled: boolean): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(projectId)}/default-subdomain/${enabled ? "true" : "false"}`,
      { method: "POST" },
    );
  }

  async setReadOnly(projectId: string, enabled: boolean): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(projectId)}/read-only/${enabled ? "true" : "false"}`,
      { method: "POST" },
    );
  }

  // ---------- logs, releases, events ----------

  async listLogs(
    app: string,
    options: {
      sinceSeconds?: number;
      lastLines?: boolean;
      releaseId?: string;
      limit?: number;
    } = {},
  ): Promise<LogEntry[]> {
    const sinceSeconds = options.sinceSeconds ?? 30 * 60;
    const start = Math.floor(Date.now() / 1000) - sinceSeconds;
    try {
      const data = await this.request<{
        data?: Array<{
          metaData?: { releaseId?: string };
          values?: Array<[string, string]>;
        }>;
      }>(this.paasBase, `v2/projects/${encodeURIComponent(app)}/logs`, {
        query: {
          start,
          direction: "forward",
          last_lines: options.lastLines ?? false,
          releaseId: options.releaseId,
        },
      });
      const lines: LogEntry[] = [];
      for (const group of asArray(data?.data)) {
        const record = asRecord(group);
        const meta = asRecord(record.metaData);
        for (const value of asArray(record.values)) {
          if (!Array.isArray(value) || value.length < 2) continue;
          lines.push({
            timestamp: String(value[0]),
            message: String(value[1]),
            releaseId: text(meta.releaseId),
          });
        }
      }
      lines.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      return lines.slice(-(options.limit ?? 200));
    } catch (error) {
      if (!(error instanceof LiaraError) || error.status >= 500) throw error;
      const data = await this.request<
        Array<{ type?: string; datetime?: string; message?: string }>
      >(this.paasBase, `v1/projects/${encodeURIComponent(app)}/logs`, {
        query: { since: new Date(start * 1000).toISOString() },
      });
      return asArray(data)
        .map((line) => {
          const record = asRecord(line);
          return {
            timestamp: text(record.datetime) || new Date().toISOString(),
            message: text(record.message),
            stream: text(record.type) || undefined,
          };
        })
        .slice(-(options.limit ?? 200));
    }
  }

  async listReleases(app: string, count = 20): Promise<{
    currentRelease?: string;
    releases: Release[];
    platform?: string;
  }> {
    const data = await this.request<{
      releases?: unknown[];
      currentRelease?: string;
      platform?: string;
    }>(this.paasBase, `v1/projects/${encodeURIComponent(app)}/releases`, {
      query: { page: 1, count },
    });
    return {
      currentRelease: data?.currentRelease,
      platform: data?.platform,
      releases: asArray(data?.releases).map(normalizeRelease),
    };
  }

  async getRelease(releaseId: string): Promise<Release> {
    const data = await this.request<{ release?: unknown }>(
      this.paasBase,
      `v1/releases/${encodeURIComponent(releaseId)}`,
    );
    return normalizeRelease(data?.release);
  }

  async getBuildLogs(
    releaseId: string,
    since?: string,
  ): Promise<{ release?: Release; lines: string[] }> {
    const data = await this.request<{
      release?: unknown;
      buildOutput?: Array<{ line?: string; stream?: string; createdAt?: string }>;
    }>(
      this.paasBase,
      `v2/releases/${encodeURIComponent(releaseId)}/build-logs`,
      { query: since ? { since } : undefined },
    );
    return {
      release: data?.release ? normalizeRelease(data.release) : undefined,
      lines: asArray(data?.buildOutput)
        .map((item) => text(asRecord(item).line))
        .filter(Boolean),
    };
  }

  async waitForRelease(
    releaseId: string,
    options: {
      timeoutMs?: number;
      intervalMs?: number;
      onProgress?: (update: {
        state: string;
        lines: string[];
        elapsedMs: number;
      }) => void;
    } = {},
  ): Promise<ReleaseWaitResult> {
    const timeoutMs = options.timeoutMs ?? 8 * 60_000;
    const intervalMs = options.intervalMs ?? 3000;
    const started = Date.now();
    const tail: string[] = [];
    let since: string | undefined;
    let lastState = "UNKNOWN";

    while (Date.now() - started < timeoutMs) {
      let release: Release | undefined;
      try {
        release = await this.getRelease(releaseId);
        lastState = release.state || lastState;
      } catch {
        // The release may not be queryable for a moment after creation.
      }

      try {
        const logs = await this.getBuildLogs(releaseId, since);
        for (const line of logs.lines) {
          tail.push(line);
          if (tail.length > 120) tail.shift();
          if (line) since = line;
        }
      } catch {
        // Build logs are not available until the build starts.
      }

      options.onProgress?.({
        state: lastState,
        lines: tail.slice(-12),
        elapsedMs: Date.now() - started,
      });

      if (TERMINAL_RELEASE_STATES.has(lastState)) {
        return {
          releaseId,
          state: lastState,
          ok: lastState === "READY",
          buildLogTail: tail.slice(-80),
          failReason: release?.failReason,
          durationMs: Date.now() - started,
        };
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return {
      releaseId,
      state: lastState,
      ok: false,
      buildLogTail: tail.slice(-80),
      failReason: "timeout",
      durationMs: Date.now() - started,
    };
  }

  async listApplets(app: string): Promise<Applet[]> {
    const data = await this.request<{ applets?: unknown[] }>(
      this.paasBase,
      `v1/projects/${encodeURIComponent(app)}/applets`,
    );
    return asArray(data?.applets).map((item) => {
      const record = asRecord(item);
      const release = asRecord(record.release);
      return {
        id: text(record.id) || text(record._id),
        name: text(record.name),
        timestamp: text(record.timestamp),
        state: text(record.state),
        reason: text(record.reason),
        releaseId: text(release.releaseID) || text(record.releaseId),
      };
    });
  }

  async listEvents(
    app: string,
    options: { start?: number; end?: number; search?: string } = {},
  ): Promise<Array<{ timestamp: string; message: string }>> {
    const data = await this.request<{
      data?: Array<{ metaData?: Record<string, unknown>; values?: unknown[] }>;
    }>(this.paasBase, `v1/projects/${encodeURIComponent(app)}/events`, {
      query: options,
    });
    return asArray(data?.data).flatMap((group) => {
      const record = asRecord(group);
      return asArray(record.values)
        .filter((value): value is unknown[] => Array.isArray(value))
        .map((value) => ({
          timestamp: String(value[0] ?? ""),
          message: String(value[1] ?? ""),
        }));
    });
  }

  // ---------- metrics ----------

  async getMetricsSummary(app: string): Promise<MetricsSummary> {
    const data = await this.request<{
      cpuUsage?: Array<{ value?: unknown[]; applet?: string }>;
      memoryUsage?: Array<{ value?: unknown[]; applet?: string }>;
      disksUsage?: Array<{
        name?: string;
        size?: string;
        usage?: string;
        reportedAt?: string;
      }>;
    }>(this.paasBase, `v1/projects/${encodeURIComponent(app)}/metrics/summary`);

    return {
      cpu: flattenMetricGroups(data?.cpuUsage),
      memory: flattenMetricGroups(data?.memoryUsage),
      networkReceive: [],
      networkTransmit: [],
      disks: asArray(data?.disksUsage).map((item) => {
        const record = asRecord(item);
        return {
          name: text(record.name),
          size: text(record.size),
          usage: text(record.usage),
          reportedAt: text(record.reportedAt) || undefined,
        };
      }),
      raw: data,
    };
  }

  async getMetric(
    app: string,
    kind: "cpu" | "memory" | "network-receive" | "network-transmit",
    sinceSeconds = 6 * 3600,
  ): Promise<MetricPoint[]> {
    const since = Math.floor(Date.now() / 1000) - sinceSeconds;
    const data = await this.request<{
      result?: Array<{ values?: unknown[]; applet?: string }>;
    }>(this.paasBase, `v1/projects/${encodeURIComponent(app)}/metrics/${kind}`, {
      query: { since },
    });
    return flattenMetricGroups(data?.result);
  }

  async getFullMetrics(
    app: string,
    sinceSeconds = 6 * 3600,
  ): Promise<MetricsSummary> {
    const [summary, cpu, memory, networkReceive, networkTransmit] =
      await Promise.allSettled([
        this.getMetricsSummary(app),
        this.getMetric(app, "cpu", sinceSeconds),
        this.getMetric(app, "memory", sinceSeconds),
        this.getMetric(app, "network-receive", sinceSeconds),
        this.getMetric(app, "network-transmit", sinceSeconds),
      ]);

    const base =
      summary.status === "fulfilled"
        ? summary.value
        : {
            cpu: [],
            memory: [],
            networkReceive: [],
            networkTransmit: [],
            disks: [],
          };

    return {
      ...base,
      cpu: cpu.status === "fulfilled" && cpu.value.length ? cpu.value : base.cpu,
      memory:
        memory.status === "fulfilled" && memory.value.length
          ? memory.value
          : base.memory,
      networkReceive:
        networkReceive.status === "fulfilled" ? networkReceive.value : [],
      networkTransmit:
        networkTransmit.status === "fulfilled" ? networkTransmit.value : [],
    };
  }

  // ---------- disks ----------

  async listDisks(app: string): Promise<{ disks: Disk[]; mounts: unknown[] }> {
    const data = await this.request<{
      disks?: unknown[];
      mounts?: unknown[];
    }>(this.paasBase, `v1/projects/${encodeURIComponent(app)}/disks`);
    return {
      disks: asArray(data?.disks).map((item) => {
        const record = asRecord(item);
        return {
          id: text(record._id),
          name: text(record.name),
          size: num(record.size),
          createdAt: text(record.createdAt),
          updatedAt: text(record.updatedAt),
        };
      }),
      mounts: asArray(data?.mounts),
    };
  }

  async createDisk(
    app: string,
    input: { name: string; size: string },
  ): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(app)}/disks`,
      { method: "POST", body: input },
    );
  }

  async resizeDisk(app: string, disk: string, size: string): Promise<void> {
    await this.request(
      this.paasBase,
      `v1/projects/${encodeURIComponent(app)}/disks/${encodeURIComponent(disk)}/resize`,
      { method: "POST", body: { size } },
    );
  }

  // ---------- deployments ----------

  async uploadSource(
    app: string,
    data: Uint8Array,
    filename = "source.tar.gz",
  ): Promise<SourceUpload> {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(data)], {
      type: "application/gzip",
    });
    form.append("file", blob, filename);
    const result = await this.request<{ sourceID?: string }>(
      this.paasBase,
      `v2/projects/${encodeURIComponent(app)}/sources`,
      {
        method: "POST",
        formData: form,
        timeoutMs: 5 * 60_000,
      },
    );
    const sourceId = text(result?.sourceID);
    if (!sourceId) {
      throw new LiaraError("Liara did not return a sourceID", 502);
    }
    return { sourceId, size: data.byteLength, filename };
  }

  async createRelease(
    app: string,
    body: Record<string, unknown>,
  ): Promise<{ releaseID?: string; releaseId?: string; [key: string]: unknown }> {
    return this.request(
      this.paasBase,
      `v2/projects/${encodeURIComponent(app)}/releases`,
      { method: "POST", body, timeoutMs: 60_000 },
    );
  }

  async deploySource(
    app: string,
    data: Uint8Array,
    options: {
      filename?: string;
      platform: string;
      port?: number;
      envs?: Record<string, string>;
      message?: string;
      build?: Record<string, unknown>;
      disks?: Array<{ name: string; mountTo: string }>;
    },
  ): Promise<{ sourceId: string; releaseId: string }> {
    const upload = await this.uploadSource(
      app,
      data,
      options.filename ?? "source.tar.gz",
    );
    const response = await this.createRelease(app, {
      build: {
        cache: true,
        args: {},
        dockerfile: null,
        location: null,
        ...(options.build ?? {}),
      },
      cron: null,
      args: null,
      port: options.port ?? defaultPort(options.platform),
      type: options.platform,
      message: options.message ?? "استقرار از راهبر",
      disks: options.disks ?? [],
      envs: options.envs ?? {},
      gitInfo: null,
      platformConfig: {},
      sourceID: upload.sourceId,
    });
    const releaseId =
      text(response?.releaseID) ||
      text(response?.releaseId) ||
      text(response?._id);
    if (!releaseId) {
      throw new LiaraError("Liara did not return a release ID", 502);
    }
    return { sourceId: upload.sourceId, releaseId };
  }

  async verifyProject(app: string): Promise<{
    project: ProjectDetail;
    releases: Release[];
    latestRelease?: Release;
    applets: Applet[];
    domains: Domain[];
    url: string;
  }> {
    const [project, releases, applets, domains] = await Promise.all([
      this.getProject(app),
      this.listReleases(app, 5).catch(() => ({
        releases: [] as Release[],
        currentRelease: undefined,
        platform: undefined,
      })),
      this.listApplets(app).catch(() => [] as Applet[]),
      this.listDomains(app).catch(() => [] as Domain[]),
    ]);
    const latestRelease =
      releases.releases.find((r) => r.id === releases.currentRelease) ??
      releases.releases[0];
    return {
      project,
      releases: releases.releases,
      latestRelease,
      applets,
      domains,
      url: projectUrl(project),
    };
  }

  // ---------- domains ----------

  async listDomains(app: string): Promise<Domain[]> {
    const data = await this.request<{ domains?: unknown[] }>(
      this.paasBase,
      "v1/domains",
      { query: { project: app } },
    );
    return asArray(data?.domains).map(normalizeDomain);
  }

  async createDomain(input: {
    name: string;
    project: string;
    type?: string;
  }): Promise<{ id?: string }> {
    const data = await this.request<{ domain?: { _id?: string } }>(
      this.paasBase,
      "v1/domains",
      {
        method: "POST",
        body: {
          name: input.name,
          project: input.project,
          type: input.type ?? "PROJECT",
        },
      },
    );
    return { id: data?.domain?._id };
  }

  async checkDomain(domainId: string): Promise<Domain> {
    const data = await this.request<{ domain?: unknown }>(
      this.paasBase,
      `v1/domains/${encodeURIComponent(domainId)}/check`,
    );
    return normalizeDomain(data?.domain);
  }

  async enableSsl(domain: string): Promise<{ code?: string }> {
    return this.request(this.paasBase, "v1/domains/provision-ssl-certs", {
      method: "POST",
      body: { domain },
    });
  }

  // ---------- VPS / IaaS ----------

  async listVms(): Promise<Vm[]> {
    const data = await this.request<{ vms?: unknown[] }>(this.iaasBase, "vm");
    return asArray(data?.vms).map(normalizeVm);
  }

  async getVm(id: string): Promise<Vm> {
    const data = await this.request<unknown>(
      this.iaasBase,
      `vm/${encodeURIComponent(id)}`,
    );
    return normalizeVm(data);
  }

  async createVm(input: {
    name: string;
    OS: string;
    plan: string;
    config?: { sshPort?: string; SSHKeys?: string[] };
  }): Promise<{ taskID?: string }> {
    return this.request(this.iaasBase, "vm", {
      method: "POST",
      body: input,
    });
  }

  async deleteVm(id: string): Promise<{ taskID?: string }> {
    return this.request(this.iaasBase, `vm/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async vmPower(
    id: string,
    action: "start" | "stop" | "restart",
  ): Promise<void> {
    await this.request(this.iaasBase, `vm/power/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { action },
    });
  }

  async resizeVm(id: string, plan: string): Promise<{ taskID?: string }> {
    return this.request(this.iaasBase, `vm/resize/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { plan },
    });
  }

  async getVmPlans(): Promise<VmPlan[]> {
    const data = await this.request<{ plans?: Record<string, unknown> }>(
      this.iaasBase,
      "plans",
    );
    return Object.entries(data?.plans ?? {}).map(([id, raw]) => {
      const record = asRecord(raw);
      const ram = asRecord(record.RAM);
      const cpu = asRecord(record.CPU);
      return {
        id,
        available: bool(record.available),
        region: text(record.region),
        monthlyPrice: num(record.monthlyPrice),
        hourlyPrice: num(record.hourlyPrice),
        volume: num(record.volume),
        cpu: num(cpu.amount),
        ram: num(ram.amount),
      };
    });
  }

  async getVmOperatingSystems(): Promise<Record<string, string[]>> {
    return this.request<Record<string, string[]>>(this.iaasBase, "oss");
  }

  async getVmOperations(id: string): Promise<unknown> {
    return this.request(this.iaasBase, `vm/operation/${encodeURIComponent(id)}`);
  }

  async getVmTraffic(id: string): Promise<unknown> {
    return this.request(
      this.iaasBase,
      `vm/traffic-graph/${encodeURIComponent(id)}`,
    );
  }

  async extendVmDisk(
    vmId: string,
    diskId: string,
    newSize: number,
  ): Promise<{ taskID?: string }> {
    return this.request(
      this.iaasBase,
      `vm/disk/${encodeURIComponent(vmId)}/${encodeURIComponent(diskId)}`,
      { method: "POST", body: { newSize } },
    );
  }

  // ---------- databases ----------

  async createDatabase(input: {
    hostname: string;
    type: string;
    planID: string;
    version?: string;
    publicNetwork?: boolean;
  }): Promise<{ databaseID?: string }> {
    return this.request(this.paasBase, "v1/databases", {
      method: "POST",
      body: {
        hostname: input.hostname,
        type: input.type,
        planID: input.planID,
        ...(input.version ? { version: input.version } : {}),
        ...(input.publicNetwork !== undefined
          ? { publicNetwork: input.publicNetwork }
          : {}),
      },
    });
  }

  async listDatabases(): Promise<Database[]> {
    const data = await this.request<unknown>(this.paasBase, "v1/databases");
    const record = asRecord(data);
    const list = asArray(record.databases ?? data);
    return list.map((item) => {
      const row = asRecord(item);
      return {
        id: text(row._id) || text(row.id),
        name: text(row.name) || text(row.hostname),
        type: text(row.type),
        planID: text(row.planID),
        status: text(row.status),
        scale: num(row.scale),
        hostname: text(row.hostname),
        port: num(row.port),
        createdAt: text(row.createdAt),
        raw: row,
      };
    });
  }

  // ---------- DNS ----------

  async listZones(): Promise<
    Array<{
      id: string;
      name: string;
      status: string;
      nameServers: string[];
      currentNameServers: string[];
      lastCheckAt?: string;
    }>
  > {
    const data = await this.request<{
      data?: Array<Record<string, unknown>>;
    }>(this.dnsBase, "api/v1/zones");
    return asArray(data?.data).map((item) => {
      const row = asRecord(item);
      return {
        id: text(row.id),
        name: text(row.name),
        status: text(row.status),
        nameServers: asArray(row.nameServers).map(String),
        currentNameServers: asArray(row.currentNameServers).map(String),
        lastCheckAt: text(row.lastCheckAt) || undefined,
      };
    });
  }

  async createZone(name: string): Promise<{ id?: string; nameServers?: string[] }> {
    const data = await this.request<{
      data?: Record<string, unknown>;
    }>(this.dnsBase, "api/v1/zones", {
      method: "POST",
      body: { name },
    });
    const row = asRecord(data?.data);
    return {
      id: text(row.id),
      nameServers: asArray(row.nameServers).map(String),
    };
  }

  async checkZone(zone: string): Promise<unknown> {
    return this.request(
      this.dnsBase,
      `api/v1/zones/${encodeURIComponent(zone)}/check`,
      { method: "PUT" },
    );
  }

  async listDnsRecords(
    zone: string,
  ): Promise<Array<{ id: string; name: string; type: string; ttl?: number; contents: unknown[] }>> {
    const data = await this.request<{ data?: unknown[] }>(
      this.dnsBase,
      `api/v1/zones/${encodeURIComponent(zone)}/dns-records`,
    );
    return asArray(data?.data).map((item) => {
      const row = asRecord(item);
      return {
        id: text(row.id),
        name: text(row.name),
        type: text(row.type),
        ttl: num(row.ttl) || undefined,
        contents: asArray(row.contents),
      };
    });
  }

  async createDnsRecord(
    zone: string,
    input: { name: string; type: string; ttl?: number; contents: unknown[] },
  ): Promise<unknown> {
    return this.request(
      this.dnsBase,
      `api/v1/zones/${encodeURIComponent(zone)}/dns-records`,
      { method: "POST", body: input },
    );
  }
}

// ---------- normalizers ----------

export function normalizePlan(id: string, raw: RawPlan): LiaraPlan {
  const ram = asRecord(raw.RAM);
  const cpu = asRecord(raw.CPU);
  const hourly = num(raw.price);
  const monthly = num(raw.displayPrice) || hourly * 720;
  return {
    id,
    available: bool(raw.available),
    region: text(raw.region) || undefined,
    cpu: num(cpu.amount),
    ram: num(ram.amount),
    disk: num(raw.volume),
    storageClass: text(raw.storageClass) || undefined,
    monthlyPrice: Math.round(monthly),
    hourlyPrice: Math.round(hourly * 100) / 100,
    sharedCpu: bool(cpu.shared),
    sharedRam: bool(ram.shared),
  };
}

export function normalizeBundles(
  raw: Record<string, Record<string, RawBundlePlan>>,
): BundlePlan[] {
  const bundles: BundlePlan[] = [];
  for (const [planID, variants] of Object.entries(raw)) {
    for (const [bundleID, item] of Object.entries(variants ?? {})) {
      if (!item || typeof item !== "object") continue;
      bundles.push({
        id: `${planID}:${bundleID}`,
        planID,
        bundleID,
        available: bool(item.available),
        monthlyPrice: num(item.displayPrice),
        hourlyPrice: num(item.displayHourlyPrice) || num(item.price),
        buildTimeoutMinutes: num(item.buildTimeout, 10),
        maxLogsRetentionDays: num(item.maxLogsRetention, 7),
        maxReportRetentionDays: num(item.maxReportRetention, 7),
        maxDomains:
          item.maxDomainsCount === "infinite"
            ? "infinite"
            : num(item.maxDomainsCount, 1),
        maxDeploymentsPerDay:
          item.maxDeploymentCountInDay === "infinite"
            ? "infinite"
            : num(item.maxDeploymentCountInDay, 20),
        zeroDowntime: bool(item.zeroDowntime),
        rollback: bool(item.rollback),
        maxSourceSizeMb: num(item.maxSourceSize, 128),
        maxDiskPerProject: num(item.maxDiskPerProject, 2),
      } as BundlePlan & { planID: string; bundleID: string });
    }
  }
  return bundles;
}

function normalizeProjectSummary(raw: unknown): ProjectSummary {
  const record = asRecord(raw);
  return {
    id: text(record._id),
    name: text(record.project_id),
    type: text(record.type),
    status: text(record.status),
    scale: num(record.scale),
    planID: text(record.planID),
    bundlePlanID: text(record.bundlePlanID) || undefined,
    createdAt: text(record.created_at) || undefined,
    isDeployed: bool(record.isDeployed),
  };
}

function normalizeProjectDetail(name: string, raw: unknown): ProjectDetail {
  const record = asRecord(raw);
  const node = asRecord(record.node);
  return {
    id: text(record._id),
    name: text(record.project_id) || name,
    type: text(record.type),
    status: text(record.status),
    scale: num(record.scale),
    planID: text(record.planID),
    bundlePlanID: text(record.bundlePlanID) || undefined,
    createdAt: text(record.created_at) || undefined,
    isDeployed: bool(record.isDeployed),
    defaultSubdomain: bool(record.defaultSubdomain),
    readOnlyRootFilesystem: bool(record.readOnlyRootFilesystem),
    zeroDowntime: bool(record.zeroDowntime),
    fixedIPStatus: text(record.fixedIPStatus) || undefined,
    network: text(record.network) || undefined,
    hourlyPrice: num(record.hourlyPrice) || undefined,
    reservedDiskSpace: num(record.reservedDiskSpace) || undefined,
    node: {
      id: text(node._id) || undefined,
      ip: text(node.IP) || undefined,
    },
    envs: asArray(record.envs).map((item) => {
      const env = asRecord(item);
      return {
        key: text(env.key),
        value: text(env.value),
        encrypted: bool(env.encrypted),
        id: text(env._id) || undefined,
      };
    }),
    raw: record,
  };
}

function normalizeRelease(raw: unknown): Release {
  const record = asRecord(raw);
  const git = asRecord(record.gitInfo);
  const author = asRecord(git.author);
  return {
    id: text(record._id),
    type: text(record.type) || undefined,
    state: text(record.state) || "UNKNOWN",
    port: num(record.port) || undefined,
    tag: text(record.tag) || undefined,
    createdAt: text(record.createdAt) || undefined,
    finishedAt: text(record.finishedAt) || undefined,
    imageName: text(record.imageName) || undefined,
    sourceAvailable: bool(record.sourceAvailable),
    failReason: text(record.failReason) || undefined,
    queue: num(record.queue) || undefined,
    git: record.gitInfo
      ? {
          branch: text(git.branch) || undefined,
          commit: text(git.commit) || undefined,
          message: text(git.message) || undefined,
          author: text(author.name) || undefined,
        }
      : null,
    raw: record,
  };
}

function normalizeDomain(raw: unknown): Domain {
  const record = asRecord(raw);
  const project = asRecord(record.project);
  return {
    id: text(record._id) || text(record.id),
    name: text(record.name),
    type: text(record.type) || undefined,
    projectName: text(project.project_id) || undefined,
    status: text(record.status) || "UNKNOWN",
    certificatesStatus: text(record.certificatesStatus) || undefined,
    redirectTo: text(record.redirectTo) || undefined,
    cnameRecord: text(record.CNameRecord) || text(record.cnameRecord) || undefined,
    verificationCode:
      text(record.verificationCode) || text(record.verification_code) || undefined,
    createdAt: text(record.created_at) || undefined,
    raw: record,
  };
}

function normalizeVm(raw: unknown): Vm {
  const record = asRecord(raw);
  const config = asRecord(record.config);
  return {
    id: text(record._id) || text(record.id),
    name: text(record.name),
    plan: text(record.plan),
    os: text(record.OS) || text(record.os),
    state: text(record.state),
    power: text(record.power),
    createdAt: text(record.createdAt) || undefined,
    ips: asArray(record.IPs).map((item) => {
      const ip = asRecord(item);
      return { address: text(ip.address), version: text(ip.version) };
    }),
    raw: { ...record, hostname: text(config.hostname) || undefined },
  };
}

function flattenMetricGroups(groups: unknown): MetricPoint[] {
  const points: MetricPoint[] = [];
  for (const group of asArray(groups)) {
    const record = asRecord(group);
    for (const value of asArray(record.values ?? record.value)) {
      if (!Array.isArray(value) || value.length < 2) continue;
      const tsRaw = value[0];
      const valRaw = value[1];
      const ts =
        typeof tsRaw === "number"
          ? tsRaw > 10_000_000_000
            ? Math.floor(tsRaw / 1000)
            : tsRaw
          : Math.floor(new Date(String(tsRaw)).getTime() / 1000);
      const val = Number(valRaw);
      if (!Number.isFinite(ts) || !Number.isFinite(val)) continue;
      points.push({ timestamp: ts, value: val });
    }
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

export function defaultPort(platform: string): number {
  const ports: Record<string, number> = {
    next: 3000,
    node: 3000,
    docker: 3000,
    static: 80,
    python: 80,
    react: 80,
    vue: 80,
    angular: 80,
    laravel: 80,
    wordpress: 80,
    django: 80,
    flask: 80,
    php: 80,
    dotnet: 80,
    go: 8080,
  };
  return ports[platform] ?? 3000;
}

export function projectUrl(project: ProjectDetail): string {
  if (project.network) return `https://${project.name}.liara.run`;
  return `https://${project.name}.iran.liara.run`;
}

export function maskEmail(value: string): string {
  if (!value.includes("@")) return value ? "•••" : "";
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}•••@${domain}`;
}

export function maskPhone(value: string): string {
  if (!value) return "";
  return `${value.slice(0, 4)}•••${value.slice(-2)}`;
}

export function diskUsagePercent(usage: string, size: string): number | null {
  const parse = (s: string): number | null => {
    const match = s
      .replace(/,/g, "")
      .match(/([\d.]+)\s*(GB|MB|TB|G|M|T)?/i);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const unit = (match[2] ?? "GB").toUpperCase();
    if (unit.startsWith("T")) return value * 1024;
    if (unit.startsWith("M")) return value / 1024;
    return value;
  };
  const used = parse(usage);
  const total = parse(size);
  if (used === null || total === null || total === 0) return null;
  return Math.min(100, Math.round((used / total) * 100));
}
