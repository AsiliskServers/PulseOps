import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../lib/encryption.js";
import type { ServerEnv } from "../lib/env.js";
import { callAgentAction, AgentRequestError } from "./agent-client.js";

export class JobRunner {
  private queue: string[] = [];
  private processing = false;

  constructor(private env: ServerEnv) {}

  enqueue(jobId: string): void {
    this.queue.push(jobId);

    if (!this.processing) {
      void this.processLoop();
    }
  }

  private async processLoop(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const nextJobId = this.queue.shift();

      if (!nextJobId) {
        continue;
      }

      await this.processJob(nextJobId);
    }

    this.processing = false;
  }

  private async processJob(jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({
      where: {
        id: jobId,
      },
      include: {
        server: true,
      },
    });

    if (!job) {
      return;
    }

    await prisma.job.update({
      where: {
        id: job.id,
      },
      data: {
        status: "running",
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    try {
      const agentToken = decryptSecret(job.server.agentTokenEncrypted, this.env.encryptionKey);
      const summary = await callAgentAction(
        job.server.agentBaseUrl,
        agentToken,
        job.type === "upgrade" ? "upgrade" : "refresh"
      );

      const checkedAt = Number.isNaN(Date.parse(summary.checkedAt))
        ? new Date()
        : new Date(summary.checkedAt);

      await prisma.serverSnapshot.create({
        data: {
          serverId: job.serverId,
          reachable: summary.reachable,
          upgradableCount: summary.upgradableCount,
          securityCount: summary.securityCount,
          rebootRequired: summary.rebootRequired,
          lastCheckAt: checkedAt,
          rawSummaryJson: JSON.stringify(summary),
        },
      });

      await prisma.job.update({
        where: {
          id: job.id,
        },
        data: {
          status: "success",
          finishedAt: new Date(),
          outputPreview: summary.outputPreview,
        },
      });
    } catch (error) {
      const message =
        error instanceof AgentRequestError
          ? `${error.message} (status ${error.statusCode})`
          : error instanceof Error
            ? error.message
            : "Unknown job failure";

      await prisma.job.update({
        where: {
          id: job.id,
        },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: message,
        },
      });
    }
  }
}
