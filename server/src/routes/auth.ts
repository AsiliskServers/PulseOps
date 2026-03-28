import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { getSessionUser } from "../lib/session.js";
import { isRecord, readRequiredString } from "../lib/validators.js";

function destroySession(request: { session: { destroy: (callback: (error?: Error) => void) => void } }): Promise<void> {
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

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request, reply) => {
    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const email = readRequiredString(request.body, "email", "email").toLowerCase();
      const password = readRequiredString(request.body, "password", "password");

      const user = await prisma.user.findUnique({
        where: {
          email,
        },
      });

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.status(401).send({ message: "Invalid credentials" });
      }

      request.session.user = {
        id: user.id,
        email: user.email,
      };

      return reply.send({
        user: request.session.user,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return reply.status(400).send({ message });
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
