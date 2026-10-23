"use client";

import {
  Check,
  Copy,
  Globe2,
  HardDrive,
  MemoryStick,
  Server,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fa } from "@/lib/utils/format";

type ProjectArtifact = {
  project?: {
    name?: string;
    type?: string;
    status?: string;
    scale?: number;
    planID?: string;
    bundlePlanID?: string;
    isDeployed?: boolean;
    zeroDowntime?: boolean;
    url?: string;
  };
  plan?: {
    id?: string;
    ram?: number;
    cpu?: number;
    disk?: number;
    monthlyPrice?: number;
  } | null;
  bundle?: { bundleID?: string } | null;
  latestRelease?: { state?: string } | null;
  currentRelease?: { state?: string } | null;
  domains?: Array<{ name?: string; status?: string }>;
  envs?: Array<{ key?: string; maskedValue?: string }>;
  healthy?: boolean;
  app?: string;
};

export function ProjectCard({
  data,
  onPrompt,
}: {
  data: ProjectArtifact;
  onPrompt?: (prompt: string) => void;
}) {
  const project = data.project;
  if (!project?.name) return null;
  const releaseState = data.latestRelease?.state ?? data.currentRelease?.state;
  const app = data.app ?? project.name;

  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Server className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[14px] font-bold" dir="ltr">
                {project.name}
              </h3>
              <Badge tone={project.scale === 0 ? "warning" : "success"} dot>
                {project.scale === 0 ? "خاموش" : "در حال اجرا"}
              </Badge>
              {project.type ? <Badge>{project.type}</Badge> : null}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {project.isDeployed ? "استقرار انجام شده" : "هنوز استقراری انجام نشده"}
              {releaseState ? ` · release: ${releaseState}` : ""}
              {data.bundle?.bundleID ? ` · بسته‌ی ${data.bundle.bundleID}` : ""}
            </p>
          </div>
        </div>
        {project.url ? <CopyButton value={project.url} label="کپی آدرس" /> : null}
      </div>

      <div className="grid grid-cols-3 gap-px bg-line">
        <Spec
          icon={<MemoryStick className="size-3.5" />}
          label="حافظه"
          value={data.plan?.ram ? `${fa(data.plan.ram)} GB` : "—"}
        />
        <Spec
          icon={<HardDrive className="size-3.5" />}
          label="CPU"
          value={data.plan?.cpu ? `${fa(data.plan.cpu)} هسته` : "—"}
        />
        <Spec
          icon={<Globe2 className="size-3.5" />}
          label="دامنه"
          value={
            data.domains?.length
              ? `${fa(data.domains.length)} دامنه`
              : "آدرس پیش‌فرض"
          }
        />
      </div>

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {(data.envs ?? []).slice(0, 4).map((env) => (
            <span
              key={env.key}
              className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] text-muted"
              dir="ltr"
            >
              {env.key}
            </span>
          ))}
          {data.envs?.length && data.envs.length > 4 ? (
            <span className="text-[10px] text-muted">
              +{fa(data.envs.length - 4)}
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {onPrompt ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  onPrompt(
                    `وضعیت برنامه‌ی ${app} را بررسی کن و اگر مشکلی هست، علت‌ها را با شواهد بگو.`,
                  )
                }
              >
                <Check className="size-3.5" />
                بررسی سلامت
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPrompt(`لاگ‌های برنامه‌ی ${app} را بررسی کن.`)}
              >
                <Terminal className="size-3.5" />
                لاگ‌ها
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Spec({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center gap-1 text-[10px] text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold">{value}</div>
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[10.5px] font-medium text-muted transition hover:border-line-strong hover:text-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard may be unavailable on insecure origins.
        }
      }}
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
      {copied ? "کپی شد" : label ?? "کپی"}
    </button>
  );
}
