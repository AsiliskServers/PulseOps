import type { FastifyInstance } from "fastify";
import { pendingJobStatuses } from "../lib/jobs.js";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import { deriveConnectivityStatus } from "../services/connectivity.js";
import type { ServerEnv } from "../lib/env.js";
import { serverListInclude } from "../services/serializers.js";

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
        include: serverListInclude,
      }),
      prisma.job.count({
        where: {
          status: {
            in: [...pendingJobStatuses],
          },
        },
      }),
    ]);

    const latestSnapshots = servers.flatMap((server) => server.snapshots.slice(0, 1));
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

      if (status === "online") {
        onlineCount++;
      } else if (status === "stale") {
        staleCount++;
      } else {
        offlineCount++;
      }
    }

    for (const snapshot of latestSnapshots) {
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
