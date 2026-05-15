import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "./env.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function toOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function buildAllowedOrigins(env: ServerEnv) {
  return new Set(
    [toOrigin(env.webOrigin), toOrigin(env.appPublicUrl)].filter((value): value is string =>
      Boolean(value)
    )
  );
}

export function registerSecurityHooks(app: FastifyInstance, env: ServerEnv) {
  const allowedOrigins = buildAllowedOrigins(env);
  const enableHsts = env.appPublicUrl.startsWith("https://");

  app.addHook("onRequest", async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) {
      return;
    }

    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      return reply.status(403).send({ message: "Origin not allowed" });
    }

    const referer = request.headers.referer;
    const refererOrigin = !origin && referer ? toOrigin(referer) : null;
    if (refererOrigin && !allowedOrigins.has(refererOrigin)) {
      return reply.status(403).send({ message: "Origin not allowed" });
    }

    if (request.headers.cookie && !origin && !refererOrigin) {
      return reply.status(403).send({ message: "Origin required" });
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");

    if (enableHsts) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    return payload;
  });
}
