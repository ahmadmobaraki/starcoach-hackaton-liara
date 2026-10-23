"use client";

import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Cloud,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import type { AccountLite, ProjectHealth, ProjectLite } from "@/components/types";
import { BrandLockup } from "@/components/ui/logo";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
import { fa } from "@/lib/utils/format";

export function Sidebar({
  account,
  projects,
  activeProject,
  health,
  healthLoading,
  onSelectProject,
  onRefresh,
  onPrompt,
  onPickFile,
  onClose,
  model,
  mcpConnected,
  className,
}: {
  account: AccountLite | null;
  projects: ProjectLite[];
  activeProject?: string;
  health: ProjectHealth | null;
  healthLoading?: boolean;
  onSelectProject: (name: string) => void;
  onRefresh: () => void;
  onPrompt: (prompt: string) => void;
  onPickFile: () => void;
  onClose?: () => void;
  model?: string;
  mcpConnected?: boolean;
  className?: string;
}) {
  const project = projects.find((p) => p.name === activeProject) ?? null;
  const diagnosis = health?.diagnosis;
  const signals = diagnosis?.signals;

  return (
    <aside
      className={cn(
        "flex h-dvh w-[308px] shrink-0 flex-col border-s border-line bg-bg/95",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <BrandLockup />
        {onClose ? (
          <button
            type="button"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
            onClick={onClose}
            aria-label="بستن منو"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="mx-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
          {(account?.fullname ?? "ل").slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-semibold">
            {account?.fullname ?? "حساب لیارا"}
          </div>
          <div className="truncate text-[9.5px] text-muted" dir="ltr">
            {account?.emailMasked ?? "متصل"}
          </div>
        </div>
        {account?.isVerified ? (
          <span title="حساب تأییدشده">
            <ShieldCheck className="size-4 text-success" />
          </span>
        ) : (
          <Cloud className="size-4 text-muted" />
        )}
      </div>

      <div className="mx-4 mt-4">
        <label
          htmlFor="active-project"
          className="mb-1.5 block text-[10px] font-medium text-muted"
        >
          پروژه‌ی فعال
        </label>
        <div className="relative">
          <select
            id="active-project"
            value={activeProject ?? ""}
            onChange={(event) => onSelectProject(event.target.value)}
            className="h-10 w-full appearance-none rounded-xl border border-line bg-surface px-3 pe-8 text-[12px] font-medium outline-none transition focus:border-accent/50"
            disabled={!projects.length}
          >
            {!projects.length ? (
              <option value="">پروژه‌ای وجود ندارد</option>
            ) : null}
            {projects.map((projectItem) => (
              <option key={projectItem.id || projectItem.name} value={projectItem.name}>
                {projectItem.name} · {projectItem.status}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
        </div>
      </div>

      <div className="mx-4 mt-3 flex-1 overflow-y-auto pb-3 no-scrollbar">
        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted">
              <Activity className="size-3.5" />
              وضعیت سرویس
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-surface-2"
              aria-label="به‌روزرسانی وضعیت"
            >
              {healthLoading ? (
                <Spinner className="size-3.5" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </button>
          </div>

          {project ? (
            <>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      project.scale === 0
                        ? "bg-warning"
                        : diagnosis?.severity === "critical"
                          ? "bg-danger"
                          : diagnosis?.severity === "warning"
                            ? "bg-warning"
                            : "bg-success",
                    )}
                  />
                  <span className="truncate text-[12px] font-bold" dir="ltr">
                    {project.name}
                  </span>
                </div>
                <Badge
                  tone={
                    project.scale === 0
                      ? "warning"
                      : diagnosis?.severity === "critical"
                        ? "danger"
                        : diagnosis?.severity === "warning"
                          ? "warning"
                          : "success"
                  }
                >
                  {project.scale === 0
                    ? "خاموش"
                    : diagnosis?.severity === "critical"
                      ? "مشکل جدی"
                      : diagnosis?.severity === "warning"
                        ? "نیاز به بررسی"
                        : "سالم"}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] leading-5 text-muted">
                {diagnosis?.headline ?? "در حال خواندن وضعیت..."}
              </p>

              <div className="mt-3 space-y-2">
                <MiniBar
                  label="CPU"
                  value={signals?.cpuPercent ?? null}
                />
                <MiniBar
                  label="حافظه"
                  value={signals?.memoryPercent ?? null}
                />
                <MiniBar
                  label="دیسک"
                  value={signals?.diskPercent ?? null}
                />
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[9.5px] text-muted">
                <span>release</span>
                <span className="font-mono" dir="ltr">
                  {health?.latestRelease?.state ?? signals?.releaseState ?? "—"}
                </span>
              </div>

              {diagnosis?.severity === "critical" ? (
                <button
                  type="button"
                  onClick={() =>
                    onPrompt(`وضعیت ${project.name} بحرانی است. عیب‌یابی کامل انجام بده.`)
                  }
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger-soft px-2 py-1.5 text-[10.5px] font-medium text-danger transition hover:bg-danger/10"
                >
                  <AlertTriangle className="size-3.5" />
                  عیب‌یابی فوری
                </button>
              ) : null}
            </>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-surface-2/40 px-3 py-4 text-center">
              <p className="text-[10.5px] leading-5 text-muted">
                هنوز پروژه‌ای به حساب وصل نیست. با یک گفت‌وگو شروع کن.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-1.5">
          <QuickAction
            icon={<Upload className="size-3.5" />}
            label="استقرار پروژه"
            onClick={onPickFile}
          />
          <QuickAction
            icon={<Wrench className="size-3.5" />}
            label="عیب‌یابی هوشمند"
            onClick={() =>
              onPrompt(
                project
                  ? `وضعیت برنامه‌ی ${project.name} را کامل بررسی کن و اگر مشکلی هست علت‌ها را با شواهد بگو.`
                  : "می‌خوام سایتم رو بررسی کنی؛ از کجا شروع کنم؟",
              )
            }
          />
          <QuickAction
            icon={<CircleHelp className="size-3.5" />}
            label="راهنمای کارهای دستی"
            onClick={() =>
              onPrompt(
                "چه کارهایی رو خودت انجام می‌دی و چه کارهایی رو باید من انجام بدم؟ راهنمای قدم‌به‌قدم بده.",
              )
            }
          />
          <QuickAction
            icon={<Server className="size-3.5" />}
            label="سرور مجازی"
            onClick={() =>
              onPrompt("پلن‌های سرور مجازی لیارا و گزینه‌های ساخت VM را بررسی کن.")
            }
          />
        </div>

        <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
            <ShieldCheck className="size-3.5 text-success" />
            محدودیت‌های شفاف
          </div>
          <p className="mt-1 text-[9.5px] leading-5 text-muted">
            تغییر DNS در ایرنیک، پرداخت، KYC و SSH از طریق API ممکن نیست. راهبر
            این موارد را قدم‌به‌قدم توضیح می‌دهد و بعد از انجام، نتیجه را بررسی می‌کند.
          </p>
          <button
            type="button"
            onClick={() =>
              onPrompt("محدودیت‌های API لیارا در این راهکار را کامل توضیح بده.")
            }
            className="mt-1.5 text-[9.5px] font-medium text-accent hover:underline"
          >
            مشاهده‌ی محدودیت‌ها
          </button>
        </div>
      </div>

      <div className="border-t border-line px-5 py-3">
        <div className="flex items-center justify-between text-[9px] text-muted">
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "size-1.5 rounded-full",
                mcpConnected ? "bg-success" : "bg-warning",
              )}
            />
            {mcpConnected ? "MCP متصل" : "MCP در انتظار"}
          </span>
          <span className="truncate font-mono" dir="ltr">
            {model ?? "deepseek"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[9px] text-muted/80">
          <Sparkles className="size-2.5" />
          ساخته‌شده برای چالش لیارا
        </div>
      </div>
    </aside>
  );
}

function MiniBar({ label, value }: { label: string; value: number | null }) {
  const safe = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[9px] text-muted">
        <span>{label}</span>
        <span>{safe === null ? "—" : `${fa(safe)}٪`}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div
          className={cn(
            "h-full rounded-full",
            safe === null
              ? "bg-muted/30"
              : safe >= 90
                ? "bg-danger"
                : safe >= 75
                  ? "bg-warning"
                  : "bg-accent",
          )}
          style={{ width: `${safe ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-start text-[11.5px] text-ink/80 transition hover:border-line hover:bg-surface"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted transition group-hover:bg-accent-soft group-hover:text-accent">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <ChevronLeft className="size-3.5 text-muted/40 transition group-hover:text-accent" />
    </button>
  );
}
