import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export type AgentEnv = {
  port: number;
  host: string;
  token: string;
  allowUpgrade: boolean;
};

export function loadConfig(): AgentEnv {
  const port = Number(process.env.PORT ?? "4010");

  if (Number.isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }

  return {
    port,
    host: process.env.HOST ?? "0.0.0.0",
    token: requireEnv("AGENT_TOKEN"),
    allowUpgrade: (process.env.ALLOW_UPGRADE ?? "true").toLowerCase() === "true",
  };
}
