import { Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth } from "./components/AuthGate";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}
