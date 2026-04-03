import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { logout } from "../api/auth";
import { listCategories } from "../api/categories";
import { listServers } from "../api/servers";
import { buildDashboardSummary } from "../lib/presentation";
import {
  CATEGORIES_QUERY_STALE_TIME_MS,
  SERVERS_QUERY_REFETCH_INTERVAL_MS,
  SERVERS_QUERY_STALE_TIME_MS,
} from "../lib/query";

function LayoutLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
    >
      {label}
    </NavLink>
  );
}

export function AppLayout() {
  const queryClient = useQueryClient();
  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: listServers,
    staleTime: SERVERS_QUERY_STALE_TIME_MS,
    refetchInterval: SERVERS_QUERY_REFETCH_INTERVAL_MS,
  });
  const summary = useMemo(
    () => buildDashboardSummary(serversQuery.data ?? []),
    [serversQuery.data]
  );
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    staleTime: CATEGORIES_QUERY_STALE_TIME_MS,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["session"] });
      window.location.assign("/pulseops/login");
    },
  });

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <div className="brand-mark">P</div>
          <div>
            <p className="eyebrow">PulseOps</p>
            <h1>Console</h1>
          </div>
        </div>

        <nav className="app-nav">
          <LayoutLink to="/overview" label="Accueil" />
          <LayoutLink to="/servers" label="Parc" />
          <LayoutLink to="/agents" label="Agents" />
        </nav>

        <section className="sidebar-panel">
          <p className="section-kicker">Vue rapide</p>
          <div className="sidebar-metrics">
            <div>
              <span>Total</span>
              <strong>{summary.serverCount}</strong>
            </div>
            <div>
              <span>En ligne</span>
              <strong>{summary.onlineCount}</strong>
            </div>
            <div>
              <span>Offline</span>
              <strong>{summary.offlineCount}</strong>
            </div>
            <div>
              <span>Jobs</span>
              <strong>{summary.queuedJobCount}</strong>
            </div>
          </div>
        </section>

        <section className="sidebar-panel">
          <p className="section-kicker">Categories</p>
          <div className="sidebar-category-list">
            {(categoriesQuery.data ?? []).length === 0 ? (
              <p className="sidebar-category-empty">Aucune categorie</p>
            ) : (
              (categoriesQuery.data ?? []).map((category) => (
                <NavLink
                  key={category.id}
                  to={`/servers/categories/${category.id}`}
                  className={({ isActive }) =>
                    `sidebar-category-link ${isActive ? "active" : ""}`
                  }
                >
                  <span>{category.name}</span>
                  <strong>{category.serverCount}</strong>
                </NavLink>
              ))
            )}
          </div>
        </section>

        <button
          className="ghost-button sidebar-logout"
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Déconnexion..." : "Déconnexion"}
        </button>
      </aside>

      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
