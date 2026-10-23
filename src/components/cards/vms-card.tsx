"use client";

import { Cpu, HardDrive, MemoryStick, Server, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fa, toman } from "@/lib/utils/format";

type VmShape = {
  id?: string;
  name?: string;
  plan?: string;
  os?: string;
  state?: string;
  power?: string;
  ips?: Array<{ address?: string; version?: string }>;
  planDetails?: {
    cpu?: number;
    ram?: number;
    volume?: number;
    monthlyPrice?: number;
  } | null;
};

export function VmsCard({
  data,
  onPrompt,
}: {
  data: { vms?: VmShape[]; count?: number };
  onPrompt?: (prompt: string) => void;
}) {
  const vms = data.vms ?? [];
  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent">
            <Server className="size-4" />
          </span>
          <div>
            <h3 className="text-[13px] font-bold">سرورهای مجازی</h3>
            <p className="text-[10px] text-muted">
              {fa(data.count ?? vms.length)} سرور
            </p>
          </div>
        </div>
        {onPrompt ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPrompt("پلن‌های سرور مجازی و گزینه‌های ساخت VM را نشان بده.")}
          >
            ساخت سرور
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 p-4">
        {vms.length ? (
          vms.map((vm, index) => (
            <div
              key={vm.id ?? `${vm.name}-${index}`}
              className="rounded-xl border border-line bg-surface-2/40 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold">{vm.name ?? "—"}</span>
                  <Badge
                    tone={
                      vm.power === "POWERED_ON"
                        ? "success"
                        : vm.power === "POWERED_OFF"
                          ? "warning"
                          : "danger"
                    }
                    dot
                  >
                    {vm.power ?? vm.state ?? "نامشخص"}
                  </Badge>
                  {vm.os ? <Badge>{vm.os}</Badge> : null}
                </div>
                <span className="font-mono text-[10px] text-muted" dir="ltr">
                  {vm.ips?.find((ip) => ip.version === "v4")?.address ??
                    vm.ips?.[0]?.address ??
                    "—"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
                <span className="flex items-center gap-1">
                  <Cpu className="size-3" />
                  {vm.planDetails?.cpu ? `${fa(vm.planDetails.cpu)} هسته` : vm.plan ?? "—"}
                </span>
                <span className="flex items-center gap-1">
                  <MemoryStick className="size-3" />
                  {vm.planDetails?.ram ? `${fa(vm.planDetails.ram)} GB` : "—"}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="size-3" />
                  {vm.planDetails?.volume ? `${fa(vm.planDetails.volume)} GB` : "—"}
                </span>
                {vm.planDetails?.monthlyPrice ? (
                  <span className="flex items-center gap-1">
                    <Wifi className="size-3" />
                    {toman(vm.planDetails.monthlyPrice)}
                  </span>
                ) : null}
              </div>
              {onPrompt ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-[10px] font-medium text-accent hover:underline"
                    onClick={() =>
                      onPrompt(`وضعیت سرور ${vm.name ?? ""} را بررسی کن.`)
                    }
                  >
                    بررسی وضعیت
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-muted hover:underline"
                    onClick={() =>
                      onPrompt(
                        `برای سرور ${vm.name ?? ""} گزینه‌های ری‌استارت یا تغییر پلن را بررسی کن.`,
                      )
                    }
                  >
                    مدیریت منابع
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-3 py-4 text-center text-[11px] text-muted">
            سرور مجازی‌ای وجود ندارد. اگر به کنترل کامل سرور نیاز داری، از راهبر بخواه پلن مناسب را پیشنهاد بدهد.
          </div>
        )}
      </div>
    </section>
  );
}
