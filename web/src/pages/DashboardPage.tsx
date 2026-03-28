import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteServer,
  getServer,
  getSummary,
  listServers,
  triggerRefresh,
  triggerUpgrade,
  updateServer,
} from "../api/servers";
import { logout } from "../api/auth";
import { getEnrollmentSettings, rotateEnrollmentSettings } from "../api/settings";
import { ServerFormModal } from "../components/ServerFormModal";
import type {
  EnrollmentSettings,
  Job,
  ServerDetail,
  ServerPayload,
  ServerSummary,
} from "../types";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Aucune date";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function resolveServerState(server: ServerSummary | ServerDetail): {
  label: string;
  tone: "ok" | "pending" | "critical" | "neutral";
} {
  if (server.latestJob?.status === "failed") {
    return { label: "Echec recent", tone: "critical" };
  }

  if (!server.latestSnapshot) {
    return { label: "Aucun report", tone: "neutral" };
  }

  if (server.connectivityStatus === "offline") {
    return { label: "Offline", tone: "critical" };
  }

  if (server.connectivityStatus === "stale") {
    return { label: "Stale", tone: "pending" };
  }

  if (!server.latestSnapshot.reachable) {
    return { label: "Degrade", tone: "critical" };
  }

  if (server.latestSnapshot.securityCount > 0) {
    return { label: "Securite", tone: "critical" };
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return { label: "Maj en attente", tone: "pending" };
  }

  return { label: "A jour", tone: "ok" };
}

function findMutationError(errors: Array<unknown>): string | null {
  for (const candidate of errors) {
    if (candidate instanceof Error) {
      return candidate.message;
    }
  }

  return null;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InstallationPanel({
  enrollment,
  pending,
  onRotate,
}: {
  enrollment: EnrollmentSettings | undefined;
  pending: boolean;
  onRotate: () => void;
}) {
  const [copied, setCopied] = useState<"command" | "token" | null>(null);

  async function copyValue(value: string, kind: "command" | "token") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Installation</p>
          <h3>Ajouter un agent</h3>
        </div>
        <button className="ghost-button small" type="button" onClick={onRotate} disabled={pending}>
          {pending ? "Rotation..." : "Regenerer"}
        </button>
      </div>

      <div className="sidebar-stats">
        <article className="mini-card">
          <span>URL</span>
          <strong className="mono-text">{enrollment?.publicUrl ?? "--"}</strong>
        </article>
        <article className="mini-card">
          <span>Rapport</span>
          <strong>{enrollment ? `${enrollment.reportIntervalSeconds}s` : "--"}</strong>
        </article>
        <article className="mini-card">
          <span>Polling</span>
          <strong>{enrollment ? `${enrollment.jobPollIntervalSeconds}s` : "--"}</strong>
        </article>
      </div>

      <div className="inline-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={() => enrollment && void copyValue(enrollment.enrollmentToken, "token")}
          disabled={!enrollment}
        >
          {copied === "token" ? "Token copie" : "Copier le token"}
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={() => enrollment && void copyValue(enrollment.installCommand, "command")}
          disabled={!enrollment}
        >
          {copied === "command" ? "Commande copiee" : "Copier la commande"}
        </button>
      </div>

      <div className="code-block">
        <pre>{enrollment?.installCommand ?? "Chargement..."}</pre>
      </div>
    </section>
  );
}

