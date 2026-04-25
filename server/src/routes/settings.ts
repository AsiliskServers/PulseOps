import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../lib/env.js";
import { requireSessionUser } from "../lib/session.js";
import { getEnrollmentToken, rotateEnrollmentToken } from "../services/settings.js";

function buildInstallCommand(publicUrl: string, token: string) {
  return `curl -fsSL ${publicUrl}/install-agent.sh | bash -s -- --server-url ${publicUrl} --enrollment-token ${token} --environment production`;
}

function buildRestrictedInstallCommand(publicUrl: string, token: string) {
  return `curl -fsSL ${publicUrl}/install-agent.sh | bash -s -- --server-url ${publicUrl} --enrollment-token ${token} --environment production --agent-profile appliance`;
}

function buildEnrollmentResponse(env: ServerEnv, token: string) {
  return {
    enrollmentToken: token,
    publicUrl: env.appPublicUrl,
    reportIntervalSeconds: env.agentReportIntervalSeconds,
    jobPollIntervalSeconds: env.agentJobPollIntervalSeconds,
    autoUpdateIntervalSeconds: env.agentAutoUpdateIntervalSeconds,
    installCommand: buildInstallCommand(env.appPublicUrl, token),
    installCommandRestricted: buildRestrictedInstallCommand(env.appPublicUrl, token),
  };
}

export async function registerSettingsRoutes(
  app: FastifyInstance,
  env: ServerEnv
): Promise<void> {
  app.get("/enrollment", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const token = await getEnrollmentToken(env);

    return reply.send(buildEnrollmentResponse(env, token));
  });

  app.post("/enrollment/rotate", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const token = await rotateEnrollmentToken(env);

    return reply.send(buildEnrollmentResponse(env, token));
  });
}
