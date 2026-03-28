import type { FastifyInstance } from "fastify";
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
            in: ["queued", "claimed", "running"],
          },
        },
      }),
    ]);

    const latestSnapshots = servers.flatMap((server) => server.snapshots.slice(0, 1));
    const lastGlobalCheckAt =
      latestSnapshots.length === 0
        ? null
        : new Date(
            Math.max(...latestSnapshots.map((snapshot) => snapshot.lastCheckAt.getTime()))
          ).toISOString();

    return reply.send({
      serverCount: servers.length,
      reachableCount: latestSnapshots.filter((snapshot) => snapshot.reachable).length,
      upToDateCount: latestSnapshots.filter(
        (snapshot) => snapshot.reachable && snapshot.upgradableCount === 0
      ).length,
      pendingUpdateCount: latestSnapshots.reduce(
        (sum, snapshot) => sum + snapshot.upgradableCount,
        0
      ),
      securityUpdateCount: latestSnapshots.reduce(
        (sum, snapshot) => sum + snapshot.securityCount,
        0
      ),
      lastGlobalCheckAt,
      onlineCount: servers.filter(
        (server) => deriveConnectivityStatus(server.lastSeenAt, env) === "online"
      ).length,
      staleCount: servers.filter(
        (server) => deriveConnectivityStatus(server.lastSeenAt, env) === "stale"
      ).length,
      offlineCount: servers.filter(
        (server) => deriveConnectivityStatus(server.lastSeenAt, env) === "offline"
      ).length,
      queuedJobCount,
    });
  });
}
