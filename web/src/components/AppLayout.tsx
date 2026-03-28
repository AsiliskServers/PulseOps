import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { logout } from "../api/auth";
import { getSummary } from "../api/servers";

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
  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: getSummary,
    refetchInterval: 5000,
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
              <strong>{summaryQuery.data?.serverCount ?? 0}</strong>
            </div>
            <div>
              <span>En ligne</span>
              <strong>{summaryQuery.data?.onlineCount ?? 0}</strong>
            </div>
            <div>
              <span>Offline</span>
              <strong>{summaryQuery.data?.offlineCount ?? 0}</strong>
            </div>
            <div>
              <span>Jobs</span>
              <strong>{summaryQuery.data?.queuedJobCount ?? 0}</strong>
            </div>
          </div>
        </section>

        <button
          className="ghost-button sidebar-logout"
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Deconnexion..." : "Deconnexion"}
        </button>
      </aside>

      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
