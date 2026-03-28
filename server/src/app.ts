import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import session from "@fastify/session";
import type { ServerEnv } from "./lib/env.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerServerRoutes } from "./routes/servers.js";
import { JobRunner } from "./services/job-runner.js";

export async function buildApp(env: ServerEnv) {
  const app = Fastify({
    logger: true,
  });

  const jobRunner = new JobRunner(env);

  await app.register(cors, {
    origin: env.webOrigin,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(session, {
    secret: env.sessionSecret,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
    saveUninitialized: false,
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  await app.register(async (instance) => {
    await registerAuthRoutes(instance);
  }, { prefix: "/api/auth" });

  await app.register(async (instance) => {
    await registerDashboardRoutes(instance);
  }, { prefix: "/api/dashboard" });

  await app.register(async (instance) => {
    await registerServerRoutes(instance, env, jobRunner);
  }, { prefix: "/api/servers" });

  return app;
}
