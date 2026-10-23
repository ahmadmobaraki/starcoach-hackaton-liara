export type ActionType =
  | "create_app"
  | "deploy_source"
  | "restart_app"
  | "scale_app"
  | "change_plan"
  | "update_envs"
  | "set_zero_downtime"
  | "set_default_subdomain"
  | "set_read_only"
  | "add_domain"
  | "enable_ssl"
  | "create_disk"
  | "resize_disk"
  | "create_vm"
  | "vm_power"
  | "resize_vm"
  | "delete_app"
  | "delete_vm"
  | "create_database";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ActionMeta = {
  action: ActionType;
  risk: RiskLevel;
  title: string;
  reversible: boolean;
  summary: string;
  confirmResourceKey?: string;
  warnings: string[];
};

export const ACTION_META: Record<ActionType, ActionMeta> = {
  create_app: {
    action: "create_app",
    risk: "high",
    title: "ساخت برنامه‌ی جدید",
    reversible: false,
    summary:
      "یک برنامه‌ی جدید در حساب لیارا ساخته می‌شود و از همین لحظه هزینه‌ی پلن فعال می‌شود.",
    confirmResourceKey: "name",
    warnings: ["هزینه‌ی پلن از زمان ساخت محاسبه می‌شود."],
  },
  deploy_source: {
    action: "deploy_source",
    risk: "high",
    title: "استقرار نسخه‌ی جدید",
    reversible: true,
    summary:
      "سورس آپلود می‌شود، بیلد اجرا می‌شود و نسخه‌ی جدید روی برنامه منتشر می‌شود. نسخه‌ی قبلی تا حدی قابل بازگشت است.",
    warnings: [
      "اگر بیلد یا health check شکست بخورد، ممکن است سرویس موقتاً در دسترس نباشد.",
      "مقادیر متغیرهای محیطی هرگز در پیش‌نمایش نمایش داده نمی‌شوند.",
    ],
  },
  restart_app: {
    action: "restart_app",
    risk: "medium",
    title: "ری‌استارت برنامه",
    reversible: true,
    summary:
      "کانتینر برنامه ری‌استارت می‌شود. در چند ثانیه ممکن است درخواست‌ها خطا بگیرند.",
    warnings: ["اگر برنامه در حال بیلد یا استقرار باشد، ری‌استارت را به تعویق بیندازید."],
  },
  scale_app: {
    action: "scale_app",
    risk: "high",
    title: "روشن/خاموش کردن برنامه",
    reversible: true,
    summary:
      "تعداد نمونه‌های در حال اجرا تغییر می‌کند. خاموش کردن برنامه باعث قطع سرویس می‌شود.",
    warnings: ["scale=0 سرویس را کاملاً قطع می‌کند."],
  },
  change_plan: {
    action: "change_plan",
    risk: "high",
    title: "تغییر پلن برنامه",
    reversible: true,
    summary:
      "منابع و هزینه‌ی برنامه تغییر می‌کند. ارتقا معمولاً فوری و کاهش پلن ممکن است محدودیت داشته باشد.",
    warnings: [
      "هزینه‌ی ماهانه/ساعتی از لحظه‌ی اعمال تغییر محاسبه می‌شود.",
      "کاهش منابع می‌تواند باعث افت عملکرد یا خطا شود.",
    ],
  },
  update_envs: {
    action: "update_envs",
    risk: "high",
    title: "به‌روزرسانی متغیرهای محیطی",
    reversible: true,
    summary:
      "کلید/مقدارهای محیطی برنامه تغییر می‌کنند و معمولاً یک ری‌استارت یا استقرار لازم است.",
    warnings: [
      "مقادیر حساس به‌صورت ماسک‌شده نمایش داده می‌شوند و در لاگ ذخیره نمی‌شوند.",
      "مقدار اشتباه می‌تواند برنامه را از کار بیندازد.",
    ],
  },
  set_zero_downtime: {
    action: "set_zero_downtime",
    risk: "medium",
    title: "تغییر استقرار بدون اختلال",
    reversible: true,
    summary:
      "استقرار بدون اختلال برای نسخه‌های بعدی روشن یا خاموش می‌شود.",
    warnings: [],
  },
  set_default_subdomain: {
    action: "set_default_subdomain",
    risk: "medium",
    title: "تغییر زیردامنه‌ی پیش‌فرض",
    reversible: true,
    summary:
      "زیردامنه‌ی پیش‌فرض لیارا برای این برنامه روشن یا خاموش می‌شود.",
    warnings: ["خاموش کردن آن دسترسی از آدرس پیش‌فرض را قطع می‌کند."],
  },
  set_read_only: {
    action: "set_read_only",
    risk: "high",
    title: "تغییر وضعیت فایل‌سیستم",
    reversible: true,
    summary:
      "فایل‌سیستم ریشه‌ی برنامه read-only یا قابل‌نوشتن می‌شود.",
    warnings: ["برنامه‌هایی که در زمان اجرا فایل می‌نویسند ممکن است خطا بدهند."],
  },
  add_domain: {
    action: "add_domain",
    risk: "medium",
    title: "افزودن دامنه",
    reversible: true,
    summary:
      "دامنه به برنامه متصل می‌شود و لیارا رکوردهای DNS لازم را نمایش می‌دهد.",
    warnings: [
      "تنظیم رکورد در ایرنیک/ثبت‌کننده از طریق API ممکن نیست و باید دستی انجام شود.",
    ],
  },
  enable_ssl: {
    action: "enable_ssl",
    risk: "medium",
    title: "فعال‌سازی SSL",
    reversible: true,
    summary:
      "برای دامنه گواهی SSL درخواست می‌شود. صدور گواهی ممکن است چند دقیقه طول بکشد.",
    warnings: ["تا زمان فعال شدن گواهی، سایت با http یا هشدار امنیتی باز می‌شود."],
  },
  create_disk: {
    action: "create_disk",
    risk: "high",
    title: "افزودن دیسک",
    reversible: false,
    summary:
      "یک دیسک پایدار جدید به برنامه اضافه می‌شود و هزینه‌ی فضای ذخیره‌سازی اضافه می‌شود.",
    confirmResourceKey: "name",
    warnings: ["دیسک پس از ساخت هزینه‌ی ماهانه دارد."],
  },
  resize_disk: {
    action: "resize_disk",
    risk: "high",
    title: "تغییر اندازه‌ی دیسک",
    reversible: false,
    summary: "فضای دیسک افزایش می‌یابد و هزینه‌ی ذخیره‌سازی تغییر می‌کند.",
    warnings: ["کاهش اندازه ممکن است پشتیبانی نشود."],
  },
  create_vm: {
    action: "create_vm",
    risk: "high",
    title: "ساخت سرور مجازی (VPS)",
    reversible: false,
    summary:
      "یک ماشین مجازی جدید با پلن و سیستم‌عامل انتخابی ساخته می‌شود و هزینه‌ی آن فعال می‌شود.",
    confirmResourceKey: "name",
    warnings: [
      "مدیریت داخل سرور (نصب پکیج، فایروال، SSH) از طریق API انجام نمی‌شود.",
      "هزینه‌ی پلن و IP از زمان ساخت محاسبه می‌شود.",
    ],
  },
  vm_power: {
    action: "vm_power",
    risk: "high",
    title: "تغییر وضعیت سرور",
    reversible: true,
    summary: "سرور مجازی روشن، خاموش یا ری‌استارت می‌شود.",
    warnings: ["خاموش کردن سرور سرویس‌های روی آن را قطع می‌کند."],
  },
  resize_vm: {
    action: "resize_vm",
    risk: "high",
    title: "تغییر پلن سرور",
    reversible: true,
    summary: "منابع سرور مجازی تغییر می‌کند و ممکن است نیاز به ری‌استارت داشته باشد.",
    warnings: ["هزینه‌ی پلن جدید از زمان اعمال محاسبه می‌شود."],
  },
  delete_app: {
    action: "delete_app",
    risk: "critical",
    title: "حذف برنامه",
    reversible: false,
    summary:
      "برنامه و منابع متصل به آن حذف می‌شوند. این عملیات برگشت‌پذیر نیست.",
    confirmResourceKey: "name",
    warnings: [
      "همه‌ی نسخه‌ها، دامنه‌ها و تنظیمات برنامه از بین می‌رود.",
      "برای تأیید باید نام برنامه را دقیقاً تایپ کنید.",
    ],
  },
  delete_vm: {
    action: "delete_vm",
    risk: "critical",
    title: "حذف سرور مجازی",
    reversible: false,
    summary: "ماشین مجازی و دیسک‌های آن حذف می‌شوند.",
    confirmResourceKey: "name",
    warnings: [
      "داده‌های داخل سرور از بین می‌رود.",
      "برای تأیید باید نام سرور را دقیقاً تایپ کنید.",
    ],
  },
  create_database: {
    action: "create_database",
    risk: "high",
    title: "ساخت دیتابیس مدیریت‌شده",
    reversible: false,
    summary: "یک دیتابیس جدید در لیارا ساخته می‌شود و هزینه‌ی آن فعال می‌شود.",
    confirmResourceKey: "name",
    warnings: ["اطلاعات اتصال را پس از ساخت باید در متغیرهای محیطی برنامه تنظیم کنید."],
  },
};

