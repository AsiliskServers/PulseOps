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

export function getAgentTerminalMessage(server: SshServer): string {
  const command = buildSshCommand(server);

  if (!command) {
    return "Aucun hôte SSH n'est configuré pour ce serveur. Renseigne l'accès SSH dans la fiche du serveur avant d'ouvrir un terminal via l'agent.";
  }

  return [
    "Le terminal via agent n'est pas encore branché sur cette instance.",
    "",
    "Le bouton n'ouvre plus de lien direct ssh:// pour éviter les erreurs navigateur.",
    "La commande SSH a été copiée dans le presse-papiers comme solution de secours :",
    command,
  ].join("\n");
}

export async function launchSsh(server: SshServer): Promise<boolean> {
  const command = buildSshCommand(server);

  if (!command) {
    window.alert(getAgentTerminalMessage(server));
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Ignore clipboard errors and still show the fallback message.
    }
  }

  window.alert(getAgentTerminalMessage(server));
  return false;
}
