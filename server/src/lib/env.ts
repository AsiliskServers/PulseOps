import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireSecret(name: string): string {
  const value = requireEnv(name);

  if (value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }

  return value;
}

function parseIntegerEnv(name: string, fallback: number, options: { min: number; max: number }) {
  const rawValue = process.env[name] ?? String(fallback);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    throw new Error(`${name} must be an integer between ${options.min} and ${options.max}`);
  }

  return value;
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.includes("..") || trimmed.includes("//")) {
    throw new Error("APP_BASE_PATH must be an absolute path without traversal segments");
  }

  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

function requireHttpUrl(name: string, value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
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
  agentAutoUpdateIntervalSeconds: number;
  agentStaleAfterSeconds: number;
  agentOfflineAfterSeconds: number;
};

export function loadEnv(): ServerEnv {
  const port = parseIntegerEnv("PORT", 4000, { min: 1, max: 65535 });
  const reportInterval = parseIntegerEnv("AGENT_REPORT_INTERVAL_SECONDS", 300, {
    min: 30,
    max: 86_400,
  });
  const pollInterval = parseIntegerEnv("AGENT_JOB_POLL_INTERVAL_SECONDS", 10, {
    min: 2,
    max: 3600,
  });
  const autoUpdateInterval = parseIntegerEnv("AGENT_AUTO_UPDATE_INTERVAL_SECONDS", 900, {
    min: 60,
    max: 86_400,
  });
  const staleAfter = parseIntegerEnv("AGENT_STALE_AFTER_SECONDS", 1800, {
    min: 60,
    max: 604_800,
  });
  const offlineAfter = parseIntegerEnv("AGENT_OFFLINE_AFTER_SECONDS", 7200, {
    min: 60,
    max: 604_800,
  });

  if (offlineAfter <= staleAfter) {
    throw new Error("AGENT_OFFLINE_AFTER_SECONDS must be greater than AGENT_STALE_AFTER_SECONDS");
  }

  const appBasePath = normalizeBasePath(process.env.APP_BASE_PATH ?? "/pulseops");
  const webOrigin = requireHttpUrl("WEB_ORIGIN", process.env.WEB_ORIGIN ?? "http://localhost:5173");
  const appPublicUrl = requireHttpUrl(
    "APP_PUBLIC_URL",
    process.env.APP_PUBLIC_URL ?? `https://app.asilisk.fr${appBasePath}`
  );

  return {
    port,
    host: process.env.HOST ?? "0.0.0.0",
    databaseUrl: requireEnv("DATABASE_URL"),
    sessionSecret: requireSecret("SESSION_SECRET"),
    encryptionKey: requireSecret("APP_ENCRYPTION_KEY"),
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    webOrigin,
    appBasePath,
    appPublicUrl,
    agentReportIntervalSeconds: reportInterval,
    agentJobPollIntervalSeconds: pollInterval,
    agentAutoUpdateIntervalSeconds: autoUpdateInterval,
    agentStaleAfterSeconds: staleAfter,
    agentOfflineAfterSeconds: offlineAfter,
  };
}
