import { prisma } from "../lib/prisma.js";
import type { ServerEnv } from "../lib/env.js";
import { hashPassword } from "../lib/password.js";

export async function ensureBootstrapAdmin(env: ServerEnv): Promise<void> {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return;
  }

  if (!env.adminEmail || !env.adminPassword) {
    throw new Error(
      "The database is empty. Set ADMIN_EMAIL and ADMIN_PASSWORD before starting the server."
    );
  }

  if (env.adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.adminEmail)) {
    throw new Error("ADMIN_EMAIL must be a valid email address");
  }

  await prisma.user.create({
    data: {
      email: env.adminEmail.trim().toLowerCase(),
      passwordHash: await hashPassword(env.adminPassword),
    },
  });
}
