import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getSummary, listServers } from "../api/servers";
import type { DashboardSummary, ServerSummary } from "../types";
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

type ConnectorAnimation = {
  pathId: string;
  duration: string;
  begin: string;
};

type TvBanner = {
  title: string;
  body: string;
  tone: "ok" | "pending" | "critical" | "neutral";
};

type TvSignal = {
  label: string;
  tone: "ok" | "pending" | "critical" | "neutral" | "live";
};

function serverUnitLabel(count: number) {
  return count > 1 ? "serveurs" : "serveur";
}

function randomConnectorAnimations(): ConnectorAnimation[] {
  return [
    "monitoringPathTopLeft",
    "monitoringPathLeft",
    "monitoringPathBottomLeft",
    "monitoringPathTopRight",
    "monitoringPathRight",
    "monitoringPathBottomRight",
  ].map((pathId) => ({
    pathId,
    duration: `${(2.9 + Math.random() * 1.1).toFixed(2)}s`,
    begin: `${(Math.random() * 1.8).toFixed(2)}s`,
  }));
}

function buildMonitoringSlices(servers: ServerSummary[]): MonitoringSlice[] {
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

  return monitoringSlices;
}

function getServerPriorityScore(server: ServerSummary) {
  if (server.pendingJobsCount > 0) {
    return 100;
  }

  if (server.latestJob?.status === "failed") {
    return 95;
  }

  if (server.connectivityStatus === "offline") {
    return 90;
  }

  if (!server.latestSnapshot) {
    return 82;
  }

  if (!server.latestSnapshot.reachable) {
    return 80;
  }

  if (server.latestSnapshot.securityCount > 0) {
    return 74;
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return 62;
  }

  if (server.connectivityStatus === "stale") {
    return 54;
  }

  return 20;
}

function resolveTvSignal(server: ServerSummary): TvSignal {
  if (server.pendingJobsCount > 0) {
    return { label: "En direct", tone: "live" };
  }

  if (server.latestJob?.status === "failed") {
    return { label: "Échec récent", tone: "critical" };
  }

  if (!server.latestSnapshot) {
    return { label: "Sans report", tone: "neutral" };
  }

  if (server.connectivityStatus === "offline" || !server.latestSnapshot.reachable) {
    return { label: "Hors ligne", tone: "critical" };
  }

  if (server.latestSnapshot.securityCount > 0) {
    return { label: "Sécurité", tone: "critical" };
  }

  if (server.latestSnapshot.upgradableCount > 0) {
    return { label: "MàJ dispo", tone: "pending" };
  }

  if (server.connectivityStatus === "stale") {
    return { label: "À surveiller", tone: "pending" };
  }

  return { label: "Stable", tone: "ok" };
}

function resolveTvWallAccent(stateLabel: string): "default" | "pending" | "critical" {
  if (stateLabel === "MàJ en attente") {
    return "pending";
  }

  if (stateLabel === "Sécurité") {
    return "critical";
  }

  return "default";
}

function resolveTvBanner(summary: DashboardSummary | undefined): TvBanner {
  if (!summary || summary.serverCount === 0) {
    return {
      title: "Parc vide",
      body: "Ajoute un premier serveur pour activer la supervision TV.",
      tone: "neutral",
    };
  }

  if (summary.queuedJobCount > 0) {
    return {
      title: `${summary.queuedJobCount} job${summary.queuedJobCount > 1 ? "s" : ""} en cours`,
      body: "Un ou plusieurs serveurs remontent actuellement un refresh, un upgrade ou une mise à jour agent.",
      tone: "pending",
    };
  }

  if (summary.securityUpdateCount > 0) {
    return {
      title: `${summary.securityUpdateCount} serveur${summary.securityUpdateCount > 1 ? "s" : ""} avec correctifs sécurité`,
      body: "Des correctifs sécurité sont disponibles et doivent être traités en priorité.",
      tone: "critical",
    };
  }

  if (summary.pendingUpdateCount > 0) {
    return {
      title: `${summary.pendingUpdateCount} serveur${summary.pendingUpdateCount > 1 ? "s" : ""} avec mises à jour`,
      body: "Des mises à jour sont en attente hors sécurité.",
      tone: "pending",
    };
  }

  if (summary.offlineCount > 0) {
    return {
      title: `${summary.offlineCount} serveur${summary.offlineCount > 1 ? "s" : ""} hors ligne`,
      body: "Une partie du parc ne remonte plus correctement ses informations.",
      tone: "critical",
    };
  }

  if (summary.staleCount > 0) {
    return {
      title: `${summary.staleCount} serveur${summary.staleCount > 1 ? "s" : ""} à surveiller`,
      body: "Certains reports datent un peu et méritent une vérification rapide.",
      tone: "pending",
    };
  }

  return {
    title: "Parc stable",
    body: "Tous les serveurs remontent correctement et aucune mise à jour n'est en attente.",
    tone: "ok",
  };
}

