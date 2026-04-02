import type { FastifyInstance, FastifyReply } from "fastify";
import { pendingJobStatuses } from "../lib/jobs.js";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import {
  isRecord,
  readOptionalBoolean,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
  validateEnvironment,
  normalizeJobType,
  type JobType,
} from "../lib/validators.js";
import type { ServerEnv } from "../lib/env.js";
import {
  serializeJob,
  serializeServer,
  serializeServerDetail,
  serverDetailInclude,
  serverListInclude,
} from "../services/serializers.js";
import { getLatestAgentVersion } from "../services/agent-release.js";

function parseCreatePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  return {
    name: readRequiredString(body, "name", "name"),
    environment: validateEnvironment(readRequiredString(body, "environment", "environment")),
    notes: readOptionalString(body, "notes"),
    isActive: readOptionalBoolean(body, "isActive") ?? true,
    sshHost: readOptionalString(body, "sshHost"),
    sshPort: readOptionalInteger(body, "sshPort", { min: 1, max: 65535 }) ?? 22,
  };
}

function buildCreateServerData(payload: ReturnType<typeof parseCreatePayload>) {
  return {
    name: payload.name,
    environment: payload.environment,
    notes: payload.notes,
    isActive: payload.isActive,
    sshHost: payload.sshHost,
    sshPort: payload.sshPort,
  };
}

function buildUpdateServerData(payload: ReturnType<typeof parseUpdatePayload>) {
  return {
    name: payload.name,
    environment: payload.environment,
    notes: payload.notes,
    isActive: payload.isActive,
    sshHost: payload.sshHost,
    sshPort: payload.sshPort,
  };
}

function parseUpdatePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  const environment = readOptionalString(body, "environment");

  return {
    name: readOptionalString(body, "name"),
    environment: environment ? validateEnvironment(environment) : undefined,
    notes:
      typeof body.notes === "string" ? body.notes.trim() || null : undefined,
    isActive: readOptionalBoolean(body, "isActive"),
    sshHost:
      typeof body.sshHost === "string" ? body.sshHost.trim() || null : undefined,
    sshPort: readOptionalInteger(body, "sshPort", { min: 1, max: 65535 }),
  };
}

function parseBatchJobPayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  const rawIds = body.serverIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new Error("serverIds must contain at least one server id");
  }

  const serverIds = Array.from(
    new Set(
      rawIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );

  if (serverIds.length === 0) {
    throw new Error("serverIds must contain at least one server id");
  }

  return {
    serverIds,
    type: normalizeJobType(readRequiredString(body, "type", "type")),
  };
}

