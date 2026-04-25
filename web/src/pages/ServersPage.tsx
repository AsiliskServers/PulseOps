import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listCategories } from "../api/categories";
import { listServers, queueBatchJobs } from "../api/servers";
import {
  buildDashboardSummary,
  formatDate,
  resolveAgentVersionState,
  resolveServerState,
} from "../lib/presentation";
import {
  CATEGORIES_QUERY_STALE_TIME_MS,
  SERVERS_QUERY_REFETCH_INTERVAL_MS,
  SERVERS_QUERY_STALE_TIME_MS,
} from "../lib/query";

function TerminalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="3" />
      <path d="M6.5 8L8.75 10L6.5 12" />
      <path d="M10.75 12H13.5" />
    </svg>
  );
}

type BatchAction = "refresh" | "upgrade" | "agent_update";
type SortField = "name" | "serverState" | "agentState" | "environment" | "lastSeenAt";
type SortMode =
  | "default"
  | "asc"
  | "desc"
  | "priority"
  | "reverse"
  | "recent"
  | "old";

const stateOrder = {
  critical: 0,
  pending: 1,
  neutral: 2,
  ok: 3,
} as const;

type OrderedTone = keyof typeof stateOrder;

const sortLabels: Record<SortField, Record<SortMode, string>> = {
  name: {
    default: "Normal",
    asc: "A-Z",
    desc: "Z-A",
    priority: "Priorite",
    reverse: "Inverse",
    recent: "Recent",
    old: "Vieux",
  },
  serverState: {
    default: "Normal",
    asc: "A-Z",
    desc: "Z-A",
    priority: "Priorite",
    reverse: "Inverse",
    recent: "Recent",
    old: "Vieux",
  },
  agentState: {
    default: "Normal",
    asc: "A-Z",
    desc: "Z-A",
    priority: "Priorite",
    reverse: "Inverse",
    recent: "Recent",
    old: "Vieux",
  },
  environment: {
    default: "Normal",
    asc: "A-Z",
    desc: "Z-A",
    priority: "Priorite",
    reverse: "Inverse",
    recent: "Recent",
    old: "Vieux",
  },
  lastSeenAt: {
    default: "Normal",
    asc: "A-Z",
    desc: "Z-A",
    priority: "Priorite",
    reverse: "Inverse",
    recent: "Recent",
    old: "Vieux",
  },
};

function compareDateStrings(left: string | null, right: string | null) {
  const leftValue = left ? new Date(left).getTime() : 0;
  const rightValue = right ? new Date(right).getTime() : 0;
  return leftValue - rightValue;
}

function compareTone(left: OrderedTone, right: OrderedTone) {
  return stateOrder[left] - stateOrder[right];
}

function nextSortMode(field: SortField, mode: SortMode): SortMode {
  if (field === "lastSeenAt") {
    if (mode === "default") return "recent";
    if (mode === "recent") return "old";
    return "default";
  }

  if (field === "serverState" || field === "agentState") {
    if (mode === "default") return "priority";
    if (mode === "priority") return "reverse";
    return "default";
  }

  if (mode === "default") return "asc";
  if (mode === "asc") return "desc";
  return "default";
}

