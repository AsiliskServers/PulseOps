import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth } from "./components/AuthGate";

const AppLayout = lazy(async () => {
  const module = await import("./components/AppLayout");
  return { default: module.AppLayout };
});

const LoginPage = lazy(async () => {
  const module = await import("./pages/LoginPage");
  return { default: module.LoginPage };
});

const OverviewPage = lazy(async () => {
  const module = await import("./pages/OverviewPage");
  return { default: module.OverviewPage };
});

const ServersPage = lazy(async () => {
  const module = await import("./pages/ServersPage");
  return { default: module.ServersPage };
});

const ServerDetailPage = lazy(async () => {
  const module = await import("./pages/ServerDetailPage");
  return { default: module.ServerDetailPage };
});

const AgentsPage = lazy(async () => {
  const module = await import("./pages/AgentsPage");
  return { default: module.AgentsPage };
});

function RouteLoading() {
  return (
    <div className="fullscreen-shell">
      <div className="fullscreen-card">
        <p className="eyebrow">PulseOps</p>
        <h1>Chargement</h1>
        <p>Ouverture de l'interface...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/servers/categories/:categoryId" element={<ServersPage />} />
            <Route path="/servers/:serverId" element={<ServerDetailPage />} />
            <Route path="/agents" element={<AgentsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}
