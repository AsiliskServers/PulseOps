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
    return { label: "Echec recent", tone: "critical" };
  }

  if (!server.latestSnapshot) {
    return { label: "Aucun report", tone: "neutral" };
  }

  if (server.connectivityStatus === "offline") {
    return { label: "Offline", tone: "critical" };
  }

  if (server.connectivityStatus === "stale") {
    return { label: "Stale", tone: "pending" };
  }

  if (!server.latestSnapshot.reachable) {
    return { label: "Degrade", tone: "critical" };
  }

  if (server.latestSnapshot.securityCount > 0) {
    return { label: "Securite", tone: "critical" };
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return { label: "Maj en attente", tone: "pending" };
  }

  return { label: "A jour", tone: "ok" };
}
