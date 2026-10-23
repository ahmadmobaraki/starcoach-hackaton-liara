import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/config";

export type {
  AgentToolCall,
  AgentMessage,
  ToolTrace,
  ArtifactKind,
  Artifact,
  UiMessage,
  PendingApproval,
  Session,
} from "./types";
import type {
  AgentMessage,
  ToolTrace,
  ArtifactKind,
  Artifact,
  UiMessage,
  Session,
} from "./types";

const MAX_HISTORY = 48;
const MAX_UI_MESSAGES = 120;
const MAX_ARTIFACTS = 60;

function sessionsDir(): string {
  return path.join(getDataDir(), "sessions");
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function isValidSessionId(id: string): boolean {
  return /^ses_[a-f0-9]{16,40}$/i.test(id);
}

export async function createSession(
  activeProject?: string,
): Promise<Session> {
  const now = new Date().toISOString();
  const session: Session = {
    id: newId("ses"),
    createdAt: now,
    updatedAt: now,
    activeProject,
    history: [],
    messages: [],
    artifacts: [],
    pending: null,
  };
  await saveSession(session);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  if (!isValidSessionId(id)) return null;
  try {
    const raw = await fs.readFile(sessionPath(id), "utf8");
    const parsed = JSON.parse(raw) as Session;
    if (!parsed || parsed.id !== id) return null;
    return normalizeSession(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveSession(session: Session): Promise<void> {
  session.updatedAt = new Date().toISOString();
  session.history = trimHistory(session.history);
  session.messages = session.messages.slice(-MAX_UI_MESSAGES);
  session.artifacts = session.artifacts.slice(-MAX_ARTIFACTS);
  const dir = sessionsDir();
  await fs.mkdir(dir, { recursive: true });
  const file = sessionPath(session.id);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(session), { mode: 0o600 });
  await fs.rename(temp, file);
}

export async function listSessions(): Promise<
  Array<Pick<Session, "id" | "title" | "activeProject" | "updatedAt">>
> {
  try {
    const entries = await fs.readdir(sessionsDir());
    const sessions = await Promise.all(
      entries
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          try {
            const parsed = JSON.parse(
              await fs.readFile(path.join(sessionsDir(), name), "utf8"),
            ) as Session;
            return {
              id: parsed.id,
              title: parsed.title,
              activeProject: parsed.activeProject,
              updatedAt: parsed.updatedAt,
            };
          } catch {
            return null;
          }
        }),
    );
    return sessions
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function addUserMessage(session: Session, content: string): UiMessage {
  const message: UiMessage = {
    id: newId("msg"),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
  session.messages.push(message);
  session.history.push({ role: "user", content });
  if (!session.title && content.trim()) {
    session.title = content.trim().slice(0, 60);
  }
  return message;
}

export function addAgentContext(
  session: Session,
  content: string,
): void {
  session.history.push({ role: "user", content });
}

export function addAssistantMessage(
  session: Session,
  content: string,
  tools: ToolTrace[] = [],
  artifactIds: string[] = [],
): UiMessage {
  const message: UiMessage = {
    id: newId("msg"),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    ...(tools.length ? { tools } : {}),
    ...(artifactIds.length ? { artifactIds } : {}),
  };
  session.messages.push(message);
  return message;
}

export function addArtifact(
  session: Session,
  kind: ArtifactKind,
  data: unknown,
  title?: string,
): Artifact {
  const artifact: Artifact = {
    id: newId("art"),
    kind,
    title,
    data,
    createdAt: new Date().toISOString(),
  };
  session.artifacts.push(artifact);
  return artifact;
}

function trimHistory(history: AgentMessage[]): AgentMessage[] {
  if (history.length <= MAX_HISTORY) return history;
  // Keep the most recent messages, but never start with an orphan tool result.
  let start = history.length - MAX_HISTORY;
  while (start < history.length && history[start]?.role === "tool") start += 1;
  return history.slice(start);
}

function normalizeSession(session: Session): Session {
  return {
    ...session,
    history: Array.isArray(session.history) ? session.history : [],
    messages: Array.isArray(session.messages) ? session.messages : [],
    artifacts: Array.isArray(session.artifacts) ? session.artifacts : [],
    pending: session.pending ?? null,
  };
}
