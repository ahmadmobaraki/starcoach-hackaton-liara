const faNumber = new Intl.NumberFormat("fa-IR");

export function fa(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return faNumber.format(num);
}

export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function toman(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${fa(Math.round(value))} تومان`;
}

export function faDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function faRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(-diff / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(-diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(-diff / 3_600_000), "hour");
  return rtf.format(Math.round(-diff / 86_400_000), "day");
}

export function formatGb(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1) return `${fa(Math.round(value * 1024))} مگابایت`;
  return `${fa(value)} گیگابایت`;
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value < 1024) return `${fa(Math.round(value))} بایت`;
  if (value < 1024 ** 2) return `${fa(Math.round(value / 1024))} کیلوبایت`;
  if (value < 1024 ** 3) return `${fa(Math.round(value / 1024 ** 2))} مگابایت`;
  return `${fa((value / 1024 ** 3).toFixed(1))} گیگابایت`;
}

export function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}
