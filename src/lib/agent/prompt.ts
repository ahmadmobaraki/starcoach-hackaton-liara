import fs from "node:fs";
import path from "node:path";
import type { Session } from "./session";

const DEFAULT_PROMPT_PATH = "prompts/raahbar-system.md";

const FALLBACK_PROMPT = `تو «راهبر» هستی؛ یک همکار فنی فارسی‌زبان برای مدیریت وب‌سایت روی لیارا.
همیشه قبل از ادعا درباره‌ی وضعیت، از ابزارهای خواندنی استفاده کن.
برای هر تغییر حساس اول liara_prepare_action بساز و بعد از آن متوقف شو؛ اجرای واقعی فقط بعد از تأیید انسان در پنل انجام می‌شود.
برای کارهایی که API انجام نمی‌دهد (ایرنیک، پرداخت، SSH، تغییر کد) راهنمای دقیق بده و بعد از گزارش کاربر نتیجه را با ابزار بررسی کن.
فارسی ساده بنویس، ایموجی استفاده نکن و هیچ مقدار env یا توکن را چاپ نکن.`;

let cached: { file: string; mtimeMs: number; size: number; text: string } | null =
  null;

function promptFile(): string {
  const configured = process.env.SYSTEM_PROMPT_PATH;
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.join(process.cwd(), DEFAULT_PROMPT_PATH);
}

function loadTemplate(): string {
  const file = promptFile();
  try {
    const stat = fs.statSync(file);
    if (
      cached &&
      cached.file === file &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      return cached.text;
    }
    const text = fs.readFileSync(file, "utf8");
    cached = { file, mtimeMs: stat.mtimeMs, size: stat.size, text };
    return text;
  } catch (error) {
    console.error(
      `[raahbar] could not load system prompt at ${file}; using fallback.`,
      error instanceof Error ? error.message : error,
    );
    return FALLBACK_PROMPT;
  }
}

export function buildSystemPrompt(session: Session): string {
  const active = session.activeProject
    ? `پروژه‌ی فعال کاربر: «${session.activeProject}».`
    : "هنوز پروژه‌ی فعالی انتخاب نشده است.";
  const details = session.activeProject
    ? `- پروژه‌ی فعال: ${session.activeProject}\n- برای وضعیت آن، حتماً از ابزارهای خواندنی استفاده کن و حدس نزن.`
    : "- پروژه‌ی فعالی انتخاب نشده؛ اگر کاربر درباره‌ی «سایتم» حرف زد، اول پروژه‌ها را بخوان یا یک سؤال کوتاه بپرس.";

  return loadTemplate()
    .replaceAll("{{active_project_line}}", active)
    .replaceAll("{{date}}", new Date().toLocaleDateString("fa-IR-u-ca-persian"))
    .replaceAll("{{active_project_details}}", details);
}
