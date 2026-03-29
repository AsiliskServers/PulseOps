import type { FastifyInstance } from "fastify";
import { pendingJobStatuses } from "../lib/jobs.js";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import {
  isRecord,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  validateEnvironment,
  normalizeJobType,
} from "../lib/validators.js";
import type { ServerEnv } from "../lib/env.js";
import {
  serializeJob,
  serializeServer,
  serializeServerDetail,
  serverDetailInclude,
  serverListInclude,
} from "../services/serializers.js";

function parseCreatePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  return {
    name: readRequiredString(body, "name", "name"),
    environment: validateEnvironment(readRequiredString(body, "environment", "environment")),
    notes: readOptionalString(body, "notes"),
    isActive: readOptionalBoolean(body, "isActive") ?? true,
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
  async function queueJob(serverId: string, triggeredByUserId: string, type: "refresh" | "upgrade") {
    return prisma.job.create({
      data: {
        serverId,
        type,
        status: "queued",
        triggeredByUserId,
      },
    });
  }

  app.get("/", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const [servers, pendingJobs] = await Promise.all([
      prisma.server.findMany({
        orderBy: {
          createdAt: "asc",
        },
        include: serverListInclude,
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
    ]);

    const pendingCountByServer = new Map(
      pendingJobs.map((item) => [item.serverId, item._count._all])
    );

    return reply.send({
      servers: servers.map((server) =>
        serializeServer(server, env, pendingCountByServer.get(server.id) ?? 0)
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
      const server = await prisma.server.create({
        data: {
          name: payload.name,
          environment: payload.environment,
          notes: payload.notes,
          isActive: payload.isActive,
        },
        include: serverListInclude,
      });

      return reply.status(201).send({
        server: serializeServer(server, env),
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
      const servers = await prisma.server.findMany({
        where: {
          id: {
            in: payload.serverIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (servers.length !== payload.serverIds.length) {
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
    const [server, pendingJobsCount] = await Promise.all([
      prisma.server.findUnique({
        where: {
          id: serverId,
        },
        include: serverDetailInclude,
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

    return reply.send({
      server: serializeServerDetail(server, env, pendingJobsCount),
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
      const updated = await prisma.server.update({
        where: {
          id: serverId,
        },
        data: {
          name: payload.name,
          environment: payload.environment,
          notes: payload.notes,
          isActive: payload.isActive,
        },
        include: serverListInclude,
      });

      return reply.send({
        server: serializeServer(updated, env),
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
    const server = await prisma.server.findUnique({
      where: {
        id: serverId,
      },
    });

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    await prisma.server.delete({
      where: {
        id: serverId,
      },
    });

    return reply.status(204).send();
  });

  app.post("/:id/jobs", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    const server = await prisma.server.findUnique({
      where: {
        id: serverId,
      },
    });

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const type = normalizeJobType(readRequiredString(request.body, "type", "type"));
      const job = await queueJob(serverId, user.id, type);

      return reply.status(202).send({
        job: serializeJob(job),
      });
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
    const server = await prisma.server.findUnique({ where: { id: serverId } });

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    const job = await queueJob(serverId, user.id, "refresh");
    return reply.status(202).send({ job: serializeJob(job) });
  });

  app.post("/:id/upgrade", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    const server = await prisma.server.findUnique({ where: { id: serverId } });

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    const job = await queueJob(serverId, user.id, "upgrade");
    return reply.status(202).send({ job: serializeJob(job) });
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
    const server = await prisma.server.findUnique({
      where: {
        id: serverId,
      },
    });

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
      jobs: jobs
        .map((job) => serializeJob(job))
        .filter((job): job is NonNullable<typeof job> => job !== null),
    });
  });
}
