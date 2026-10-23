"use client";

import { Globe2, Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./project-card";

type DomainShape = {
  id?: string;
  name?: string;
  status?: string;
  certificatesStatus?: string;
  cnameRecord?: string;
  verificationCode?: string;
};

type DomainArtifact = {
  app?: string;
  domains?: DomainShape[];
  note?: string;
  domain?: DomainShape;
  records?: {
    cname?: string;
    verification?: string;
  };
  manualStep?: string;
};

export function DomainCard({
  data,
  onPrompt,
}: {
  data: DomainArtifact;
  onPrompt?: (prompt: string) => void;
}) {
  const domains = data.domains ?? (data.domain ? [data.domain] : []);
  const active = domains.filter(
    (domain) =>
      domain.status === "ACTIVE" &&
      (!domain.certificatesStatus || domain.certificatesStatus === "ACTIVE"),
  ).length;

  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-info-soft text-info">
            <Globe2 className="size-4" />
          </span>
          <div>
            <h3 className="text-[13px] font-bold">دامنه‌ها</h3>
            <p className="text-[10px] text-muted">
              {data.app ? `برنامه‌ی ${data.app}` : "اتصال دامنه"}
            </p>
          </div>
        </div>
        <Badge tone={active ? "success" : "warning"} dot>
          {active
            ? `${active.toLocaleString("fa-IR")} فعال`
            : "در انتظار تنظیم DNS"}
        </Badge>
      </div>

      <div className="space-y-2 p-4">
        {domains.length ? (
          domains.map((domain, index) => (
            <div
              key={domain.id ?? `${domain.name}-${index}`}
              className="rounded-xl border border-line bg-surface-2/40 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" dir="ltr">
                    {domain.name ?? "—"}
                  </span>
                  <Badge
                    tone={
                      domain.status === "ACTIVE"
                        ? "success"
                        : domain.status === "PENDING"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {domain.status ?? "نامشخص"}
                  </Badge>
                  {domain.certificatesStatus ? (
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted">
                      <Lock className="size-2.5" />
                      {domain.certificatesStatus}
                    </span>
                  ) : null}
                </div>
                {onPrompt ? (
                  <button
                    type="button"
                    className="text-[10.5px] font-medium text-accent hover:underline"
                    onClick={() =>
                      onPrompt(
                        `وضعیت دامنه‌ی ${domain.name ?? ""} برای برنامه‌ی ${data.app ?? ""} را بررسی کن.`,
                      )
                    }
                  >
                    بررسی وضعیت
                  </button>
                ) : null}
              </div>

              {domain.cnameRecord || domain.verificationCode ? (
                <div className="mt-2 grid gap-1.5">
                  {domain.cnameRecord ? (
                    <RecordRow label="CNAME / ALIAS" value={domain.cnameRecord} />
                  ) : null}
                  {domain.verificationCode ? (
                    <RecordRow label="TXT / Verification" value={domain.verificationCode} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-3 py-4 text-center">
            <p className="text-[11px] text-muted">هنوز دامنه‌ای به این برنامه وصل نیست.</p>
            {onPrompt ? (
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() =>
                  onPrompt(
                    `می‌خواهم یک دامنه به برنامه‌ی ${data.app ?? ""} وصل کنم. مراحل و رکوردهای لازم را بگو.`,
                  )
                }
              >
                اتصال دامنه
              </Button>
            ) : null}
          </div>
        )}

        {data.manualStep ? (
          <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning-soft/40 px-3 py-2 text-[10.5px] leading-5 text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{data.manualStep}</span>
          </div>
        ) : null}
        {data.note ? (
          <p className="text-[10px] leading-5 text-muted">{data.note}</p>
        ) : null}
      </div>
    </section>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-white/70 px-2 py-1.5">
      <span className="shrink-0 text-[9.5px] text-muted">{label}</span>
      <code
        dir="ltr"
        className="min-w-0 flex-1 truncate text-[10px] text-ink"
      >
        {value}
      </code>
      <CopyButton value={value} label="کپی" />
    </div>
  );
}
