import fs from "node:fs/promises";
import path from "node:path";
import { appendAudit } from "@/lib/security/audit";
import {
  approvalUrl,
  createApproval,
  decideApproval,
  getApproval,
  getApprovalParams,
  markExecuted,
  markFailed,
} from "@/lib/security/approvals";
import {
  actionMeta,
  buildPreview,
  type ActionType,
} from "@/lib/security/risk-policy";
import { redactObject, redactText } from "@/lib/security/redact";
import type { LiaraClient } from "@/lib/liara/client";
import { defaultPort, projectUrl } from "@/lib/liara/client";
import type { BundlePlan, LiaraPlan } from "@/lib/liara/types";
import { getUpload } from "@/lib/deploy/uploads";
import {
  prepareArchiveFromBuffer,
  prepareArchiveFromDirectory,
  type PreparedArchive,
} from "@/lib/deploy/archive";

export type PrepareActionResult = {
  status: "AWAITING_APPROVAL";
  approvalId: string;
  digest: string;
  action: ActionType;
  risk: string;
  preview: ReturnType<typeof buildPreview>;
  expiresAt: string;
  approveUrl: string;
};

export type ApplyActionResult = {
  status: "executed" | "AWAITING_APPROVAL" | "already_executed";
  approvalId: string;
  action: ActionType;
  result?: unknown;
  message?: string;
};

export async function prepareAction(
  client: LiaraClient,
  input: {
    action: ActionType;
    params: Record<string, unknown>;
    reason?: string;
    sessionId?: string;
  },
): Promise<PrepareActionResult> {
  validateParams(input.action, input.params);
  const meta = actionMeta(input.action);
  const context = await buildActionContext(client, input.action, input.params);
  const preview = buildPreview(input.action, input.params, context);
  const record = await createApproval({
    action: input.action,
    params: input.params,
    risk: meta.risk,
    preview,
    reason: input.reason,
    sessionId: input.sessionId,
  });
  await appendAudit({
    type: "approval_created",
    approvalId: record.id,
    action: input.action,
    risk: meta.risk,
    sessionId: input.sessionId,
    detail: { resource: preview.resource },
  });
  return {
    status: "AWAITING_APPROVAL",
    approvalId: record.id,
    digest: record.digest,
    action: input.action,
    risk: meta.risk,
    preview,
    expiresAt: record.expiresAt,
    approveUrl: approvalUrl(record.id),
  };
}

export async function applyAction(
  client: LiaraClient,
  input: {
    approvalId: string;
    digest: string;
    allowLocalPaths?: boolean;
  },
): Promise<ApplyActionResult> {
  const record = await getApproval(input.approvalId);
  if (!record) throw new Error("درخواست تأیید پیدا نشد یا منقضی شده است.");
  if (record.digest !== input.digest) {
    throw new Error("پارامترهای اقدام با پیش‌نمایش تأییدشده مطابقت ندارد.");
  }
  if (record.status === "executed") {
    return {
      status: "already_executed",
      approvalId: record.id,
      action: record.action,
      result: record.result,
    };
  }
  if (record.status === "pending") {
    return {
      status: "AWAITING_APPROVAL",
      approvalId: record.id,
      action: record.action,
      message: "این اقدام هنوز توسط کاربر تأیید نشده است.",
    };
  }
  if (record.status !== "approved") {
    throw new Error(
      record.status === "rejected"
        ? "کاربر این اقدام را رد کرده است."
        : record.status === "expired"
          ? "مهلت تأیید این اقدام تمام شده است؛ دوباره آماده‌سازی کنید."
          : "این اقدام قابل اجرا نیست.",
    );
  }

  const params = await getApprovalParams(record.id);
  if (!params) throw new Error("پارامترهای اقدام پیدا نشد.");

  await appendAudit({
    type: "action_started",
    approvalId: record.id,
    action: record.action,
    risk: record.risk,
  });

  try {
    const result = await executeAction(client, record.action, params, {
      allowLocalPaths: input.allowLocalPaths ?? false,
    });
    await markExecuted(record.id, result);
    await appendAudit({
      type: "action_succeeded",
      approvalId: record.id,
      action: record.action,
      risk: record.risk,
      detail: result,
    });
    return {
      status: "executed",
      approvalId: record.id,
      action: record.action,
      result: redactObject(result),
    };
  } catch (error) {
    await markFailed(record.id, error);
    await appendAudit({
      type: "action_failed",
      approvalId: record.id,
      action: record.action,
      risk: record.risk,
      detail: { error: redactText(error instanceof Error ? error.message : "unknown") },
    });
    throw error;
  }
}

