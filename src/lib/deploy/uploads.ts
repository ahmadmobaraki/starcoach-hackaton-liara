import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/config";

export type UploadMeta = {
  id: string;
  filename: string;
  size: number;
  fileCount: number;
  platform: string;
  createdAt: string;
};

function uploadsDir(): string {
  return path.join(getDataDir(), "uploads");
}

function metaPath(id: string): string {
  return path.join(uploadsDir(), `${id}.json`);
}

function dataPath(id: string): string {
  return path.join(uploadsDir(), `${id}.tar.gz`);
}

export async function saveUpload(input: {
  buffer: Buffer;
  filename: string;
  fileCount: number;
  platform: string;
}): Promise<UploadMeta> {
  await fs.mkdir(uploadsDir(), { recursive: true });
  const id = `upl_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const meta: UploadMeta = {
    id,
    filename: input.filename,
    size: input.buffer.byteLength,
    fileCount: input.fileCount,
    platform: input.platform,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(dataPath(id), input.buffer, { mode: 0o600 });
  await fs.writeFile(metaPath(id), JSON.stringify(meta), { mode: 0o600 });
  await cleanupUploads();
  return meta;
}

export async function getUpload(
  id: string,
): Promise<{ meta: UploadMeta; buffer: Buffer } | null> {
  if (!/^upl_[a-f0-9]+$/i.test(id)) return null;
  try {
    const [rawMeta, buffer] = await Promise.all([
      fs.readFile(metaPath(id), "utf8"),
      fs.readFile(dataPath(id)),
    ]);
    return { meta: JSON.parse(rawMeta) as UploadMeta, buffer };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listUploads(): Promise<UploadMeta[]> {
  try {
    const entries = await fs.readdir(uploadsDir());
    const metas = await Promise.all(
      entries
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          try {
            return JSON.parse(
              await fs.readFile(path.join(uploadsDir(), name), "utf8"),
            ) as UploadMeta;
          } catch {
            return null;
          }
        }),
    );
    return metas
      .filter((m): m is UploadMeta => Boolean(m))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function cleanupUploads(): Promise<void> {
  const cutoff = Date.now() - 24 * 3600_000;
  const metas = await listUploads();
  await Promise.all(
    metas
      .filter((meta) => new Date(meta.createdAt).getTime() < cutoff)
      .map(async (meta) => {
        await fs.rm(dataPath(meta.id), { force: true }).catch(() => undefined);
        await fs.rm(metaPath(meta.id), { force: true }).catch(() => undefined);
      }),
  );
}
