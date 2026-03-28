import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { encryptSecret } from "../lib/encryption.js";
import { requireSessionUser } from "../lib/session.js";
import {
  isRecord,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  validateEnvironment,
  validateUrl,
} from "../lib/validators.js";
import { JobRunner } from "../services/job-runner.js";
import {
  getServerDetailInclude,
  getServerSummaryInclude,
  serializeJob,
  serializeServerDetail,
  serializeServerSummary,
} from "../services/server-read-models.js";
import type { ServerEnv } from "../lib/env.js";

function parseCreatePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  return {
    name: readRequiredString(body, "name", "name"),
    environment: validateEnvironment(readRequiredString(body, "environment", "environment")),
    agentBaseUrl: validateUrl(readRequiredString(body, "agentBaseUrl", "agentBaseUrl")),
    agentToken: readRequiredString(body, "agentToken", "agentToken"),
    notes: readOptionalString(body, "notes"),
    isActive: readOptionalBoolean(body, "isActive") ?? true,
  };
}

function parseUpdatePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  const environment = readOptionalString(body, "environment");
  const agentBaseUrl = readOptionalString(body, "agentBaseUrl");

  return {
    name: readOptionalString(body, "name"),
    environment: environment ? validateEnvironment(environment) : undefined,
    agentBaseUrl: agentBaseUrl ? validateUrl(agentBaseUrl) : undefined,
    agentToken: readOptionalString(body, "agentToken"),
    notes:
      typeof body.notes === "string" ? body.notes.trim() || null : undefined,
    isActive: readOptionalBoolean(body, "isActive"),
  };
}

export async function registerServerRoutes(
  app: FastifyInstance,
  env: ServerEnv,
  jobRunner: JobRunner
): Promise<void> {
  app.get("/", async (request, reply) => {
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

    return reply.send({
      servers: servers.map((server) => serializeServerSummary(server)),
    });
  });

  app.post("/", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    try {
      const payload = parseCreatePayload(request.body);
      const created = await prisma.server.create({
        data: {
          name: payload.name,
          environment: payload.environment,
          agentBaseUrl: payload.agentBaseUrl,
          agentTokenEncrypted: encryptSecret(payload.agentToken, env.encryptionKey),
          notes: payload.notes,
          isActive: payload.isActive,
        },
        include: getServerSummaryInclude(),
      });

      return reply.status(201).send({
        server: serializeServerSummary(created),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create server";
      return reply.status(400).send({ message });
    }
  });

  app.get("/:id", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const server = await prisma.server.findUnique({
      where: {
        id: String((request.params as { id: string }).id),
      },
      include: getServerDetailInclude(),
    });

    if (!server) {
      return reply.status(404).send({ message: "Server not found" });
    }

    return reply.send({
      server: serializeServerDetail(server),
    });
  });

  app.patch("/:id", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const serverId = String((request.params as { id: string }).id);
    const existingServer = await prisma.server.findUnique({
      where: {
        id: serverId,
      },
    });

    if (!existingServer) {
      return reply.status(404).send({ message: "Server not found" });
    }

    try {
      const payload = parseUpdatePayload(request.body);
      const updated = await prisma.server.update({
        where: {
          id: serverId,
        },
        data: {
          name: payload.name,
          environment: payload.environment,
          agentBaseUrl: payload.agentBaseUrl,
          agentTokenEncrypted: payload.agentToken
            ? encryptSecret(payload.agentToken, env.encryptionKey)
            : undefined,
          notes: payload.notes,
          isActive: payload.isActive,
        },
        include: getServerSummaryInclude(),
      });

      return reply.send({
        server: serializeServerSummary(updated),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update server";
      return reply.status(400).send({ message });
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

  app.post("/:id/refresh", async (request, reply) => {
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

    const job = await prisma.job.create({
      data: {
        serverId,
        type: "refresh",
        status: "queued",
        triggeredByUserId: user.id,
      },
    });

    jobRunner.enqueue(job.id);

    return reply.status(202).send({
      job: serializeJob(job),
    });
  });

  app.post("/:id/upgrade", async (request, reply) => {
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

    const job = await prisma.job.create({
      data: {
        serverId,
        type: "upgrade",
        status: "queued",
        triggeredByUserId: user.id,
      },
    });

    jobRunner.enqueue(job.id);

    return reply.status(202).send({
      job: serializeJob(job),
    });
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
      take: 20,
    });

    return reply.send({
      jobs: jobs.map((job) => serializeJob(job)),
    });
  });
}
