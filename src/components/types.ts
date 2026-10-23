import type { LiaraPlan } from "@/lib/liara/types";

export type AccountLite = {
  id?: string;
  fullname?: string;
  emailMasked?: string;
  phoneMasked?: string;
  isVerified?: boolean;
  isTeam?: boolean;
  accountType?: string;
};

export type ProjectLite = {
  id: string;
  name: string;
  type: string;
  status: string;
  scale: number;
  planID: string;
  bundlePlanID?: string;
  isDeployed: boolean;
  url: string;
  health: "stopped" | "deployed" | "not_deployed";
  plan?: LiaraPlan | null;
};

export type ProjectHealth = {
  project: {
    id: string;
    name: string;
    type: string;
    status: string;
    scale: number;
    planID: string;
    bundlePlanID?: string;
    isDeployed: boolean;
    url: string;
  };
  plan?: LiaraPlan | null;
  bundle?: {
    bundleID?: string;
    monthlyPrice?: number;
    zeroDowntime?: boolean;
    maxLogsRetentionDays?: number;
  } | null;
  latestRelease?: { id?: string; state?: string; createdAt?: string } | null;
  domains?: Array<{ name?: string; status?: string }>;
  diagnosis?: {
    severity: "critical" | "warning" | "healthy" | "unknown";
    headline: string;
    signals: {
      cpuPercent: number | null;
      memoryPercent: number | null;
      diskPercent: number | null;
      errorCount: number;
      releaseState: string | null;
      scale: number;
    };
  };
  metrics?: {
    signals?: unknown;
    disks?: Array<{ name?: string; size?: string; usage?: string }>;
  };
};

export type UploadLite = {
  id: string;
  filename: string;
  size: number;
  fileCount: number;
  platform: string;
  createdAt: string;
};
