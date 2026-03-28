import { buildApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { ensureBootstrapAdmin } from "./services/bootstrap.js";

async function main() {
  const env = loadEnv();

  await ensureBootstrapAdmin(env);

  const app = await buildApp(env);

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });

  await app.listen({
    port: env.port,
    host: env.host,
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
