import { buildApp } from "./app.js";
import { loadEnv } from "./lib/env.js";
import { initializePrisma, prisma } from "./lib/prisma.js";
import { ensureBootstrapAdmin } from "./services/bootstrap.js";
import { interruptInFlightJobsOnStartup } from "./services/job-recovery.js";
import { ensureAppSettings } from "./services/settings.js";

async function main() {
  const env = loadEnv();
  await initializePrisma();
  const recovery = await interruptInFlightJobsOnStartup();
  if (recovery.interruptedCount > 0) {
    console.warn(
      `[PulseOps] ${recovery.interruptedCount} job(s) marque(s) en echec apres redemarrage du serveur principal.`
    );
  }

  await Promise.all([ensureBootstrapAdmin(env), ensureAppSettings(env)]);

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
