import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSummary, listServers, queueBatchJobs } from "../api/servers";
import { formatDate, resolveServerState } from "../lib/presentation";

export function ServersPage() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const queryClient = useQueryClient();

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

  const servers =
    serversQuery.data?.filter((server) => {
      const haystack =
        `${server.name} ${server.environment} ${server.notes ?? ""} ${server.hostname ?? ""} ${
          server.osName ?? ""
        }`.toLowerCase();
      return haystack.includes(deferredSearch);
    }) ?? [];

  useEffect(() => {
    if (!serversQuery.data) {
      return;
    }

    const validIds = new Set(serversQuery.data.map((server) => server.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [serversQuery.data]);

  const batchMutation = useMutation({
    mutationFn: (type: "refresh" | "upgrade") =>
      queueBatchJobs({
        serverIds: selectedIds,
        type,
      }),
    onSuccess: async () => {
      setSelectedIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });

  const visibleIds = servers.map((server) => server.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const hasSelection = selectedIds.length > 0;

  function toggleServerSelection(serverId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, serverId])) : current.filter((id) => id !== serverId)
    );
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visibleIds]));
      }

      return current.filter((id) => !visibleIds.includes(id));
    });
  }

  const topError =
    (serversQuery.error instanceof Error && serversQuery.error.message) ||
    (summaryQuery.error instanceof Error && summaryQuery.error.message) ||
    (batchMutation.error instanceof Error && batchMutation.error.message) ||
    null;

  return (
    <div className="page-column">
      <section className="page-header panel">
        <div className="page-heading">
          <p className="section-kicker">Parc</p>
          <h2>Inventaire serveurs</h2>
          <p className="page-copy">Liste detaillee, etat courant et acces rapide a chaque fiche.</p>
        </div>

        <div className="page-header-side compact-stats">
          <div className="hero-stat">
            <span>A jour</span>
            <strong>{summaryQuery.data?.upToDateCount ?? 0}</strong>
          </div>
          <div className="hero-stat">
            <span>Securite</span>
            <strong>{summaryQuery.data?.securityUpdateCount ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Serveurs</p>
            <h2>Inventaire</h2>
          </div>

          <label className="search-field" htmlFor="serversSearchInput">
            <span>Recherche</span>
            <input
              id="serversSearchInput"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, hostname, environnement..."
            />
          </label>
        </div>

        {topError ? <div className="alert error">{topError}</div> : null}

        <div className="bulk-toolbar">
          <label className="bulk-select">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => toggleVisibleSelection(event.target.checked)}
              disabled={visibleIds.length === 0}
            />
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} serveur${selectedIds.length > 1 ? "s" : ""} selectionne${selectedIds.length > 1 ? "s" : ""}`
                : "Selectionner les serveurs visibles"}
            </span>
          </label>

          <div className="inline-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => batchMutation.mutate("refresh")}
              disabled={!hasSelection || batchMutation.isPending}
            >
              {batchMutation.isPending ? "Traitement..." : "Refresh selection"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => batchMutation.mutate("upgrade")}
              disabled={!hasSelection || batchMutation.isPending}
            >
              {batchMutation.isPending ? "Traitement..." : "Upgrade selection"}
            </button>
          </div>
        </div>

        <div className="table-head">
          <span></span>
          <span>Serveur</span>
          <span>Etat</span>
          <span>Environnement</span>
          <span>Dernier retour</span>
        </div>

        <div className="server-table">
          {servers.length === 0 ? (
            <div className="empty-state">Aucun serveur ne correspond a ce filtre.</div>
          ) : (
            servers.map((server) => {
              const state = resolveServerState(server);
              return (
                <div
                  key={server.id}
                  className={`table-row selectable-row ${
                    selectedIds.includes(server.id) ? "selected" : ""
                  }`}
                >
                  <label className="row-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(server.id)}
                      onChange={(event) => toggleServerSelection(server.id, event.target.checked)}
                    />
                  </label>
                  <div>
                    <Link className="table-name-link" to={`/servers/${server.id}`}>
                      <strong>{server.name}</strong>
                    </Link>
                    <p>{server.hostname ?? "Hostname inconnu"}</p>
                  </div>
                  <div>
                    <span className={`server-badge ${state.tone}`}>{state.label}</span>
                  </div>
                  <div>
                    <span className="server-badge neutral">{server.environment}</span>
                  </div>
                  <div className="table-row-side">
                    <span>{formatDate(server.lastSeenAt)}</span>
                    <small>{server.pendingJobsCount} jobs</small>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
