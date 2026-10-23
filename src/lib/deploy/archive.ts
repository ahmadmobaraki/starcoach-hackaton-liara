import AdmZip from "adm-zip";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { create, extract } from "tar";
import { detectPlatform } from "./detect-platform";

export type PreparedArchive = {
  buffer: Buffer;
  filename: string;
  size: number;
  fileCount: number;
  platform: string;
};

const MAX_EXTRACTED_BYTES = 400 * 1024 * 1024;
const MAX_FILES = 20_000;
const IGNORED = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".data",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  ".idea",
  ".vscode",
  ".DS_Store",
  "liara.json",
  ".env",
]);

export async function prepareArchiveFromBuffer(
  buffer: Buffer,
  filename: string,
): Promise<PreparedArchive> {
  const lower = filename.toLowerCase();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "raahbar-src-"));
  try {
    if (lower.endsWith(".zip")) {
      await extractZip(buffer, work);
    } else if (
      lower.endsWith(".tar.gz") ||
      lower.endsWith(".tgz") ||
      lower.endsWith(".tar")
    ) {
      await extractTarBuffer(buffer, work);
    } else {
      throw new Error("فرمت فایل پشتیبانی نمی‌شود. zip یا tar.gz آپلود کنید.");
    }
    const normalized = await normalizeProjectRoot(work);
    const target = path.join(work, "source.tar.gz");
    const files = await listFiles(normalized);
    if (!files.length) {
      throw new Error("فایل قابل استقراری داخل آرشیو پیدا نشد.");
    }
    if (files.length > MAX_FILES) {
      throw new Error("تعداد فایل‌های پروژه بیش از حد مجاز است.");
    }
    await create(
      {
        gzip: { level: 9 },
        cwd: normalized,
        file: target,
        portable: true,
        filter: (entryPath) => {
          const parts = entryPath.split("/").filter(Boolean);
          return !parts.some(
            (part) => IGNORED.has(part) || part.startsWith(".env."),
          );
        },
      },
      files.map((file) => path.relative(normalized, file)),
    );
    const packed = await fs.readFile(target);
    const platform = await detectPlatform(normalized);
    return {
      buffer: packed,
      filename: filename.replace(/\.(tar\.gz|tgz|tar|zip)$/i, "") + ".tar.gz",
      size: packed.byteLength,
      fileCount: files.length,
      platform,
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function prepareArchiveFromDirectory(
  directory: string,
): Promise<PreparedArchive> {
  const resolved = path.resolve(directory);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    const buffer = await fs.readFile(resolved);
    return {
      buffer,
      filename: path.basename(resolved),
      size: buffer.byteLength,
      fileCount: 1,
      platform: await detectPlatform(path.dirname(resolved)),
    };
  }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "raahbar-src-"));
  try {
    const target = path.join(work, "source.tar.gz");
    const files = await listFiles(resolved);
    if (!files.length) throw new Error("پروژه خالی است.");
    await create(
      {
        gzip: { level: 9 },
        cwd: resolved,
        file: target,
        portable: true,
        filter: (entryPath) => {
          const parts = entryPath.split("/").filter(Boolean);
          return !parts.some(
            (part) => IGNORED.has(part) || part.startsWith(".env."),
          );
        },
      },
      files.map((file) => path.relative(resolved, file)),
    );
    const buffer = await fs.readFile(target);
    return {
      buffer,
      filename: "source.tar.gz",
      size: buffer.byteLength,
      fileCount: files.length,
      platform: await detectPlatform(resolved),
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function writeTemporaryArchive(
  archive: PreparedArchive,
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "raahbar-upload-"));
  const file = path.join(dir, "source.tar.gz");
  await fs.writeFile(file, archive.buffer);
  return file;
}

async function extractTarBuffer(buffer: Buffer, target: string): Promise<void> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "raahbar-tar-"));
  try {
    const archivePath = path.join(work, "source.tar");
    await fs.writeFile(archivePath, buffer);
    let bytes = 0;
    let count = 0;
    await extract({
      file: archivePath,
      cwd: target,
      strict: true,
      filter: (entryPath, entry) => {
        count += 1;
        bytes += Number(entry.size ?? 0);
        if (count > MAX_FILES) {
          throw new Error("تعداد فایل‌های آرشیو بیش از حد مجاز است.");
        }
        if (bytes > MAX_EXTRACTED_BYTES) {
          throw new Error("حجم بازشده‌ی آرشیو بیش از حد مجاز است.");
        }
        const entryType = "type" in entry ? entry.type : undefined;
        if (
          entryType === "SymbolicLink" ||
          entryType === "Link" ||
          entryType === "CharacterDevice" ||
          entryType === "BlockDevice"
        ) {
          return false;
        }
        return isSafeRelativePath(entryPath);
      },
    });
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractZip(buffer: Buffer, target: string): Promise<void> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (entries.length > MAX_FILES) {
    throw new Error("تعداد فایل‌های آرشیو بیش از حد مجاز است.");
  }
  let bytes = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    if (!isSafeRelativePath(name)) {
      throw new Error("مسیر ناامن در فایل zip شناسایی شد.");
    }
    bytes += entry.header.size;
    if (bytes > MAX_EXTRACTED_BYTES) {
      throw new Error("حجم بازشده‌ی آرشیو بیش از حد مجاز است.");
    }
    const out = path.join(target, name);
    if (entry.isDirectory) {
      await fs.mkdir(out, { recursive: true });
      continue;
    }
    const mode = (entry.header as unknown as { attr?: number }).attr;
    if (mode && (mode & 0o170000) === 0o120000) {
      throw new Error("symlink در فایل zip مجاز نیست.");
    }
    const data = zip.readFile(entry);
    if (!data) continue;
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, data);
  }
}

async function normalizeProjectRoot(work: string): Promise<string> {
  const entries = (await fs.readdir(work)).filter((name) => name !== ".DS_Store");
  if (entries.length === 1) {
    const only = path.join(work, entries[0]);
    const stat = await fs.stat(only);
    if (stat.isDirectory()) return only;
  }
  return work;
}

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || entry.name.startsWith(".env.")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        result.push(full);
      }
    }
  }
  await walk(root);
  return result;
}

function isSafeRelativePath(name: string): boolean {
  if (!name || name.includes("\0")) return false;
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
  return normalized.split("/").every((part) => part !== "..");
}
