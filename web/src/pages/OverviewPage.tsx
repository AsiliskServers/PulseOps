import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSummary, listServers } from "../api/servers";
import { formatDate, resolveServerState } from "../lib/presentation";

export function OverviewPage() {
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

  const servers = serversQuery.data ?? [];
  const productionCount = servers.filter((server) => server.environment === "production").length;
  const staleOrOfflineCount = servers.filter(
    (server) => server.connectivityStatus === "stale" || server.connectivityStatus === "offline"
  ).length;
  const highlightedServers = servers
    .filter(
      (server) =>
        (server.latestSnapshot?.securityCount ?? 0) > 0 ||
        server.connectivityStatus !== "online" ||
        (server.latestSnapshot?.upgradableCount ?? 0) > 0
    )
    .slice(0, 6);

  return (
    <div className="page-column">
      <section className="page-header panel">
        <div className="page-heading">
          <p className="section-kicker">Accueil</p>
          <h2>Vue générale du parc</h2>
          <p className="page-copy">
            Résumé des serveurs, des updates à traiter et des derniers retours agents.
          </p>
        </div>
        <div className="page-header-side">
          <div className="hero-stat">
            <span>Dernière vérification</span>
            <strong>{formatDate(summaryQuery.data?.lastGlobalCheckAt)}</strong>
          </div>
          <div className="hero-stat">
            <span>Updates en attente</span>
            <strong>{summaryQuery.data?.pendingUpdateCount ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="overview-cards">
        <article className="stat-card">
          <span>Serveurs</span>
          <strong>{summaryQuery.data?.serverCount ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>En ligne</span>
          <strong>{summaryQuery.data?.onlineCount ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Offline</span>
          <strong>{summaryQuery.data?.offlineCount ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>Jobs en attente</span>
          <strong>{summaryQuery.data?.queuedJobCount ?? 0}</strong>
        </article>
      </section>

      <section className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Priorités</p>
              <h3>Serveurs à suivre</h3>
            </div>
            <Link className="text-link" to="/servers">
              Voir tous les serveurs
            </Link>
          </div>

          <div className="overview-list">
            {highlightedServers.length === 0 ? (
              <div className="empty-state">Aucun serveur prioritaire.</div>
            ) : (
              highlightedServers.map((server) => {
                const state = resolveServerState(server);
                return (
                  <Link key={server.id} to={`/servers/${server.id}`} className="overview-row">
                    <div>
                      <strong>{server.name}</strong>
                      <p>{server.hostname ?? "Hostname inconnu"}</p>
                    </div>
                    <div className="overview-row-side">
                      <span className={`server-badge ${state.tone}`}>{state.label}</span>
                      <small>{formatDate(server.lastSeenAt)}</small>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Répartition</p>
              <h3>État du parc</h3>
            </div>
          </div>

          <div className="summary-grid">
            <article className="mini-summary">
              <span>Joignables</span>
              <strong>{summaryQuery.data?.reachableCount ?? 0}</strong>
            </article>
            <article className="mini-summary">
              <span>À jour</span>
              <strong>{summaryQuery.data?.upToDateCount ?? 0}</strong>
            </article>
            <article className="mini-summary">
              <span>À surveiller</span>
              <strong>{summaryQuery.data?.staleCount ?? 0}</strong>
            </article>
            <article className="mini-summary">
              <span>Correctifs sécurité</span>
              <strong>{summaryQuery.data?.securityUpdateCount ?? 0}</strong>
            </article>
            <article className="mini-summary">
              <span>Production</span>
              <strong>{productionCount}</strong>
            </article>
            <article className="mini-summary">
              <span>Alertes infra</span>
              <strong>{staleOrOfflineCount}</strong>
            </article>
          </div>
        </section>
      </section>
    </div>
  );
}
