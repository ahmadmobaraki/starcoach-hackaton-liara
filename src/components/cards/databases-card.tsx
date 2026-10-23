"use client";

import { Database, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DatabaseShape = {
  id?: string;
  name?: string;
  type?: string;
  planID?: string;
  status?: string;
  hostname?: string;
  port?: number;
};

export function DatabasesCard({
  data,
  onPrompt,
}: {
  data: { databases?: DatabaseShape[]; count?: number };
  onPrompt?: (prompt: string) => void;
}) {
  const databases = data.databases ?? [];
  return (
    <section className="panel animate-rise overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-info-soft text-info">
            <Database className="size-4" />
          </span>
          <div>
            <h3 className="text-[13px] font-bold">دیتابیس‌ها</h3>
            <p className="text-[10px] text-muted">{databases.length} دیتابیس</p>
          </div>
        </div>
        {onPrompt ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onPrompt(
                "دیتابیس‌های فعلی و پلن‌های دیتابیس را بررسی کن و اگر به دیتابیس جدید نیاز دارم راهنمایی کن.",
              )
            }
          >
            مدیریت
          </Button>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        {databases.length ? (
          databases.map((database, index) => (
            <div
              key={database.id ?? `${database.name}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold">{database.name ?? "—"}</span>
                <Badge>{database.type ?? "—"}</Badge>
                {database.planID ? <Badge tone="info">{database.planID}</Badge> : null}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted">
                {database.hostname ? (
                  <span className="flex items-center gap-1" dir="ltr">
                    <LockKeyhole className="size-3" />
                    {database.hostname}
                    {database.port ? `:${database.port}` : ""}
                  </span>
                ) : null}
                <Badge tone={database.status === "ACTIVE" ? "success" : "warning"}>
                  {database.status ?? "—"}
                </Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-3 py-4 text-center text-[11px] text-muted">
            دیتابیسی ساخته نشده است.
          </div>
        )}
      </div>
    </section>
  );
}