export function actionMeta(action: string): ActionMeta {
  const meta = ACTION_META[action as ActionType];
  if (!meta) {
    throw new Error(`نوع اقدام ناشناخته است: ${action}`);
  }
  return meta;
}

export function requiresApproval(action: string): boolean {
  const meta = actionMeta(action);
  return meta.risk !== "low";
}

export function isCritical(action: string): boolean {
  return actionMeta(action).risk === "critical";
}

export type ActionPreview = {
  action: ActionType;
  title: string;
  summary: string;
  risk: RiskLevel;
  reversible: boolean;
  resource: string;
  changes: string[];
  cost: {
    monthlyTomanDelta?: number;
    hourlyTomanDelta?: number;
    note?: string;
  };
  warnings: string[];
  confirmTextRequired?: string;
};

export function buildPreview(
  action: string,
  params: Record<string, unknown>,
  extra: {
    changes?: string[];
    cost?: ActionPreview["cost"];
    resource?: string;
    warnings?: string[];
  } = {},
): ActionPreview {
  const meta = actionMeta(action);
  const resource =
    extra.resource ||
    String(params.name ?? params.app ?? params.vm ?? params.domain ?? "—");
  const confirmValue =
    meta.risk === "critical" &&
    meta.confirmResourceKey &&
    params[meta.confirmResourceKey] !== undefined
      ? String(params[meta.confirmResourceKey])
      : undefined;

  return {
    action: meta.action,
    title: meta.title,
    summary: meta.summary,
    risk: meta.risk,
    reversible: meta.reversible,
    resource,
    changes: extra.changes ?? [],
    cost: extra.cost ?? {},
    warnings: [...meta.warnings, ...(extra.warnings ?? [])],
    confirmTextRequired: confirmValue,
  };
}
