import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSummary, listServers } from "../api/servers";
import { formatDate, resolveServerState } from "../lib/presentation";

export function ServersPage() {
  const [search, setSearch] = useState("");
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

  const servers =
    serversQuery.data?.filter((server) => {
      const haystack =
        `${server.name} ${server.environment} ${server.notes ?? ""} ${server.hostname ?? ""} ${
          server.osName ?? ""
        }`.toLowerCase();
      return haystack.includes(deferredSearch);
    }) ?? [];

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

        <div className="table-head">
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
                <Link key={server.id} to={`/servers/${server.id}`} className="table-row">
                  <div>
                    <strong>{server.name}</strong>
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
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
