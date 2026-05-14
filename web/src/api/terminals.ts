import { fetchJson } from "./client";

const API_BASE = import.meta.env.VITE_API_URL ?? "/pulseops/api";

export type TerminalSessionStatus = "pending" | "connected" | "closed";

export type TerminalSessionResponse = {
  sessionId: string;
  status: TerminalSessionStatus;
  outputHistory: string;
};

export async function openTerminalSession(serverId: string): Promise<TerminalSessionResponse> {
  return fetchJson<TerminalSessionResponse>("/terminals/sessions", {
    method: "POST",
    body: JSON.stringify({ serverId }),
  });
}

export async function sendTerminalInput(sessionId: string, data: string): Promise<void> {
  await fetchJson<void>(`/terminals/sessions/${sessionId}/input`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export async function resizeTerminalSession(
  sessionId: string,
  input: { cols: number; rows: number }
): Promise<void> {
  await fetchJson<void>(`/terminals/sessions/${sessionId}/resize`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function closeTerminalSession(sessionId: string): Promise<void> {
  await fetchJson<void>(`/terminals/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function releaseTerminalSession(sessionId: string): Promise<void> {
  await fetchJson<void>(`/terminals/sessions/${sessionId}/release`, {
    method: "POST",
    keepalive: true,
  });
}

export function releaseTerminalSessionOnPageLeave(sessionId: string) {
  const url = `${API_BASE}/terminals/sessions/${sessionId}/release`;

  try {
    const targetUrl = new URL(url, window.location.href);

    if (
      targetUrl.origin === window.location.origin &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(targetUrl.toString())
    ) {
      return;
    }
  } catch {
    // Fall through to the keepalive fetch fallback below.
  }

  void fetch(url, {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
}

export function getTerminalStreamUrl(sessionId: string) {
  return `${API_BASE}/terminals/sessions/${sessionId}/stream`;
}
