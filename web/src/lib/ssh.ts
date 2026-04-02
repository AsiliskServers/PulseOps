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

export function buildSshCommand(server: SshServer): string | null {
  const host = resolveSshHost(server);
  if (!host) {
    return null;
  }

  const port = resolveSshPort(server);
  return port === 22 ? `ssh root@${host}` : `ssh -p ${port} root@${host}`;
}

export function buildSshUri(server: SshServer): string | null {
  const host = resolveSshHost(server);
  if (!host) {
    return null;
  }

  const port = resolveSshPort(server);
  return `ssh://root@${host}:${port}`;
}

export async function launchSsh(server: SshServer): Promise<boolean> {
  const command = buildSshCommand(server);
  const uri = buildSshUri(server);

  if (!command || !uri) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Ignore clipboard errors and still try to open the SSH handler.
    }
  }

  window.location.href = uri;
  return true;
}
