export type AgentSummary = {
  reachable: boolean;
  upgradableCount: number;
  securityCount: number;
  rebootRequired: boolean;
  checkedAt: string;
  outputPreview: string;
};

export class AgentRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AgentRequestError";
    this.statusCode = statusCode;
  }
}

function extractMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = payload.message;

    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }

  return "Unknown agent error";
}

function isAgentSummary(value: unknown): value is AgentSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.reachable === "boolean" &&
    typeof candidate.upgradableCount === "number" &&
    typeof candidate.securityCount === "number" &&
    typeof candidate.rebootRequired === "boolean" &&
    typeof candidate.checkedAt === "string" &&
    typeof candidate.outputPreview === "string"
  );
}

export async function callAgentAction(
  agentBaseUrl: string,
  agentToken: string,
  action: "refresh" | "upgrade"
): Promise<AgentSummary> {
  const response = await fetch(`${agentBaseUrl}/v1/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agentToken}`,
    },
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AgentRequestError(extractMessage(payload), response.status);
  }

  if (!isAgentSummary(payload)) {
    throw new AgentRequestError("The agent returned an invalid payload", 502);
  }

  return payload;
}
