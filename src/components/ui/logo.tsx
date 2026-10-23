import { cn } from "@/lib/utils/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-accent text-accent-ink shadow-[0_1px_0_rgba(0,0,0,0.08)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" fill="none" className="size-6">
        <path
          d="M7 22.5c0-4.2 3.2-5.3 6.4-6.4 3.3-1.1 5.1-2.3 5.1-5.2"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="7" cy="22.5" r="2.2" fill="currentColor" />
        <circle cx="18.5" cy="10.9" r="2.2" fill="currentColor" />
        <path
          d="M22 18.5h4.5M22 22.5h2.5"
          stroke="#9FD8C8"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo />
      {compact ? (
        <div className="text-[14px] font-extrabold tracking-tight">راهبر</div>
      ) : (
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight">راهبر</div>
          <div className="text-[10.5px] font-medium text-muted">
            دستیار هوشمند لیارا
          </div>
        </div>
      )}
    </div>
  );
}
