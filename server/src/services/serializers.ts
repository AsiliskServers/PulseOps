import type { Prisma } from "@prisma/client";
import type { ServerEnv } from "../lib/env.js";
import { isPendingJobStatus } from "../lib/jobs.js";
import { deriveConnectivityStatus } from "./connectivity.js";
import { resolveAgentUpdateStatus } from "./agent-release.js";

const snapshotSelect = {
  id: true,
  reachable: true,
  upgradableCount: true,
  securityCount: true,
  rebootRequired: true,
  lastCheckAt: true,
  outputPreview: true,
} satisfies Prisma.ServerSnapshotSelect;

const jobSelect = {
  id: true,
  type: true,
  status: true,
  claimedAt: true,
  startedAt: true,
  finishedAt: true,
  outputPreview: true,
  errorMessage: true,
  createdAt: true,
  triggeredByUserId: true,
} satisfies Prisma.JobSelect;

export const serverListInclude = {
  id: true,
  name: true,
  environment: true,
  isActive: true,
  agentId: true,
  hostname: true,
  sshHost: true,
  sshPort: true,
  osName: true,
  osVersion: true,
  agentVersion: true,
  lastSeenAt: true,
  lastReportAt: true,
  createdAt: true,
  updatedAt: true,
  snapshots: {
    orderBy: {
      lastCheckAt: "desc" as const,
    },
    take: 1,
    select: snapshotSelect,
  },
  jobs: {
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 1,
    select: jobSelect,
  },
} satisfies Prisma.ServerSelect;

export const serverDetailInclude = {
  ...serverListInclude,
  notes: true,
  jobs: {
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 20,
    select: jobSelect,
  },
} satisfies Prisma.ServerSelect;

export type ServerListRecord = Prisma.ServerGetPayload<{
  select: typeof serverListInclude;
}>;

export type ServerDetailRecord = Prisma.ServerGetPayload<{
  select: typeof serverDetailInclude;
}>;

type SnapshotRecord = ServerListRecord["snapshots"][number];
type JobRecord = ServerDetailRecord["jobs"][number];
type JobLike = Pick<
  JobRecord,
  "id" | "type" | "status" | "claimedAt" | "startedAt" | "finishedAt" | "outputPreview" | "errorMessage" | "createdAt" | "triggeredByUserId"
>;

type SerializeServerOptions = {
  latestAgentVersion?: string | null;
  pendingJobsCount?: number;
};

function getPendingJobsCount(jobs: readonly JobRecord[], explicitCount?: number): number {
  return explicitCount ?? jobs.filter((job) => isPendingJobStatus(job.status)).length;
}

export function serializeSnapshot(snapshot: SnapshotRecord | null | undefined) {
  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id,
    reachable: snapshot.reachable,
    upgradableCount: snapshot.upgradableCount,
    securityCount: snapshot.securityCount,
    rebootRequired: snapshot.rebootRequired,
    lastCheckAt: snapshot.lastCheckAt.toISOString(),
    outputPreview: snapshot.outputPreview,
  };
}

export function serializeJob(job: JobLike): {
  id: string;
  type: string;
  status: string;
  claimedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  outputPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  triggeredByUserId: string;
};
export function serializeJob(job: null | undefined): null;
export function serializeJob(job: JobLike | null | undefined) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    claimedAt: job.claimedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    outputPreview: job.outputPreview ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt.toISOString(),
    triggeredByUserId: job.triggeredByUserId,
  };
}

export function serializeServer(
  server: ServerListRecord | ServerDetailRecord,
  env: ServerEnv,
  options: SerializeServerOptions = {}
) {
  const jobs = server.jobs;
  const latestAgentVersion = options.latestAgentVersion ?? null;
  const pendingJobsCount = getPendingJobsCount(jobs, options.pendingJobsCount);

  return {
    id: server.id,
    name: server.name,
    environment: server.environment,
    isActive: server.isActive,
    agentId: server.agentId,
    hostname: server.hostname,
    sshHost: server.sshHost,
    sshPort: server.sshPort,
    osName: server.osName,
    osVersion: server.osVersion,
    agentVersion: server.agentVersion,
    latestAgentVersion,
    agentUpdateStatus: resolveAgentUpdateStatus(server.agentVersion, latestAgentVersion),
    lastSeenAt: server.lastSeenAt?.toISOString() ?? null,
    lastReportAt: server.lastReportAt?.toISOString() ?? null,
    connectivityStatus: deriveConnectivityStatus(server.lastSeenAt, env),
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
    latestSnapshot: serializeSnapshot(server.snapshots[0]),
    latestJob: serializeJob(jobs[0]),
    pendingJobsCount,
  };
}

export function serializeServerDetail(
  server: ServerDetailRecord,
  env: ServerEnv,
  options: SerializeServerOptions = {}
) {
  return {
    ...serializeServer(
      server,
      env,
      {
        ...options,
        pendingJobsCount: getPendingJobsCount(server.jobs, options.pendingJobsCount),
      }
    ),
    notes: server.notes,
    recentJobs: server.jobs.map((job) => serializeJob(job)),
  };
}
