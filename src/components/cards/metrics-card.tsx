"use client";

import { Activity, Cpu, HardDrive, MemoryStick, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fa } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Point = { timestamp: number; value: number };

type MetricsArtifact = {
  app?: string;
  plan?: { ram?: number; cpu?: number; disk?: number } | null;
  signals?: {
    cpuPercent?: number | null;
    memoryPercent?: number | null;
    diskPercent?: number | null;
    cpuAvg?: number;
    cpuPeak?: number;
    memoryAvgGb?: number | null;
    networkReceiveTotal?: number;
    networkTransmitTotal?: number;
  };
  series?: {
    cpu?: Point[];
    memory?: Point[];
    networkReceive?: Point[];
    networkTransmit?: Point[];
  };
  disks?: Array<{ name?: string; size?: string; usage?: string }>;
  note?: string;
};

export function MetricsCard({
  data,
  onPrompt,
}: {
  data: MetricsArtifact;
  onPrompt?: (prompt: string) => void;
}) {
  const signals = data.signals ?? {};
  const cpu = signals.cpuPercent ?? null;
  const memory = signals.memoryPercent ?? null;
  const disk = signals.diskPercent ?? null;

  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-info-soft text-info">
            <Activity className="size-4" />
          </span>
          <div>
            <h3 className="text-[13px] font-bold">متریک‌های منابع</h3>
            <p className="text-[10px] text-muted">
              {data.app ? `برنامه‌ی ${data.app}` : "بازه‌ی اخیر"}
            </p>
          </div>
        </div>
        {onPrompt ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onPrompt(`متریک‌های ${data.app ?? ""} را کامل بررسی کن و علت فشار منابع را بگو.`)
            }
          >
            عیب‌یابی کامل
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <UsageBar
          icon={<Cpu className="size-3.5" />}
          label="CPU"
          value={cpu}
          detail={
            signals.cpuPeak !== undefined
              ? `اوج ${fa(signals.cpuPeak)}`
              : undefined
          }
          series={data.series?.cpu ?? []}
        />
        <UsageBar
          icon={<MemoryStick className="size-3.5" />}
          label="حافظه"
          value={memory}
          detail={
            signals.memoryAvgGb !== null && signals.memoryAvgGb !== undefined
              ? `${fa(signals.memoryAvgGb)} GB`
              : undefined
          }
          series={data.series?.memory ?? []}
        />
        <UsageBar
          icon={<HardDrive className="size-3.5" />}
          label="دیسک"
          value={disk}
          detail={data.disks?.[0]?.usage}
          series={[]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3 text-[10.5px] text-muted">
        <span className="flex items-center gap-1">
          <Network className="size-3" />
          دریافت: {fa(signals.networkReceiveTotal ?? 0)} واحد
        </span>
        <span className="flex items-center gap-1">
          <Network className="size-3" />
          ارسال: {fa(signals.networkTransmitTotal ?? 0)} واحد
        </span>
        {data.note ? <span className="text-warning">{data.note}</span> : null}
      </div>
    </section>
  );
}

function UsageBar({
  icon,
  label,
  value,
  detail,
  series,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  detail?: string;
  series: Point[];
}) {
  const safe = value === null ? null : Math.max(0, Math.min(100, value));
  const tone =
    safe === null
      ? "bg-muted"
      : safe >= 90
        ? "bg-danger"
        : safe >= 75
          ? "bg-warning"
          : "bg-success";
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          {icon}
          {label}
        </div>
        <div className={cn("text-[13px] font-bold", safe !== null && safe >= 90 && "text-danger")}>
          {safe === null ? "—" : `${fa(safe)}٪`}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone)}
          style={{ width: `${safe ?? 0}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[9.5px] text-muted">{detail ?? "—"}</span>
        {series.length > 1 ? <Sparkline points={series} /> : null}
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: Point[] }) {
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 86;
  const height = 20;
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point.value - min) / range) * (height - 3) - 1.5;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-5 w-[86px] shrink-0"
      aria-hidden
    >
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
