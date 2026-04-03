const API_BASE = import.meta.env.VITE_API_URL ?? "/pulseops/api";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

function resolveHttpErrorMessage(statusCode: number, rawText: string) {
  const text = rawText.trim();

  if (text) {
    return text;
  }

  if (statusCode === 502) {
    return "Le serveur PulseOps est indisponible (502). Verifie que pulseops.service est demarre.";
  }

  if (statusCode === 503) {
    return "Le serveur PulseOps est temporairement indisponible (503).";
  }

  if (statusCode === 504) {
    return "Le serveur PulseOps a mis trop de temps a repondre (504).";
  }

  return `API error (${statusCode})`;
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});

  if (init?.body !== undefined && init?.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let payload: unknown = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : resolveHttpErrorMessage(response.status, rawText);

    throw new ApiError(message, response.status);
  }

  if (payload === null) {
    return undefined as T;
  }

  return payload as T;
}
