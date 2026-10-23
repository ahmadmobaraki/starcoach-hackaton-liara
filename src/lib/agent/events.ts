import type { ArtifactKind } from "./types";

export type AgentEvent =
  | { type: "meta"; sessionId: string; model: string }
  | { type: "status"; label: string }
  | { type: "text"; delta: string }
  | {
      type: "tool_start";
      id: string;
      name: string;
      displayName: string;
      risk?: string;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
      durationMs: number;
    }
  | { type: "artifact"; artifactId: string; kind: ArtifactKind; data: unknown }
  | {
      type: "approval";
      approvalId: string;
      digest: string;
      action: string;
      preview: unknown;
      expiresAt: string;
    }
  | { type: "done"; sessionId: string }
  | { type: "error"; message: string };

