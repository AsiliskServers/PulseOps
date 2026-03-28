import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteServer,
  getServer,
  triggerRefresh,
  triggerUpgrade,
  updateServer,
} from "../api/servers";
import { ServerFormModal } from "../components/ServerFormModal";
import {
  extractUpgradablePackages,
  formatDate,
  resolveServerState,
} from "../lib/presentation";
import type { Job, ServerPayload } from "../types";

function JobRow({ job }: { job: Job }) {
  const tone =
    job.status === "success" ? "ok" : job.status === "failed" ? "critical" : "pending";

  return (
    <article className="job-row">
      <div>
        <strong>{job.type === "upgrade" ? "Upgrade APT" : "Refresh APT"}</strong>
        <p>Cree le {formatDate(job.createdAt)}</p>
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

  const detailQuery = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId!),
    enabled: Boolean(serverId),
    refetchInterval: serverId ? 5000 : false,
  });

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

  const server = detailQuery.data;
  const state = server ? resolveServerState(server) : null;
  const upgradablePackages = extractUpgradablePackages(server?.latestSnapshot?.outputPreview);
  const topError =
    (detailQuery.error instanceof Error && detailQuery.error.message) ||
    (updateMutation.error instanceof Error && updateMutation.error.message) ||
    (refreshMutation.error instanceof Error && refreshMutation.error.message) ||
    (upgradeMutation.error instanceof Error && upgradeMutation.error.message) ||
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
          <span className={`status-pill ${state?.tone ?? "neutral"}`}>{state?.label ?? "--"}</span>
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
          <span>Connectivite</span>
          <strong>{server.connectivityStatus}</strong>
        </article>
        <article className="stat-card">
          <span>Updates</span>
          <strong>{server.latestSnapshot?.upgradableCount ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Securite</span>
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
                <p className="section-kicker">Synthese</p>
                <h3>Etat du serveur</h3>
              </div>
            </div>

            <div className="summary-grid">
              <article className="mini-summary">
                <span>Derniere vue</span>
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
            </div>

            {server.latestSnapshot ? (
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
                    ? "Le retour agent ne contient pas de liste detaillee exploitable."
                    : "Aucun paquet en attente de mise a jour."}
                </div>
              )
            ) : (
              <div className="empty-state">Aucun snapshot disponible pour ce serveur.</div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Execution</p>
                <h3>Historique recent</h3>
              </div>
            </div>

            <div className="job-list">
              {server.recentJobs.length === 0 ? (
                <div className="empty-state">Aucun job lance pour ce serveur.</div>
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
                <span>Creation</span>
                <strong>{formatDate(server.createdAt)}</strong>
              </div>
              <div className="summary-item">
                <span>Mise a jour</span>
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

            {server.notes ? (
              <div className="note-block">{server.notes}</div>
            ) : (
              <div className="empty-state">Aucune note enregistree.</div>
            )}
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
