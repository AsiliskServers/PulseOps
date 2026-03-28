import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteServer, getServer, getSummary, listServers, triggerRefresh, triggerUpgrade, updateServer } from "../api/servers";
import { logout } from "../api/auth";
import { getEnrollmentSettings, rotateEnrollmentSettings } from "../api/settings";
import { ServerFormModal } from "../components/ServerFormModal";
import type { EnrollmentSettings, Job, ServerDetail, ServerPayload, ServerSummary } from "../types";

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
    return { label: "Heartbeat stale", tone: "pending" };
  }

  if (!server.latestSnapshot.reachable) {
    return { label: "Report degrade", tone: "critical" };
  }

  if (server.latestSnapshot.securityCount > 0) {
    return { label: "Correctifs securite", tone: "critical" };
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return { label: "Updates en attente", tone: "pending" };
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
  tone,
}: {
  label: string;
  value: string | number;
  tone: "neutral" | "green" | "amber" | "rose";
}) {
  return (
    <article className={`metric-card accent-${tone}`}>
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
    <section className="panel installer-panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Installation</p>
          <h3>Commande agent Debian 13</h3>
        </div>
        <div className="panel-toolbar">
          <button
            className="ghost-button"
            type="button"
            onClick={() => enrollment && void copyValue(enrollment.enrollmentToken, "token")}
            disabled={!enrollment}
          >
            {copied === "token" ? "Token copie" : "Copier le token"}
          </button>
          <button className="ghost-button" type="button" onClick={onRotate} disabled={pending}>
            {pending ? "Rotation..." : "Regenerer le token"}
          </button>
        </div>
      </div>

      <div className="installer-grid">
        <article className="detail-card">
          <span>URL</span>
          <strong>{enrollment?.publicUrl ?? "--"}</strong>
        </article>
        <article className="detail-card">
          <span>Rapport</span>
          <strong>{enrollment ? `${enrollment.reportIntervalSeconds}s` : "--"}</strong>
        </article>
        <article className="detail-card">
          <span>Polling</span>
          <strong>{enrollment ? `${enrollment.jobPollIntervalSeconds}s` : "--"}</strong>
        </article>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          <h4>Commande d'installation</h4>
          <button
            className="ghost-button small"
            type="button"
            onClick={() => enrollment && void copyValue(enrollment.installCommand, "command")}
            disabled={!enrollment}
          >
            {copied === "command" ? "Commande copiee" : "Copier la commande"}
          </button>
        </div>
        <pre>{enrollment?.installCommand ?? "Chargement..."}</pre>
      </div>
    </section>
  );
}

