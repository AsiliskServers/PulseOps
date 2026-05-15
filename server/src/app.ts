import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import session from "@fastify/session";
import type { ServerEnv } from "./lib/env.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerServerRoutes } from "./routes/servers.js";
import { registerTerminalRoutes } from "./routes/terminals.js";
import { TerminalBroker } from "./services/terminal-broker.js";
import { registerSecurityHooks } from "./lib/security.js";

export async function buildApp(env: ServerEnv) {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 512 * 1024,
  });
  const terminalBroker = new TerminalBroker();

  registerSecurityHooks(app, env);

  app.addHook("onClose", async () => {
    terminalBroker.dispose();
  });

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
      path: env.appBasePath,
      maxAge: 8 * 60 * 60 * 1000,
    },
    rolling: true,
    saveUninitialized: false,
  });

  await app.register(async (instance) => {
    await registerPublicRoutes(instance, env);
  }, { prefix: env.appBasePath });

  await app.register(async (instance) => {
    await registerAuthRoutes(instance);
  }, { prefix: `${env.appBasePath}/api/auth` });

  await app.register(async (instance) => {
    await registerDashboardRoutes(instance, env);
  }, { prefix: `${env.appBasePath}/api/dashboard` });

  await app.register(async (instance) => {
    await registerSettingsRoutes(instance, env);
  }, { prefix: `${env.appBasePath}/api/settings` });

  await app.register(async (instance) => {
    await registerCategoryRoutes(instance);
  }, { prefix: `${env.appBasePath}/api/categories` });

  await app.register(async (instance) => {
    await registerServerRoutes(instance, env);
  }, { prefix: `${env.appBasePath}/api/servers` });

  await app.register(async (instance) => {
    await registerTerminalRoutes(instance, terminalBroker);
  }, { prefix: `${env.appBasePath}/api/terminals` });

  await app.register(async (instance) => {
    await registerAgentRoutes(instance, env, terminalBroker);
  }, { prefix: `${env.appBasePath}/api/agent` });

  return app;
}
