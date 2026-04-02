import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getMe } from "../api/auth";
import { SESSION_QUERY_STALE_TIME_MS } from "../lib/query";

function FullScreenState({ title, body }: { title: string; body: string }) {
  return (
    <div className="fullscreen-shell">
      <div className="fullscreen-card">
        <p className="eyebrow">PulseOps</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </div>
  );
}

export function RequireAuth() {
  const location = useLocation();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getMe,
    staleTime: SESSION_QUERY_STALE_TIME_MS,
  });

  if (sessionQuery.isLoading) {
    return <FullScreenState title="Chargement" body="Vérification de votre accès..." />;
  }

  if (sessionQuery.isError) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestOnly() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getMe,
    staleTime: SESSION_QUERY_STALE_TIME_MS,
  });

  if (sessionQuery.isLoading) {
    return <FullScreenState title="Chargement" body="Ouverture de la session PulseOps..." />;
  }

  if (sessionQuery.data) {
    return <Navigate to="/overview" replace />;
  }

  return <Outlet />;
}
