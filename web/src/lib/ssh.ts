import type { ServerDetail, ServerSummary } from "../types";

type SshServer = Pick<ServerSummary | ServerDetail, "hostname" | "sshHost" | "sshPort">;

export function resolveSshHost(server: SshServer): string | null {
  const directHost = server.sshHost?.trim();
  if (directHost) {
    return directHost;
  }

  const hostname = server.hostname?.trim();
  return hostname || null;
}

export function resolveSshPort(server: SshServer): number {
  return Number.isInteger(server.sshPort) && server.sshPort > 0 ? server.sshPort : 22;
}
