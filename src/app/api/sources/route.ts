import { getConfig } from "@/lib/config";
import { prepareArchiveFromBuffer } from "@/lib/deploy/archive";
import { saveUpload } from "@/lib/deploy/uploads";
import { safeError } from "@/lib/security/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const config = getConfig();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "فایلی انتخاب نشده است." }, { status: 400 });
    }
    const maxBytes = config.maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return Response.json(
        {
          error: `حجم فایل بیش از ${config.maxUploadMb} مگابایت است.`,
        },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return Response.json({ error: "فایل خالی است." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const archive = await prepareArchiveFromBuffer(buffer, file.name);
    const upload = await saveUpload({
      buffer: archive.buffer,
      filename: archive.filename,
      fileCount: archive.fileCount,
      platform: archive.platform,
    });
    return Response.json({
      upload,
      detectedPlatform: archive.platform,
      note:
        "این فایل امن‌سازی و دوباره بسته‌بندی شد. برای استقرار، نام پروژه و این شناسه را به راهبر بده.",
    });
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 400 });
  }
}
