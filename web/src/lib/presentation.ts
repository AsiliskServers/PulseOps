import type { DashboardSummary, ServerDetail, ServerSummary } from "../types";

type ServerRecord = ServerSummary | ServerDetail;

export type StateTone = "ok" | "pending" | "critical" | "neutral";
export type ServerStatusKind =
  | "failed"
  | "no_report"
  | "offline"
  | "stale"
  | "degraded"
  | "security"
  | "pending"
  | "up_to_date";
export type MonitoringBucket =
  | "security_updates"
  | "watch"
  | "no_report"
  | "pending_updates"
  | "up_to_date"
  | "offline";
export type TvSignalTone = StateTone | "live";

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Aucune date";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function resolveServerStatusKind(server: ServerRecord): ServerStatusKind {
  if (server.latestJob?.status === "failed") {
    return "failed";
  }

  if (!server.latestSnapshot) {
    return "no_report";
  }

  if (server.connectivityStatus === "offline") {
    return "offline";
  }

  if (server.connectivityStatus === "stale") {
    return "stale";
  }

  if (!server.latestSnapshot.reachable) {
    return "degraded";
  }

  if (server.latestSnapshot.securityCount > 0) {
    return "security";
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return "pending";
  }

  return "up_to_date";
}

export function resolveServerState(server: ServerRecord): {
  label: string;
  tone: StateTone;
} {
  const kind = resolveServerStatusKind(server);

  switch (kind) {
    case "failed":
      return { label: "Échec récent", tone: "critical" };
    case "no_report":
      return { label: "Aucun report", tone: "neutral" };
    case "offline":
      return { label: "Hors ligne", tone: "critical" };
    case "stale":
      return { label: "À surveiller", tone: "pending" };
    case "degraded":
      return { label: "Dégradé", tone: "critical" };
    case "security":
      return { label: "Sécurité", tone: "critical" };
    case "pending":
      return { label: "MàJ en attente", tone: "pending" };
    case "up_to_date":
    default:
      return { label: "À jour", tone: "ok" };
  }
}

export function resolveAgentVersionState(server: ServerRecord): {
  label: string;
  tone: "ok" | "pending" | "neutral";
} {
  if (!server.agentVersion || !server.latestAgentVersion || server.agentUpdateStatus === "unknown") {
    return { label: "Version agent inconnue", tone: "neutral" };
  }

  if (server.agentUpdateStatus === "update_available") {
    return { label: "MàJ agent dispo", tone: "pending" };
  }

  return { label: "Agent à jour", tone: "ok" };
}

export function resolveMonitoringBucket(server: ServerRecord): MonitoringBucket {
  const kind = resolveServerStatusKind(server);

  switch (kind) {
    case "security":
      return "security_updates";
    case "stale":
      return "watch";
    case "no_report":
      return "no_report";
    case "pending":
      return "pending_updates";
    case "up_to_date":
      return "up_to_date";
    case "failed":
    case "offline":
    case "degraded":
    default:
      return "offline";
  }
}

export function getServerPriorityScore(server: ServerRecord): number {
  if (server.pendingJobsCount > 0) {
    return 100;
  }

  switch (resolveServerStatusKind(server)) {
    case "failed":
      return 95;
    case "offline":
      return 90;
    case "no_report":
      return 82;
    case "degraded":
      return 80;
    case "security":
      return 74;
    case "pending":
      return 62;
    case "stale":
      return 54;
    case "up_to_date":
    default:
      return 20;
  }
}

export function resolveTvSignal(server: ServerRecord): {
  label: string;
  tone: TvSignalTone;
} {
  if (server.pendingJobsCount > 0) {
    return { label: "En direct", tone: "live" };
  }

  switch (resolveServerStatusKind(server)) {
    case "failed":
      return { label: "Échec récent", tone: "critical" };
    case "no_report":
      return { label: "Sans report", tone: "neutral" };
    case "offline":
    case "degraded":
      return { label: "Hors ligne", tone: "critical" };
    case "security":
      return { label: "Sécurité", tone: "critical" };
    case "pending":
      return { label: "MàJ dispo", tone: "pending" };
    case "stale":
      return { label: "À surveiller", tone: "pending" };
    case "up_to_date":
    default:
      return { label: "Stable", tone: "ok" };
  }
}

export function resolveTvWallAccent(server: ServerRecord): "default" | "pending" | "critical" {
  const kind = resolveServerStatusKind(server);

  if (kind === "pending") {
    return "pending";
  }

  if (kind === "security") {
    return "critical";
  }

  return "default";
}

export function extractUpgradablePackages(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes("[upgradable from:"));
}

export function buildDashboardSummary(servers: readonly ServerRecord[]): DashboardSummary {
  let reachableCount = 0;
  let upToDateCount = 0;
  let pendingUpdateCount = 0;
  let securityUpdateCount = 0;
  let onlineCount = 0;
  let staleCount = 0;
  let offlineCount = 0;
  let queuedJobCount = 0;
  let lastGlobalCheckAt: string | null = null;
  let latestCheckTime = 0;

  for (const server of servers) {
    queuedJobCount += server.pendingJobsCount;

    if (server.connectivityStatus === "online") {
      onlineCount++;
    } else if (server.connectivityStatus === "stale") {
      staleCount++;
    } else {
      offlineCount++;
    }

    const snapshot = server.latestSnapshot;
    if (!snapshot) {
      continue;
    }

    if (snapshot.reachable) {
      reachableCount++;
    }

    if (snapshot.reachable && snapshot.upgradableCount === 0) {
      upToDateCount++;
    }

    pendingUpdateCount += snapshot.upgradableCount;
    securityUpdateCount += snapshot.securityCount;

    const checkTime = new Date(snapshot.lastCheckAt).getTime();
    if (checkTime > latestCheckTime) {
      latestCheckTime = checkTime;
      lastGlobalCheckAt = snapshot.lastCheckAt;
    }
  }

  return {
    serverCount: servers.length,
    reachableCount,
    upToDateCount,
    pendingUpdateCount,
    securityUpdateCount,
    lastGlobalCheckAt,
    onlineCount,
    staleCount,
    offlineCount,
    queuedJobCount,
  };
}
