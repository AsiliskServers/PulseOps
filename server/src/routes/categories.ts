import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireSessionUser } from "../lib/session.js";
import { isRecord, readRequiredString } from "../lib/validators.js";

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    const categories = await prisma.category.findMany({
      orderBy: {
        name: "asc",
      },
      include: {
        _count: {
          select: {
            servers: true,
          },
        },
      },
    });

    return reply.send({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        serverCount: category._count.servers,
      })),
    });
  });

  app.post("/", async (request, reply) => {
    const user = await requireSessionUser(request, reply);

    if (!user) {
      return;
    }

    try {
      if (!isRecord(request.body)) {
        return reply.status(400).send({ message: "Invalid request body" });
      }

      const name = normalizeCategoryName(
        readRequiredString(request.body, "name", "name", { maxLength: 80 })
      );
      if (name.length === 0) {
        return reply.status(400).send({ message: "name is required" });
      }

      const category = await prisma.category.create({
        data: {
          name,
        },
        include: {
          _count: {
            select: {
              servers: true,
            },
          },
        },
      });

      return reply.status(201).send({
        category: {
          id: category.id,
          name: category.name,
          serverCount: category._count.servers,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create category";
      const lowered = message.toLowerCase();
      const statusCode =
        lowered.includes("unique") || lowered.includes("constraint") || lowered.includes("duplicate")
          ? 409
          : 400;
      return reply.status(statusCode).send({
        message: statusCode === 409 ? "Cette categorie existe deja" : message,
      });
    }
  });
}
