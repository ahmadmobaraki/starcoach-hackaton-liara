"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { ToolTrace } from "@/lib/agent/types";
import { cn } from "@/lib/utils/cn";

export function ToolTraceList({ tools }: { tools: ToolTrace[] }) {
  if (!tools.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {tools.map((tool) => (
        <details
          key={tool.id}
          className="group rounded-xl border border-line bg-surface-2/70 px-3 py-2 text-[12px] text-muted"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <StatusIcon status={tool.status} />
            <span className="min-w-0 flex-1 truncate font-medium text-ink/80">
              {tool.displayName}
            </span>
            {tool.durationMs ? (
              <span className="shrink-0 text-[10.5px] text-muted/80">
                {Math.max(0.1, tool.durationMs / 1000).toLocaleString("fa-IR", {
                  maximumFractionDigits: 1,
                })}
                ث
              </span>
            ) : null}
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 border-t border-line/70 pt-2 leading-6 text-muted">
            {tool.summary || "نتیجه‌ای برای نمایش نیست."}
          </div>
        </details>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: ToolTrace["status"] }) {
  if (status === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />;
  }
  if (status === "error") {
    return <AlertTriangle className="size-3.5 shrink-0 text-danger" />;
  }
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-success-soft text-success">
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

export function LiveStatus({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/40" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle text-accent">
      <Sparkles className="size-3.5" />
      <span className="flex gap-0.5">
        <span className="size-1 animate-pulse-soft rounded-full bg-accent" />
        <span className="size-1 animate-pulse-soft rounded-full bg-accent [animation-delay:150ms]" />
        <span className="size-1 animate-pulse-soft rounded-full bg-accent [animation-delay:300ms]" />
      </span>
    </span>
  );
}

export function ToolBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted",
        className,
      )}
    >
      <Sparkles className="size-2.5" />
      ابزار
    </span>
  );
}
