"use client";

import { CheckCircle2, GitBranch, Loader2, Rocket, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { faRelative } from "@/lib/utils/format";

type ReleaseShape = {
  id?: string;
  state?: string;
  tag?: string;
  port?: number;
  createdAt?: string;
  finishedAt?: string;
  failReason?: string;
  queue?: number;
};

type ReleaseArtifact = {
  app?: string;
  releaseId?: string;
  state?: string;
  ok?: boolean;
  buildLogTail?: string[];
  failReason?: string;
  hint?: string;
  currentRelease?: string;
  releases?: ReleaseShape[];
  applets?: Array<{ id?: string; name?: string; state?: string; reason?: string; timestamp?: string }>;
};

export function ReleaseCard({ data }: { data: ReleaseArtifact }) {
  const state = data.state ?? data.releases?.[0]?.state;
  const ok = data.ok ?? state === "READY";
  const building = ["BUILDING", "DEPLOYING", "QUEUED", "PUSHING"].includes(
    state ?? "",
  );
  const logTail = data.buildLogTail ?? [];

  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent">
            <Rocket className="size-4" />
          </span>
          <div>
            <h3 className="text-[13px] font-bold">وضعیت استقرار</h3>
            <p className="text-[10px] text-muted">
              {data.app ? `برنامه‌ی ${data.app}` : data.releaseId ?? "release"}
            </p>
          </div>
        </div>
        <Badge tone={ok ? "success" : building ? "info" : "danger"} dot>
          {state ?? "نامشخص"}
        </Badge>
      </div>

      <div className="p-4">
        {data.releases?.length ? (
          <div className="mb-3 space-y-1.5">
            {data.releases.slice(0, 5).map((release, index) => (
              <div
                key={release.id ?? index}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-1.5 text-[10.5px]"
              >
                <StatusDot state={release.state ?? ""} />
                <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted" dir="ltr">
                  {release.tag ?? release.id ?? "—"}
                </span>
                <span className="text-muted">{release.state}</span>
                {release.createdAt ? (
                  <span className="text-[9px] text-muted/80">{faRelative(release.createdAt)}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {data.failReason ? (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/40 px-3 py-2 text-[11px] leading-5 text-danger">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{data.failReason}</span>
          </div>
        ) : null}

        {logTail.length ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-muted">
              <GitBranch className="size-3" />
              انتهای لاگ بیلد
            </div>
            <pre
              dir="ltr"
              className="max-h-52 overflow-auto rounded-xl bg-[#15201c] px-3 py-2.5 text-[10px] leading-5 text-[#cfe3da]"
            >
              {logTail.slice(-30).join("\n")}
            </pre>
          </div>
        ) : null}

        {data.hint ? (
          <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted">
            {building ? (
              <Loader2 className="size-3 animate-spin" />
            ) : ok ? (
              <CheckCircle2 className="size-3 text-success" />
            ) : null}
            {data.hint}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function StatusDot({ state }: { state: string }) {
  return (
    <span
      className={
        state === "READY"
          ? "size-1.5 rounded-full bg-success"
          : ["FAILED", "UNHEALTHY", "TIMEDOUT"].includes(state)
            ? "size-1.5 rounded-full bg-danger"
            : "size-1.5 rounded-full bg-warning"
      }
    />
  );
}