export function ServersPage() {
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null);
  const [sortField, setSortField] = useState<SortField>("lastSeenAt");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const queryClient = useQueryClient();

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: listServers,
    staleTime: SERVERS_QUERY_STALE_TIME_MS,
    refetchInterval: SERVERS_QUERY_REFETCH_INTERVAL_MS,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    staleTime: CATEGORIES_QUERY_STALE_TIME_MS,
  });

  const selectedCategory =
    categoriesQuery.data?.find((category) => category.id === categoryId) ?? null;

  const filteredServers = useMemo(
    () =>
      (serversQuery.data ?? []).filter((server) => {
        const categories = server.categories ?? [];

        if (categoryId && !categories.some((category) => category.id === categoryId)) {
          return false;
        }

        const haystack =
          `${server.name} ${server.environment} ${server.hostname ?? ""} ${
            server.osName ?? ""
          } ${server.agentVersion ?? ""} ${categories
            .map((category) => category.name)
            .join(" ")}`.toLowerCase();
        return haystack.includes(deferredSearch);
      }),
    [categoryId, deferredSearch, serversQuery.data]
  );

  const summary = useMemo(() => buildDashboardSummary(filteredServers), [filteredServers]);

  const servers = useMemo(
    () =>
      filteredServers
        .map((server, index) => ({
          server,
          index,
          state: resolveServerState(server),
          agentState: resolveAgentVersionState(server),
        }))
        .sort((left, right) => {
          if (sortMode === "default") {
            return left.index - right.index;
          }

          let comparison = 0;

          if (sortField === "name") {
            comparison = left.server.name.localeCompare(right.server.name, "fr", {
              sensitivity: "base",
            });
          } else if (sortField === "environment") {
            comparison = left.server.environment.localeCompare(right.server.environment, "fr", {
              sensitivity: "base",
            });
          } else if (sortField === "lastSeenAt") {
            comparison = compareDateStrings(left.server.lastSeenAt, right.server.lastSeenAt);
            if (sortMode === "recent") {
              comparison *= -1;
            }
          } else if (sortField === "serverState") {
            comparison = compareTone(left.state.tone, right.state.tone);
            if (sortMode === "reverse") {
              comparison *= -1;
            }
          } else if (sortField === "agentState") {
            comparison = compareTone(left.agentState.tone, right.agentState.tone);
            if (sortMode === "reverse") {
              comparison *= -1;
            }
          }

          if (comparison !== 0) {
            return comparison;
          }

          return left.index - right.index;
        }),
    [filteredServers, sortField, sortMode]
  );

  useEffect(() => {
    if (!serversQuery.data) {
      return;
    }

    const validIds = new Set(serversQuery.data.map((server) => server.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [serversQuery.data]);

  const batchMutation = useMutation({
    mutationFn: (type: BatchAction) =>
      queueBatchJobs({
        serverIds: selectedIds,
        type,
      }),
    onSuccess: async () => {
      setBatchAction(null);
      setSelectedIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
      ]);
    },
    onError: () => {
      setBatchAction(null);
    },
  });

  const visibleIds = servers.map(({ server }) => server.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const hasSelection = selectedIds.length > 0;

  function toggleServerSelection(serverId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? Array.from(new Set([...current, serverId]))
        : current.filter((id) => id !== serverId)
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

  function runBatchAction(type: BatchAction) {
    setBatchAction(type);
    batchMutation.mutate(type);
  }

  function cycleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortMode(nextSortMode(field, "default"));
      return;
    }

    setSortMode((current) => nextSortMode(field, current));
  }

  function getSortLabel(field: SortField) {
    if (sortField !== field) {
      return "Normal";
    }

    return sortLabels[field][sortMode];
  }

  const topError =
    (serversQuery.error instanceof Error && serversQuery.error.message) ||
    (categoriesQuery.error instanceof Error && categoriesQuery.error.message) ||
    (batchMutation.error instanceof Error && batchMutation.error.message) ||
    null;

  const headingTitle = selectedCategory ? `Categorie ${selectedCategory.name}` : "Inventaire";
  const headingCopy = selectedCategory
    ? `Vue filtree sur les serveurs classes dans ${selectedCategory.name}.`
    : "Liste detaillee, etat courant et acces rapide a chaque fiche.";

  return (
    <div className="page-column">
      <section className="page-header panel">
        <div className="page-heading">
          <p className="section-kicker">Parc</p>
          <h2>{selectedCategory ? "Serveurs par categorie" : "Inventaire serveurs"}</h2>
          <p className="page-copy">{headingCopy}</p>
        </div>

        <div className="page-header-side compact-stats">
          <div className="hero-stat">
            <span>A jour</span>
            <strong>{summary.upToDateCount}</strong>
          </div>
          <div className="hero-stat">
            <span>Securite</span>
            <strong>{summary.securityUpdateCount}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">{selectedCategory ? "Categorie" : "Serveurs"}</p>
            <h2>{headingTitle}</h2>
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
                ? `${selectedIds.length} serveur${selectedIds.length > 1 ? "s" : ""} selectionne${
                    selectedIds.length > 1 ? "s" : ""
                  }`
                : "Selectionner les serveurs visibles"}
            </span>
          </label>

          <div className="inline-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => runBatchAction("refresh")}
              disabled={!hasSelection || batchMutation.isPending}
            >
              {batchMutation.isPending && batchAction === "refresh"
                ? "Refresh..."
                : "Refresh selection"}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => runBatchAction("upgrade")}
              disabled={!hasSelection || batchMutation.isPending}
            >
              {batchMutation.isPending && batchAction === "upgrade"
                ? "Upgrade..."
                : "Upgrade selection"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => runBatchAction("agent_update")}
              disabled={!hasSelection || batchMutation.isPending}
            >
              {batchMutation.isPending && batchAction === "agent_update"
                ? "Maj agent..."
                : "Mettre a jour l'agent"}
            </button>
          </div>
        </div>

        <div className="table-head">
          <span></span>
          <button className="table-sort-button" type="button" onClick={() => cycleSort("name")}>
            <span>Serveur</span>
            <small>{getSortLabel("name")}</small>
          </button>
          <button
            className="table-sort-button"
            type="button"
            onClick={() => cycleSort("serverState")}
          >
            <span>Etat</span>
            <small>{getSortLabel("serverState")}</small>
          </button>
          <button
            className="table-sort-button"
            type="button"
            onClick={() => cycleSort("agentState")}
          >
            <span>Etat agent</span>
            <small>{getSortLabel("agentState")}</small>
          </button>
          <button
            className="table-sort-button"
            type="button"
            onClick={() => cycleSort("environment")}
          >
            <span>Environnement</span>
            <small>{getSortLabel("environment")}</small>
          </button>
          <span className="table-head-label table-head-label-center">Terminal</span>
          <button
            className="table-sort-button align-end"
            type="button"
            onClick={() => cycleSort("lastSeenAt")}
          >
            <span>Dernier retour</span>
            <small>{getSortLabel("lastSeenAt")}</small>
          </button>
        </div>

        <div className="server-table">
          {servers.length === 0 ? (
            <div className="empty-state">
              {selectedCategory
                ? "Aucun serveur dans cette categorie avec le filtre actuel."
                : "Aucun serveur ne correspond a ce filtre."}
            </div>
          ) : (
            servers.map(({ server, state, agentState }) => {
              const shellSupported = server.shellAccessEnabled !== false;
              const canOpenTerminal = Boolean(server.agentId && server.isActive && shellSupported);
              const sshCommand = canOpenTerminal
                ? "Ouvrir le terminal root via l'agent"
                : shellSupported
                  ? null
                  : "Shell desactive sur ce type d'agent";

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

                  <div className="table-stack">
                    <span className={`server-badge ${state.tone}`}>{state.label}</span>
                    <small>{server.latestSnapshot?.upgradableCount ?? 0} update(s)</small>
                  </div>

                  <div className="table-stack">
                    <span className={`server-badge ${agentState.tone}`}>{agentState.label}</span>
                    <small>{server.agentVersion ?? "Version inconnue"}</small>
                  </div>

                  <div>
                    <span className="server-badge neutral">{server.environment}</span>
                  </div>

                  <div className="table-ssh">
                    <button
                      className="ghost-button small ssh-launch-button"
                      type="button"
                      onClick={() => {
                        navigate(`/servers/${server.id}?terminal=1`);
                      }}
                      disabled={!canOpenTerminal}
                      aria-label="Ouvrir le terminal via l'agent"
                      title={sshCommand ?? "Configurer un hote SSH pour ce serveur"}
                    >
                      <TerminalIcon />
                    </button>
                  </div>

                  <div className="table-row-side">
                    <span>{formatDate(server.lastSeenAt)}</span>
                    <small
                      className={`table-jobs-indicator ${
                        server.pendingJobsCount > 0 ? "live" : "idle"
                      }`}
                    >
                      <span className="table-jobs-dot" aria-hidden="true" />
                      <span>{server.pendingJobsCount} jobs</span>
                    </small>
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
