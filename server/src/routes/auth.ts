import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { getSessionUser } from "../lib/session.js";
import { isRecord, readRequiredString } from "../lib/validators.js";

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_MAX_FAILURE_KEYS = 10_000;
const DUMMY_PASSWORD_HASH =
  "$2a$12$Inq96r3fs77EqCrmPCTKPuaZk7oIHqJEXIoPuL8MCI4PK27cimtpi";

const loginFailures = new Map<
  string,
  {
    count: number;
    resetAt: number;
  }
>();

function destroySession(request: {
  session: { destroy: (callback: (error?: Error) => void) => void };
}): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getLoginKey(request: { ip: string }, email: string) {
  return `${request.ip}:${email}`;
}

function assertLoginAllowed(key: string) {
  const entry = loginFailures.get(key);
  const now = Date.now();

  if (!entry) {
    return;
  }

  if (entry.resetAt <= now) {
    loginFailures.delete(key);
    return;
  }

  if (entry.count >= LOGIN_MAX_FAILURES) {
    throw new Error("Too many login attempts. Try again later.");
  }
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginFailures.get(key);

  for (const [failureKey, entry] of loginFailures) {
    if (entry.resetAt <= now) {
      loginFailures.delete(failureKey);
    }
  }

  if (loginFailures.size >= LOGIN_MAX_FAILURE_KEYS) {
    const oldestKey = loginFailures.keys().next().value as string | undefined;
    if (oldestKey) {
      loginFailures.delete(oldestKey);
    }
  }

  if (!current || current.resetAt <= now) {
    loginFailures.set(key, {
      count: 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
    return;
  }

  current.count += 1;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request, reply) => {
    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const email = readRequiredString(request.body, "email", "email", {
        maxLength: 320,
      }).toLowerCase();
      const password = readRequiredString(request.body, "password", "password", {
        maxLength: 1024,
      });
      const loginKey = getLoginKey(request, email);

      assertLoginAllowed(loginKey);

      const user = await prisma.user.findUnique({
        where: {
          email,
        },
      });

      const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
      if (!(await verifyPassword(password, passwordHash)) || !user) {
        recordLoginFailure(loginKey);
        return reply.status(401).send({ message: "Invalid credentials" });
      }

      loginFailures.delete(loginKey);
      await request.session.regenerate();
      request.session.user = {
        id: user.id,
        email: user.email,
      };

      return reply.send({
        user: request.session.user,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      const statusCode = message.startsWith("Too many login attempts") ? 429 : 400;
      return reply.status(statusCode).send({ message });
    }
  });

  app.post("/logout", async (request, reply) => {
    await destroySession(request);
    return reply.status(204).send();
  });

  app.get("/me", async (request, reply) => {
    const user = getSessionUser(request);

    if (!user) {
      return reply.status(401).send({ message: "Authentication required" });
    }

    return reply.send({ user });
  });
}
