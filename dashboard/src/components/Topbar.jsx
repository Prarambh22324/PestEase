import { Bell, ChevronDown, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Topbar({ connected, alertCount = 0 }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initials = user?.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AP";

  return (
    <header className="topbar">
      <div className="logo">
        <div className="logo-dot" />
        PestEase
      </div>

      <div className="farm-pill">
        Sunrise Farm — Field A <ChevronDown size={11} style={{ display: "inline", verticalAlign: "middle" }} />
      </div>

      <div className="spacer" />

      <div className="online-badge">
        {connected
          ? <><Wifi size={11} /> Rover online</>
          : <><WifiOff size={11} style={{ color: "var(--text3)" }} /> <span style={{ color: "var(--text3)" }}>Rover offline</span></>
        }
      </div>

      <div className="notif-btn" onClick={() => navigate("/alerts")}>
        <Bell size={14} color="var(--text2)" />
        {alertCount > 0 && <div className="notif-count">{alertCount}</div>}
      </div>

      <div className="avatar">{initials}</div>
    </header>
  );
}
