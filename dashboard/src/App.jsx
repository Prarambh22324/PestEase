import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useState, useEffect, createContext, useContext } from "react";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { FarmProvider, useFarm } from "./context/FarmContext";
import { useSocket }             from "./hooks/useSocket";
import { alertsApi }            from "./services/api";

import Topbar    from "./components/Topbar";
import Sidebar   from "./components/Sidebar";

import Login     from "./pages/Login";
import Overview  from "./pages/Overview";
import ScanPlant from "./pages/ScanPlant";
import Alerts    from "./pages/Alerts";
import Rover     from "./pages/Rover";
import FarmMap   from "./pages/FarmMap";
import Settings  from "./pages/Settings";
import Feedback  from "./pages/Feedback";

import "./index.css";

import { AlertCountContext } from "./context/AlertCountContext";

function AppShell() {
  const { user } = useAuth();
  const { farmId, loading: farmLoading } = useFarm();
  const [alertCount, setAlertCount] = useState(0);
  const { connected, newAlert } = useSocket(farmId);

  const refreshAlertCount = () => {
    if (!farmId) return;
    alertsApi.list(farmId)
      .then(res => {
        const unread = (res.data.alerts || []).filter(a => !a.read).length;
        setAlertCount(unread);
      })
      .catch(() => {});
  };

  useEffect(() => { if (farmId) refreshAlertCount(); }, [farmId]);
  useEffect(() => { if (newAlert) setAlertCount(n => n + 1); }, [newAlert]);

  if (!user) return <Navigate to="/login" replace />;

  if (farmLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>
        Loading farm…
      </div>
    );
  }

  return (
    <AlertCountContext.Provider value={{ count: alertCount, refresh: refreshAlertCount }}>
      <div className="app-shell">
        <Topbar connected={connected} alertCount={alertCount} />
        <Sidebar alertCount={alertCount} />
        <Routes>
          <Route path="/"         element={<Overview />} />
          <Route path="/scan"     element={<ScanPlant />} />
          <Route path="/alerts"   element={<Alerts />} />
          <Route path="/rover"    element={<Rover />} />
          <Route path="/map"      element={<FarmMap />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AlertCountContext.Provider>
  );
}

function AuthGate() {
  const { user } = useAuth();
  return (
    <FarmProvider user={user}>
      <AppShell />
    </FarmProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#fff",
              color: "var(--text)",
              border: "1px solid var(--border)",
              fontFamily: "var(--mono)",
              fontSize: 12,
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*"     element={<AuthGate />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
