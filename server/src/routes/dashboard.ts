import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import { getServerSummaryInclude } from "../services/server-read-models.js";

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/summary", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const servers = await prisma.server.findMany({
      orderBy: {
        createdAt: "asc",
      },
      include: getServerSummaryInclude(),
    });

    const snapshots = servers.flatMap((server) => server.snapshots.slice(0, 1));
    const lastGlobalCheckAt =
      snapshots.length === 0
        ? null
        : new Date(
            Math.max(
              ...snapshots.map((snapshot) => snapshot.lastCheckAt.getTime())
            )
          ).toISOString();

    return reply.send({
      serverCount: servers.length,
      reachableCount: snapshots.filter((snapshot) => snapshot.reachable).length,
      upToDateCount: snapshots.filter(
        (snapshot) => snapshot.reachable && snapshot.upgradableCount === 0
      ).length,
      pendingUpdateCount: snapshots.reduce(
        (sum, snapshot) => sum + snapshot.upgradableCount,
        0
      ),
      securityUpdateCount: snapshots.reduce(
        (sum, snapshot) => sum + snapshot.securityCount,
        0
      ),
      lastGlobalCheckAt,
    });
  });
}
