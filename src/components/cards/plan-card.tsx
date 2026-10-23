"use client";

import {
  AlertTriangle,
  Check,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fa, toman } from "@/lib/utils/format";

type PlanShape = {
  id: string;
  ram: number;
  cpu: number;
  disk: number;
  monthlyPrice: number;
  hourlyPrice: number;
};

type OptionShape = {
  plan: PlanShape;
  bundle: {
    bundleID?: string;
    bundlePlanID?: string;
    monthlyPrice?: number;
    zeroDowntime?: boolean;
    maxLogsRetentionDays?: number;
  };
  totalMonthlyToman: number;
  totalHourlyToman: number;
  reasons: string[];
  tradeoffs: string[];
  fitsBudget: boolean;
};

export type PlanArtifact = {
  summary?: string;
  recommended: OptionShape;
  alternatives?: OptionShape[];
  assumptions?: string[];
  notes?: string[];
  profile?: {
    framework?: string;
    traffic?: string;
    memoryFloorGb?: number;
    cpuFloor?: number;
  };
};

export function PlanCard({
  data,
  onSelect,
}: {
  data: PlanArtifact;
  onSelect?: (prompt: string) => void;
}) {
  const recommended = data.recommended;
  if (!recommended?.plan) return null;
  const bundleId =
    recommended.bundle?.bundlePlanID ?? recommended.bundle?.bundleID ?? "standard";
  const bundleLabel =
    { free: "رایگان", basic: "پایه", standard: "استاندارد", pro: "حرفه‌ای" }[
      bundleId
    ] ?? bundleId;

  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent">
              <Server className="size-4" />
            </span>
            <div>
              <h3 className="text-[14px] font-bold">پلن پیشنهادی</h3>
              <p className="text-[11.5px] text-muted">
                {data.profile?.framework
                  ? `برای ${data.profile.framework}`
                  : "بر اساس نیاز پروژه"}
                {data.profile?.traffic
                  ? ` · ترافیک ${
                      {
                        low: "کم",
                        medium: "متوسط",
                        high: "زیاد",
                        very_high: "بسیار زیاد",
                      }[data.profile.traffic] ?? data.profile.traffic
                    }`
                  : ""}
              </p>
            </div>
          </div>
        </div>
        <Badge tone="accent" dot>
          قیمت زنده
        </Badge>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-accent/20 bg-accent-soft/45 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-accent">پیشنهاد اصلی</div>
              <div className="mt-0.5 text-xl font-extrabold tracking-tight">
                {recommended.plan.id}
              </div>
            </div>
            <div className="text-end">
              <div className="text-[11px] text-muted">ماهانه</div>
              <div className="text-[15px] font-extrabold text-accent">
                {toman(recommended.totalMonthlyToman)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-[11.5px]">
            <Spec icon={<MemoryStick className="size-3.5" />} label="حافظه">
              {fa(recommended.plan.ram)} GB
            </Spec>
            <Spec icon={<Cpu className="size-3.5" />} label="پردازنده">
              {fa(recommended.plan.cpu)} هسته
            </Spec>
            <Spec icon={<HardDrive className="size-3.5" />} label="دیسک">
              {fa(recommended.plan.disk)} GB
            </Spec>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
            <Wallet className="size-3.5" />
            بسته‌ی {bundleLabel} · ساعتی {toman(recommended.totalHourlyToman)}
          </div>

          {recommended.reasons?.length ? (
            <ul className="mt-4 space-y-1.5">
              {recommended.reasons.slice(0, 4).map((reason) => (
                <li key={reason} className="flex gap-2 text-[12px] leading-6">
                  <Check className="mt-1 size-3.5 shrink-0 text-success" strokeWidth={2.6} />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {recommended.tradeoffs?.length ? (
            <div className="mt-3 rounded-xl border border-warning/20 bg-warning-soft/60 px-3 py-2">
              {recommended.tradeoffs.map((item) => (
                <div key={item} className="flex gap-2 text-[11.5px] leading-5 text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : null}

          {onSelect ? (
            <Button
              className="mt-4 w-full"
              onClick={() =>
                onSelect(
                  `پلن ${recommended.plan.id} با بسته‌ی ${bundleId} را انتخاب می‌کنم. برای ساخت برنامه و استقرار ادامه بده.`,
                )
              }
            >
              انتخاب همین پلن
            </Button>
          ) : null}
        </div>

        <div className="space-y-2.5">
          <div className="text-[11px] font-medium text-muted">گزینه‌های دیگر</div>
          {(data.alternatives ?? []).slice(0, 2).map((option) => (
            <div
              key={option.plan.id}
              className="rounded-xl border border-line bg-surface-2/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12.5px] font-bold">{option.plan.id}</div>
                <div className="text-[11.5px] font-semibold text-muted">
                  {toman(option.totalMonthlyToman)}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                <span>{fa(option.plan.ram)} GB RAM</span>
                <span>{fa(option.plan.cpu)} CPU</span>
                <span>{fa(option.plan.disk)} GB</span>
              </div>
              {option.tradeoffs?.[0] ? (
                <p className="mt-1.5 text-[10.5px] leading-5 text-warning">
                  {option.tradeoffs[0]}
                </p>
              ) : null}
              {onSelect ? (
                <button
                  type="button"
                  className="mt-2 text-[11.5px] font-medium text-accent hover:underline"
                  onClick={() =>
                    onSelect(
                      `پلن ${option.plan.id} با بسته‌ی ${
                        option.bundle?.bundleID ?? "standard"
                      } را انتخاب می‌کنم. برای ساخت برنامه و استقرار ادامه بده.`,
                    )
                  }
                >
                  انتخاب این گزینه
                </button>
              ) : null}
            </div>
          ))}
          {data.summary ? (
            <p className="pt-1 text-[11px] leading-6 text-muted">{data.summary}</p>
          ) : null}
        </div>
      </div>

      {(data.assumptions?.length || data.notes?.length) ? (
        <details className="border-t border-line px-5 py-3 text-[11px] text-muted">
          <summary className="cursor-pointer font-medium">فرض‌ها و نکته‌ها</summary>
          <div className="mt-2 space-y-1 leading-6">
            {data.assumptions?.map((item) => <p key={item}>• {item}</p>)}
            {data.notes?.map((item) => <p key={item}>• {item}</p>)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function Spec({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-accent/10 bg-white/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-ink">{children}</div>
    </div>
  );
}
