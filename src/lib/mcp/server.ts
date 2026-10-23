import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { LiaraClient, projectUrl } from "@/lib/liara/client";
import { diagnose, memoryValueToGb } from "@/lib/liara/diagnostics";
import { recommendPlan, type TrafficLevel } from "@/lib/liara/plan-advisor";
import type { BundlePlan, LiaraPlan, ProjectDetail } from "@/lib/liara/types";
import { getGuide, guideToMarkdown, listGuides } from "@/lib/guides";
import { applyAction, cancelAction, prepareAction } from "./actions";
import { getApproval } from "@/lib/security/approvals";
import { ACTION_META, type ActionType } from "@/lib/security/risk-policy";
import {
  maskEnvVars,
  redactObject,
  redactText,
  safeError,
} from "@/lib/security/redact";

const ACTION_NAMES = Object.keys(ACTION_META) as [ActionType, ...ActionType[]];

export type CreateServerOptions = {
  client?: LiaraClient;
  allowLocalPaths?: boolean;
};

export function createLiaraMcpServer(options: CreateServerOptions = {}): McpServer {
  const client = options.client ?? createDefaultClient();
  const defaultAllowLocalPaths =
    options.allowLocalPaths ??
    process.env.LIARA_MCP_ALLOW_LOCAL_PATHS === "true";

  const server = new McpServer(
    { name: "raahbar-liara", version: "0.1.0" },
    {
      instructions: [
        "راهبر is a Liara operations MCP server.",
        "Read tools are safe. Every mutation must use liara_prepare_action, then a human must approve it via the panel; never ask for or fabricate an approval.",
        "The panel executes the approved action and resumes the agent. In external MCP clients, the tool returns an approveUrl and the human approves there, then calls liara_apply_action with approvalId and digest.",
        "For steps the API cannot perform (Irnic records, payment, KYC, SSH, code changes), call liara_get_guide, give the exact steps, ask the user to report the result, then verify with a read tool.",
        "Never expose secrets. Environment values are intentionally masked.",
      ].join(" "),
    },
  );

  // ---------- account, projects, plans ----------

  server.registerTool(
    "liara_account",
    {
      title: "Liara account overview",
      description:
        "Read the current Liara account, verification state and available plan counts. No secrets are returned.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const [summary, plans, billing] = await Promise.all([
          client.getAccountSummary(),
          client.getPlanData(),
          client.getBilling().catch(() => null),
        ]);
        return {
          account: summary,
          billing,
          plans: {
            availableProjects: plans.projects.filter((p) => p.available).length,
            availableBundles: plans.bundles.filter((b) => b.available).length,
          },
          capabilities: {
            canReadProjects: true,
            canDeploy: true,
            canManageVms: true,
            canChangeIrnic: false,
            canPay: false,
            canSsh: false,
          },
        };
      }),
  );

  server.registerTool(
    "liara_list_projects",
    {
      title: "List Liara projects",
      description:
        "List all PaaS apps with status, plan, scale and default URL. Read-only.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const projects = await client.listProjects();
        const plans = await client.getPlanData();
        return {
          count: projects.length,
          projects: projects.map((project) => ({
            ...project,
            plan: plans.projects.find((p) => p.id === project.planID) ?? null,
            url: defaultUrl(project.name, project.scale),
            health:
              project.scale === 0
                ? "stopped"
                : project.isDeployed
                  ? "deployed"
                  : "not_deployed",
          })),
        };
      }),
  );

  server.registerTool(
    "liara_get_project",
    {
      title: "Get Liara project",
      description:
        "Get one app's details, plan, bundle, domains and env keys (values masked). Read-only.",
      inputSchema: z.object({
        app: appName(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app }) =>
      run(async () => {
        const project = await client.getProject(app);
        const plans = await client.getPlanData();
        const domains = await client.listDomains(app).catch(() => []);
        const plan = plans.projects.find((p) => p.id === project.planID) ?? null;
        const bundle =
          plans.bundles.find(
            (b) =>
              b.planID === project.planID &&
              b.bundleID === project.bundlePlanID,
          ) ?? null;
        return {
          project: publicProject(project),
          plan,
          bundle,
          domains,
          url: projectUrl(project),
          envs: maskEnvVars(project.envs),
          note:
            "env values are masked; use update_envs to change them with approval.",
        };
      }),
  );

  server.registerTool(
    "liara_list_plans",
    {
      title: "List live Liara plans",
      description:
        "Read normalized PaaS hardware plans and feature bundles from /v1/me. Prices are live.",
      inputSchema: z.object({
        includeUnavailable: z.boolean().optional().default(false),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ includeUnavailable }) =>
      run(async () => {
        const data = await client.getPlanData();
        const projects = includeUnavailable
          ? data.projects
          : data.projects.filter((p) => p.available);
        const bundles = includeUnavailable
          ? data.bundles
          : data.bundles.filter((b) => b.available);
        return {
          projects,
          bundles: groupBundles(bundles),
          currency: "Toman",
          note: "monthlyPrice is the display price; hourlyPrice is the hourly rate.",
        };
      }),
  );

  server.registerTool(
    "liara_recommend_plan",
    {
      title: "Recommend a Liara plan",
      description:
        "Deterministic plan recommendation from framework, traffic, database/disk needs and budget. Reads live plans and suggests a hardware plan plus feature bundle with costs and tradeoffs.",
      inputSchema: z.object({
        framework: z
          .enum([
            "next",
            "node",
            "laravel",
            "php",
            "django",
            "flask",
            "python",
            "react",
            "vue",
            "angular",
            "static",
            "docker",
            "go",
            "dotnet",
          ])
          .describe("Project framework/platform"),
        traffic: z
          .enum(["low", "medium", "high", "very_high"])
          .optional()
          .describe("Traffic level if known"),
        expectedVisitorsPerDay: z.number().positive().optional(),
        hasDatabase: z.boolean().optional().default(false),
        databaseType: z.string().optional(),
        needsPersistentDisk: z.boolean().optional().default(false),
        diskGb: z.number().positive().optional(),
        budgetMonthlyToman: z.number().positive().optional(),
        needsZeroDowntime: z.boolean().optional(),
        logsRetentionDays: z.number().positive().optional(),
        region: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) =>
      run(async () => {
        const data = await client.getPlanData();
        const recommendation = recommendPlan(
          {
            ...input,
            traffic: input.traffic as TrafficLevel | undefined,
          },
          data.projects,
          data.bundles,
        );
        return recommendation;
      }),
  );

  // ---------- monitoring ----------

  server.registerTool(
    "liara_app_logs",
    {
      title: "Read app logs",
      description:
        "Read recent application logs, redacted, optionally filtered to errors. Read-only.",
      inputSchema: z.object({
        app: appName(),
        sinceMinutes: z.number().min(1).max(1440).optional().default(30),
        severity: z.enum(["all", "errors", "warnings"]).optional().default("all"),
        limit: z.number().min(1).max(200).optional().default(100),
        releaseId: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, sinceMinutes, severity, limit, releaseId }) =>
      run(async () => {
        const logs = await client.listLogs(app, {
          sinceSeconds: (sinceMinutes ?? 30) * 60,
          limit: 400,
          releaseId,
        });
        const redacted = logs.map((line) => ({
          ...line,
          message: redactText(line.message),
        }));
        const filtered = redacted.filter((line) => {
          if (severity === "errors") return isErrorLine(line.message);
          if (severity === "warnings")
            return isErrorLine(line.message) || /warn|deprecated|slow/i.test(line.message);
          return true;
        });
        const selected = filtered.slice(-(limit ?? 100));
        return {
          app,
          count: selected.length,
          total: redacted.length,
          errors: redacted.filter((l) => isErrorLine(l.message)).length,
          lines: selected.map((line) => ({
            at: line.timestamp,
            message: line.message,
            releaseId: line.releaseId || undefined,
          })),
          note:
            selected.length === 0
              ? "در این بازه لاگی پیدا نشد. ممکن است برنامه ترافیک نداشته باشد یا بازه‌ی نگه‌داری لاگ کوتاه باشد."
              : undefined,
        };
      }),
  );

  server.registerTool(
    "liara_app_metrics",
    {
      title: "Read app metrics",
      description:
        "Read CPU, memory, disk and network metrics with resource percentages against the app plan. Read-only.",
      inputSchema: z.object({
        app: appName(),
        sinceHours: z.number().min(1).max(168).optional().default(6),
        points: z.number().min(10).max(120).optional().default(40),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, sinceHours, points }) =>
      run(async () => {
        const project = await client.getProject(app);
        const data = await client.getPlanData();
        const plan = data.projects.find((p) => p.id === project.planID) ?? null;
        const metrics = await client.getFullMetrics(app, (sinceHours ?? 6) * 3600);
        return {
          app,
          plan,
          signals: metricSignals(metrics, plan),
          series: {
            cpu: downsample(metrics.cpu, points ?? 40),
            memory: downsample(metrics.memory, points ?? 40),
            networkReceive: downsample(metrics.networkReceive, points ?? 40),
            networkTransmit: downsample(metrics.networkTransmit, points ?? 40),
          },
          disks: metrics.disks,
          note:
            metrics.cpu.length === 0 && metrics.memory.length === 0
              ? "متریک تازه‌ای در این بازه دریافت نشد."
              : undefined,
        };
      }),
  );

  server.registerTool(
    "liara_app_releases",
    {
      title: "Read app releases and events",
      description:
        "Read deployment history, latest release, applet states and build log tail. Read-only.",
      inputSchema: z.object({
        app: appName(),
        count: z.number().min(1).max(50).optional().default(10),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, count }) =>
      run(async () => {
        const [history, applets] = await Promise.all([
          client.listReleases(app, count ?? 10),
          client.listApplets(app).catch(() => []),
        ]);
        let buildTail: string[] = [];
        if (history.releases[0]) {
          try {
            const logs = await client.getBuildLogs(history.releases[0].id);
            buildTail = logs.lines.slice(-30);
          } catch {
            buildTail = [];
          }
        }
        return {
          app,
          platform: history.platform,
          currentRelease: history.currentRelease,
          releases: history.releases.map(publicRelease),
          applets,
          buildLogTail: buildTail,
        };
      }),
  );

  server.registerTool(
    "liara_app_events",
    {
      title: "Read app events",
      description: "Read recent Liara app events. Read-only.",
      inputSchema: z.object({
        app: appName(),
        hours: z.number().min(1).max(168).optional().default(24),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, hours }) =>
      run(async () => {
        const end = Math.floor(Date.now() / 1000);
        const start = end - (hours ?? 24) * 3600;
        const events = await client.listEvents(app, { start, end });
        return { app, count: events.length, events };
      }),
  );

  server.registerTool(
    "liara_diagnose_app",
    {
      title: "Diagnose a Liara app",
      description:
        "Composite diagnostics: reads project state, releases, applets, logs, metrics and domains, then returns ranked hypotheses with evidence, confidence and recommended approved actions. Use this for 500/slow/won't-start incidents.",
      inputSchema: z.object({
        app: appName(),
        sinceMinutes: z.number().min(5).max(1440).optional().default(60),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, sinceMinutes }) =>
      run(async () => {
        const project = await client.getProject(app);
        const [plans, history, applets, logs, metrics, domains] =
          await Promise.all([
            client.getPlanData(),
            client.listReleases(app, 10).catch(() => ({ releases: [] })),
            client.listApplets(app).catch(() => []),
            client
              .listLogs(app, {
                sinceSeconds: (sinceMinutes ?? 60) * 60,
                limit: 500,
              })
              .catch(() => []),
            client.getFullMetrics(app, 6 * 3600).catch(() => ({
              cpu: [],
              memory: [],
              networkReceive: [],
              networkTransmit: [],
              disks: [],
            })),
            client.listDomains(app).catch(() => []),
          ]);
        const plan =
          plans.projects.find((p) => p.id === project.planID) ?? undefined;
        const diagnosis = diagnose({
          project,
          plan,
          releases: history.releases,
          applets,
          logs,
          metrics,
          domains,
        });
        return {
          app,
          project: publicProject(project),
          plan: plan ?? null,
          diagnosis,
          logSummary: {
            count: logs.length,
            errors: logs.filter((l) => isErrorLine(l.message)).length,
            windowMinutes: sinceMinutes ?? 60,
          },
          actions: diagnosis.findings.flatMap((finding) =>
            finding.recommendations.map((recommendation) => ({
              finding: finding.id,
              ...recommendation,
            })),
          ),
        };
      }),
  );

  server.registerTool(
    "liara_verify_project",
    {
      title: "Verify an app after an action",
      description:
        "Read project, current release, applets, domains and health signals to verify the result of a deployment or remediation. Read-only.",
      inputSchema: z.object({
        app: appName(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app }) =>
      run(async () => {
        const verified = await client.verifyProject(app);
        const plans = await client.getPlanData();
        const plan =
          plans.projects.find((p) => p.id === verified.project.planID) ?? null;
        const metrics = await client.getFullMetrics(app, 3600).catch(() => ({
          cpu: [],
          memory: [],
          networkReceive: [],
          networkTransmit: [],
          disks: [],
        }));
        return {
          ...verified,
          project: publicProject(verified.project),
          currentRelease: verified.latestRelease
            ? publicRelease(verified.latestRelease)
            : null,
          plan,
          signals: metricSignals(metrics, plan),
          healthy:
            verified.project.scale > 0 &&
            verified.latestRelease?.state === "READY" &&
            (metricSignals(metrics, plan).cpuPercent ?? 0) < 95,
        };
      }),
  );

  server.registerTool(
    "liara_wait_release",
    {
      title: "Wait for a release",
      description:
        "Poll a release until READY/FAILED/UNHEALTHY or a timeout, and return the build log tail. Read-only.",
      inputSchema: z.object({
        releaseId: z.string().min(1),
        timeoutSeconds: z.number().min(10).max(180).optional().default(90),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ releaseId, timeoutSeconds }) =>
      run(async () => {
        const result = await client.waitForRelease(releaseId, {
          timeoutMs: (timeoutSeconds ?? 90) * 1000,
          intervalMs: 3000,
        });
        return {
          ...result,
          hint: result.ok
            ? "نسخه با موفقیت آماده شد."
            : result.state === "UNKNOWN" ||
                ["BUILDING", "DEPLOYING", "QUEUED"].includes(result.state)
              ? "هنوز در حال اجراست؛ دوباره liara_wait_release را صدا بزنید."
              : "استقرار موفق نبود؛ لاگ بیلد و پیشنهاد اصلاح را بررسی کنید.",
        };
      }),
  );

  // ---------- domains ----------

  server.registerTool(
    "liara_list_domains",
    {
      title: "List app domains",
      description:
        "List domains, status, SSL status and the DNS records Liara expects. Read-only.",
      inputSchema: z.object({ app: appName() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app }) =>
      run(async () => {
        const domains = await client.listDomains(app);
        return {
          app,
          domains,
          note:
            "رکوردهای DNS را در ایرنیک/ثبت‌کننده وارد کنید؛ API لیارا نمی‌تواند آن‌ها را تغییر دهد.",
        };
      }),
  );

  server.registerTool(
    "liara_check_domain",
    {
      title: "Check a domain",
      description:
        "Check a domain's DNS/SSL status by domain name or id. Use after the user reports changing records at Irnic. Read-only.",
      inputSchema: z.object({
        app: appName(),
        domain: z.string().min(1).describe("Domain name or domain id"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, domain }) =>
      run(async () => {
        const domains = await client.listDomains(app);
        const found = domains.find((d) => d.name === domain || d.id === domain);
        if (!found) {
          throw new Error(
            `دامنه‌ی «${domain}» در لیست دامنه‌های برنامه پیدا نشد. ابتدا دامنه را اضافه کنید.`,
          );
        }
        const checked = await client.checkDomain(found.id);
        return {
          app,
          domain: found,
          checked,
          active:
            checked.status === "ACTIVE" &&
            (!checked.certificatesStatus ||
              checked.certificatesStatus === "ACTIVE"),
          next:
            checked.status !== "ACTIVE"
              ? "رکوردهای DNS را بررسی کنید؛ انتشار ممکن است تا چند ساعت طول بکشد."
              : checked.certificatesStatus !== "ACTIVE"
                ? "گواهی SSL هنوز فعال نشده؛ چند دقیقه بعد دوباره بررسی کنید."
                : "دامنه و SSL فعال هستند.",
        };
      }),
  );

  // ---------- VPS ----------

  server.registerTool(
    "liara_list_vms",
    {
      title: "List Liara VMs",
      description: "List virtual machines with power/state, plan and IPs. Read-only.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const [vms, plans] = await Promise.all([
          client.listVms(),
          client.getVmPlans().catch(() => []),
        ]);
        return {
          count: vms.length,
          vms: vms.map((vm) => ({
            ...vm,
            planDetails: plans.find((p) => p.id === vm.plan) ?? null,
          })),
        };
      }),
  );

  server.registerTool(
    "liara_vm_plans",
    {
      title: "List VPS plans",
      description: "List live IaaS VM plans with CPU, RAM, disk and prices. Read-only.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const plans = await client.getVmPlans();
        return { plans, currency: "Toman" };
      }),
  );

  server.registerTool(
    "liara_vm_os",
    {
      title: "List VPS operating systems",
      description: "List available VM operating systems. Read-only.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const oss = await client.getVmOperatingSystems();
        return { operatingSystems: oss };
      }),
  );

  server.registerTool(
    "liara_list_databases",
    {
      title: "List Liara databases",
      description: "List managed databases. Read-only.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      run(async () => {
        const databases = await client.listDatabases();
        return { count: databases.length, databases };
      }),
  );

  // ---------- guides ----------

  server.registerTool(
    "liara_list_guides",
    {
      title: "List manual-step guides",
      description:
        "List Persian runbooks for steps the API cannot perform, such as Irnic DNS, payment, SSH and code changes.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => run(async () => ({ guides: listGuides() })),
  );

  server.registerTool(
    "liara_get_guide",
    {
      title: "Get a manual-step guide",
      description:
        "Get a Persian runbook with exact steps, what the agent can/cannot do, and how to verify the user's result. Use when the API cannot perform the task.",
      inputSchema: z.object({
        topic: z.string().min(1).describe(
          "Guide id or alias: first-deploy, deploy-methods, domain-irnic, domain-liara, envs, http-500, slow-site, docker, database, vps-ssh, billing, rollback, limits, source-package, scale",
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic }) =>
      run(async () => {
        const guide = getGuide(topic);
        if (!guide) {
          return {
            found: false,
            topic,
            available: listGuides().map((g) => g.id),
            message:
              "راهنمای دقیق برای این موضوع ندارم؛ از لیست موجود یکی را انتخاب کنید یا سؤال را دقیق‌تر بپرسید.",
          };
        }
        return {
          found: true,
          guide,
          markdown: guideToMarkdown(guide),
        };
      }),
  );

  // ---------- two-phase actions ----------

  server.registerTool(
    "liara_prepare_action",
    {
      title: "Prepare a Liara action",
      description:
        "Validate a mutation and create an approval request. This does NOT execute the action. Returns approvalId, digest, risk, cost impact, plain-language changes and an approve URL. The human approves in the panel, then liara_apply_action executes. Required params per action: create_app {name, platform, planID, bundlePlanID}; deploy_source {app, sourceUploadId|sourcePath|sourceId, platform?, port?}; restart_app {app}; scale_app {app, scale}; change_plan {app, planID}; update_envs {app, variables:[{key,value}]}; add_domain {app, domain}; enable_ssl {domain}; create_disk {app, name, size}; resize_disk {app, disk, size}; create_vm {name, OS, plan}; vm_power {vmId, action}; resize_vm {vmId, plan}; delete_app {name}; delete_vm {vmId}; create_database {hostname, type, planID}. For create_app, bundlePlanID is required; use liara_recommend_plan to get it.",
      inputSchema: z.object({
        action: z.enum(ACTION_NAMES),
        params: z.record(z.string(), z.unknown()),
        reason: z.string().optional(),
        sessionId: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ action, params, reason, sessionId }) =>
      run(async () =>
        prepareAction(client, {
          action,
          params: params as Record<string, unknown>,
          reason,
          sessionId,
        }),
      ),
  );

  server.registerTool(
    "liara_apply_action",
    {
      title: "Apply an approved Liara action",
      description:
        "Execute an action ONLY after a human approved it in the panel. Requires approvalId and digest. If the approval is pending, returns AWAITING_APPROVAL without mutating anything.",
      inputSchema: z.object({
        approvalId: z.string().min(1),
        digest: z.string().min(1),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ approvalId, digest }) =>
      run(async () =>
        applyAction(client, {
          approvalId,
          digest,
          allowLocalPaths: defaultAllowLocalPaths,
        }),
      ),
  );

  server.registerTool(
    "liara_action_status",
    {
      title: "Get approval status",
      description: "Read the status and preview of an approval request. Read-only.",
      inputSchema: z.object({ approvalId: z.string().min(1) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ approvalId }) =>
      run(async () => {
        const approval = await getApproval(approvalId);
        if (!approval) throw new Error("درخواست تأیید پیدا نشد.");
        return approval;
      }),
  );

  server.registerTool(
    "liara_cancel_action",
    {
      title: "Cancel an approval",
      description:
        "Reject a pending approval (no Liara mutation). Use when the user changes their mind.",
      inputSchema: z.object({ approvalId: z.string().min(1) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ approvalId }) =>
      run(async () => {
        await cancelAction(approvalId);
        return { cancelled: true, approvalId };
      }),
  );

  // ---------- prompts ----------

  server.registerPrompt(
    "deploy-new-app",
    {
      title: "Deploy a new app",
      description:
        "Guide a non-technical user through framework detection, plan choice, approval, upload and deploy.",
      argsSchema: {
        projectName: z.string().optional(),
        framework: z.string().optional(),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "می‌خواهم اولین استقرار وب‌سایتم را در لیارا انجام دهم.",
              args.projectName ? `نام پروژه: ${args.projectName}` : "",
              args.framework ? `فریم‌ورک: ${args.framework}` : "",
              "اول نیازهای پروژه را بپرس (فقط سؤال‌هایی که روی پلن اثر دارد)، لاگین حساب را بررسی کن، پلن زنده را نشان بده و بعد از تأیید من مراحل ساخت و استقرار را انجام بده.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "choose-plan",
    {
      title: "Choose the right plan",
      description: "Ask the minimum questions and recommend a Liara plan with live prices.",
      argsSchema: {
        framework: z.string().optional(),
        traffic: z.string().optional(),
        budget: z.string().optional(),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "برای پروژه‌ام پلن مناسب لیارا را انتخاب کن.",
              args.framework ? `فریم‌ورک: ${args.framework}` : "",
              args.traffic ? `ترافیک: ${args.traffic}` : "",
              args.budget ? `بودجه: ${args.budget}` : "",
              "فقط سؤال‌های تعیین‌کننده را بپرس، سپس liara_recommend_plan را صدا بزن و گزینه‌ها را با قیمت و دلیل مقایسه کن.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "troubleshoot-500",
    {
      title: "Troubleshoot HTTP 500",
      description: "Run composite diagnostics and rank causes with evidence.",
      argsSchema: { app: z.string().optional() },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              args.app ? `برنامه‌ی ${args.app} خطای 500 می‌دهد.` : "سایتم خطای 500 می‌دهد.",
              "اول liara_diagnose_app را اجرا کن. سپس حداکثر ۳ علت را با شاهد و میزان اطمینان توضیح بده. برای اقدام حساس، liara_prepare_action بساز و منتظر تأیید من بمان. بعد از اجرا، نتیجه را دوباره بررسی کن.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "slow-site",
    {
      title: "Diagnose a slow site",
      description: "Check resources, logs and plan pressure, then offer approved remediation.",
      argsSchema: { app: z.string().optional() },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              args.app ? `برنامه‌ی ${args.app} کند شده است.` : "سایتم کند شده است.",
              "متریک CPU/RAM/دیسک و لاگ‌ها را بررسی کن، فشار منابع را با پلن مقایسه کن، و اگر ارتقای پلن یا ری‌استارت لازم است با تأیید من انجام بده.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "connect-domain",
    {
      title: "Connect a domain",
      description:
        "Create the Liara domain, show exact DNS records, give the Irnic checklist, and verify after the user reports back.",
      argsSchema: {
        app: z.string().optional(),
        domain: z.string().optional(),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              args.domain ? `می‌خواهم دامنه‌ی ${args.domain} را وصل کنم.` : "می‌خواهم دامنه‌ام را به سایتم وصل کنم.",
              args.app ? `برنامه: ${args.app}` : "",
              "اگر دامنه در لیارا نیست، با تأیید من اضافه کن و رکوردهای دقیق DNS را نشان بده. سپس liara_get_guide با موضوع domain-irnic را بخوان و چک‌لیست ایرنیک را بده. بعد از اینکه گفتم انجام دادم، liara_check_domain را اجرا کن.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "what-can-you-do",
    {
      title: "What can you do?",
      description: "Explain capabilities, manual steps and the approval protocol in Persian.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "به زبان ساده بگو چه کارهایی را خودت انجام می‌دهی، چه کارهایی را من باید انجام بدهم، و برای کارهای حساس چطور تأیید می‌گیری. بعد بپرس هدف فعلی من چیست.",
          },
        },
      ],
    }),
  );

  // ---------- resources ----------

  server.registerResource(
    "guides",
    "liara://guides",
    {
      title: "راهنماهای راهبر",
      description: "List of Persian runbooks for manual steps.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify({ guides: listGuides() }, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "guide",
    new ResourceTemplate("liara://guides/{topic}", { list: undefined }),
    {
      title: "راهنمای راهبر",
      description: "A Persian runbook by topic.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const topic = String(variables.topic ?? "");
      const guide = getGuide(topic);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: guide
              ? guideToMarkdown(guide)
              : `راهنمای «${topic}» پیدا نشد. موضوع‌های موجود: ${listGuides()
                  .map((g) => g.id)
                  .join(", ")}`,
          },
        ],
      };
    },
  );

  server.registerResource(
    "account",
    "liara://account",
    {
      title: "Liara account",
      description: "Redacted account summary.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const summary = await client.getAccountSummary();
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify(
                summary,
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "text/plain",
              text: `خطا در خواندن حساب: ${safeError(error)}`,
            },
          ],
        };
      }
    },
  );

  return server;
}

// ---------- helpers ----------

function createDefaultClient(): LiaraClient {
  const config = getConfig();
  return new LiaraClient({
    apiKey: config.liaraApiKey,
    teamId: config.liaraTeamId,
  });
}

function appName() {
  return z
    .string()
    .min(1)
    .max(64)
    .describe("Liara app/project name (project_id)");
}

function run(fn: () => Promise<unknown>) {
  return fn()
    .then((data) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(redactObject(data), null, 2),
        },
      ],
    }))
    .catch((error) => ({
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              error: safeError(error),
              ...(error && typeof error === "object" && "status" in error
                ? { status: (error as { status?: number }).status }
                : {}),
              ...(error && typeof error === "object" && "code" in error
                ? { code: (error as { code?: string }).code }
                : {}),
            },
            null,
            2,
          ),
        },
      ],
    }));
}

function publicProject(project: ProjectDetail) {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    status: project.status,
    scale: project.scale,
    planID: project.planID,
    bundlePlanID: project.bundlePlanID,
    createdAt: project.createdAt,
    isDeployed: project.isDeployed,
    zeroDowntime: project.zeroDowntime,
    defaultSubdomain: project.defaultSubdomain,
    readOnlyRootFilesystem: project.readOnlyRootFilesystem,
    network: project.network,
    fixedIPStatus: project.fixedIPStatus,
    hourlyPrice: project.hourlyPrice,
    node: project.node,
    url: projectUrl(project),
  };
}

function publicRelease(release: {
  id: string;
  state: string;
  tag?: string;
  port?: number;
  createdAt?: string;
  finishedAt?: string;
  failReason?: string;
  queue?: number;
  git?: unknown;
}) {
  return {
    id: release.id,
    state: release.state,
    tag: release.tag,
    port: release.port,
    createdAt: release.createdAt,
    finishedAt: release.finishedAt,
    failReason: release.failReason,
    queue: release.queue,
    git: release.git,
  };
}

function groupBundles(bundles: BundlePlan[]) {
  const result: Record<string, BundlePlan[]> = {};
  for (const bundle of bundles) {
    (result[bundle.planID] ??= []).push(bundle);
  }
  return result;
}

function defaultUrl(name: string, scale: number): string {
  if (!name || scale === 0) return "";
  return `https://${name}.iran.liara.run`;
}

function isErrorLine(message: string): boolean {
  return /\b5\d\d\b|error|exception|fatal|panic|unhandled|econnrefused|etimedout|enospc|oom|out of memory|build failed|npm err/i.test(
    message,
  );
}

function metricSignals(
  metrics: {
    cpu: Array<{ value: number }>;
    memory: Array<{ value: number }>;
    networkReceive: Array<{ value: number }>;
    networkTransmit: Array<{ value: number }>;
    disks: Array<{ size: string; usage: string }>;
  },
  plan: LiaraPlan | null,
) {
  const cpu = stats(metrics.cpu);
  const memory = stats(metrics.memory);
  const cpuPercent =
    cpu.avg && plan?.cpu ? Math.min(100, Math.round((cpu.avg / plan.cpu) * 100)) : null;
  const memoryGb = memory.avg
    ? memoryValueToGb(memory.avg, plan?.ram)
    : null;
  const memoryPercent =
    memoryGb !== null && plan?.ram
      ? Math.min(100, Math.round((memoryGb / plan.ram) * 100))
      : null;
  const diskPercent = worstDisk(metrics.disks);
  return {
    cpuAvg: round(cpu.avg),
    cpuPeak: round(cpu.max),
    cpuPercent,
    memoryAvgGb: memoryGb === null ? null : round(memoryGb),
    memoryPercent,
    diskPercent,
    networkReceiveTotal: round(
      metrics.networkReceive.reduce((sum, p) => sum + p.value, 0),
    ),
    networkTransmitTotal: round(
      metrics.networkTransmit.reduce((sum, p) => sum + p.value, 0),
    ),
  };
}

function stats(points: Array<{ value: number }>) {
  if (!points.length) return { avg: 0, max: 0, min: 0 };
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const point of points) {
    sum += point.value;
    if (point.value > max) max = point.value;
    if (point.value < min) min = point.value;
  }
  return { avg: sum / points.length, max, min };
}

function worstDisk(disks: Array<{ size: string; usage: string }>): number | null {
  let worst: number | null = null;
  for (const disk of disks) {
    const used = parseSizeGb(disk.usage);
    const total = parseSizeGb(disk.size);
    if (used === null || total === null || total === 0) continue;
    const percent = Math.min(100, Math.round((used / total) * 100));
    if (worst === null || percent > worst) worst = percent;
  }
  return worst;
}

function parseSizeGb(value: string): number | null {
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*(GB|MB|TB|G|M|T)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] ?? "GB").toUpperCase();
  if (unit.startsWith("T")) return amount * 1024;
  if (unit.startsWith("M")) return amount / 1024;
  return amount;
}

function downsample<T>(points: T[], size: number): T[] {
  if (points.length <= size) return points;
  const step = points.length / size;
  return Array.from({ length: size }, (_, i) => points[Math.floor(i * step)]);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

