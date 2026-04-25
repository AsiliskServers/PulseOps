import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import { isRecord, readOptionalInteger, readRequiredString } from "../lib/validators.js";
import { TerminalBroker, type TerminalEvent } from "../services/terminal-broker.js";

const TERMINAL_MAX_COLS = 360;
const TERMINAL_MAX_ROWS = 120;

function writeSseEvent(event: TerminalEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function registerTerminalRoutes(
  app: FastifyInstance,
  broker: TerminalBroker
): Promise<void> {
  app.post("/sessions", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const serverId = readRequiredString(request.body, "serverId", "serverId");
      const server = await prisma.server.findUnique({
        where: {
          id: serverId,
        },
        select: {
          id: true,
          agentId: true,
          isActive: true,
          shellAccessEnabled: true,
        },
      });

      if (!server) {
        return reply.status(404).send({ message: "Server not found" });
      }

      if (!server.isActive || !server.agentId) {
        return reply.status(409).send({
          message: "Aucun agent actif n'est disponible sur ce serveur pour ouvrir un terminal",
        });
      }

      if (!server.shellAccessEnabled) {
        return reply.status(409).send({
          message: "Le shell distant est desactive sur ce type d'agent",
        });
      }

      return reply.send(broker.createOrReuse(server.id, user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create terminal session";
      return reply.status(400).send({ message });
    }
  });

  app.get("/sessions/:id/stream", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const sessionId = String((request.params as { id: string }).id);

    try {
      const session = broker.getSnapshot(sessionId, user.id);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: TerminalEvent) => {
        reply.raw.write(writeSseEvent(event));
      };

      send({
        type: "bootstrap",
        sessionId,
        status: session.status,
        outputHistory: session.outputHistory,
      });

      const unsubscribe = broker.subscribe(sessionId, user.id, send);
      const heartbeat = setInterval(() => {
        reply.raw.write(": keep-alive\n\n");
      }, 15_000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terminal session not found";
      return reply.status(404).send({ message });
    }
  });

  app.post("/sessions/:id/input", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const sessionId = String((request.params as { id: string }).id);

    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const rawData = request.body.data;

      if (typeof rawData !== "string" || rawData.length === 0) {
        return reply.status(400).send({ message: "data is required" });
      }

      const data = rawData;
      broker.enqueueInput(sessionId, user.id, data);
      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send terminal input";
      const statusCode = message === "Terminal session not found" ? 404 : 400;
      return reply.status(statusCode).send({ message });
    }
  });

  app.post("/sessions/:id/resize", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const sessionId = String((request.params as { id: string }).id);

    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const cols = readOptionalInteger(request.body, "cols", { min: 40, max: TERMINAL_MAX_COLS });
      const rows = readOptionalInteger(request.body, "rows", { min: 12, max: TERMINAL_MAX_ROWS });

      if (!cols || !rows) {
        return reply.status(400).send({ message: "cols and rows are required" });
      }

      broker.updateResize(sessionId, user.id, { cols, rows });
      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resize terminal";
      const statusCode = message === "Terminal session not found" ? 404 : 400;
      return reply.status(statusCode).send({ message });
    }
  });

  app.delete("/sessions/:id", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const sessionId = String((request.params as { id: string }).id);

    try {
      broker.closeForUser(sessionId, user.id);
      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to close terminal session";
      const statusCode = message === "Terminal session not found" ? 404 : 400;
      return reply.status(statusCode).send({ message });
    }
  });
}