function JobItem({ job }: { job: Job }) {
  return (
    <article className="job-row">
      <div>
        <strong>{job.type === "upgrade" ? "Upgrade" : "Refresh APT"}</strong>
        <p>{formatDate(job.createdAt)}</p>
      </div>
      <div className="job-row-side">
        <span
          className={`status-pill ${
            job.status === "success"
              ? "ok"
              : job.status === "failed"
                ? "critical"
                : "pending"
          }`}
        >
          {job.status}
        </span>
        {job.errorMessage ? <small>{job.errorMessage}</small> : null}
      </div>
    </article>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const enrollmentQuery = useQuery({
    queryKey: ["enrollment"],
    queryFn: getEnrollmentSettings,
  });

  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: getSummary,
    refetchInterval: 5000,
  });

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: listServers,
    refetchInterval: 5000,
  });

  const selectedServerSummary =
    serversQuery.data?.find((server) => server.id === selectedId) ?? null;

  const detailQuery = useQuery({
    queryKey: ["server", selectedId],
    queryFn: () => getServer(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: selectedId ? 5000 : false,
  });

  useEffect(() => {
    if (!serversQuery.data) {
      return;
    }

    if (serversQuery.data.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !serversQuery.data.some((server) => server.id === selectedId)) {
      setSelectedId(serversQuery.data[0].id);
    }
  }, [selectedId, serversQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ServerPayload }) =>
      updateServer(id, payload),
    onSuccess: async () => {
      setModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["server", selectedId] }),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServer(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => triggerRefresh(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["server", selectedId] }),
      ]);
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: (id: string) => triggerUpgrade(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["server", selectedId] }),
      ]);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["session"] });
      window.location.assign("/pulseops/login");
    },
  });

  const rotateEnrollmentMutation = useMutation({
    mutationFn: rotateEnrollmentSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enrollment"] });
    },
  });

  const filteredServers =
    serversQuery.data?.filter((server) => {
      const haystack =
        `${server.name} ${server.environment} ${server.notes ?? ""} ${server.hostname ?? ""} ${
          server.osName ?? ""
        }`.toLowerCase();
      return haystack.includes(deferredSearch);
    }) ?? [];

  const selectedServer = detailQuery.data ?? null;
  const selectedState = selectedServer ? resolveServerState(selectedServer) : null;
  const mutationError = findMutationError([
    updateMutation.error,
    deleteMutation.error,
    refreshMutation.error,
    upgradeMutation.error,
    logoutMutation.error,
    rotateEnrollmentMutation.error,
  ]);

  const topError =
    mutationError ??
    (serversQuery.error instanceof Error
      ? serversQuery.error.message
      : summaryQuery.error instanceof Error
        ? summaryQuery.error.message
        : enrollmentQuery.error instanceof Error
          ? enrollmentQuery.error.message
          : detailQuery.error instanceof Error
            ? detailQuery.error.message
            : null);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <p className="eyebrow">Console de supervision</p>
            <h1>PulseOps</h1>
          </div>
        </div>

        <div className="topbar-copy">Debian 13</div>

        <div className="topbar-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "Logout..." : "Deconnexion"}
          </button>
        </div>
      </header>

      {topError ? <div className="alert error section-gap">{topError}</div> : null}

      <div className="dashboard-layout section-gap">
        <aside className="sidebar-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Apercu</p>
                <h3>Parc</h3>
              </div>
            </div>

            <div className="metric-stack">
              <MetricCard label="Serveurs" value={summaryQuery.data?.serverCount ?? 0} />
              <MetricCard label="En ligne" value={summaryQuery.data?.onlineCount ?? 0} />
              <MetricCard
                label="Jobs en attente"
                value={summaryQuery.data?.queuedJobCount ?? 0}
              />
              <MetricCard
                label="Correctifs securite"
                value={summaryQuery.data?.securityUpdateCount ?? 0}
              />
            </div>

            <div className="summary-list">
              <div className="summary-item">
                <span>Dernier check</span>
                <strong>{formatDate(summaryQuery.data?.lastGlobalCheckAt)}</strong>
              </div>
              <div className="summary-item">
                <span>Stale</span>
                <strong>{summaryQuery.data?.staleCount ?? 0}</strong>
              </div>
              <div className="summary-item">
                <span>Offline</span>
                <strong>{summaryQuery.data?.offlineCount ?? 0}</strong>
              </div>
            </div>
          </section>

          <InstallationPanel
            enrollment={enrollmentQuery.data}
            pending={rotateEnrollmentMutation.isPending}
            onRotate={() => rotateEnrollmentMutation.mutate()}
          />
        </aside>

        <section className="main-column">
          {serversQuery.data && serversQuery.data.length === 0 ? (
            <section className="panel empty-panel">
              <p className="section-kicker">Serveurs</p>
              <h3>Aucun serveur</h3>
              <p>Lance la commande d&apos;installation depuis la colonne de gauche.</p>
            </section>
          ) : (
            <div className="workspace-grid">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Serveurs</p>
                    <h3>Liste</h3>
                  </div>

                  <label className="search-field" htmlFor="searchInput">
                    <span>Recherche</span>
                    <input
                      id="searchInput"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Nom, hostname, environnement..."
                    />
                  </label>
                </div>

                <div className="server-stack">
                  {filteredServers.length === 0 ? (
                    <div className="empty-state">Aucun serveur ne correspond a ce filtre.</div>
                  ) : (
                    filteredServers.map((server) => {
                      const state = resolveServerState(server);

                      return (
                        <article
                          key={server.id}
                          className={`server-row ${
                            server.id === selectedId ? "selected" : ""
                          }`}
                          onClick={() => setSelectedId(server.id)}
                        >
                          <div className="server-row-main">
                            <h4>{server.name}</h4>
                            <p>{server.hostname ?? "Hostname inconnu"}</p>
                          </div>

                          <div className="server-row-tags">
                            <span className="server-badge neutral">{server.environment}</span>
                            <span
                              className={`server-badge ${
                                server.connectivityStatus === "online"
                                  ? "ok"
                                  : server.connectivityStatus === "stale"
                                    ? "pending"
                                    : "critical"
                              }`}
                            >
                              {server.connectivityStatus}
                            </span>
                            <span className={`server-badge ${state.tone}`}>{state.label}</span>
                          </div>

                          <div className="server-row-side">
                            <span>{server.pendingJobsCount} jobs</span>
                            <span>{formatDate(server.lastSeenAt)}</span>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>

              <aside className="panel detail-panel">
                {selectedServer ? (
                  <>
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Serveur</p>
                        <h3>{selectedServer.name}</h3>
                      </div>
                      <span className={`status-pill ${selectedState?.tone ?? "neutral"}`}>
                        {selectedState?.label ?? "Selection"}
                      </span>
                    </div>

                    <div className="detail-meta-grid">
                      <article className="detail-card">
                        <span>Nom machine</span>
                        <strong className="compact-strong">{selectedServer.hostname ?? "--"}</strong>
                      </article>
                      <article className="detail-card">
                        <span>Version agent</span>
                        <strong className="compact-strong">
                          {selectedServer.agentVersion ?? "--"}
                        </strong>
                      </article>
                      <article className="detail-card">
                        <span>Derniere vue</span>
                        <strong className="compact-strong">
                          {formatDate(selectedServer.lastSeenAt)}
                        </strong>
                      </article>
                      <article className="detail-card">
                        <span>Maj en attente</span>
                        <strong>{selectedServer.latestSnapshot?.upgradableCount ?? 0}</strong>
                      </article>
                      <article className="detail-card">
                        <span>Correctifs securite</span>
                        <strong>{selectedServer.latestSnapshot?.securityCount ?? 0}</strong>
                      </article>
                      <article className="detail-card">
                        <span>Jobs</span>
                        <strong>{selectedServer.pendingJobsCount}</strong>
                      </article>
                    </div>

                    <div className="detail-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => refreshMutation.mutate(selectedServer.id)}
                        disabled={refreshMutation.isPending}
                      >
                        {refreshMutation.isPending ? "Refresh..." : "Refresh APT"}
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => upgradeMutation.mutate(selectedServer.id)}
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
                            deleteMutation.mutate(selectedServer.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
                      </button>
                    </div>

                    <div className="detail-section">
                      <div className="detail-section-header">
                        <h4>Dernier report</h4>
                        <span>
                          {selectedServer.latestSnapshot ? "Snapshot actuel" : "En attente"}
                        </span>
                      </div>
                      {selectedServer.latestSnapshot ? (
                        <pre>
                          {selectedServer.latestSnapshot.outputPreview ||
                            selectedServer.latestSnapshot.rawSummaryJson}
                        </pre>
                      ) : (
                        <div className="empty-state">Aucun snapshot disponible.</div>
                      )}
                    </div>

                    <div className="detail-section">
                      <div className="detail-section-header">
                        <h4>Jobs recents</h4>
                        <span>{selectedServer.recentJobs.length}</span>
                      </div>
                      <div className="job-list">
                        {selectedServer.recentJobs.length === 0 ? (
                          <div className="empty-state">Aucun job.</div>
                        ) : (
                          selectedServer.recentJobs.map((job) => <JobItem key={job.id} job={job} />)
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state tall">Selectionne un serveur.</div>
                )}
              </aside>
            </div>
          )}
        </section>
      </div>

      <ServerFormModal
        open={modalOpen}
        initialServer={selectedServerSummary}
        pending={updateMutation.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={(payload) => {
          if (!selectedServerSummary) {
            return;
          }

          updateMutation.mutate({
            id: selectedServerSummary.id,
            payload,
          });
        }}
      />
    </div>
  );
}
