export type User = {
  id: string;
  email: string;
};

export type DashboardSummary = {
  serverCount: number;
  reachableCount: number;
  upToDateCount: number;
  pendingUpdateCount: number;
  securityUpdateCount: number;
  lastGlobalCheckAt: string | null;
  onlineCount: number;
  staleCount: number;
  offlineCount: number;
  queuedJobCount: number;
};

export type ServerSnapshot = {
  id: string;
  reachable: boolean;
  upgradableCount: number;
  securityCount: number;
  rebootRequired: boolean;
  lastCheckAt: string;
  outputPreview: string;
};

export type Job = {
  id: string;
  type: "refresh" | "upgrade" | "agent_update" | string;
  status: "queued" | "running" | "success" | "failed" | string;
  claimedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  outputPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  triggeredByUserId: string;
};

export type Category = {
  id: string;
  name: string;
};

export type CategorySummary = Category & {
  serverCount: number;
};

export type ServerSummary = {
  id: string;
  name: string;
  environment: "production" | "staging" | "internal" | "other" | string;
  isActive: boolean;
  shellAccessEnabled?: boolean;
  agentId: string | null;
  hostname: string | null;
  sshHost: string | null;
  sshPort: number;
  osName: string | null;
  osVersion: string | null;
  agentVersion: string | null;
  latestAgentVersion: string | null;
  agentUpdateStatus: "up_to_date" | "update_available" | "unknown" | string;
  lastSeenAt: string | null;
  lastReportAt: string | null;
  connectivityStatus: "online" | "stale" | "offline" | string;
  createdAt: string;
  updatedAt: string;
  categories: Category[];
  latestSnapshot: ServerSnapshot | null;
  latestJob: Job | null;
  pendingJobsCount: number;
};

export type ServerDetail = ServerSummary & {
  notes: string | null;
  recentJobs: Job[];
};

export type ServerPayload = {
  name?: string;
  environment?: "production" | "staging" | "internal" | "other";
  notes?: string;
  isActive?: boolean;
  sshHost?: string;
  sshPort?: number;
  categoryIds?: string[];
};

export type EnrollmentSettings = {
  enrollmentToken: string;
  publicUrl: string;
  reportIntervalSeconds: number;
  jobPollIntervalSeconds: number;
  autoUpdateIntervalSeconds: number;
  installCommand: string;
  installCommandRestricted: string;
};
