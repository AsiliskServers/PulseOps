import type { ServerDetail, ServerSummary } from "../types";

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Aucune date";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function resolveServerState(server: ServerSummary | ServerDetail): {
  label: string;
  tone: "ok" | "pending" | "critical" | "neutral";
} {
  if (server.latestJob?.status === "failed") {
    return { label: "Échec récent", tone: "critical" };
  }

  if (!server.latestSnapshot) {
    return { label: "Aucun report", tone: "neutral" };
  }

  if (server.connectivityStatus === "offline") {
    return { label: "Hors ligne", tone: "critical" };
  }

  if (server.connectivityStatus === "stale") {
    return { label: "À surveiller", tone: "pending" };
  }

  if (!server.latestSnapshot.reachable) {
    return { label: "Dégradé", tone: "critical" };
  }

  if (server.latestSnapshot.securityCount > 0) {
    return { label: "Sécurité", tone: "critical" };
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return { label: "MàJ en attente", tone: "pending" };
  }

  return { label: "À jour", tone: "ok" };
}

export function resolveAgentVersionState(server: ServerSummary | ServerDetail): {
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

export function extractUpgradablePackages(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes("[upgradable from:"));
}
