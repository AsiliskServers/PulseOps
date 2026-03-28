import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServer, deleteServer, getServer, getSummary, listServers, triggerRefresh, triggerUpgrade, updateServer } from "../api/servers";
import { logout } from "../api/auth";
import { ServerFormModal } from "../components/ServerFormModal";
import type { Job, ServerDetail, ServerPayload, ServerSummary } from "../types";

type FilterKey = "all" | "updated" | "pending" | "critical";

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
    return { label: "Dernier check en echec", tone: "critical" };
  }

  if (!server.latestSnapshot) {
    return { label: "Jamais synchronise", tone: "neutral" };
  }

  if (!server.latestSnapshot.reachable) {
    return { label: "Agent injoignable", tone: "critical" };
  }

  if (server.latestSnapshot.securityCount > 0) {
    return { label: "Correctifs securite", tone: "critical" };
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return { label: "Updates en attente", tone: "pending" };
  }

  return { label: "A jour", tone: "ok" };
}

function matchesFilter(server: ServerSummary, filter: FilterKey): boolean {
  const state = resolveServerState(server);

  if (filter === "all") {
    return true;
  }

  if (filter === "updated") {
    return state.tone === "ok";
  }

  if (filter === "pending") {
    return state.tone === "pending";
  }

  return state.tone === "critical";
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
  caption,
  tone,
}: {
  label: string;
  value: string | number;
  caption: string;
  tone: "sand" | "green" | "amber" | "rose";
}) {
  return (
    <article className={`metric-card accent-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

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

  const createMutation = useMutation({
    mutationFn: (payload: ServerPayload) => createServer(payload),
    onSuccess: async (server) => {
      setModalOpen(false);
      setSelectedId(server.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

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
      window.location.assign("/login");
    },
  });

  const filteredServers =
    serversQuery.data?.filter((server) => {
      const haystack = `${server.name} ${server.environment} ${server.notes ?? ""}`.toLowerCase();
      return haystack.includes(deferredSearch) && matchesFilter(server, filter);
    }) ?? [];

  const selectedServer = detailQuery.data ?? null;
  const selectedState = selectedServer ? resolveServerState(selectedServer) : null;
  const mutationError = findMutationError([
    createMutation.error,
    updateMutation.error,
    deleteMutation.error,
    refreshMutation.error,
    upgradeMutation.error,
    logoutMutation.error,
  ]);

  const topError =
    mutationError ??
    (serversQuery.error instanceof Error
      ? serversQuery.error.message
      : summaryQuery.error instanceof Error
        ? summaryQuery.error.message
        : detailQuery.error instanceof Error
          ? detailQuery.error.message
          : null);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <p className="eyebrow">Debian 13 update control</p>
            <h1>PulseOps</h1>
          </div>
        </div>

        <div className="topbar-copy">
          <span className="hero-chip">Empty by default. Ready for your first server.</span>
        </div>

        <div className="topbar-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setModalMode("create");
              setModalOpen(true);
            }}
          >
            Ajouter un serveur
          </button>
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
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-chip">Central update visibility for Debian 13</span>
            <h2>Une console vide, propre et prete a accueillir votre premier serveur.</h2>
            <p>
              PulseOps est maintenant connecte a un vrai backend. Tant qu&apos;aucun agent n&apos;est
              configure, l&apos;interface reste volontairement nette: zero serveur, zero historique,
              zero bruit.
            </p>

            <div className="hero-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setModalMode("create");
                  setModalOpen(true);
                }}
              >
                Ajouter un premier serveur
              </button>
            </div>
          </div>

          <aside className="hero-panel">
            <p className="section-kicker">Live posture</p>
            <div className="status-orbit">
              <div className="status-ring">
                <strong>{summaryQuery.data?.serverCount ?? 0}</strong>
                <span>registered servers</span>
              </div>
              <div className="orbit-tag orbit-tag-top">
                {summaryQuery.data?.reachableCount ?? 0} reachable
              </div>
              <div className="orbit-tag orbit-tag-right">
                {summaryQuery.data?.pendingUpdateCount ?? 0} pending
              </div>
              <div className="orbit-tag orbit-tag-bottom">
                {summaryQuery.data?.securityUpdateCount ?? 0} security
              </div>
            </div>

            <div className="mini-feed">
              <article>
                <span>Last global check</span>
                <strong>{formatDate(summaryQuery.data?.lastGlobalCheckAt)}</strong>
              </article>
              <article>
                <span>Current mode</span>
                <strong>Manual refresh and upgrade</strong>
              </article>
            </div>
          </aside>
        </section>

        {topError ? <div className="alert error">{topError}</div> : null}

        <section className="metrics-grid" aria-label="Key metrics">
          <MetricCard
            label="Fleet registered"
            value={summaryQuery.data?.serverCount ?? 0}
            caption="Serveurs enregistres dans la base principale."
            tone="sand"
          />
          <MetricCard
            label="Reachable"
            value={summaryQuery.data?.reachableCount ?? 0}
            caption="Agents joignables au dernier check valide."
            tone="green"
          />
          <MetricCard
            label="Pending updates"
            value={summaryQuery.data?.pendingUpdateCount ?? 0}
            caption="Somme des paquets encore upgradables."
            tone="amber"
          />
          <MetricCard
            label="Security patches"
            value={summaryQuery.data?.securityUpdateCount ?? 0}
            caption="Correctifs securite detectes au dernier check."
            tone="rose"
          />
        </section>

        {serversQuery.data && serversQuery.data.length === 0 ? (
          <section className="empty-hero panel">
            <p className="section-kicker">Fleet status</p>
            <h3>Aucun serveur configure pour le moment</h3>
            <p>
              Ajoute une URL d&apos;agent et son token pour lancer le premier refresh APT depuis le
              serveur principal.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setModalMode("create");
                setModalOpen(true);
              }}
            >
              Ajouter un premier serveur
            </button>
          </section>
        ) : (
          <section className="content-grid">
            <div className="panel server-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Fleet status</p>
                  <h3>Serveurs enregistres</h3>
                </div>

                <div className="panel-toolbar">
                  <label className="search-field" htmlFor="searchInput">
                    <span>Search</span>
                    <input
                      id="searchInput"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="srv-prod, staging, edge..."
                    />
                  </label>

                  <div className="filter-group" role="tablist" aria-label="Server filters">
                    {(["all", "updated", "pending", "critical"] as FilterKey[]).map((key) => (
                      <button
                        key={key}
                        className={`filter-chip ${filter === key ? "active" : ""}`}
                        type="button"
                        onClick={() => setFilter(key)}
                      >
                        {key === "all"
                          ? "Tous"
                          : key === "updated"
                            ? "A jour"
                            : key === "pending"
                              ? "Updates"
                              : "Critique"}
                      </button>
                    ))}
                  </div>
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
                            <p className="server-note">{server.agentBaseUrl}</p>
                          </div>
                          <span className={`server-badge ${state.tone}`}>{state.label}</span>
                        </div>

                        <div className="server-card-bottom">
                          <div className="server-stats">
                            <span className="server-badge neutral">
                              {server.latestSnapshot
                                ? `${server.latestSnapshot.upgradableCount} updates`
                                : "No snapshot"}
                            </span>
                            <span
                              className={`server-badge ${
                                (server.latestSnapshot?.securityCount ?? 0) > 0 ? "critical" : "ok"
                              }`}
                            >
                              {server.latestSnapshot?.securityCount ?? 0} security
                            </span>
                          </div>
                          <p className="server-note">
                            Last check: {formatDate(server.latestSnapshot?.lastCheckAt)}
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
                      <p className="section-kicker">Selected server</p>
                      <h3>{selectedServer.name}</h3>
                    </div>
                    <span className={`status-pill ${selectedState?.tone ?? "neutral"}`}>
                      {selectedState?.label ?? "Selection"}
                    </span>
                  </div>

                  <div className="detail-hero">
                    <div>
                      <p className="detail-label">Environment</p>
                      <strong>{selectedServer.environment}</strong>
                    </div>
                    <div>
                      <p className="detail-label">Last apt check</p>
                      <strong>{formatDate(selectedServer.latestSnapshot?.lastCheckAt)}</strong>
                    </div>
                    <div>
                      <p className="detail-label">Agent endpoint</p>
                      <strong>{selectedServer.agentBaseUrl}</strong>
                    </div>
                  </div>

                  <div className="detail-grid">
                    <article className="detail-card">
                      <span>Packages pending</span>
                      <strong>{selectedServer.latestSnapshot?.upgradableCount ?? 0}</strong>
                    </article>
                    <article className="detail-card">
                      <span>Security patches</span>
                      <strong>{selectedServer.latestSnapshot?.securityCount ?? 0}</strong>
                    </article>
                    <article className="detail-card">
                      <span>Reboot needed</span>
                      <strong>
                        {selectedServer.latestSnapshot
                          ? selectedServer.latestSnapshot.rebootRequired
                            ? "Yes"
                            : "No"
                          : "--"}
                      </strong>
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
                      onClick={() => {
                        setModalMode("edit");
                        setModalOpen(true);
                      }}
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
                      <h4>Etat courant</h4>
                      <span>
                        {selectedServer.latestSnapshot ? "Dernier snapshot valide" : "En attente de premier refresh"}
                      </span>
                    </div>
                    {selectedServer.latestSnapshot ? (
                      <pre>{selectedServer.latestSnapshot.rawSummaryJson}</pre>
                    ) : (
                      <div className="empty-state compact">
                        Aucun snapshot disponible. Lance d&apos;abord un refresh APT.
                      </div>
                    )}
                  </div>

                  <div className="detail-section">
                    <div className="detail-section-header">
                      <h4>Recent jobs</h4>
                      <span>{selectedServer.recentJobs.length} item(s)</span>
                    </div>
                    <div className="job-list">
                      {selectedServer.recentJobs.length === 0 ? (
                        <div className="empty-state compact">
                          Aucun job pour ce serveur pour le moment.
                        </div>
                      ) : (
                        selectedServer.recentJobs.map((job) => <JobItem key={job.id} job={job} />)
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state tall">
                  Selectionne un serveur pour afficher son detail, ou ajoute le premier si la flotte
                  est encore vide.
                </div>
              )}
            </aside>
          </section>
        )}
      </main>

      <ServerFormModal
        open={modalOpen}
        mode={modalMode}
        initialServer={modalMode === "edit" ? selectedServerSummary : null}
        pending={createMutation.isPending || updateMutation.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={(payload) => {
          if (modalMode === "create") {
            createMutation.mutate(payload);
            return;
          }

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
