import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { ServerEnv } from "../lib/env.js";
import { isRecord, readOptionalString, readRequiredString, validateEnvironment } from "../lib/validators.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { generateOpaqueToken } from "../lib/tokens.js";
import { getEnrollmentToken } from "../services/settings.js";

function normalizeDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function authenticateAgent(body: unknown, env: ServerEnv) {
  if (!isRecord(body)) {
    throw new Error("Invalid request body");
  }

  const agentId = readRequiredString(body, "agentId", "agentId");
  const agentSecret = readRequiredString(body, "agentSecret", "agentSecret");
  const server = await prisma.server.findFirst({
    where: {
      agentId,
      isActive: true,
    },
  });

  if (!server || !server.agentSecretEncrypted) {
    throw new Error("Invalid agent credentials");
  }

  const expectedSecret = decryptSecret(server.agentSecretEncrypted, env.encryptionKey);

  if (expectedSecret !== agentSecret) {
    throw new Error("Invalid agent credentials");
  }

  return {
    body,
    server,
  };
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  env: ServerEnv
): Promise<void> {
  app.post("/enroll", async (request, reply) => {
    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const enrollmentToken = readRequiredString(request.body, "enrollmentToken", "enrollmentToken");
      const expectedToken = await getEnrollmentToken(env);

      if (enrollmentToken !== expectedToken) {
        return reply.status(401).send({ message: "Invalid enrollment token" });
      }

      const hostname = readRequiredString(request.body, "hostname", "hostname");
      const environment = validateEnvironment(readRequiredString(request.body, "environment", "environment"));
      const agentVersion = readRequiredString(request.body, "agentVersion", "agentVersion");
      const osName = readRequiredString(request.body, "osName", "osName");
      const osVersion = readRequiredString(request.body, "osVersion", "osVersion");
      const requestedName = readOptionalString(request.body, "name");
      const now = new Date();
      const agentId = generateOpaqueToken("pulseops_agent");
      const agentSecret = generateOpaqueToken("pulseops_secret");

      const server = await prisma.server.create({
        data: {
          name: requestedName ?? hostname,
          environment,
          agentId,
          agentSecretEncrypted: encryptSecret(agentSecret, env.encryptionKey),
          hostname,
          sshHost: hostname,
          sshPort: 22,
          osName,
          osVersion,
          agentVersion,
          lastSeenAt: now,
        },
      });

      return reply.status(201).send({
        agentId,
        agentSecret,
        serverId: server.id,
        reportIntervalSeconds: env.agentReportIntervalSeconds,
        jobPollIntervalSeconds: env.agentJobPollIntervalSeconds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enrollment failed";
      const status = message === "Invalid enrollment token" ? 401 : 400;
      return reply.status(status).send({ message });
    }
  });

  app.post("/report", async (request, reply) => {
    try {
      const { body, server } = await authenticateAgent(request.body, env);

      const checkedAt = normalizeDate(readRequiredString(body, "checkedAt", "checkedAt")) ?? new Date();
      const reachable = Boolean(body.reachable);
      const upgradableCount = Number(body.upgradableCount ?? 0);
      const securityCount = Number(body.securityCount ?? 0);
      const rebootRequired = Boolean(body.rebootRequired);
      const outputPreview = typeof body.outputPreview === "string" ? body.outputPreview : "";

      if (
        Number.isNaN(upgradableCount) ||
        Number.isNaN(securityCount)
      ) {
        return reply.status(400).send({ message: "Invalid snapshot counts" });
      }

      const now = new Date();
      const reportedHostname = readOptionalString(body, "hostname");

      await prisma.$transaction([
        prisma.server.update({
          where: {
            id: server.id,
          },
          data: {
            lastSeenAt: now,
            lastReportAt: now,
            hostname: reportedHostname ?? server.hostname,
            sshHost: server.sshHost ?? reportedHostname,
            osName: readOptionalString(body, "osName") ?? server.osName,
            osVersion: readOptionalString(body, "osVersion") ?? server.osVersion,
            agentVersion: readOptionalString(body, "agentVersion") ?? server.agentVersion,
          },
        }),
        prisma.serverSnapshot.create({
          data: {
            serverId: server.id,
            reachable,
            upgradableCount,
            securityCount,
            rebootRequired,
            lastCheckAt: checkedAt,
            outputPreview,
            rawSummaryJson: JSON.stringify(body),
          },
        }),
      ]);

      return reply.status(202).send({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Report failed";
      return reply.status(message === "Invalid agent credentials" ? 401 : 400).send({ message });
    }
  });

  app.post("/jobs/claim", async (request, reply) => {
    try {
      const { server } = await authenticateAgent(request.body, env);
      const now = new Date();

      const job = await prisma.$transaction(async (tx) => {
        await tx.server.update({
          where: {
            id: server.id,
          },
          data: {
            lastSeenAt: now,
          },
        });

        const nextJob = await tx.job.findFirst({
          where: {
            serverId: server.id,
            status: "queued",
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        if (!nextJob) {
          return null;
        }

        const claimed = await tx.job.updateMany({
          where: {
            id: nextJob.id,
            status: "queued",
          },
          data: {
            status: "claimed",
            claimedAt: now,
          },
        });

        if (claimed.count === 0) {
          return null;
        }

        return tx.job.findUnique({
          where: {
            id: nextJob.id,
          },
        });
      });

      return reply.send({
        job: job
          ? {
              id: job.id,
              type: job.type,
            }
          : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to claim job";
      return reply.status(message === "Invalid agent credentials" ? 401 : 400).send({ message });
    }
  });

  app.post("/jobs/:id/result", async (request, reply) => {
    try {
      const { body, server } = await authenticateAgent(request.body, env);

      const jobId = String((request.params as { id: string }).id);
      const job = await prisma.job.findFirst({
        where: {
          id: jobId,
          serverId: server.id,
        },
      });

      if (!job) {
        return reply.status(404).send({ message: "Job not found" });
      }

      const status = readRequiredString(body, "status", "status");

      if (status !== "running" && status !== "success" && status !== "failed") {
        return reply.status(400).send({ message: "status must be running, success or failed" });
      }

      const startedAt = normalizeDate(readOptionalString(body, "startedAt")) ?? job.startedAt;
      const finishedAt =
        status === "running"
          ? null
          : normalizeDate(readOptionalString(body, "finishedAt")) ?? new Date();
      const outputPreview = readOptionalString(body, "outputPreview") ?? null;
      const errorMessage = readOptionalString(body, "errorMessage") ?? null;

      await prisma.$transaction([
        prisma.server.update({
          where: {
            id: server.id,
          },
          data: {
            lastSeenAt: new Date(),
          },
        }),
        prisma.job.update({
          where: {
            id: job.id,
          },
          data: {
            status,
            startedAt,
            finishedAt,
            outputPreview: outputPreview ?? job.outputPreview,
            errorMessage: status === "running" ? null : errorMessage,
          },
        }),
      ]);

      return reply.send({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to store job result";
      const status = message === "Invalid agent credentials" ? 401 : 400;
      return reply.status(status).send({ message });
    }
  });
}
