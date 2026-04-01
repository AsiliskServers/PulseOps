import type { Prisma } from "@prisma/client";
import type { ServerEnv } from "../lib/env.js";
import { isPendingJobStatus } from "../lib/jobs.js";
import { deriveConnectivityStatus } from "./connectivity.js";
import { resolveAgentUpdateStatus } from "./agent-release.js";

export const serverListInclude = {
  snapshots: {
    orderBy: {
      lastCheckAt: "desc",
    },
    take: 1,
  },
  jobs: {
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
} satisfies Prisma.ServerInclude;

export const serverDetailInclude = {
  snapshots: {
    orderBy: {
      lastCheckAt: "desc",
    },
    take: 1,
  },
  jobs: {
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  },
} satisfies Prisma.ServerInclude;

export type ServerListRecord = Prisma.ServerGetPayload<{
  include: typeof serverListInclude;
}>;

export type ServerDetailRecord = Prisma.ServerGetPayload<{
  include: typeof serverDetailInclude;
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
    rawSummaryJson: snapshot.rawSummaryJson,
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
    notes: server.notes,
    isActive: server.isActive,
    agentId: server.agentId,
    hostname: server.hostname,
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
    recentJobs: server.jobs.map((job) => serializeJob(job)),
  };
}
