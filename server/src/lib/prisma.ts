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
    await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL;");
    await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL;");
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
    await prisma.$executeRawUnsafe("PRAGMA temp_store = MEMORY;");
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 15000;");
  }

  prismaInitialized = true;
}
