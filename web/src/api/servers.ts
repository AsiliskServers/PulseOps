import { ApiError, fetchJson } from "./client";
import type { Job, ServerDetail, ServerPayload, ServerSummary } from "../types";

export async function listServers(): Promise<ServerSummary[]> {
  const payload = await fetchJson<{ servers: ServerSummary[] }>("/servers");
  return payload.servers;
}

export async function getServer(id: string): Promise<ServerDetail> {
  const payload = await fetchJson<{ server: ServerDetail }>(`/servers/${id}`);
  return payload.server;
}

export async function updateServer(id: string, input: ServerPayload): Promise<ServerSummary> {
  const payload = await fetchJson<{ server: ServerSummary }>(`/servers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return payload.server;
}

export async function deleteServer(id: string): Promise<void> {
  await fetchJson<void>(`/servers/${id}`, {
    method: "DELETE",
  });
}

export async function clearServerHistory(id: string): Promise<void> {
  await fetchJson<void>(`/servers/${id}/history`, {
    method: "DELETE",
  });
}

export async function queueBatchJobs(input: {
  serverIds: string[];
  type: "refresh" | "upgrade" | "agent_update";
}): Promise<{ queuedCount: number }> {
  try {
    return await fetchJson<{ queuedCount: number }>("/servers/batch/jobs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) {
      throw error;
    }

    const endpoint =
      input.type === "upgrade"
        ? "upgrade"
        : input.type === "agent_update"
          ? "agent-update"
          : "refresh";
    await Promise.all(
      input.serverIds.map((serverId) =>
        fetchJson<{ job: Job }>(`/servers/${serverId}/${endpoint}`, {
          method: "POST",
        })
      )
    );

    return { queuedCount: input.serverIds.length };
  }
}

export async function triggerRefresh(id: string): Promise<Job> {
  const payload = await fetchJson<{ job: Job }>(`/servers/${id}/refresh`, {
    method: "POST",
  });

  return payload.job;
}

export async function triggerUpgrade(id: string): Promise<Job> {
  const payload = await fetchJson<{ job: Job }>(`/servers/${id}/upgrade`, {
    method: "POST",
  });

  return payload.job;
}

export async function triggerAgentUpdate(id: string): Promise<Job> {
  const payload = await fetchJson<{ job: Job }>(`/servers/${id}/agent-update`, {
    method: "POST",
  });

  return payload.job;
}
