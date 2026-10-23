"use client";

import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fa } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Severity = "critical" | "warning" | "healthy" | "unknown";

type Recommendation = {
  actionType?: string;
  risk?: string;
  title?: string;
  why?: string;
  params?: Record<string, unknown>;
  automatic?: boolean;
};

type Finding = {
  id: string;
  title: string;
  severity: Severity;
  confidence: number;
  explanation: string;
  evidence: string[];
  recommendations: Recommendation[];
};

export type DiagnosisArtifact = {
  app?: string;
  diagnosis?: {
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
  };
};

const severityMeta: Record<
  Severity,
  { label: string; tone: "danger" | "warning" | "success" | "neutral"; icon: React.ReactNode }
> = {
  critical: {
    label: "بحرانی",
    tone: "danger",
    icon: <AlertTriangle className="size-3.5" />,
  },
  warning: {
    label: "نیازمند بررسی",
    tone: "warning",
    icon: <AlertTriangle className="size-3.5" />,
  },
  healthy: {
    label: "سالم",
    tone: "success",
    icon: <ShieldCheck className="size-3.5" />,
  },
  unknown: {
    label: "نامشخص",
    tone: "neutral",
    icon: <Activity className="size-3.5" />,
  },
};

export function DiagnosisCard({
  data,
  onPrompt,
}: {
  data: DiagnosisArtifact;
  onPrompt?: (prompt: string) => void;
}) {
  const diagnosis = data.diagnosis;
  if (!diagnosis) return null;
  const meta = severityMeta[diagnosis.severity] ?? severityMeta.unknown;
  const signals = diagnosis.signals;

  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                diagnosis.severity === "critical" && "bg-danger-soft text-danger",
                diagnosis.severity === "warning" && "bg-warning-soft text-warning",
                diagnosis.severity === "healthy" && "bg-success-soft text-success",
                diagnosis.severity === "unknown" && "bg-surface-2 text-muted",
              )}
            >
              {meta.icon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-bold">{diagnosis.headline}</h3>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <p className="mt-1 text-[11.5px] leading-6 text-muted">
                {diagnosis.summary}
              </p>
            </div>
          </div>
          <div className="text-end">
            <div className="text-[10px] text-muted">اطمینان</div>
            <div className="text-[13px] font-bold">
              {fa(Math.round(diagnosis.confidence * 100))}٪
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        <Metric
          icon={<Cpu className="size-3.5" />}
          label="CPU"
          value={signals.cpuPercent === null ? "—" : `${fa(signals.cpuPercent)}٪`}
          danger={(signals.cpuPercent ?? 0) >= 85}
        />
        <Metric
          icon={<MemoryStick className="size-3.5" />}
          label="حافظه"
          value={
            signals.memoryPercent === null ? "—" : `${fa(signals.memoryPercent)}٪`
          }
          danger={(signals.memoryPercent ?? 0) >= 85}
        />
        <Metric
          icon={<HardDrive className="size-3.5" />}
          label="دیسک"
          value={signals.diskPercent === null ? "—" : `${fa(signals.diskPercent)}٪`}
          danger={(signals.diskPercent ?? 0) >= 85}
        />
        <Metric
          icon={<Terminal className="size-3.5" />}
          label="خطای لاگ"
          value={fa(signals.errorCount)}
          danger={signals.errorCount > 0}
        />
      </div>

      <div className="space-y-3 p-5">
        {diagnosis.findings.map((finding, index) => (
          <details
            key={finding.id}
            className="group rounded-xl border border-line bg-surface-2/50"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  finding.severity === "critical" && "bg-danger",
                  finding.severity === "warning" && "bg-warning",
                  finding.severity === "healthy" && "bg-success",
                  finding.severity === "unknown" && "bg-muted",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                {finding.title}
              </span>
              <span className="shrink-0 text-[10.5px] text-muted">
                {fa(Math.round(finding.confidence * 100))}٪
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line/70 px-3.5 py-3">
              <p className="text-[12px] leading-6 text-ink/80">{finding.explanation}</p>
              {finding.evidence?.length ? (
                <div className="mt-2 space-y-1">
                  {finding.evidence.map((evidence, i) => (
                    <div
                      key={`${finding.id}-${i}`}
                      className="rounded-lg border border-line bg-white/70 px-2.5 py-1.5 text-[11px] leading-5 text-muted"
                    >
                      {evidence}
                    </div>
                  ))}
                </div>
              ) : null}
              {finding.recommendations?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {finding.recommendations.map((recommendation, i) => (
                    <button
                      key={`${finding.id}-rec-${i}`}
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-white px-3 py-1.5 text-[11.5px] font-medium text-accent transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!onPrompt || !recommendation.actionType}
                      onClick={() =>
                        onPrompt?.(
                          `برای برنامه‌ی ${data.app ?? ""} مشکل «${
                            finding.title
                          }» را در نظر بگیر. اگر اقدام «${
                            recommendation.title ?? ""
                          }» مناسب است، پارامترهای لازم را کامل کن (برای تغییر پلن، پلن بالاتر را پیشنهاد بده) و پیشنهاد قابل تأیید آماده کن. دلیل: ${
                            recommendation.why ?? ""
                          }`,
                        )
                      }
                    >
                      <Wrench className="size-3.5" />
                      {recommendation.title ?? "اقدام پیشنهادی"}
                      {recommendation.risk === "high" ? (
                        <span className="rounded bg-warning-soft px-1 py-0.5 text-[9px] text-warning">
                          نیازمند تأیید
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        ))}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[11px] text-muted">
          <div className="flex items-center gap-1.5">
            <Database className="size-3.5" />
            release: {signals.releaseState ?? "—"} · وضعیت: {signals.appState || "—"}
          </div>
          {onPrompt ? (
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() =>
                onPrompt(
                  `وضعیت برنامه‌ی ${data.app ?? ""} را دوباره بررسی کن و بگو چه چیزی تغییر کرده است.`,
                )
              }
            >
              بررسی دوباره
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[15px] font-bold",
          danger ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