function renderMonitoringCallout(slice: MonitoringSlice, monitoredCount: number) {
  const percentage = monitoredCount > 0 ? Math.round((slice.count / monitoredCount) * 100) : 0;

  return (
    <article
      key={slice.key}
      className={`monitoring-callout ${slice.position} ${slice.count > 0 ? "has-value" : "is-empty"}`}
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

export function OverviewPage() {
  const [connectorAnimations] = useState(randomConnectorAnimations);
  const [searchParams, setSearchParams] = useSearchParams();

  const tvMode = searchParams.get("mode") === "tv";

  useEffect(() => {
    if (!tvMode) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [tvMode]);

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
  const highlightedServers = [...servers]
    .sort(
      (left, right) =>
        getServerPriorityScore(right) - getServerPriorityScore(left) ||
        left.name.localeCompare(right.name, "fr")
    )
    .slice(0, 6);
  const tvWallServers = [...servers].sort(
    (left, right) =>
      getServerPriorityScore(right) - getServerPriorityScore(left) ||
      left.name.localeCompare(right.name, "fr")
  );
  const monitoringSlices = buildMonitoringSlices(servers);
  const monitoredCount = monitoringSlices.reduce((total, slice) => total + slice.count, 0);
  const activeMonitoringSlices = monitoringSlices.filter((slice) => slice.count > 0);
  const tvBanner = resolveTvBanner(summaryQuery.data);
  const currentTimeLabel = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  function toggleTvMode() {
    const next = new URLSearchParams(searchParams);

    if (tvMode) {
      next.delete("mode");
    } else {
      next.set("mode", "tv");
    }

    setSearchParams(next, { replace: true });
  }

  const monitoringPanel = (
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

            {connectorAnimations.map((animation) => (
              <circle
                key={animation.pathId}
                className="monitoring-connector-orb"
                r="5"
                filter="url(#monitoringGlow)"
              >
                <animateMotion
                  dur={animation.duration}
                  begin={animation.begin}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#${animation.pathId}`} />
                </animateMotion>
              </circle>
            ))}
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

          {monitoringSlices.map((slice) => renderMonitoringCallout(slice, monitoredCount))}
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
  );

  const prioritiesPanel = (
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
  );

  const tvOverlay = tvMode ? (
    <div className="tv-overlay">
      <div className="tv-shell">
        <section className="tv-hero panel">
          <div className="tv-hero-copy">
            <p className="section-kicker">Monitoring permanent</p>
            <h2>Vue TV du parc PulseOps</h2>
            <p className="page-copy">
              Affichage continu du parc, des alertes et des serveurs qui demandent une action.
            </p>
          </div>
          <div className="tv-clock-card">
            <span>Horodatage</span>
            <strong>{currentTimeLabel}</strong>
          </div>
        </section>

        <section className={`tv-banner tv-banner-${tvBanner.tone}`}>
          <div>
            <strong>{tvBanner.title}</strong>
            <p>{tvBanner.body}</p>
          </div>
          <div className="tv-banner-metrics">
            <div>
              <span>Dernier report</span>
              <strong>{formatDate(summaryQuery.data?.lastGlobalCheckAt)}</strong>
            </div>
            <div>
              <span>Production</span>
              <strong>{productionCount}</strong>
            </div>
          </div>
        </section>

        <section className="tv-metrics-grid">
          <article className="tv-metric-card">
            <span>Total serveurs</span>
            <strong>{summaryQuery.data?.serverCount ?? 0}</strong>
          </article>
          <article className="tv-metric-card">
            <span>En ligne</span>
            <strong>{summaryQuery.data?.onlineCount ?? 0}</strong>
          </article>
          <article className="tv-metric-card">
            <span>À jour</span>
            <strong>{summaryQuery.data?.upToDateCount ?? 0}</strong>
          </article>
          <article className="tv-metric-card">
            <span>MàJ en attente</span>
            <strong>{summaryQuery.data?.pendingUpdateCount ?? 0}</strong>
          </article>
          <article className="tv-metric-card">
            <span>Sécurité</span>
            <strong>{summaryQuery.data?.securityUpdateCount ?? 0}</strong>
          </article>
          <article className="tv-metric-card">
            <span>Jobs</span>
            <strong>{summaryQuery.data?.queuedJobCount ?? 0}</strong>
          </article>
        </section>

        <section className="tv-main-grid">
          <div className="tv-stack">
            {monitoringPanel}

            <section className="panel tv-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Direct</p>
                  <h3>Priorités live</h3>
                </div>
              </div>

              <div className="tv-priority-list">
                {highlightedServers.length === 0 ? (
                  <div className="empty-state">Aucune alerte en direct.</div>
                ) : (
                  highlightedServers.map((server) => {
                    const state = resolveServerState(server);
                    const signal = resolveTvSignal(server);
                    return (
                      <div key={server.id} className="tv-priority-row">
                        <div className="tv-priority-main">
                          <strong>{server.name}</strong>
                          <p>{server.hostname ?? "Hostname inconnu"}</p>
                        </div>
                        <div className="tv-priority-side">
                          <span className={`server-badge ${state.tone}`}>{state.label}</span>
                          <span className={`tv-server-live is-${signal.tone}`}>
                            <span className="tv-server-live-dot" aria-hidden="true" />
                            {signal.label}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <section className="panel tv-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Parc</p>
                <h3>Mur de supervision</h3>
              </div>
            </div>

            <div className="tv-server-wall">
              {tvWallServers.length === 0 ? (
                <div className="empty-state">Aucun serveur à afficher.</div>
              ) : (
                tvWallServers.map((server) => {
                  const state = resolveServerState(server);
                  const signal = resolveTvSignal(server);
                  const wallAccent = resolveTvWallAccent(state.label);

                  return (
                    <article key={server.id} className={`tv-server-card wall-${wallAccent}`}>
                      <div className="tv-server-card-head">
                        <div className="tv-server-name">
                          <strong>{server.name}</strong>
                          <p>{server.hostname ?? "Hostname inconnu"}</p>
                        </div>
                        <div className={`tv-server-live is-${signal.tone}`}>
                          <span className="tv-server-live-dot" aria-hidden="true" />
                          {signal.label}
                        </div>
                      </div>

                      <div className="tv-server-badges">
                        <span className={`server-badge ${state.tone}`}>{state.label}</span>
                        <span className="status-pill neutral">{server.environment}</span>
                      </div>

                      <div className="tv-server-metrics">
                        <div>
                          <span>Updates</span>
                          <strong>{server.latestSnapshot?.upgradableCount ?? 0}</strong>
                        </div>
                        <div>
                          <span>Sécurité</span>
                          <strong>{server.latestSnapshot?.securityCount ?? 0}</strong>
                        </div>
                        <div>
                          <span>Jobs</span>
                          <strong>{server.pendingJobsCount}</strong>
                        </div>
                      </div>

                      <div className="tv-server-meta">
                        <span>{server.connectivityStatus}</span>
                        <span>{formatDate(server.lastSeenAt ?? server.lastReportAt)}</span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </section>
      </div>
    </div>
  ) : null;

  return (
    <>
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
          {prioritiesPanel}
          {monitoringPanel}
        </section>
      </div>

      {tvOverlay}

      <button
        className={`primary-button tv-mode-switch ${tvMode ? "active" : ""}`}
        type="button"
        onClick={toggleTvMode}
      >
        {tvMode ? "Quitter mode TV" : "Mode TV"}
      </button>
    </>
  );
}
