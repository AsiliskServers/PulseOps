import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSummary, listServers } from "../api/servers";
import { formatDate, resolveServerState } from "../lib/presentation";

type MonitoringSlice = {
  key: string;
  label: string;
  description: string;
  count: number;
  color: string;
  position:
    | "top-left"
    | "left"
    | "bottom-left"
    | "top-right"
    | "right"
    | "bottom-right";
};

function serverUnitLabel(count: number) {
  return count > 1 ? "serveurs" : "serveur";
}

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

  const monitoringSlices: MonitoringSlice[] = [
    {
      key: "security_updates",
      label: "Sécurité",
      description: "Correctifs sécurité à traiter.",
      count: 0,
      color: "#aa4359",
      position: "top-left",
    },
    {
      key: "watch",
      label: "À surveiller",
      description: "Dernier report ancien ou instable.",
      count: 0,
      color: "#446c9c",
      position: "left",
    },
    {
      key: "no_report",
      label: "Sans report",
      description: "Agent enrôlé sans snapshot exploitable.",
      count: 0,
      color: "#a3adb8",
      position: "bottom-left",
    },
    {
      key: "pending_updates",
      label: "MàJ en attente",
      description: "Updates disponibles hors sécurité.",
      count: 0,
      color: "#d39a2c",
      position: "top-right",
    },
    {
      key: "up_to_date",
      label: "À jour",
      description: "Aucune mise à jour en attente.",
      count: 0,
      color: "#216e54",
      position: "right",
    },
    {
      key: "offline",
      label: "Hors ligne",
      description: "Machine non joignable ou état dégradé.",
      count: 0,
      color: "#5d6472",
      position: "bottom-right",
    },
  ];

  for (const server of servers) {
    if (!server.latestSnapshot) {
      monitoringSlices[2].count += 1;
      continue;
    }

    if (server.latestJob?.status === "failed") {
      monitoringSlices[5].count += 1;
      continue;
    }

    if (server.connectivityStatus === "offline" || !server.latestSnapshot.reachable) {
      monitoringSlices[5].count += 1;
      continue;
    }

    if (server.connectivityStatus === "stale") {
      monitoringSlices[1].count += 1;
      continue;
    }

    if (server.latestSnapshot.securityCount > 0) {
      monitoringSlices[0].count += 1;
      continue;
    }

    if (server.latestSnapshot.upgradableCount > 0) {
      monitoringSlices[3].count += 1;
      continue;
    }

    monitoringSlices[4].count += 1;
  }

  const monitoredCount = monitoringSlices.reduce((total, slice) => total + slice.count, 0);
  const activeMonitoringSlices = monitoringSlices.filter((slice) => slice.count > 0);

  function renderMonitoringCallout(slice: MonitoringSlice) {
    const percentage = monitoredCount > 0 ? Math.round((slice.count / monitoredCount) * 100) : 0;

    return (
      <article
        key={slice.key}
        className={`monitoring-callout ${slice.position} ${
          slice.count > 0 ? "has-value" : "is-empty"
        }`}
      >
        <span
          className="monitoring-swatch"
          style={{ backgroundColor: slice.color }}
          aria-hidden="true"
        />
        <div className="monitoring-copy">
          <div className="monitoring-copy-top">
            <strong>{slice.label}</strong>
            <small>{percentage}%</small>
          </div>
          <p>{slice.description}</p>
        </div>
        <div className="monitoring-value">
          <strong>{slice.count}</strong>
          <small>{serverUnitLabel(slice.count)}</small>
        </div>
      </article>
    );
  }

  return (
    <div className="page-column">
      <section className="page-header panel">
        <div className="page-heading">
          <p className="section-kicker">Accueil</p>
          <h2>Vue générale du parc</h2>
          <p className="page-copy">
            Résumé des serveurs, des mises à jour à traiter et des derniers retours agents.
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
              <p className="section-kicker">Monitoring</p>
              <h3>État du parc</h3>
            </div>
          </div>

          {monitoredCount === 0 ? (
            <div className="empty-state">Aucun serveur enregistré pour le moment.</div>
          ) : (
            <div className="monitoring-constellation">
              <svg
                className="monitoring-connector-layer"
                viewBox="0 0 920 430"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <filter id="monitoringGlow">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <path
                  id="monitoringPathTopLeft"
                  className="monitoring-connector-path"
                  d="M 236 54 H 344 V 120 H 406"
                />
                <path
                  id="monitoringPathLeft"
                  className="monitoring-connector-path"
                  d="M 236 214 H 406"
                />
                <path
                  id="monitoringPathBottomLeft"
                  className="monitoring-connector-path"
                  d="M 236 374 H 344 V 308 H 406"
                />
                <path
                  id="monitoringPathTopRight"
                  className="monitoring-connector-path"
                  d="M 684 54 H 576 V 120 H 514"
                />
                <path
                  id="monitoringPathRight"
                  className="monitoring-connector-path"
                  d="M 684 214 H 514"
                />
                <path
                  id="monitoringPathBottomRight"
                  className="monitoring-connector-path"
                  d="M 684 374 H 576 V 308 H 514"
                />
                <path
                  className="monitoring-connector-path monitoring-connector-path-core"
                  d="M 406 214 H 442"
                />
                <path
                  className="monitoring-connector-path monitoring-connector-path-core"
                  d="M 478 214 H 514"
                />

                <circle className="monitoring-connector-orb" r="5" filter="url(#monitoringGlow)">
                  <animateMotion dur="3.1s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#monitoringPathTopLeft" />
                  </animateMotion>
                </circle>
                <circle className="monitoring-connector-orb" r="5" filter="url(#monitoringGlow)">
                  <animateMotion dur="3.35s" begin="0.35s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#monitoringPathLeft" />
                  </animateMotion>
                </circle>
                <circle className="monitoring-connector-orb" r="5" filter="url(#monitoringGlow)">
                  <animateMotion dur="3.15s" begin="0.75s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#monitoringPathBottomLeft" />
                  </animateMotion>
                </circle>
                <circle className="monitoring-connector-orb" r="5" filter="url(#monitoringGlow)">
                  <animateMotion dur="3.05s" begin="0.2s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#monitoringPathTopRight" />
                  </animateMotion>
                </circle>
                <circle className="monitoring-connector-orb" r="5" filter="url(#monitoringGlow)">
                  <animateMotion dur="3.3s" begin="0.55s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#monitoringPathRight" />
                  </animateMotion>
                </circle>
                <circle className="monitoring-connector-orb" r="5" filter="url(#monitoringGlow)">
                  <animateMotion dur="3.2s" begin="0.9s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#monitoringPathBottomRight" />
                  </animateMotion>
                </circle>
              </svg>

              <div className="monitoring-center">
                <div className="monitoring-hub">
                  <div className="monitoring-hub-copy">
                    <span>Parc monitoré</span>
                    <strong>{monitoredCount}</strong>
                    <small>{serverUnitLabel(monitoredCount)}</small>
                  </div>

                  <div className="monitoring-server-visual" aria-hidden="true">
                    <div className="monitoring-server-beacon" />
                    <div className="monitoring-server-stack">
                      <div className="monitoring-server-unit">
                        <span className="monitoring-server-slot" />
                        <div className="monitoring-server-lights">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <div className="monitoring-server-unit">
                        <span className="monitoring-server-slot" />
                        <div className="monitoring-server-lights">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <div className="monitoring-server-unit">
                        <span className="monitoring-server-slot" />
                        <div className="monitoring-server-lights">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="monitoring-hub-meta">
                    <div className="monitoring-hub-stat">
                      <span>Segments actifs</span>
                      <strong>{activeMonitoringSlices.length}</strong>
                    </div>
                    <div className="monitoring-hub-stat">
                      <span>Jobs</span>
                      <strong>{summaryQuery.data?.queuedJobCount ?? 0}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {monitoringSlices.map(renderMonitoringCallout)}
            </div>
          )}

          <div className="summary-grid monitoring-summary-grid">
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
            <article className="mini-summary">
              <span>Segments actifs</span>
              <strong>{activeMonitoringSlices.length}</strong>
            </article>
            <article className="mini-summary">
              <span>Dernier report</span>
              <strong>{formatDate(summaryQuery.data?.lastGlobalCheckAt)}</strong>
            </article>
          </div>
        </section>
      </section>
    </div>
  );
}
