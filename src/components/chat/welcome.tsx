"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Gauge,
  Globe2,
  Rocket,
  ServerCog,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";

type AccountShape = {
  fullname?: string;
  emailMasked?: string;
  isVerified?: boolean;
} | null;

const suggestions = [
  {
    icon: Rocket,
    title: "سایتم رو راه بنداز",
    prompt:
      "می‌خوام وب‌سایتم رو برای اولین بار روی لیارا راه بندازم. از من بپرس چه اطلاعاتی لازم داری و قدم‌به‌قدم کمکم کن.",
  },
  {
    icon: Gauge,
    title: "چه پلنی مناسبه؟",
    prompt:
      "نمی‌دونم چه پلنی برای وب‌سایتم مناسبه. نیازم رو بررسی کن و با قیمت زنده بهترین گزینه رو پیشنهاد بده.",
  },
  {
    icon: AlertTriangle,
    title: "خطای ۵۰۰ می‌گیرم",
    prompt:
      "سایتم خطای 500 می‌ده. لاگ‌ها و وضعیت سرویس رو بررسی کن و علت‌های احتمالی رو با شواهد بگو.",
  },
  {
    icon: ServerCog,
    title: "سایتم کند شده",
    prompt:
      "سایتم کند شده. مصرف CPU، حافظه و دیسک رو بررسی کن و بگو مشکل از منابع است یا کد.",
  },
  {
    icon: Globe2,
    title: "دامنه رو وصل کن",
    prompt:
      "می‌خوام دامنه‌ام رو به سایت وصل کنم. مراحل لیارا و ایرنیک رو قدم‌به‌قدم بگو.",
  },
];

export function Welcome({
  account,
  hasProjects,
  activeProject,
  onPrompt,
  onPickFile,
  uploading,
}: {
  account: AccountShape;
  hasProjects: boolean;
  activeProject?: string;
  onPrompt: (prompt: string) => void;
  onPickFile: () => void;
  uploading?: boolean;
}) {
  return (
    <div className="animate-rise pb-2 pt-6 sm:pt-10">
      <div className="flex flex-col items-start gap-5">
        <div className="flex items-center gap-3">
          <Logo className="size-12 rounded-2xl" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">
                از اولین استقرار تا پایداری، کنارتم.
              </h1>
              <Badge tone="accent" dot>
                متصل به لیارا
              </Badge>
            </div>
            <p className="mt-1 text-[12px] text-muted sm:text-[13px]">
              {account?.fullname ? `${account.fullname} · ` : ""}
              کارهای زیرساخت را انجام می‌دهم، قدم‌های دستی را دقیق توضیح می‌دهم و
              قبل از هر تغییر حساس از تو تأیید می‌گیرم.
            </p>
          </div>
        </div>

        <div className="grid w-full gap-2.5 sm:grid-cols-2">
          {suggestions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => onPrompt(item.prompt)}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-start transition hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-[var(--shadow-card)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted transition group-hover:bg-accent-soft group-hover:text-accent">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] font-medium">
                  {item.title}
                </span>
                <ArrowLeft className="size-3.5 text-muted/50 transition group-hover:-translate-x-0.5 group-hover:text-accent" />
              </button>
            );
          })}
        </div>

        <div className="hidden w-full flex-col gap-3 rounded-2xl border border-line bg-surface-2/50 px-4 py-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Upload className="size-3.5" />
            </span>
            <div>
              <p className="text-[12px] font-semibold">
                {hasProjects
                  ? activeProject
                    ? `پروژه‌ی فعال: ${activeProject}`
                    : "یک پروژه انتخاب کن"
                  : "هنوز پروژه‌ای در لیارا نداری"}
              </p>
              <p className="mt-0.5 text-[10.5px] leading-5 text-muted">
                فایل zip یا tar.gz پروژه را آپلود کن؛ پلتفرم را تشخیص می‌دهم و برای
                ساخت و استقرار راهنمایی می‌کنم.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={uploading}
            onClick={onPickFile}
            className="shrink-0"
          >
            <Upload className="size-3.5" />
            آپلود پروژه
          </Button>
        </div>

        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted sm:flex">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3 text-accent" />
            پلن با قیمت زنده
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1 rounded-full bg-success" />
            اقدام حساس فقط با تأیید تو
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1 rounded-full bg-info" />
            راهنمای قدم‌به‌قدم برای کارهای خارج از API
          </span>
        </div>
      </div>
    </div>
  );
}