export async function cancelAction(approvalId: string): Promise<void> {
  await decideApproval(approvalId, "reject");
  await appendAudit({
    type: "approval_rejected",
    approvalId,
    detail: { by: "tool" },
  });
}

export function validateParams(
  action: ActionType,
  params: Record<string, unknown>,
): void {
  const requireString = (key: string, label: string) => {
    if (typeof params[key] !== "string" || !(params[key] as string).trim()) {
      throw new Error(`${label} الزامی است.`);
    }
  };
  switch (action) {
    case "create_app": {
      requireString("name", "نام برنامه");
      requireString("platform", "پلتفرم");
      requireString("planID", "پلن");
      const name = String(params.name);
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/i.test(name)) {
        throw new Error(
          "نام برنامه فقط می‌تواند شامل حروف انگلیسی، عدد و خط تیره باشد (۲ تا ۶۳ کاراکتر).",
        );
      }
      break;
    }
    case "deploy_source":
      requireString("app", "نام برنامه");
      if (
        !params.sourceUploadId &&
        !params.sourcePath &&
        !params.sourceId
      ) {
        throw new Error("یکی از sourceUploadId، sourcePath یا sourceId لازم است.");
      }
      break;
    case "restart_app":
    case "scale_app":
      requireString("app", "نام برنامه");
      break;
    case "create_disk":
      requireString("app", "نام برنامه");
      requireString("name", "نام دیسک");
      requireString("size", "اندازه");
      break;
    case "change_plan":
      requireString("app", "نام برنامه");
      requireString("planID", "پلن جدید");
      break;
    case "update_envs": {
      requireString("app", "نام برنامه");
      if (!Array.isArray(params.variables) || params.variables.length === 0) {
        throw new Error("حداقل یک متغیر محیطی لازم است.");
      }
      for (const variable of params.variables) {
        const row = variable as Record<string, unknown>;
        if (typeof row.key !== "string" || !row.key) {
          throw new Error("کلید متغیر محیطی نامعتبر است.");
        }
        if (typeof row.value !== "string") {
          throw new Error(`مقدار متغیر ${row.key} باید رشته باشد.`);
        }
      }
      break;
    }
    case "set_zero_downtime":
    case "set_default_subdomain":
    case "set_read_only":
      requireString("app", "نام برنامه");
      if (typeof params.enabled !== "boolean") {
        throw new Error("وضعیت enabled باید true یا false باشد.");
      }
      break;
    case "add_domain":
      requireString("app", "نام برنامه");
      requireString("domain", "دامنه");
      if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(String(params.domain))) {
        throw new Error("نام دامنه معتبر نیست.");
      }
      break;
    case "enable_ssl":
      requireString("domain", "دامنه");
      break;
    case "resize_disk":
      requireString("app", "نام برنامه");
      requireString("disk", "نام دیسک");
      requireString("size", "اندازه");
      break;
    case "create_vm":
      requireString("name", "نام سرور");
      requireString("OS", "سیستم‌عامل");
      requireString("plan", "پلن");
      break;
    case "vm_power":
      requireString("vmId", "شناسه‌ی سرور");
      if (!["start", "stop", "restart"].includes(String(params.action))) {
        throw new Error("action باید start، stop یا restart باشد.");
      }
      break;
    case "resize_vm":
      requireString("vmId", "شناسه‌ی سرور");
      requireString("plan", "پلن");
      break;
    case "delete_app":
      requireString("name", "نام برنامه");
      break;
    case "delete_vm":
      requireString("vmId", "شناسه‌ی سرور");
      break;
    case "create_database":
      requireString("hostname", "نام دیتابیس");
      requireString("type", "نوع دیتابیس");
      requireString("planID", "پلن دیتابیس");
      break;
    default:
      throw new Error(`نوع اقدام پشتیبانی نمی‌شود: ${action}`);
  }
}

