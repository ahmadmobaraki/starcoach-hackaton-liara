import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, getDataDir } from "@/lib/config";
import type { ActionType, ActionPreview, RiskLevel } from "./risk-policy";
import { actionMeta } from "./risk-policy";
import { redactObject, redactText } from "./redact";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "expired";

export type ApprovalRecord = {
  id: string;
  digest: string;
  action: ActionType;
  risk: RiskLevel;
  preview: ActionPreview;
  reason?: string;
  sessionId?: string;
  status: ApprovalStatus;
  confirmTextRequired?: string;
  paramsEnc: string;
  iv: string;
  tag: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  executedAt?: string;
  result?: unknown;
  error?: string;
};

export type CreateApprovalInput = {
  action: ActionType;
  params: Record<string, unknown>;
  risk: RiskLevel;
  preview: ActionPreview;
  reason?: string;
  sessionId?: string;
};

const FILE_VERSION = 1;
const TTL_MS = 10 * 60_000;
let lock: Promise<unknown> = Promise.resolve();

function storePath(): string {
  return path.join(getDataDir(), "approvals.json");
}

function approvalSecret(): string {
  const config = getConfig();
  return process.env.APPROVAL_SECRET || config.liaraApiKey;
}

function encryptionKey(): Buffer {
  return crypto.scryptSync(approvalSecret(), "raahbar-approval-v1", 32);
}

function encryptParams(params: Record<string, unknown>): {
  paramsEnc: string;
  iv: string;
  tag: string;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(params), "utf8"),
    cipher.final(),
  ]);
  return {
    paramsEnc: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptParams(record: ApprovalRecord): Record<string, unknown> {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.paramsEnc, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function actionDigest(
  action: string,
  params: Record<string, unknown>,
): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify({ action, params }))
    .digest("hex");
}

async function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.catch(() => undefined);
  return next;
}

type StoreShape = {
  version: number;
  approvals: Record<string, ApprovalRecord>;
};

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || typeof parsed !== "object" || !parsed.approvals) {
      return { version: FILE_VERSION, approvals: {} };
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: FILE_VERSION, approvals: {} };
    }
    throw error;
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  const file = storePath();
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
  await fs.rename(temp, file);
}

function expireIfNeeded(record: ApprovalRecord): ApprovalRecord {
  if (
    record.status === "pending" &&
    new Date(record.expiresAt).getTime() < Date.now()
  ) {
    return { ...record, status: "expired" };
  }
  return record;
}

export async function createApproval(
  input: CreateApprovalInput,
): Promise<ApprovalRecord> {
  return withFileLock(async () => {
    const store = await readStore();
    const id = `apr_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const encrypted = encryptParams(input.params);
    const now = new Date();
    const record: ApprovalRecord = {
      id,
      digest: actionDigest(input.action, input.params),
      action: input.action,
      risk: input.risk,
      preview: input.preview,
      reason: input.reason ? redactText(input.reason) : undefined,
      sessionId: input.sessionId,
      status: "pending",
      confirmTextRequired: input.preview.confirmTextRequired,
      ...encrypted,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    };
    store.approvals[id] = record;
    cleanupStore(store);
    await writeStore(store);
    return record;
  });
}

async function getApprovalRecord(id: string): Promise<ApprovalRecord | null> {
  return withFileLock(async () => {
    const store = await readStore();
    const record = store.approvals[id];
    if (!record) return null;
    const expired = expireIfNeeded(record);
    if (expired.status !== record.status) {
      store.approvals[id] = expired;
      await writeStore(store);
    }
    return expired;
  });
}

export async function getApproval(
  id: string,
): Promise<ApprovalRecord | null> {
  const record = await getApprovalRecord(id);
  return record ? publicApproval(record) : null;
}

export async function getApprovalParams(
  id: string,
): Promise<Record<string, unknown> | null> {
  const record = await getApprovalRecord(id);
  if (!record) return null;
  return decryptParams(record);
}

export async function decideApproval(
  id: string,
  decision: "approve" | "reject",
  confirmText?: string,
): Promise<ApprovalRecord> {
  return withFileLock(async () => {
    const store = await readStore();
    const record = store.approvals[id];
    if (!record) throw new Error("درخواست تأیید پیدا نشد.");
    const current = expireIfNeeded(record);
    if (current.status !== "pending") {
      throw new Error(
        current.status === "approved"
          ? "این درخواست قبلاً تأیید شده است."
          : current.status === "rejected"
            ? "این درخواست قبلاً رد شده است."
            : "این درخواست منقضی شده است؛ دوباره آماده‌سازی کنید.",
      );
    }
    if (
      decision === "approve" &&
      current.confirmTextRequired &&
      confirmText !== current.confirmTextRequired
    ) {
      throw new Error(
        `برای این اقدام باید نام منبع را دقیقاً تایپ کنید: ${current.confirmTextRequired}`,
      );
    }
    const updated: ApprovalRecord = {
      ...current,
      status: decision === "approve" ? "approved" : "rejected",
      decidedAt: new Date().toISOString(),
    };
    store.approvals[id] = updated;
    await writeStore(store);
    return publicApproval(updated);
  });
}

export async function markExecuted(
  id: string,
  result: unknown,
): Promise<ApprovalRecord> {
  return withFileLock(async () => {
    const store = await readStore();
    const record = store.approvals[id];
    if (!record) throw new Error("درخواست تأیید پیدا نشد.");
    const updated: ApprovalRecord = {
      ...record,
      status: "executed",
      executedAt: new Date().toISOString(),
      result: redactObject(result),
    };
    store.approvals[id] = updated;
    await writeStore(store);
    return publicApproval(updated);
  });
}

export async function markFailed(
  id: string,
  error: unknown,
): Promise<ApprovalRecord> {
  return withFileLock(async () => {
    const store = await readStore();
    const record = store.approvals[id];
    if (!record) throw new Error("درخواست تأیید پیدا نشد.");
    const updated: ApprovalRecord = {
      ...record,
      status: "failed",
      executedAt: new Date().toISOString(),
      error: error instanceof Error ? redactText(error.message) : "خطای ناشناخته",
    };
    store.approvals[id] = updated;
    await writeStore(store);
    return publicApproval(updated);
  });
}

export async function listPendingApprovals(
  sessionId?: string,
): Promise<ApprovalRecord[]> {
  const store = await readStore();
  return Object.values(store.approvals)
    .map(expireIfNeeded)
    .filter(
      (record) =>
        record.status === "pending" &&
        (!sessionId || record.sessionId === sessionId),
    )
    .map(publicApproval)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function publicApproval(record: ApprovalRecord): ApprovalRecord {
  const rest = { ...record };
  delete (rest as Partial<ApprovalRecord>).paramsEnc;
  delete (rest as Partial<ApprovalRecord>).iv;
  delete (rest as Partial<ApprovalRecord>).tag;
  return rest;
}

function cleanupStore(store: StoreShape): void {
  const cutoff = Date.now() - 24 * 3600_000;
  for (const [id, record] of Object.entries(store.approvals)) {
    const terminal = ["executed", "failed", "expired", "rejected"].includes(
      record.status,
    );
    if (terminal && new Date(record.createdAt).getTime() < cutoff) {
      delete store.approvals[id];
    }
  }
}

export function approvalUrl(id: string): string {
  return `${getConfig().appUrl}/?approval=${encodeURIComponent(id)}`;
}

export function approvalMeta(action: ActionType) {
  return actionMeta(action);
}
