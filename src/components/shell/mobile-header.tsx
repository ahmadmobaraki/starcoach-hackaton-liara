"use client";

import { Menu, Sparkles } from "lucide-react";
import { BrandLockup } from "@/components/ui/logo";
import { Badge } from "@/components/ui/badge";
import type { ProjectLite } from "@/components/types";

export function MobileHeader({
  activeProject,
  projects,
  onMenu,
}: {
  activeProject?: string;
  projects: ProjectLite[];
  onMenu: () => void;
}) {
  const project = projects.find((item) => item.name === activeProject);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur-md lg:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenu}
          className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-muted"
          aria-label="باز کردن منو"
        >
          <Menu className="size-4" />
        </button>
        <BrandLockup compact />
      </div>
      <div className="flex items-center gap-2">
        {project ? (
          <Badge tone={project.scale === 0 ? "warning" : "success"} dot>
            {project.name}
          </Badge>
        ) : (
          <Badge tone="neutral">
            <Sparkles className="size-3" />
            شروع سریع
          </Badge>
        )}
      </div>
    </header>
  );
}