async function buildActionContext(
  client: LiaraClient,
  action: ActionType,
  params: Record<string, unknown>,
): Promise<{
  changes: string[];
  cost: {
    monthlyTomanDelta?: number;
    hourlyTomanDelta?: number;
    note?: string;
  };
  resource: string;
  warnings: string[];
}> {
  const changes: string[] = [];
  const cost: {
    monthlyTomanDelta?: number;
    hourlyTomanDelta?: number;
    note?: string;
  } = {};
  const warnings: string[] = [];
  let resource = String(
    params.name ?? params.app ?? params.domain ?? params.vmId ?? "",
  );

  switch (action) {
    case "create_app": {
      const plans = await client.getPlanData();
      const plan = findPlan(plans.projects, String(params.planID));
      let bundle = params.bundlePlanID
        ? findBundle(plans.bundles, plan.id, String(params.bundlePlanID))
        : null;
      if (!params.bundlePlanID) {
        const available = plans.bundles
          .filter((item) => item.planID === plan.id && item.available)
          .sort((a, b) => {
            const order = ["standard", "pro", "basic", "free"];
            return order.indexOf(a.bundleID) - order.indexOf(b.bundleID);
          });
        bundle = available[0] ?? null;
        if (bundle) params.bundlePlanID = bundle.bundleID;
      }
      if (params.bundlePlanID && !bundle) {
        const availableIds = plans.bundles
          .filter((item) => item.planID === plan.id && item.available)
          .map((item) => item.bundleID);
        throw new Error(
          `بسته‌ی «${params.bundlePlanID}» برای پلن ${plan.id} در دسترس نیست. گزینه‌ها: ${availableIds.join("، ")}`,
        );
      }
      const monthly =
        bundle && bundle.monthlyPrice > 0
          ? bundle.monthlyPrice
          : plan.monthlyPrice;
      const billing = (await client.getBilling().catch(() => null)) as
        | { user?: { balance?: number } }
        | null;
      const balance = Number(billing?.user?.balance);
      if (Number.isFinite(balance) && monthly > balance) {
        warnings.push(
          `موجودی حساب (${balance.toLocaleString("fa-IR")}) کمتر از هزینه‌ی ماهانه‌ی این پلن (${monthly.toLocaleString("fa-IR")}) است؛ ممکن است ساخت برنامه با خطای 402 متوقف شود.`,
        );
      }
      cost.monthlyTomanDelta = monthly;
      cost.hourlyTomanDelta =
        Math.round(
          (bundle && bundle.hourlyPrice > 0
            ? bundle.hourlyPrice
            : plan.hourlyPrice) * 100,
        ) / 100;
      resource = String(params.name);
      changes.push(
        `برنامه‌ی «${params.name}» با پلتفرم ${params.platform} ساخته می‌شود.`,
        `پلن سخت‌افزاری: ${plan.id} (${plan.ram} GB RAM، ${plan.cpu} CPU، ${plan.disk} GB دیسک)`,
        bundle
          ? `بسته‌ی امکانات: ${bundle.bundleID} (${bundle.monthlyPrice.toLocaleString("fa-IR")} تومان در ماه، شامل منابع)`
          : "بسته‌ی امکانات: پیش‌فرض",
      );
      break;
    }
    case "deploy_source": {
      resource = String(params.app);
      changes.push(
        `سورس روی برنامه‌ی «${params.app}» آپلود و یک release جدید ساخته می‌شود.`,
      );
      if (params.filename) changes.push(`فایل: ${params.filename}`);
      if (params.sourceUploadId) changes.push(`شناسه‌ی آپلود: ${params.sourceUploadId}`);
      if (params.sourcePath) changes.push(`مسیر محلی: ${params.sourcePath}`);
      if (params.sourceId) changes.push(`منبع قبلی: ${params.sourceId}`);
      if (params.envs && typeof params.envs === "object") {
        changes.push(
          `تعداد متغیر محیطی: ${Object.keys(params.envs as Record<string, string>).length} (مقادیر مخفی)`,
        );
      }
      warnings.push(
        "آپلود و بیلد ممکن است چند دقیقه طول بکشد؛ در این مدت وضعیت سرویس می‌تواند ناپایدار باشد.",
      );
      break;
    }
    case "restart_app":
      resource = String(params.app);
      changes.push(`کانتینر برنامه‌ی «${params.app}» ری‌استارت می‌شود.`);
      break;
    case "scale_app":
      resource = String(params.app);
      changes.push(
        Number(params.scale) === 1
          ? `برنامه‌ی «${params.app}» روشن می‌شود.`
          : `برنامه‌ی «${params.app}» خاموش می‌شود و سرویس قطع می‌شود.`,
      );
      break;
    case "change_plan": {
      const project = await client.getProject(String(params.app));
      const plans = await client.getPlanData();
      const current = plans.projects.find((p) => p.id === project.planID);
      const next = findPlan(plans.projects, String(params.planID));
      const currentBundle = plans.bundles.find(
        (b) =>
          b.planID === project.planID &&
          b.bundleID === project.bundlePlanID,
      );
      const nextBundle = plans.bundles.find(
        (b) =>
          b.planID === next.id &&
          b.bundleID === (project.bundlePlanID ?? currentBundle?.bundleID) &&
          b.available,
      );
      const currentTotal =
        currentBundle && currentBundle.monthlyPrice > 0
          ? currentBundle.monthlyPrice
          : current?.monthlyPrice ?? 0;
      const nextTotal =
        nextBundle && nextBundle.monthlyPrice > 0
          ? nextBundle.monthlyPrice
          : next.monthlyPrice;
      cost.monthlyTomanDelta = nextTotal - currentTotal;
      cost.hourlyTomanDelta =
        Math.round(
          ((nextBundle && nextBundle.hourlyPrice > 0
            ? nextBundle.hourlyPrice
            : next.hourlyPrice) -
            (currentBundle && currentBundle.hourlyPrice > 0
              ? currentBundle.hourlyPrice
              : current?.hourlyPrice ?? 0)) *
            100,
        ) / 100;
      resource = project.name;
      changes.push(
        `پلن برنامه از ${project.planID} به ${next.id} تغییر می‌کند.`,
        `منابع جدید: ${next.ram} GB RAM، ${next.cpu} CPU، ${next.disk} GB دیسک`,
      );
      break;
    }
    case "update_envs": {
      resource = String(params.app);
      const variables = params.variables as Array<{ key: string }>;
      changes.push(
        `متغیرهای محیطی برنامه‌ی «${params.app}» به‌روزرسانی می‌شوند.`,
        `کلیدها: ${variables.map((v) => v.key).join("، ")}`,
        "مقادیر جدید در این پیش‌نمایش و در لاگ نمایش داده نمی‌شوند.",
      );
      warnings.push("مقدار اشتباه می‌تواند برنامه را از کار بیندازد.");
      break;
    }
    case "set_zero_downtime":
      changes.push(
        `استقرار بدون اختلال برنامه ${params.enabled ? "روشن" : "خاموش"} می‌شود.`,
      );
      break;
    case "set_default_subdomain":
      changes.push(
        `زیردامنه‌ی پیش‌فرض ${params.enabled ? "روشن" : "خاموش"} می‌شود.`,
      );
      break;
    case "set_read_only":
      changes.push(
        `فایل‌سیستم برنامه ${params.enabled ? "read-only" : "قابل‌نوشتن"} می‌شود.`,
      );
      break;
    case "add_domain":
      resource = String(params.domain);
      changes.push(
        `دامنه‌ی «${params.domain}» به برنامه‌ی «${params.app}» متصل می‌شود.`,
        "لیارا رکوردهای DNS لازم را برمی‌گرداند؛ تنظیم در ایرنیک/ثبت‌کننده باید دستی انجام شود.",
      );
      break;
    case "enable_ssl":
      resource = String(params.domain);
      changes.push(`برای دامنه‌ی «${params.domain}» درخواست گواهی SSL ثبت می‌شود.`);
      break;
    case "create_disk":
      resource = String(params.app);
      changes.push(
        `دیسک «${params.name}» با حجم ${params.size} به برنامه اضافه می‌شود.`,
      );
      warnings.push("هزینه‌ی دیسک در API به‌صورت جداگانه اعلام نشده است.");
      break;
    case "resize_disk":
      resource = String(params.app);
      changes.push(
        `حجم دیسک «${params.disk}» به ${params.size} تغییر می‌کند.`,
      );
      break;
    case "create_vm": {
      resource = String(params.name);
      const vms = await client.getVmPlans();
      const plan = vms.find((p) => p.id === params.plan);
      if (plan) {
        cost.monthlyTomanDelta = plan.monthlyPrice;
        cost.hourlyTomanDelta = plan.hourlyPrice;
        changes.push(
          `ماشین مجازی «${params.name}» با ${plan.cpu} CPU، ${plan.ram} GB RAM و ${plan.volume} GB دیسک ساخته می‌شود.`,
        );
      } else {
        changes.push(`ماشین مجازی «${params.name}» با پلن ${params.plan} ساخته می‌شود.`);
      }
      warnings.push("نصب و کانفیگ داخل سرور از طریق API انجام نمی‌شود.");
      break;
    }
    case "vm_power":
      resource = String(params.vmId);
      changes.push(
        `سرور ${params.vmId} دستور ${params.action} را دریافت می‌کند.`,
      );
      break;
    case "resize_vm": {
      resource = String(params.vmId);
      const vms = await client.getVmPlans();
      const plan = vms.find((p) => p.id === params.plan);
      if (plan) {
        cost.monthlyTomanDelta = plan.monthlyPrice;
        cost.hourlyTomanDelta = plan.hourlyPrice;
      }
      changes.push(`پلن سرور ${params.vmId} به ${params.plan} تغییر می‌کند.`);
      break;
    }
    case "delete_app":
      resource = String(params.name);
      changes.push(`برنامه‌ی «${params.name}» و منابع آن حذف می‌شوند.`);
      break;
    case "delete_vm":
      resource = String(params.vmId);
      changes.push(`ماشین مجازی ${params.vmId} حذف می‌شود.`);
      break;
    case "create_database": {
      resource = String(params.hostname);
      const data = await client.getPlanData();
      const raw = (data.raw?.databases ?? {}) as Record<string, unknown>;
      const dbPlan = raw[String(params.planID)] as
        | { displayPrice?: number; price?: number }
        | undefined;
      if (dbPlan) {
        cost.monthlyTomanDelta =
          Number(dbPlan.displayPrice ?? 0) ||
          Number(dbPlan.price ?? 0) * 720;
      }
      changes.push(
        `دیتابیس «${params.hostname}» از نوع ${params.type} با پلن ${params.planID} ساخته می‌شود.`,
      );
      warnings.push("اطلاعات اتصال پس از ساخت باید در env برنامه تنظیم شود.");
      break;
    }
    default:
      break;
  }

  return { changes, cost, resource, warnings };
}

