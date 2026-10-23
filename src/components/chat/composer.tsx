"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizontal, ShieldCheck, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

export function Composer({
  onSend,
  onStop,
  onUpload,
  disabled,
  streaming,
  uploading,
  placeholder,
  activeProject,
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  onUpload: (file: File) => void;
  disabled?: boolean;
  streaming?: boolean;
  uploading?: boolean;
  placeholder?: string;
  activeProject?: string;
}) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  };

  const handleFile = (file?: File | null) => {
    if (!file) return;
    onUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className={cn(
        "rounded-[20px] border bg-surface p-2 shadow-[var(--shadow-float)] transition-colors",
        dragging ? "border-accent bg-accent-soft/20" : "border-line",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        handleFile(file);
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={8000}
        placeholder={
          placeholder ??
          (activeProject
            ? `درباره‌ی «${activeProject}» بپرس یا یک کار جدید شروع کن...`
            : "درخواستت را بنویس؛ از انتخاب پلن تا رفع خطا...")
        }
        className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-7 outline-none placeholder:text-muted/70"
        disabled={disabled}
        aria-label="پیام به راهبر"
      />

      <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
        <div className="flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.tar,.tar.gz,.tgz"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            title="آپلود فایل پروژه"
            aria-label="آپلود فایل پروژه"
          >
            {uploading ? <Spinner /> : <Paperclip className="size-4" />}
          </button>
          {text.length > 0 ? (
            <button
              type="button"
              className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
              onClick={() => setText("")}
              title="پاک کردن"
              aria-label="پاک کردن"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[9.5px] text-muted sm:flex">
            <ShieldCheck className="size-3 text-success" />
            اقدام حساس با تأیید
          </span>
          {streaming && onStop ? (
            <Button size="sm" variant="secondary" onClick={onStop}>
              <Square className="size-3.5 fill-current" />
              توقف
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={submit}
              disabled={!text.trim() || disabled}
              aria-label="ارسال"
              className="size-10 rounded-xl p-0"
            >
              <SendHorizontal className="size-4 rtl:-scale-x-100" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
