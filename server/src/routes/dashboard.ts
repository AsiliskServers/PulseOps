import type { FastifyInstance } from "fastify";
import { pendingJobStatuses } from "../lib/jobs.js";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import { deriveConnectivityStatus } from "../services/connectivity.js";
import type { ServerEnv } from "../lib/env.js";

const dashboardSummarySelect = {
  lastSeenAt: true,
  snapshots: {
    orderBy: {
      lastCheckAt: "desc" as const,
    },
    take: 1,
    select: {
      reachable: true,
      upgradableCount: true,
      securityCount: true,
      lastCheckAt: true,
    },
  },
};

export async function registerDashboardRoutes(
  app: FastifyInstance,
  env: ServerEnv
): Promise<void> {
  app.get("/summary", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const [servers, queuedJobCount] = await Promise.all([
      prisma.server.findMany({
        orderBy: {
          createdAt: "asc",
        },
        select: dashboardSummarySelect,
      }),
      prisma.job.count({
        where: {
          status: {
            in: [...pendingJobStatuses],
          },
        },
      }),
    ]);

    let reachableCount = 0;
    let upToDateCount = 0;
    let pendingUpdateCount = 0;
    let securityUpdateCount = 0;
    let onlineCount = 0;
    let staleCount = 0;
    let offlineCount = 0;
    let lastGlobalCheckAt: string | null = null;
    let latestCheckTime = 0;

    for (const server of servers) {
      const status = deriveConnectivityStatus(server.lastSeenAt, env);
      const snapshot = server.snapshots[0];

      if (status === "online") {
        onlineCount++;
      } else if (status === "stale") {
        staleCount++;
      } else {
        offlineCount++;
      }

      if (!snapshot) {
        continue;
      }

      if (snapshot.reachable) {
        reachableCount++;
      }

      if (snapshot.reachable && snapshot.upgradableCount === 0) {
        upToDateCount++;
      }

      pendingUpdateCount += snapshot.upgradableCount;
      securityUpdateCount += snapshot.securityCount;

      const checkTime = snapshot.lastCheckAt.getTime();
      if (checkTime > latestCheckTime) {
        latestCheckTime = checkTime;
        lastGlobalCheckAt = snapshot.lastCheckAt.toISOString();
      }
    }

    return reply.send({
      serverCount: servers.length,
      reachableCount,
      upToDateCount,
      pendingUpdateCount,
      securityUpdateCount,
      lastGlobalCheckAt,
      onlineCount,
      staleCount,
      offlineCount,
      queuedJobCount,
    });
  });
}
