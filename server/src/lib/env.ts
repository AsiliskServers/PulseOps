import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export type ServerEnv = {
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: string;
  encryptionKey: string;
  adminEmail?: string;
  adminPassword?: string;
  webOrigin: string;
};

export function loadEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? "4000");

  if (Number.isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }

  return {
    port,
    host: process.env.HOST ?? "0.0.0.0",
    databaseUrl: requireEnv("DATABASE_URL"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    encryptionKey: requireEnv("APP_ENCRYPTION_KEY"),
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  };
}
