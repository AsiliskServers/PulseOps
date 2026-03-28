import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../lib/env.js";
import { agentDistDir } from "../lib/paths.js";
import { buildInstallScript } from "../services/install-script.js";

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
    const name = path.basename(String((request.params as { name: string }).name));
    const filePath = path.join(agentDistDir, name);

    try {
      await access(filePath);
      const buffer = await readFile(filePath);
      reply.type("application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${name}"`);
      return reply.send(buffer);
    } catch {
      return reply.status(404).send({ message: "Agent binary not found" });
    }
  });
}
