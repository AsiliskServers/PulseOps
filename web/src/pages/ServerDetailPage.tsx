import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  clearServerHistory,
  deleteServer,
  getServer,
  triggerAgentUpdate,
  triggerRefresh,
  triggerUpgrade,
  updateServer,
} from "../api/servers";
import { ServerFormModal } from "../components/ServerFormModal";
import {
  extractUpgradablePackages,
  formatDate,
  resolveAgentVersionState,
  resolveServerState,
} from "../lib/presentation";
import type { Job, ServerDetail, ServerPayload } from "../types";

const liveStatuses = new Set(["queued", "claimed", "running"]);

function isLiveJob(job: Job): boolean {
  return liveStatuses.has(job.status);
}

function getLiveCommand(job: Job): string {
  if (job.type === "agent_update") {
    return "pulseops-agent self-update";
  }

  if (job.type === "upgrade") {
    return "apt-get update && apt-get upgrade -y";
  }

  return "apt-get update && apt list --upgradable";
}

function getLiveMessage(job: Job): string {
  if (job.status === "queued") {
    return job.type === "agent_update"
      ? "Mise à jour agent en file d'attente. L'agent vérifiera la release au prochain polling."
      : "Job en file d'attente. L'agent récupérera la commande au prochain polling.";
  }

  if (job.status === "claimed") {
    return job.type === "agent_update"
      ? "Commande de mise à jour agent prise en charge. Préparation du remplacement du binaire."
      : "Commande prise en charge par l'agent. Exécution en préparation.";
  }

  return job.type === "agent_update"
    ? "Mise à jour agent en cours. Le service redémarrera automatiquement si une nouvelle version est appliquée."
    : "Commande en cours d'exécution. La vue se rafraîchit automatiquement.";
}

function JobRow({ job }: { job: Job }) {
  const tone =
    job.status === "success" ? "ok" : job.status === "failed" ? "critical" : "pending";
  const label =
    job.type === "agent_update"
      ? "Mise à jour agent"
      : job.type === "upgrade"
        ? "Upgrade APT"
        : "Refresh APT";

  return (
    <article className="job-row">
      <div>
        <strong>{label}</strong>
        <p>Créé le {formatDate(job.createdAt)}</p>
      </div>

      <div className="job-row-side">
        <span className={`status-pill ${tone}`}>{job.status}</span>
        <small>{formatDate(job.finishedAt ?? job.startedAt ?? job.claimedAt ?? job.createdAt)}</small>
      </div>
    </article>
  );
}

