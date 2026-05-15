import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Leaf, AlertTriangle, Cpu, Map, Settings, LogOut, MessageSquare } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { label: "Overview",      icon: LayoutDashboard, to: "/"          },
  { label: "Scan Plant",    icon: Leaf,            to: "/scan"      },
  { label: "Alerts",        icon: AlertTriangle,   to: "/alerts",   badge: true },
  { label: "Rover Control", icon: Cpu,             to: "/rover"     },
  { label: "Farm Map",      icon: Map,             to: "/map"       },
  { label: "Expert Feedback", icon: MessageSquare, to: "/feedback"  },
];

export default function Sidebar({ alertCount = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AP";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="sidebar">
      <span className="sec-label">Main</span>

      {NAV.map(({ label, icon: Icon, to, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <Icon size={14} />
          {label}
          {badge && alertCount > 0 && (
            <span className="nav-badge">{alertCount}</span>
          )}
        </NavLink>
      ))}

      <span className="sec-label" style={{ marginTop: 6 }}>System</span>
      <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Settings size={14} />
        Settings
      </NavLink>

      <div className="sidebar-footer">
        <div className="user-row">
          <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>{user?.name || "Arjun Patel"}</div>
            <div style={{ fontSize: 10.5, color: "var(--text3)" }}>{user?.role || "farmer"}</div>
          </div>
        </div>
        <button className="nav-item" onClick={handleLogout} style={{ width: "100%", border: "none", cursor: "pointer", background: "none" }}>
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </nav>
  );
}
