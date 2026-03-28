import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { GuestOnly, RequireAuth } from "./components/AuthGate";
import { AgentsPage } from "./pages/AgentsPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ServerDetailPage } from "./pages/ServerDetailPage";
import { ServersPage } from "./pages/ServersPage";

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/servers/:serverId" element={<ServerDetailPage />} />
          <Route path="/agents" element={<AgentsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
