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

export function getTerminalStreamUrl(sessionId: string) {
  return `${API_BASE}/terminals/sessions/${sessionId}/stream`;
}
