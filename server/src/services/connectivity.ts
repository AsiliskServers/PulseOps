import type { ServerEnv } from "../lib/env.js";

export type ConnectivityStatus = "online" | "stale" | "offline";

export function deriveConnectivityStatus(
  lastSeenAt: Date | null | undefined,
  env: ServerEnv
): ConnectivityStatus {
  if (!lastSeenAt) {
    return "offline";
  }

  const ageSeconds = (Date.now() - lastSeenAt.getTime()) / 1000;

  if (ageSeconds <= env.agentStaleAfterSeconds) {
    return "online";
  }

  if (ageSeconds <= env.agentOfflineAfterSeconds) {
    return "stale";
  }

  return "offline";
}
