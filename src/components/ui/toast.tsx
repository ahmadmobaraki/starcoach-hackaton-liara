"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { useEffect } from "react";

export type ToastState = {
  id: number;
  message: string;
  tone?: "success" | "error" | "info";
};

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 animate-rise">
      <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-[var(--shadow-float)]">
        {toast.tone === "error" ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        )}
        <p className="flex-1 text-[11.5px] leading-5">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2"
          aria-label="بستن"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
