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
  rawSummaryJson: string;
};

export type Job = {
  id: string;
  type: "refresh" | "upgrade" | string;
  status: "queued" | "running" | "success" | "failed" | string;
  claimedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  outputPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  triggeredByUserId: string;
};

export type ServerSummary = {
  id: string;
  name: string;
  environment: "production" | "staging" | "internal" | "other" | string;
  notes: string | null;
  isActive: boolean;
  agentId: string | null;
  hostname: string | null;
  osName: string | null;
  osVersion: string | null;
  agentVersion: string | null;
  lastSeenAt: string | null;
  lastReportAt: string | null;
  connectivityStatus: "online" | "stale" | "offline" | string;
  createdAt: string;
  updatedAt: string;
  latestSnapshot: ServerSnapshot | null;
  latestJob: Job | null;
  pendingJobsCount: number;
};

export type ServerDetail = ServerSummary & {
  recentJobs: Job[];
};

export type ServerPayload = {
  name: string;
  environment: "production" | "staging" | "internal" | "other";
  notes?: string;
  isActive?: boolean;
};

export type EnrollmentSettings = {
  enrollmentToken: string;
  publicUrl: string;
  reportIntervalSeconds: number;
  jobPollIntervalSeconds: number;
  installCommand: string;
};