function JobItem({ job }: { job: Job }) {
  return (
    <article className="job-card">
      <div>
        <strong>{job.type === "upgrade" ? "Upgrade" : "Refresh APT"}</strong>
        <p>{formatDate(job.createdAt)}</p>
      </div>
      <div className="job-meta">
        <span className={`status-pill ${job.status === "success" ? "ok" : job.status === "failed" ? "critical" : "pending"}`}>
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
      const haystack = `${server.name} ${server.environment} ${server.notes ?? ""} ${server.hostname ?? ""} ${server.osName ?? ""}`.toLowerCase();
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
            className="primary-button"
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "Logout..." : "Deconnexion"}
          </button>
        </div>
      </header>

      <main>
        {topError ? <div className="alert error">{topError}</div> : null}

        <section className="metrics-grid section-block" aria-label="Key metrics">
          <MetricCard
            label="Serveurs"
            value={summaryQuery.data?.serverCount ?? 0}
            tone="neutral"
          />
          <MetricCard
            label="En ligne"
            value={summaryQuery.data?.onlineCount ?? 0}
            tone="green"
          />
          <MetricCard
            label="Jobs en attente"
            value={summaryQuery.data?.queuedJobCount ?? 0}
            tone="amber"
          />
          <MetricCard
            label="Correctifs securite"
            value={summaryQuery.data?.securityUpdateCount ?? 0}
            tone="rose"
          />
        </section>

        <section className="summary-bar panel section-block">
          <div>
            <p className="section-kicker">Resume</p>
            <h3>Etat global</h3>
          </div>
          <div className="summary-inline">
            <span>Check: {formatDate(summaryQuery.data?.lastGlobalCheckAt)}</span>
            <span>Stale: {summaryQuery.data?.staleCount ?? 0}</span>
            <span>Offline: {summaryQuery.data?.offlineCount ?? 0}</span>
          </div>
        </section>

        <div className="section-block">
          <InstallationPanel
            enrollment={enrollmentQuery.data}
            pending={rotateEnrollmentMutation.isPending}
            onRotate={() => rotateEnrollmentMutation.mutate()}
          />
        </div>

        {serversQuery.data && serversQuery.data.length === 0 ? (
          <section className="empty-hero panel section-block">
            <p className="section-kicker">Serveurs</p>
            <h3>Aucun serveur pour le moment</h3>
            <p>Lance la commande d&apos;installation ci-dessus sur un serveur Debian 13.</p>
          </section>
        ) : (
          <section className="content-grid section-block">
            <div className="panel server-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Serveurs</p>
                  <h3>Liste</h3>
                </div>

                <div className="panel-toolbar">
                  <label className="search-field" htmlFor="searchInput">
                    <span>Recherche</span>
                    <input
                      id="searchInput"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="hostname, environnement..."
                    />
                  </label>
                </div>
              </div>

              <div className="server-list">
                {filteredServers.length === 0 ? (
                  <div className="empty-state">Aucun serveur ne correspond a ce filtre.</div>
                ) : (
                  filteredServers.map((server) => {
                    const state = resolveServerState(server);

                    return (
                      <article
                        key={server.id}
                        className={`server-card ${server.id === selectedId ? "selected" : ""}`}
                        onClick={() => setSelectedId(server.id)}
                      >
                        <div className="server-card-top">
                          <div>
                            <p className="server-meta">{server.environment}</p>
                            <h4>{server.name}</h4>
                            <p className="server-note">{server.hostname ?? "Hostname inconnu"}</p>
                          </div>
                          <span className={`server-badge ${state.tone}`}>{state.label}</span>
                        </div>

                        <div className="server-card-bottom">
                          <div className="server-stats">
                            <span className={`server-badge ${server.connectivityStatus === "online" ? "ok" : server.connectivityStatus === "stale" ? "pending" : "critical"}`}>
                              {server.connectivityStatus}
                            </span>
                            <span className="server-badge neutral">
                              {server.pendingJobsCount} jobs
                            </span>
                            <span
                              className={`server-badge ${
                                (server.latestSnapshot?.securityCount ?? 0) > 0 ? "critical" : "ok"
                              }`}
                            >
                              {server.latestSnapshot?.securityCount ?? 0} secu
                            </span>
                          </div>
                          <p className="server-note">
                            Vue: {formatDate(server.lastSeenAt)}
                          </p>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <aside className="panel detail-panel">
              {selectedServer ? (
                <>
                  <div className="panel-header compact">
                    <div>
                      <p className="section-kicker">Detail</p>
                      <h3>{selectedServer.name}</h3>
                    </div>
                    <span className={`status-pill ${selectedState?.tone ?? "neutral"}`}>
                      {selectedState?.label ?? "Selection"}
                    </span>
                  </div>

                  <div className="detail-hero">
                    <div>
                      <p className="detail-label">Nom machine</p>
                      <strong>{selectedServer.hostname ?? "--"}</strong>
                    </div>
                    <div>
                      <p className="detail-label">Derniere vue</p>
                      <strong>{formatDate(selectedServer.lastSeenAt)}</strong>
                    </div>
                    <div>
                      <p className="detail-label">Version agent</p>
                      <strong>{selectedServer.agentVersion ?? "--"}</strong>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-card">
                      <span>Maj en attente</span>
                      <strong>{selectedServer.latestSnapshot?.upgradableCount ?? 0}</strong>
                    </article>
                    <article className="detail-card">
                      <span>Dernier report</span>
                      <strong>{formatDate(selectedServer.lastReportAt)}</strong>
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
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setModalOpen(true)}
                    >
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
                      <pre>{selectedServer.latestSnapshot.outputPreview || selectedServer.latestSnapshot.rawSummaryJson}</pre>
                    ) : (
                      <div className="empty-state compact">
                        Aucun snapshot disponible.
                      </div>
                    )}
                  </div>

                  <div className="detail-section">
                    <div className="detail-section-header">
                      <h4>Jobs recents</h4>
                      <span>{selectedServer.recentJobs.length}</span>
                    </div>
                    <div className="job-list">
                      {selectedServer.recentJobs.length === 0 ? (
                        <div className="empty-state compact">
                          Aucun job.
                        </div>
                      ) : (
                        selectedServer.recentJobs.map((job) => <JobItem key={job.id} job={job} />)
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state tall">
                  Selectionne un serveur.
                </div>
              )}
            </aside>
          </section>
        )}
      </main>

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