function findPlan(plans: LiaraPlan[], id: string): LiaraPlan {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new Error(`پلن «${id}» پیدا نشد.`);
  if (!plan.available) {
    throw new Error(`پلن «${id}» در حال حاضر قابل سفارش نیست.`);
  }
  return plan;
}

function findBundle(
  bundles: BundlePlan[],
  planId: string,
  bundleId: string,
): BundlePlan | null {
  const found = bundles.find(
    (b) => b.planID === planId && b.bundleID === bundleId && b.available,
  );
  return found ?? null;
}

async function executeAction(
  client: LiaraClient,
  action: ActionType,
  params: Record<string, unknown>,
  options: { allowLocalPaths: boolean },
): Promise<unknown> {
  switch (action) {
    case "create_app": {
      await client.createProject({
        name: String(params.name),
        planID: String(params.planID),
        platform: String(params.platform),
        bundlePlanID: params.bundlePlanID
          ? String(params.bundlePlanID)
          : undefined,
        readOnlyRootFilesystem:
          typeof params.readOnlyRootFilesystem === "boolean"
            ? params.readOnlyRootFilesystem
            : undefined,
      });
      await wait(1500);
      const project = await client.getProject(String(params.name));
      return {
        app: project.name,
        planID: project.planID,
        platform: project.type,
        status: project.status,
        url: projectUrl(project),
        next:
          "برای استقرار، سورس را آپلود کنید یا از یک release قبلی استفاده کنید.",
      };
    }

    case "deploy_source": {
      const app = String(params.app);
      const project = await client.getProject(app);
      const platform = String(params.platform ?? project.type);
      const port = Number(params.port ?? defaultPort(platform));
      const envs = (params.envs ?? {}) as Record<string, string>;
      const build = (params.build ?? {}) as Record<string, unknown>;
      const message = params.message ? String(params.message) : undefined;

      if (params.sourceId) {
        const response = await client.createRelease(app, {
          build: { cache: true, args: {}, dockerfile: null, location: null, ...build },
          cron: null,
          args: null,
          port,
          type: platform,
          message: message ?? "استقرار از راهبر",
          disks: [],
          envs,
          gitInfo: null,
          platformConfig: {},
          sourceID: String(params.sourceId),
        });
        const releaseId =
          String(response.releaseID ?? response.releaseId ?? response._id ?? "");
        return {
          app,
          releaseId,
          status: "DEPLOYING",
          hint: "با liara_wait_release وضعیت بیلد را دنبال کنید.",
        };
      }

      let archive: PreparedArchive;
      if (params.sourceUploadId) {
        const upload = await getUpload(String(params.sourceUploadId));
        if (!upload) throw new Error("فایل آپلودشده پیدا نشد یا منقضی شده است.");
        archive = {
          buffer: upload.buffer,
          filename: upload.meta.filename,
          size: upload.meta.size,
          fileCount: upload.meta.fileCount,
          platform: upload.meta.platform,
        };
      } else if (params.sourcePath) {
        if (!options.allowLocalPaths) {
          throw new Error(
            "خواندن مسیر محلی در این حالت غیرفعال است. از sourceUploadId استفاده کنید.",
          );
        }
        archive = await readLocalSource(
          String(params.sourcePath),
          options.allowLocalPaths,
        );
      } else {
        throw new Error("منبع استقرار مشخص نیست.");
      }

      const result = await client.deploySource(app, archive.buffer, {
        filename: archive.filename,
        platform,
        port,
        envs,
        message,
        build,
      });
      return {
        app,
        sourceId: result.sourceId,
        releaseId: result.releaseId,
        status: "DEPLOYING",
        platform,
        port,
        hint: "با liara_wait_release وضعیت بیلد را دنبال کنید.",
      };
    }

    case "restart_app": {
      const before = await client.getProject(String(params.app));
      await client.restartProject(String(params.app));
      await wait(3500);
      const after = await client.getProject(String(params.app));
      return {
        app: after.name,
        before: { status: before.status, scale: before.scale },
        after: { status: after.status, scale: after.scale },
        verified: true,
      };
    }

    case "scale_app": {
      const before = await client.getProject(String(params.app));
      await client.scaleProject(String(params.app), Number(params.scale) === 1 ? 1 : 0);
      await wait(3000);
      const after = await client.getProject(String(params.app));
      return {
        app: after.name,
        beforeScale: before.scale,
        afterScale: after.scale,
        status: after.status,
      };
    }

    case "change_plan": {
      const before = await client.getProject(String(params.app));
      await client.resizeProject(String(params.app), String(params.planID));
      await wait(3000);
      const after = await client.getProject(String(params.app));
      return {
        app: after.name,
        beforePlanID: before.planID,
        afterPlanID: after.planID,
        status: after.status,
      };
    }

    case "update_envs": {
      const variables = params.variables as Array<{ key: string; value: string }>;
      const response = await client.updateEnvs(
        String(params.app),
        variables.map((v) => ({ key: v.key, value: v.value })),
      );
      if (params.restart === true) {
        await client.restartProject(String(params.app));
      }
      return {
        app: params.app,
        updatedKeys: variables.map((v) => v.key),
        message: response?.message,
        restarted: params.restart === true,
      };
    }

    case "set_zero_downtime": {
      const project = await client.getProject(String(params.app));
      await client.setZeroDowntime(project.id, Boolean(params.enabled));
      return { projectId: project.id, enabled: params.enabled, app: project.name };
    }

    case "set_default_subdomain": {
      const project = await client.getProject(String(params.app));
      await client.setDefaultSubdomain(project.id, Boolean(params.enabled));
      return { projectId: project.id, enabled: params.enabled, app: project.name };
    }

    case "set_read_only": {
      const project = await client.getProject(String(params.app));
      await client.setReadOnly(project.id, Boolean(params.enabled));
      return { projectId: project.id, enabled: params.enabled, app: project.name };
    }

    case "add_domain": {
      const app = String(params.app);
      const created = await client.createDomain({
        name: String(params.domain),
        project: app,
        type: params.type ? String(params.type) : undefined,
      });
      await wait(1200);
      const domains = await client.listDomains(app);
      const domain =
        domains.find((d) => d.name === params.domain) ??
        domains.find((d) => d.id === created.id);
      return {
        app,
        domain,
        records: domain
          ? {
              cname: domain.cnameRecord,
              verification: domain.verificationCode,
              raw: domain.raw,
            }
          : null,
        manualStep:
          "رکوردهای بالا را در پنل ایرنیک/ثبت‌کننده وارد کنید؛ سپس به من بگویید تا وضعیت را بررسی کنم.",
      };
    }

    case "enable_ssl": {
      const domain = String(params.domain);
      const response = await client.enableSsl(domain);
      return { domain, ...response, hint: "وضعیت SSL ممکن است چند دقیقه بعد ACTIVE شود." };
    }

    case "create_disk": {
      const app = String(params.app);
      await client.createDisk(app, {
        name: String(params.name),
        size: String(params.size),
      });
      await wait(1200);
      const disks = await client.listDisks(app);
      return { app, disks: disks.disks };
    }

    case "resize_disk": {
      const app = String(params.app);
      await client.resizeDisk(app, String(params.disk), String(params.size));
      await wait(1200);
      const disks = await client.listDisks(app);
      return { app, disks: disks.disks };
    }

    case "create_vm": {
      const result = await client.createVm({
        name: String(params.name),
        OS: String(params.OS),
        plan: String(params.plan),
        config: params.config as { sshPort?: string; SSHKeys?: string[] } | undefined,
      });
      await wait(1500);
      const vms = await client.listVms();
      const vm = vms.find((v) => v.name === params.name);
      return {
        taskID: result.taskID,
        vm: vm ?? null,
        hint: "ساخت VM ممکن است چند دقیقه طول بکشد. با liara_list_vms وضعیت را بررسی کنید.",
      };
    }

    case "vm_power": {
      const vmId = String(params.vmId);
      await client.vmPower(vmId, params.action as "start" | "stop" | "restart");
      await wait(2500);
      const vm = await client.getVm(vmId);
      return { vmId, power: vm.power, state: vm.state };
    }

    case "resize_vm": {
      const vmId = String(params.vmId);
      const result = await client.resizeVm(vmId, String(params.plan));
      await wait(2000);
      const vm = await client.getVm(vmId);
      return { taskID: result.taskID, vmId, plan: vm.plan, state: vm.state };
    }

    case "delete_app": {
      await client.deleteProject(String(params.name));
      return { deleted: true, app: params.name };
    }

    case "delete_vm": {
      await client.deleteVm(String(params.vmId));
      return { deleted: true, vmId: params.vmId };
    }

    case "create_database": {
      const result = await client.createDatabase({
        hostname: String(params.hostname),
        type: String(params.type),
        planID: String(params.planID),
        version: params.version ? String(params.version) : undefined,
        publicNetwork:
          typeof params.publicNetwork === "boolean"
            ? params.publicNetwork
            : undefined,
      });
      return {
        databaseID: result.databaseID,
        hostname: params.hostname,
        hint: "اطلاعات اتصال را از پنل/API بگیرید و در env برنامه تنظیم کنید.",
      };
    }

    default:
      throw new Error(`اجرای این اقدام پیاده‌سازی نشده است: ${action}`);
  }
}

async function readLocalSource(
  sourcePath: string,
  allowLocalPaths: boolean,
): Promise<PreparedArchive> {
  if (!allowLocalPaths) {
    throw new Error("خواندن مسیر محلی مجاز نیست.");
  }
  const root = process.env.LIARA_MCP_SOURCE_ROOT
    ? path.resolve(process.env.LIARA_MCP_SOURCE_ROOT)
    : process.cwd();
  const resolved = path.resolve(sourcePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `برای امنیت، فقط مسیرهای داخل ${root} مجاز هستند.`,
    );
  }
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) return prepareArchiveFromDirectory(resolved);
  const buffer = await fs.readFile(resolved);
  if (/\.(tar\.gz|tgz|zip)$/i.test(resolved)) {
    return prepareArchiveFromBuffer(buffer, path.basename(resolved));
  }
  throw new Error("فایل سورس باید zip یا tar.gz باشد.");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
