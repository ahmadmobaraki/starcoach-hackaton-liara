"use client";

import { BookOpen, Check, ChevronDown, CircleHelp, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type GuideShape = {
  id?: string;
  title?: string;
  summary?: string;
  audience?: string;
  canAgentDo?: string[];
  cannotAgentDo?: string[];
  steps?: Array<{
    title: string;
    body: string;
    link?: string;
    command?: string;
    verifyHint?: string;
  }>;
  verify?: { tool?: string; hint?: string };
  nextPrompt?: string;
};

export type GuideArtifact = {
  found?: boolean;
  guide?: GuideShape;
  available?: string[];
  message?: string;
};

export function GuideCard({
  data,
  onPrompt,
}: {
  data: GuideArtifact;
  onPrompt?: (prompt: string) => void;
}) {
  if (!data.found || !data.guide) {
    return (
      <section className="panel animate-rise p-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          <CircleHelp className="size-4 text-muted" />
          راهنمای دقیقی پیدا نشد
        </div>
        <p className="mt-1 text-[11.5px] leading-6 text-muted">
          {data.message ?? "موضوع را دقیق‌تر بگو تا راهنمای مناسب را پیدا کنم."}
        </p>
      </section>
    );
  }

  const guide = data.guide;
  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
            <BookOpen className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-bold">{guide.title ?? "راهنما"}</h3>
              <Badge tone="info">مرحله‌ی دستی</Badge>
            </div>
            <p className="mt-1 text-[11.5px] leading-6 text-muted">
              {guide.summary}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-xl border border-success/20 bg-success-soft/35 p-3">
          <div className="text-[11px] font-bold text-success">این بخش را من انجام می‌دهم</div>
          <ul className="mt-2 space-y-1.5">
            {(guide.canAgentDo ?? []).map((item) => (
              <li key={item} className="flex gap-1.5 text-[11px] leading-5">
                <Check className="mt-0.5 size-3 shrink-0 text-success" strokeWidth={3} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-warning/20 bg-warning-soft/35 p-3">
          <div className="text-[11px] font-bold text-warning">این بخش را تو انجام می‌دهی</div>
          <ul className="mt-2 space-y-1.5">
            {(guide.cannotAgentDo ?? []).map((item) => (
              <li key={item} className="flex gap-1.5 text-[11px] leading-5">
                <X className="mt-0.5 size-3 shrink-0 text-warning" strokeWidth={3} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2 px-5 pb-5">
        {(guide.steps ?? []).map((step, index) => (
          <details
            key={`${step.title}-${index}`}
            className="group rounded-xl border border-line bg-surface-2/50"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white text-[10px] font-bold text-muted">
                {(index + 1).toLocaleString("fa-IR")}
              </span>
              <span className="min-w-0 flex-1 text-[12px] font-semibold">{step.title}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line/70 px-3.5 pb-3 pt-2.5 text-[11.5px] leading-6 text-ink/80">
              <p>{step.body}</p>
              {step.command ? (
                <pre
                  dir="ltr"
                  className="mt-2 overflow-x-auto rounded-lg bg-[#15201c] px-3 py-2 text-[11px] text-[#e9f2ee]"
                >
                  <code>{step.command}</code>
                </pre>
              ) : null}
              {step.link ? (
                <a
                  href={step.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                >
                  <ExternalLink className="size-3" />
                  باز کردن راهنما
                </a>
              ) : null}
              {step.verifyHint ? (
                <p className="mt-2 rounded-lg bg-info-soft/60 px-2.5 py-1.5 text-[10.5px] leading-5 text-info">
                  {step.verifyHint}
                </p>
              ) : null}
            </div>
          </details>
        ))}

        <div className="flex flex-col gap-2 rounded-xl border border-accent/20 bg-accent-soft/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10.5px] leading-5 text-muted">
            وقتی مرحله‌ی دستی را انجام دادی، همین‌جا بگو تا نتیجه را با API بررسی کنم و ادامه بدهم.
          </p>
          <Button
            size="sm"
            onClick={() =>
              onPrompt?.(
                `مرحله‌های راهنمای «${guide.title ?? ""}» را انجام دادم. ${
                  guide.verify?.hint ?? ""
                } لطفاً با ابزار مناسب نتیجه را بررسی کن و قدم بعدی را بگو.`,
              )
            }
          >
            انجام دادم؛ بررسی کن
          </Button>
        </div>
      </div>
    </section>
  );
}
