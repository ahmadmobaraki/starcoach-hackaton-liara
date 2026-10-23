import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/config";
import { redactObject } from "./redact";

export type AuditEvent = {
  type:
    | "approval_created"
    | "approval_approved"
    | "approval_rejected"
    | "action_started"
    | "action_succeeded"
    | "action_failed"
    | "chat_turn"
    | "tool_called";
  at?: string;
  sessionId?: string;
  approvalId?: string;
  action?: string;
  risk?: string;
  detail?: unknown;
};

export async function appendAudit(event: AuditEvent): Promise<void> {
  const file = path.join(getDataDir(), "audit.jsonl");
  const line = JSON.stringify(
    redactObject({
      at: new Date().toISOString(),
      ...event,
    }),
  );
  await fs.appendFile(file, `${line}\n`, { mode: 0o600 });
}
