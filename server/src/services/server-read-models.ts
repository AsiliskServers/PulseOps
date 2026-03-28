import type { Prisma } from "@prisma/client";

const summaryInclude = {
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

const detailInclude = {
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

export type ServerSummaryRecord = Prisma.ServerGetPayload<{
  include: typeof summaryInclude;
}>;

export type ServerDetailRecord = Prisma.ServerGetPayload<{
  include: typeof detailInclude;
}>;

type SnapshotRecord = ServerSummaryRecord["snapshots"][number];
type JobRecord = ServerDetailRecord["jobs"][number];

export function getServerSummaryInclude() {
  return summaryInclude;
}

export function getServerDetailInclude() {
  return detailInclude;
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
    rawSummaryJson: snapshot.rawSummaryJson,
  };
}

type JobLike = Pick<
  JobRecord,
  "id" | "type" | "status" | "startedAt" | "finishedAt" | "outputPreview" | "errorMessage" | "createdAt" | "triggeredByUserId"
>;

export function serializeJob(job: JobLike | null | undefined) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    outputPreview: job.outputPreview ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt.toISOString(),
    triggeredByUserId: job.triggeredByUserId,
  };
}

export function serializeServerSummary(server: ServerSummaryRecord) {
  return {
    id: server.id,
    name: server.name,
    environment: server.environment,
    agentBaseUrl: server.agentBaseUrl,
    notes: server.notes,
    isActive: server.isActive,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
    latestSnapshot: serializeSnapshot(server.snapshots[0]),
    latestJob: serializeJob(server.jobs[0]),
  };
}

export function serializeServerDetail(server: ServerDetailRecord) {
  return {
    ...serializeServerSummary(server),
    recentJobs: server.jobs
      .map((job) => serializeJob(job))
      .filter((job): job is NonNullable<typeof job> => job !== null),
  };
}
