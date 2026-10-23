"use client";

import type { Artifact, ToolTrace, UiMessage } from "@/lib/agent/types";
import { Logo } from "@/components/ui/logo";
import { ArtifactRenderer } from "@/components/cards/artifact-renderer";
import { Markdown } from "./markdown";
import { LiveStatus, ThinkingDots, ToolTraceList } from "./tool-trace";
import { cn } from "@/lib/utils/cn";

export function MessageItem({
  message,
  artifactsById,
  onPrompt,
}: {
  message: UiMessage;
  artifactsById: Map<string, Artifact>;
  onPrompt?: (prompt: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex animate-enter justify-start">
        <div className="max-w-[88%] rounded-2xl rounded-tr-md border border-accent/15 bg-accent-soft/70 px-4 py-2.5 text-[13px] leading-7 text-ink sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  const messageArtifacts = (message.artifactIds ?? [])
    .map((id) => artifactsById.get(id))
    .filter((artifact): artifact is Artifact => Boolean(artifact));

  if (!message.content && !message.tools?.length && !messageArtifacts.length) {
    return null;
  }

  return (
    <div className="flex animate-enter gap-2.5 sm:gap-3">
      <div className="mt-0.5 hidden sm:block">
        <Logo className="size-8 rounded-xl" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {message.content ? (
          <div className="rounded-2xl rounded-tr-md border border-line bg-surface px-4 py-3 shadow-[0_1px_0_rgba(24,32,29,0.03)] sm:px-5">
            <Markdown content={message.content} />
          </div>
        ) : null}
        {message.tools?.length ? <ToolTraceList tools={message.tools} /> : null}
        {messageArtifacts.map((artifact) => (
          <ArtifactRenderer key={artifact.id} artifact={artifact} onPrompt={onPrompt} />
        ))}
      </div>
    </div>
  );
}

export function LiveMessage({
  text,
  tools,
  artifacts,
  status,
  onPrompt,
}: {
  text: string;
  tools: ToolTrace[];
  artifacts: Artifact[];
  status: string | null;
  onPrompt?: (prompt: string) => void;
}) {
  const hasContent = text.trim() || tools.length || artifacts.length;
  return (
    <div className="flex animate-enter gap-2.5 sm:gap-3">
      <div className="mt-0.5 hidden sm:block">
        <Logo className="size-8 rounded-xl" />
      </div>
      <div className="min-w-0 flex-1 space-y-3" aria-live="polite">
        {!hasContent && status ? (
          <div className="inline-flex items-center gap-2 rounded-2xl rounded-tr-md border border-line bg-surface px-4 py-3 text-[12px] text-muted">
            <ThinkingDots />
            <LiveStatus label={status} />
          </div>
        ) : null}
        {text.trim() ? (
          <div className="rounded-2xl rounded-tr-md border border-line bg-surface px-4 py-3 shadow-[0_1px_0_rgba(24,32,29,0.03)] sm:px-5">
            <Markdown content={text} />
            <span className="ms-0.5 inline-block h-4 w-[2px] animate-pulse-soft bg-accent align-middle" />
          </div>
        ) : null}
        {tools.length ? <ToolTraceList tools={tools} /> : null}
        {artifacts.map((artifact) => (
          <ArtifactRenderer key={artifact.id} artifact={artifact} onPrompt={onPrompt} />
        ))}
        {hasContent && status ? (
          <div className="ps-1 text-[10.5px] text-muted">
            <LiveStatus label={status} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StreamingCursor({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "ms-0.5 inline-block h-4 w-[2px] animate-pulse-soft bg-accent align-middle",
        className,
      )}
    />
  );
}