export function ServerDetailPage() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const detailQuery = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId!),
    enabled: Boolean(serverId),
    refetchInterval: (query) => {
      if (!serverId) {
        return false;
      }

      const data = query.state.data as ServerDetail | undefined;
      return data?.recentJobs.some(isLiveJob) ? 1500 : 5000;
    },
  });

  const server = detailQuery.data;

  useEffect(() => {
    setNotesDraft(server?.notes ?? "");
  }, [server?.id, server?.notes]);

  const updateMutation = useMutation({
    mutationFn: (payload: ServerPayload) => updateServer(serverId!, payload),
    onSuccess: async () => {
      setModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => triggerRefresh(serverId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: () => triggerUpgrade(serverId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const agentUpdateMutation = useMutation({
    mutationFn: () => triggerAgentUpdate(serverId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteServer(serverId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
      navigate("/servers", { replace: true });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => clearServerHistory(serverId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      if (!server) {
        throw new Error("Serveur introuvable");
      }

      return updateServer(serverId!, {
        name: server.name,
        environment: server.environment as ServerPayload["environment"],
        notes: notesDraft,
        isActive: server.isActive,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const state = server ? resolveServerState(server) : null;
  const agentState = server ? resolveAgentVersionState(server) : null;
  const liveJob =
    server?.recentJobs.find(isLiveJob) ??
    (server?.latestJob && isLiveJob(server.latestJob) ? server.latestJob : null);
  const upgradablePackages = extractUpgradablePackages(server?.latestSnapshot?.outputPreview);
  const hasHistory = Boolean(server?.latestSnapshot) || (server?.recentJobs.length ?? 0) > 0;
  const notesDirty = notesDraft !== (server?.notes ?? "");
  const agentUpdateLive = liveJob?.type === "agent_update";
  const topError =
    (detailQuery.error instanceof Error && detailQuery.error.message) ||
    (updateMutation.error instanceof Error && updateMutation.error.message) ||
    (notesMutation.error instanceof Error && notesMutation.error.message) ||
    (refreshMutation.error instanceof Error && refreshMutation.error.message) ||
    (upgradeMutation.error instanceof Error && upgradeMutation.error.message) ||
    (agentUpdateMutation.error instanceof Error && agentUpdateMutation.error.message) ||
    (clearHistoryMutation.error instanceof Error && clearHistoryMutation.error.message) ||
    (deleteMutation.error instanceof Error && deleteMutation.error.message) ||
    null;

  if (detailQuery.isLoading) {
    return (
      <div className="page-column">
        <section className="panel empty-state tall">Chargement du serveur...</section>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="page-column">
        <section className="panel empty-state tall">
          <div>
            <strong>Serveur introuvable</strong>
            <p>Le serveur demande n&apos;existe plus ou n&apos;est pas accessible.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-column">
      <section className="page-header panel">
        <div className="page-heading">
          <p className="section-kicker">Serveur</p>
          <h2>{server.name}</h2>
          <p className="page-copy">
            <Link className="text-link" to="/servers">
              Parc serveurs
            </Link>
            <span className="page-separator">/</span>
            <span>{server.hostname ?? "Machine sans hostname"}</span>
          </p>
        </div>

        <div className="page-header-side">
          <div className="status-pill-group">
            <span className={`status-pill ${state?.tone ?? "neutral"}`}>{state?.label ?? "--"}</span>
            <span className={`status-pill ${agentState?.tone ?? "neutral"}`}>
              {agentState?.label ?? "--"}
            </span>
          </div>
          <div className="inline-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? "Refresh..." : "Refresh APT"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => upgradeMutation.mutate()}
              disabled={upgradeMutation.isPending}
            >
              {upgradeMutation.isPending ? "Upgrade..." : "Lancer upgrade"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => agentUpdateMutation.mutate()}
              disabled={agentUpdateMutation.isPending || agentUpdateLive}
            >
              {agentUpdateMutation.isPending
                ? "MàJ agent..."
                : agentUpdateLive
                  ? "Agent en update"
                  : "Mettre à jour l'agent"}
            </button>
            <button className="ghost-button" type="button" onClick={() => setModalOpen(true)}>
              Modifier
            </button>
            <button
              className="ghost-button danger"
              type="button"
              onClick={() => {
                if (window.confirm("Supprimer ce serveur de PulseOps ?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </div>
      </section>

      {topError ? <div className="alert error">{topError}</div> : null}

      <section className="detail-metrics">
        <article className="stat-card">
          <span>Connectivité</span>
          <strong>{server.connectivityStatus}</strong>
        </article>
        <article className="stat-card">
          <span>Updates</span>
          <strong>{server.latestSnapshot?.upgradableCount ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Sécurité</span>
          <strong>{server.latestSnapshot?.securityCount ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Jobs en attente</span>
          <strong>{server.pendingJobsCount}</strong>
        </article>
      </section>

      <section className="detail-layout">
        <div className="detail-primary">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Synthèse</p>
                <h3>État du serveur</h3>
              </div>
            </div>

            <div className="summary-grid">
              <article className="mini-summary">
                <span>Dernière vue</span>
                <strong>{formatDate(server.lastSeenAt)}</strong>
              </article>
              <article className="mini-summary">
                <span>Dernier report</span>
                <strong>{formatDate(server.lastReportAt)}</strong>
              </article>
              <article className="mini-summary">
                <span>Agent</span>
                <strong>{server.agentVersion ?? "--"}</strong>
              </article>
              <article className="mini-summary">
                <span>Release agent</span>
                <strong>{server.latestAgentVersion ?? "--"}</strong>
              </article>
              <article className="mini-summary">
                <span>OS</span>
                <strong>{[server.osName, server.osVersion].filter(Boolean).join(" ") || "--"}</strong>
              </article>
            </div>

            <div className="detail-fields">
              <div className="detail-field">
                <span>Hostname</span>
                <strong>{server.hostname ?? "--"}</strong>
              </div>
              <div className="detail-field">
                <span>Environnement</span>
                <strong>{server.environment}</strong>
              </div>
              <div className="detail-field">
                <span>Agent ID</span>
                <strong className="mono-inline">{server.agentId ?? "--"}</strong>
              </div>
              <div className="detail-field">
                <span>Actif</span>
                <strong>{server.isActive ? "Oui" : "Non"}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Snapshot</p>
                <h3>Dernier retour agent</h3>
              </div>

              {liveJob ? (
                <div className="live-indicator">
                  <span className="live-indicator-label">
                    <span className="live-dot" />
                    <span>En direct</span>
                  </span>
                </div>
              ) : null}
            </div>

            {liveJob ? (
              <div className="terminal-shell terminal-shell-live" role="presentation">
                <div className="terminal-header">
                  <div className="terminal-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <strong>
                    {liveJob.type === "agent_update"
                      ? "mise à jour agent en cours"
                      : liveJob.type === "upgrade"
                        ? "upgrade en cours"
                        : "refresh en cours"}
                  </strong>
                </div>

                <div className="terminal-body">
                  <div className="terminal-line">
                    <span className="terminal-prompt">$</span>
                    <span className="terminal-command">{getLiveCommand(liveJob)}</span>
                  </div>
                  <div className="terminal-output live-line">
                    <span className="live-dot" />
                    <span>{getLiveMessage(liveJob)}</span>
                  </div>
                  <div className="terminal-output muted">
                    Dernière transition : {formatDate(
                      liveJob.startedAt ?? liveJob.claimedAt ?? liveJob.createdAt
                    )}
                  </div>
                  <div className="terminal-output muted">
                    {liveJob.type === "agent_update"
                      ? "Le statut agent sera mis à jour automatiquement après le redémarrage du service."
                      : "La liste finale des paquets s'affichera automatiquement à la fin du job."}
                  </div>
                </div>
              </div>
            ) : server.latestSnapshot ? (
              upgradablePackages.length > 0 ? (
                <div className="terminal-shell" role="presentation">
                  <div className="terminal-header">
                    <div className="terminal-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <strong>apt list --upgradable</strong>
                  </div>

                  <div className="terminal-body">
                    <div className="terminal-line">
                      <span className="terminal-prompt">$</span>
                      <span className="terminal-command">apt list --upgradable</span>
                    </div>
                    <div className="terminal-output muted">Listing...</div>
                    {upgradablePackages.map((line) => (
                      <div key={line} className="terminal-output">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  {server.latestSnapshot.upgradableCount > 0
                    ? "Le retour agent ne contient pas de liste détaillée exploitable."
                    : "Aucun paquet en attente de mise à jour."}
                </div>
              )
            ) : (
              <div className="empty-state">Aucun snapshot disponible pour ce serveur.</div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Exécution</p>
                <h3>Historique récent</h3>
              </div>

              <button
                className="ghost-button danger small"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Vider l'historique de ce serveur ? Les jobs et snapshots seront supprimés."
                    )
                  ) {
                    clearHistoryMutation.mutate();
                  }
                }}
                disabled={!hasHistory || clearHistoryMutation.isPending || Boolean(liveJob)}
              >
                {clearHistoryMutation.isPending ? "Nettoyage..." : "Vider l'historique"}
              </button>
            </div>

            <div className="job-list">
              {server.recentJobs.length === 0 ? (
                <div className="empty-state">Aucun job lancé pour ce serveur.</div>
              ) : (
                server.recentJobs.map((job) => <JobRow key={job.id} job={job} />)
              )}
            </div>
          </section>
        </div>

        <aside className="detail-secondary">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Informations</p>
                <h3>Fiche serveur</h3>
              </div>
            </div>

            <div className="summary-list">
              <div className="summary-item">
                <span>Création</span>
                <strong>{formatDate(server.createdAt)}</strong>
              </div>
              <div className="summary-item">
                <span>Mise à jour</span>
                <strong>{formatDate(server.updatedAt)}</strong>
              </div>
              <div className="summary-item">
                <span>Reachable</span>
                <strong>{server.latestSnapshot?.reachable ? "Oui" : "Non"}</strong>
              </div>
              <div className="summary-item">
                <span>Reboot requis</span>
                <strong>{server.latestSnapshot?.rebootRequired ? "Oui" : "Non"}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Notes</p>
                <h3>Contexte</h3>
              </div>
            </div>

            <form
              className="notes-form"
              onSubmit={(event) => {
                event.preventDefault();
                notesMutation.mutate();
              }}
            >
              <textarea
                className="notes-textarea"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                rows={8}
                placeholder="Ajouter des notes sur ce serveur, la maintenance, le contexte réseau ou un contact..."
              />

              <div className="inline-actions">
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={() => setNotesDraft(server.notes ?? "")}
                  disabled={!notesDirty || notesMutation.isPending}
                >
                  Réinitialiser
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!notesDirty || notesMutation.isPending}
                >
                  {notesMutation.isPending ? "Enregistrement..." : "Enregistrer la note"}
                </button>
              </div>
            </form>
          </section>
        </aside>
      </section>

      <ServerFormModal
        open={modalOpen}
        initialServer={server}
        pending={updateMutation.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={(payload) => updateMutation.mutate(payload)}
      />
    </div>
  );
}
