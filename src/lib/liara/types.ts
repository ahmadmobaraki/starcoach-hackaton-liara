export type LiaraPlan = {
  id: string;
  available: boolean;
  region?: string;
  cpu: number;
  ram: number;
  disk: number;
  storageClass?: string;
  monthlyPrice: number;
  hourlyPrice: number;
  sharedCpu?: boolean;
  sharedRam?: boolean;
};

export type BundlePlan = {
  id: string;
  planID: string;
  bundleID: string;
  available: boolean;
  monthlyPrice: number;
  hourlyPrice: number;
  buildTimeoutMinutes: number;
  maxLogsRetentionDays: number;
  maxReportRetentionDays: number;
  maxDomains: number | "infinite";
  maxDeploymentsPerDay: number | "infinite";
  zeroDowntime: boolean;
  rollback: boolean;
  maxSourceSizeMb: number;
  maxDiskPerProject: number;
};

export type AccountPlanData = {
  projects: Record<string, RawPlan>;
  projectBundlePlans: Record<string, Record<string, RawBundlePlan>>;
  databases?: Record<string, RawPlan>;
  objectStorage?: Record<string, RawPlan>;
};

export type RawPlan = {
  available?: boolean;
  region?: string;
  storageClass?: string;
  displayPrice?: number;
  price?: number;
  volume?: number;
  RAM?: { amount?: number; shared?: boolean };
  CPU?: { amount?: number; shared?: boolean };
  supports?: string[];
  [key: string]: unknown;
};

export type RawBundlePlan = {
  available?: boolean;
  price?: number;
  displayPrice?: number;
  displayHourlyPrice?: number;
  buildTimeout?: number;
  maxLogsRetention?: number;
  maxReportRetention?: number;
  maxDomainsCount?: number | string;
  maxDeploymentCountInDay?: number | string;
  zeroDowntime?: boolean;
  rollback?: boolean;
  maxSourceSize?: number;
  maxDiskPerProject?: number;
  [key: string]: unknown;
};

export type LiaraUser = {
  id: string;
  fullname?: string;
  email?: string;
  phone?: string;
  isTeam?: boolean;
  accountType?: string;
  isVerified?: boolean;
  privateNetworkFeature?: boolean;
};

export type MeResponse = {
  user?: {
    _id?: string;
    fullname?: string;
    email?: string;
    phone?: string;
    isTeam?: boolean;
    accountType?: string;
    isVerified?: boolean;
    privateNetworkFeature?: boolean;
    [key: string]: unknown;
  };
  team?: Record<string, unknown>;
  plans?: AccountPlanData;
  databaseVersions?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ProjectSummary = {
  id: string;
  name: string;
  type: string;
  status: string;
  scale: number;
  planID: string;
  bundlePlanID?: string;
  createdAt?: string;
  isDeployed: boolean;
  deleted?: boolean;
};

export type EnvVar = {
  key: string;
  value?: string;
  encrypted?: boolean;
  id?: string;
};

export type ProjectDetail = ProjectSummary & {
  defaultSubdomain?: boolean;
  readOnlyRootFilesystem?: boolean;
  zeroDowntime?: boolean;
  fixedIPStatus?: string;
  network?: string;
  hourlyPrice?: number;
  reservedDiskSpace?: number;
  node?: { id?: string; ip?: string };
  envs: EnvVar[];
  raw?: Record<string, unknown>;
};

export type Release = {
  id: string;
  type?: string;
  state: string;
  port?: number;
  tag?: string;
  createdAt?: string;
  finishedAt?: string;
  imageName?: string;
  sourceAvailable?: boolean;
  failReason?: string;
  queue?: number;
  git?: {
    branch?: string;
    commit?: string;
    message?: string;
    author?: string;
  } | null;
  raw?: Record<string, unknown>;
};

export type Applet = {
  id: string;
  name: string;
  timestamp?: string;
  state: string;
  reason?: string;
  releaseId?: string;
};

export type LogEntry = {
  timestamp: string;
  message: string;
  releaseId?: string;
  stream?: string;
};

export type MetricPoint = {
  timestamp: number;
  value: number;
};

export type MetricsSummary = {
  cpu: MetricPoint[];
  memory: MetricPoint[];
  networkReceive: MetricPoint[];
  networkTransmit: MetricPoint[];
  disks: Array<{ name: string; size: string; usage: string; reportedAt?: string }>;
  raw?: unknown;
};

export type Domain = {
  id: string;
  name: string;
  type?: string;
  projectName?: string;
  status: string;
  certificatesStatus?: string;
  redirectTo?: string;
  cnameRecord?: string;
  verificationCode?: string;
  createdAt?: string;
  raw?: Record<string, unknown>;
};

export type Disk = {
  id: string;
  name: string;
  size: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Vm = {
  id: string;
  name: string;
  plan: string;
  os: string;
  state: string;
  power: string;
  createdAt?: string;
  ips?: Array<{ address: string; version: string }>;
  raw?: Record<string, unknown>;
};

export type VmPlan = {
  id: string;
  available: boolean;
  region?: string;
  monthlyPrice: number;
  hourlyPrice: number;
  volume: number;
  cpu: number;
  ram: number;
};

export type Database = {
  id: string;
  name: string;
  type: string;
  planID?: string;
  status?: string;
  scale?: number;
  hostname?: string;
  port?: number;
  createdAt?: string;
  raw?: Record<string, unknown>;
};

export type SourceUpload = {
  sourceId: string;
  size: number;
  filename: string;
};

export type ReleaseWaitResult = {
  releaseId: string;
  state: string;
  ok: boolean;
  buildLogTail: string[];
  failReason?: string;
  durationMs: number;
};

export type HttpErrorShape = {
  status: number;
  code?: string;
  message: string;
  body?: unknown;
};
