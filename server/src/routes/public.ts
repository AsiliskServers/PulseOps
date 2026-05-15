import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../lib/env.js";
import { agentDistDir } from "../lib/paths.js";
import { buildInstallScript } from "../services/install-script.js";

const DOWNLOADABLE_AGENT_FILES = new Set([
  "latest.json",
  "pulseops-agent-linux-amd64",
  "pulseops-agent-linux-arm64",
]);

export async function registerPublicRoutes(
  app: FastifyInstance,
  env: ServerEnv
): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
  }));

  app.get("/install-agent.sh", async (_request, reply) => {
    reply.type("text/x-shellscript; charset=utf-8");
    return reply.send(await buildInstallScript(env));
  });

  app.get("/downloads/:name", async (request, reply) => {
    const rawName = String((request.params as { name: string }).name);
    const name = path.basename(rawName);

    if (name !== rawName || !DOWNLOADABLE_AGENT_FILES.has(name)) {
      return reply.status(404).send({ message: "Agent binary not found" });
    }

    const distDir = path.resolve(agentDistDir);
    const filePath = path.resolve(distDir, name);

    if (!filePath.startsWith(`${distDir}${path.sep}`)) {
      return reply.status(404).send({ message: "Agent binary not found" });
    }

    try {
      await access(filePath);
      const buffer = await readFile(filePath);
      if (name.endsWith(".json")) {
        reply.type("application/json; charset=utf-8");
      } else {
        reply.type("application/octet-stream");
        reply.header("Content-Disposition", `attachment; filename="${name}"`);
      }
      return reply.send(buffer);
    } catch {
      return reply.status(404).send({ message: "Agent binary not found" });
    }
  });
}
