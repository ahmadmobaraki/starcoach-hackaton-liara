"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover border border-accent shadow-[0_1px_0_rgba(0,0,0,0.06)]",
  secondary:
    "bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-surface-2",
  danger:
    "bg-danger text-white border border-danger hover:bg-[#9f322b]",
  outline:
    "bg-transparent text-accent border border-accent/30 hover:bg-accent-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[12.5px] gap-1.5 rounded-lg",
  md: "h-11 px-4 text-[13.5px] gap-2 rounded-xl",
  lg: "h-12 px-5 text-sm gap-2 rounded-xl",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
