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
};

export type ServerSnapshot = {
  id: string;
  reachable: boolean;
  upgradableCount: number;
  securityCount: number;
  rebootRequired: boolean;
  lastCheckAt: string;
  rawSummaryJson: string;
};

export type Job = {
  id: string;
  type: "refresh" | "upgrade" | string;
  status: "queued" | "running" | "success" | "failed" | string;
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
  agentBaseUrl: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  latestSnapshot: ServerSnapshot | null;
  latestJob: Job | null;
};

export type ServerDetail = ServerSummary & {
  recentJobs: Job[];
};

export type ServerPayload = {
  name: string;
  environment: "production" | "staging" | "internal" | "other";
  agentBaseUrl: string;
  agentToken?: string;
  notes?: string;
  isActive?: boolean;
};
