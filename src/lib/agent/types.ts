import type { ActionPreview } from "@/lib/security/risk-policy";

export type AgentToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AgentMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: AgentToolCall[];
    }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

export type ToolTrace = {
  id: string;
  name: string;
  displayName: string;
  status: "running" | "ok" | "error";
  risk?: string;
  summary?: string;
  durationMs?: number;
};

export type ArtifactKind =
  | "diagnosis"
  | "plan"
  | "project"
  | "metrics"
  | "guide"
  | "release"
  | "domain"
  | "vms"
  | "verification"
  | "databases";

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title?: string;
  data: unknown;
  createdAt: string;
};

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tools?: ToolTrace[];
  artifactIds?: string[];
};

export type PendingApproval = {
  approvalId: string;
  digest: string;
  action: string;
  preview: ActionPreview;
  createdAt: string;
  expiresAt: string;
};

export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  activeProject?: string;
  history: AgentMessage[];
  messages: UiMessage[];
  artifacts: Artifact[];
  pending?: PendingApproval | null;
};

