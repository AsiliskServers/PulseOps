import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

let prismaInitialized = false;

export async function initializePrisma() {
  if (prismaInitialized) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isSqlite = databaseUrl.startsWith("file:");

  if (isSqlite) {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
    await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
    await prisma.$queryRawUnsafe("PRAGMA temp_store = MEMORY;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 15000;");
  }

  prismaInitialized = true;
}
