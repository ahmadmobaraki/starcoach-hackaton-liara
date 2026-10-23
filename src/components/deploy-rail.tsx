"use client";

import { Check, Loader2 } from "lucide-react";
import type { Artifact, PendingApproval, ToolTrace } from "@/lib/agent/types";
import { cn } from "@/lib/utils/cn";

type StepState = "done" | "active" | "pending";

const steps = [
  { id: "create", label: "ساخت برنامه" },
  { id: "upload", label: "آپلود سورس" },
  { id: "build", label: "بیلد" },
  { id: "release", label: "انتشار" },
  { id: "domain", label: "دامنه" },
];

export function DeployRail({
  visible,
  pending,
  tools,
  artifacts,
  isDeployed,
}: {
  visible: boolean;
  pending?: PendingApproval | null;
  tools: ToolTrace[];
  artifacts: Artifact[];
  isDeployed?: boolean;
}) {
  if (!visible) return null;

  const states: Record<string, StepState> = {
    create: isDeployed || artifacts.some((a) => a.kind === "project") ? "done" : "pending",
    upload: tools.some((t) => t.name === "liara_prepare_action") ? "active" : "pending",
    build:
      tools.some((t) => t.name === "liara_wait_release") ||
      artifacts.some((a) => a.kind === "release")
        ? "active"
        : "pending",
    release: artifacts.some(
      (a) =>
        a.kind === "release" &&
        typeof a.data === "object" &&
        a.data !== null &&
        (a.data as { state?: string }).state === "READY",
    )
      ? "done"
      : "pending",
    domain: artifacts.some(
      (a) =>
        a.kind === "domain" &&
        Array.isArray((a.data as { domains?: unknown[] })?.domains) &&
        ((a.data as { domains: Array<{ status?: string }> }).domains ?? []).some(
          (d) => d.status === "ACTIVE",
        ),
    )
      ? "done"
      : "pending",
  };

  if (pending?.action === "deploy_source") states.upload = "active";
  if (pending?.action === "create_app") states.create = "active";
  const firstActive = steps.find((step) => states[step.id] !== "done");
  if (firstActive) states[firstActive.id] = "active";

  return (
    <div className="mb-2 rounded-2xl border border-line bg-surface/85 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-1">
        {steps.map((step, index) => (
          <div key={step.id} className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 items-center gap-1.5">
              <StepNode state={states[step.id]} index={index} />
              <span
                className={cn(
                  "hidden truncate text-[9.5px] sm:block",
                  states[step.id] === "done"
                    ? "font-medium text-accent"
                    : states[step.id] === "active"
                      ? "font-semibold text-ink"
                      : "text-muted/70",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div
                className={cn(
                  "mx-1.5 h-px min-w-2 flex-1",
                  states[steps[index + 1]?.id ?? ""] === "done"
                    ? "bg-accent/50"
                    : "bg-line",
                )}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepNode({ state, index }: { state: StepState; index: number }) {
  if (state === "done") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-accent bg-accent-soft text-accent">
        <Loader2 className="size-3 animate-spin" />
      </span>
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line bg-surface text-[8.5px] text-muted">
      {index + 1}
    </span>
  );
}
