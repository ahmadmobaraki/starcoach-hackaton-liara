"use client";

import { useEffect, useState } from "react";
import {
  AlertOctagon,
  ArrowLeftRight,
  Check,
  Clock3,
  Coins,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PendingApproval } from "@/lib/agent/types";
import { fa, toman } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const riskMeta: Record<
  string,
  { label: string; tone: "warning" | "danger" | "info"; hint: string }
> = {
  medium: {
    label: "ریسک متوسط",
    tone: "info",
    hint: "این تغییر با تأیید شما و به‌صورت قابل‌برگشت انجام می‌شود.",
  },
  high: {
    label: "اقدام حساس",
    tone: "warning",
    hint: "این تغییر روی هزینه یا دسترس‌پذیری سرویس اثر دارد.",
  },
  critical: {
    label: "اقدام بحرانی",
    tone: "danger",
    hint: "این عملیات برگشت‌ناپذیر است. با دقت بررسی کنید.",
  },
};

export function ApprovalCard({
  pending,
  busy,
  result,
  onDecision,
}: {
  pending: PendingApproval;
  busy?: boolean;
  result?: { ok: boolean; message: string } | null;
  onDecision: (decision: "approve" | "reject", confirmText?: string) => void;
}) {
  const preview = pending.preview;
  const meta = riskMeta[preview.risk] ?? riskMeta.medium;
  const [confirmText, setConfirmText] = useState("");
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const ms = new Date(pending.expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining("منقضی شده");
        return;
      }
      const minutes = Math.floor(ms / 60_000);
      const seconds = Math.floor((ms % 60_000) / 1000);
      setRemaining(`${fa(minutes)}:${fa(String(seconds).padStart(2, "0"))}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [pending.expiresAt]);

  const needsConfirm = Boolean(preview.confirmTextRequired);
  const confirmMatches =
    !needsConfirm || confirmText.trim() === preview.confirmTextRequired;
  const expired = remaining === "منقضی شده";
  const finishedWithError = Boolean(result && !result.ok);

  const monthly = preview.cost?.monthlyTomanDelta;

  return (
    <section
      aria-label={preview.title}
      className={cn(
        "animate-rise overflow-hidden rounded-[var(--radius-lg)] border bg-surface shadow-[var(--shadow-card)]",
        preview.risk === "critical"
          ? "border-danger/35"
          : preview.risk === "high"
            ? "border-warning/35"
            : "border-accent/25",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5",
          preview.risk === "critical"
            ? "border-danger/20 bg-danger-soft/60"
            : preview.risk === "high"
              ? "border-warning/20 bg-warning-soft/60"
              : "border-accent/15 bg-accent-soft/50",
        )}
      >
        <div className="flex items-center gap-2">
          {preview.risk === "critical" ? (
            <AlertOctagon className="size-4 text-danger" />
          ) : preview.risk === "high" ? (
            <ShieldAlert className="size-4 text-warning" />
          ) : (
            <ShieldCheck className="size-4 text-accent" />
          )}
          <span className="text-[12px] font-bold">{meta.label}</span>
          <Badge tone={meta.tone}>{preview.reversible ? "قابل برگشت" : "برگشت‌ناپذیر"}</Badge>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-muted">
          <Clock3 className="size-3" />
          اعتبار تأیید: {remaining}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold">{preview.title}</h3>
            <p className="mt-1 text-[12px] leading-6 text-muted">{preview.summary}</p>
          </div>
          <div className="hidden rounded-xl border border-line bg-surface-2 px-3 py-2 text-end sm:block">
            <div className="text-[9.5px] text-muted">منبع</div>
            <div className="max-w-[160px] truncate text-[11.5px] font-semibold" dir="ltr">
              {preview.resource}
            </div>
          </div>
        </div>

        {preview.changes?.length ? (
          <ul className="mt-3 space-y-1.5 rounded-xl border border-line bg-surface-2/50 p-3">
            {preview.changes.map((change, i) => (
              <li key={`${change}-${i}`} className="flex gap-2 text-[11.5px] leading-6">
                <ArrowLeftRight className="mt-1 size-3.5 shrink-0 text-accent" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted">
              <Coins className="size-3.5" />
              اثر هزینه
            </div>
            <div className="mt-0.5 text-[12.5px] font-semibold">
              {monthly === undefined
                ? preview.cost?.note ?? "در API اعلام نشده"
                : monthly === 0
                  ? "بدون تغییر هزینه"
                  : monthly > 0
                    ? `+ ${toman(monthly)} در ماه`
                    : `− ${toman(Math.abs(monthly))} در ماه`}
            </div>
            {preview.cost?.note && monthly !== undefined ? (
              <div className="mt-0.5 text-[10px] text-muted">{preview.cost.note}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-line px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted">
              <LockKeyhole className="size-3.5" />
              نحوه‌ی اجرا
            </div>
            <div className="mt-0.5 text-[11.5px] leading-5">
              بعد از تأیید، همین‌جا اجرا می‌شود و نتیجه دوباره بررسی می‌شود.
            </div>
          </div>
        </div>

        {preview.warnings?.length ? (
          <div className="mt-3 rounded-xl border border-warning/25 bg-warning-soft/50 px-3 py-2">
            {preview.warnings.map((warning, i) => (
              <div key={`${warning}-${i}`} className="flex gap-2 text-[11px] leading-5 text-warning">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        ) : null}

        {needsConfirm ? (
          <label className="mt-3 block rounded-xl border border-danger/25 bg-danger-soft/30 p-3">
            <span className="text-[11px] font-medium text-danger">
              برای تأیید، نام منبع را دقیقاً تایپ کنید:{" "}
              <bdi className="font-mono">{preview.confirmTextRequired}</bdi>
            </span>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-danger/25 bg-white px-3 text-[12px] outline-none focus:border-danger"
              dir="ltr"
              placeholder={preview.confirmTextRequired}
              autoComplete="off"
            />
          </label>
        ) : null}

        {result ? (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11.5px] leading-5",
              result.ok
                ? "border-success/25 bg-success-soft/50 text-success"
                : "border-danger/25 bg-danger-soft/50 text-danger",
            )}
          >
            {result.ok ? (
              <Check className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <X className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10.5px] leading-5 text-muted">{meta.hint}</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => onDecision("reject")}
              disabled={busy || expired || finishedWithError}
            >
              <X className="size-4" />
              لغو
            </Button>
            <Button
              variant={preview.risk === "critical" ? "danger" : "primary"}
              onClick={() => onDecision("approve", confirmText)}
              loading={busy}
              disabled={!confirmMatches || expired || finishedWithError}
            >
              {!busy ? <Check className="size-4" /> : null}
              تأیید و اجرا
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