export async function registerServerRoutes(
  app: FastifyInstance,
  env: ServerEnv
): Promise<void> {
  async function queueJob(serverId: string, triggeredByUserId: string, type: JobType) {
    return prisma.job.create({
      data: {
        serverId,
        type,
        status: "queued",
        triggeredByUserId,
      },
    });
  }

  async function findServer(serverId: string) {
    return prisma.server.findUnique({
      where: {
        id: serverId,
      },
      select: {
        id: true,
      },
    });
  }

  async function queueServerJobResponse(
    reply: FastifyReply,
    serverId: string,
    triggeredByUserId: string,
    type: JobType
  ) {
    const server = await findServer(serverId);

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    const job = await queueJob(server.id, triggeredByUserId, type);
    return reply.status(202).send({ job: serializeJob(job) });
  }

  app.get("/", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const [servers, pendingJobs, latestAgentVersion] = await Promise.all([
      prisma.server.findMany({
        orderBy: {
          createdAt: "asc",
        },
        select: serverListInclude,
      }),
      prisma.job.groupBy({
        by: ["serverId"],
        where: {
          status: {
            in: [...pendingJobStatuses],
          },
        },
        _count: {
          _all: true,
        },
      }),
      getLatestAgentVersion(),
    ]);

    const pendingCountByServer = new Map(
      pendingJobs.map((item) => [item.serverId, item._count._all])
    );

    return reply.send({
      servers: servers.map((server) =>
        serializeServer(server, env, {
          pendingJobsCount: pendingCountByServer.get(server.id) ?? 0,
          latestAgentVersion,
        })
      ),
    });
  });

  app.post("/", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    try {
      const payload = parseCreatePayload(request.body);
      const [server, latestAgentVersion] = await Promise.all([
        prisma.server.create({
          data: buildCreateServerData(payload),
          select: serverListInclude,
        }),
        getLatestAgentVersion(),
      ]);

      return reply.status(201).send({
        server: serializeServer(server, env, { latestAgentVersion }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create server";
      return reply.status(400).send({ message });
    }
  });

  app.post("/batch/jobs", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    try {
      const payload = parseBatchJobPayload(request.body);
      const matchingServerCount = await prisma.server.count({
        where: {
          id: {
            in: payload.serverIds,
          },
        },
      });

      if (matchingServerCount !== payload.serverIds.length) {
        return reply.status(404).send({ message: "One or more servers were not found" });
      }

      const jobs = await prisma.$transaction(
        payload.serverIds.map((serverId) =>
          prisma.job.create({
            data: {
              serverId,
              type: payload.type,
              status: "queued",
              triggeredByUserId: user.id,
            },
          })
        )
      );

      return reply.status(202).send({
        queuedCount: jobs.length,
        jobs: jobs.map((job) => serializeJob(job)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to queue jobs";
      return reply.status(400).send({ message });
    }
  });

  app.get("/:id", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    const [server, pendingJobsCount, latestAgentVersion] = await Promise.all([
      prisma.server.findUnique({
        where: {
          id: serverId,
        },
        select: serverDetailInclude,
      }),
      prisma.job.count({
        where: {
          serverId,
          status: {
            in: [...pendingJobStatuses],
          },
        },
      }),
      getLatestAgentVersion(),
    ]);

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    return reply.send({
      server: serializeServerDetail(server, env, {
        pendingJobsCount,
        latestAgentVersion,
      }),
    });
  });

  app.patch("/:id", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);

    try {
      const payload = parseUpdatePayload(request.body);
      const [updated, latestAgentVersion] = await Promise.all([
        prisma.server.update({
          where: {
            id: serverId,
          },
          data: buildUpdateServerData(payload),
          select: serverListInclude,
        }),
        getLatestAgentVersion(),
      ]);

      return reply.send({
        server: serializeServer(updated, env, { latestAgentVersion }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update server";
      const statusCode = message === "Record to update not found." ? 404 : 400;
      return reply.status(statusCode).send({ message: statusCode === 404 ? "Server not found" : message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);

    try {
      await prisma.server.delete({
        where: {
          id: serverId,
        },
      });

      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete server";
      const statusCode = message === "Record to delete does not exist." ? 404 : 400;
      return reply.status(statusCode).send({ message: statusCode === 404 ? "Server not found" : message });
    }
  });

  app.post("/:id/jobs", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);

    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const type = normalizeJobType(readRequiredString(request.body, "type", "type"));
      return queueServerJobResponse(reply, serverId, user.id, type);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to queue job";
      return reply.status(400).send({ message });
    }
  });

  app.post("/:id/refresh", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    return queueServerJobResponse(reply, serverId, user.id, "refresh");
  });

  app.post("/:id/upgrade", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    return queueServerJobResponse(reply, serverId, user.id, "upgrade");
  });

  app.post("/:id/agent-update", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    return queueServerJobResponse(reply, serverId, user.id, "agent_update");
  });

  app.delete("/:id/history", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    const [server, runningJobsCount] = await Promise.all([
      prisma.server.findUnique({
        where: {
          id: serverId,
        },
      }),
      prisma.job.count({
        where: {
          serverId,
          status: {
            in: [...pendingJobStatuses],
          },
        },
      }),
    ]);

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    if (runningJobsCount > 0) {
      return reply.status(409).send({
        message: "Impossible de vider l'historique pendant qu'un job est en cours",
      });
    }

    await prisma.$transaction([
      prisma.job.deleteMany({
        where: {
          serverId,
        },
      }),
      prisma.serverSnapshot.deleteMany({
        where: {
          serverId,
        },
      }),
    ]);

    return reply.status(204).send();
  });

  app.get("/:id/jobs", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    const server = await findServer(serverId);

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    const jobs = await prisma.job.findMany({
      where: {
        serverId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return reply.send({
      jobs: jobs.map((job) => serializeJob(job)),
    });
  });
}
