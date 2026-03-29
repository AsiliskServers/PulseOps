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
  appBasePath: string;
  appPublicUrl: string;
  agentReportIntervalSeconds: number;
  agentJobPollIntervalSeconds: number;
  agentStaleAfterSeconds: number;
  agentOfflineAfterSeconds: number;
};

export function loadEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? "4000");
  const reportInterval = Number(process.env.AGENT_REPORT_INTERVAL_SECONDS ?? "300");
  const pollInterval = Number(process.env.AGENT_JOB_POLL_INTERVAL_SECONDS ?? "10");
  const staleAfter = Number(process.env.AGENT_STALE_AFTER_SECONDS ?? "1800");
  const offlineAfter = Number(process.env.AGENT_OFFLINE_AFTER_SECONDS ?? "7200");

  if (
    Number.isNaN(port) ||
    Number.isNaN(reportInterval) ||
    Number.isNaN(pollInterval) ||
    Number.isNaN(staleAfter) ||
    Number.isNaN(offlineAfter)
  ) {
    throw new Error("Numeric environment variables must contain valid numbers");
  }

  const appBasePath = process.env.APP_BASE_PATH ?? "/pulseops";

  return {
    port,
    host: process.env.HOST ?? "0.0.0.0",
    databaseUrl: requireEnv("DATABASE_URL"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    encryptionKey: requireEnv("APP_ENCRYPTION_KEY"),
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    appBasePath,
    appPublicUrl: process.env.APP_PUBLIC_URL ?? `https://app.asilisk.fr${appBasePath}`,
    agentReportIntervalSeconds: reportInterval,
    agentJobPollIntervalSeconds: pollInterval,
    agentStaleAfterSeconds: staleAfter,
    agentOfflineAfterSeconds: offlineAfter,
  };
}
