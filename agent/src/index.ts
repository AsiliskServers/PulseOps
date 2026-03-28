import Fastify from "fastify";
import { loadConfig } from "./lib/config.js";
import { requireAgentToken } from "./lib/auth.js";
import { AgentExecutionError, runRefresh, runUpgrade } from "./lib/apt.js";

async function main() {
  const env = loadConfig();
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  app.post("/v1/refresh", async (request, reply) => {
    if (!requireAgentToken(request, reply, env.token)) {
      return;
    }

    try {
      return reply.send(await runRefresh());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed";
      return reply.status(500).send({ message });
    }
  });

  app.post("/v1/upgrade", async (request, reply) => {
    if (!requireAgentToken(request, reply, env.token)) {
      return;
    }

    try {
      return reply.send(await runUpgrade(env.allowUpgrade));
    } catch (error) {
      if (error instanceof AgentExecutionError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }

      const message = error instanceof Error ? error.message : "Upgrade failed";
      return reply.status(500).send({ message });
    }
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });

  await app.listen({
    host: env.host,
    port: env.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
