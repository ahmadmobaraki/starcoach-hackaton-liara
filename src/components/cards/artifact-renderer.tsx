"use client";

import type { Artifact } from "@/lib/agent/types";
import { PlanCard, type PlanArtifact } from "./plan-card";
import { DiagnosisCard, type DiagnosisArtifact } from "./diagnosis-card";
import { GuideCard, type GuideArtifact } from "./guide-card";
import { ProjectCard } from "./project-card";
import { MetricsCard } from "./metrics-card";
import { ReleaseCard } from "./release-card";
import { DomainCard } from "./domain-card";
import { VmsCard } from "./vms-card";
import { DatabasesCard } from "./databases-card";

export function ArtifactRenderer({
  artifact,
  onPrompt,
}: {
  artifact: Artifact;
  onPrompt?: (prompt: string) => void;
}) {
  const data = artifact.data;
  switch (artifact.kind) {
    case "plan":
      return <PlanCard data={data as PlanArtifact} onSelect={onPrompt} />;
    case "diagnosis":
      return <DiagnosisCard data={data as DiagnosisArtifact} onPrompt={onPrompt} />;
    case "guide":
      return <GuideCard data={data as GuideArtifact} onPrompt={onPrompt} />;
    case "project":
    case "verification":
      return <ProjectCard data={data as never} onPrompt={onPrompt} />;
    case "metrics":
      return <MetricsCard data={data as never} onPrompt={onPrompt} />;
    case "release":
      return <ReleaseCard data={data as never} />;
    case "domain":
      return <DomainCard data={data as never} onPrompt={onPrompt} />;
    case "vms":
      return <VmsCard data={data as never} onPrompt={onPrompt} />;
    case "databases":
      return <DatabasesCard data={data as never} onPrompt={onPrompt} />;
    default:
      return (
        <details className="panel p-3 text-[11px] text-muted">
          <summary className="cursor-pointer font-medium">جزئیات نتیجه</summary>
          <pre
            dir="ltr"
            className="mt-2 max-h-60 overflow-auto rounded-lg bg-surface-2 p-2 text-[10px]"
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      );
  }
}
