import { useState, useEffect } from "react";
import { CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { alertsApi } from "../services/api";
import { useFarm } from "../context/FarmContext";
import { useAlertCount } from "../context/AlertCountContext";

const SEV_CONFIG = {
  3: { label: "Severe",   bg: "#fdecea", color: "var(--red)"   },
  2: { label: "Moderate", bg: "#fef3c7", color: "var(--amber)" },
  1: { label: "Mild",     bg: "#f0fdf4", color: "#166534"      },
  0: { label: "Info",     bg: "var(--green-light)", color: "var(--green)" },
};

const SEV_ICONS = { 3: "🚨", 2: "🔶", 1: "⚠️", 0: "✅" };
const FILTERS = ["All", "Unread", "Severe", "Moderate", "Mild"];

export default function Alerts() {
  const { farmId } = useFarm();
  const { refresh } = useAlertCount();

  const [alerts, setAlerts]   = useState([]);
  const [filter, setFilter]   = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!farmId) { setLoading(false); return; }
    alertsApi.list(farmId)
      .then(res => setAlerts(res.data.alerts || []))
      .catch(err => setError(err.response?.data?.error || "Failed to load alerts."))
      .finally(() => setLoading(false));
  }, [farmId]);

  const unreadCount = alerts.filter(a => !a.read).length;

  const filtered = alerts.filter(a => {
    if (filter === "Unread")   return !a.read;
    if (filter === "Severe")   return a.severity === 3;
    if (filter === "Moderate") return a.severity === 2;
    if (filter === "Mild")     return a.severity === 1;
    return true;
  });

  const markRead = async (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
    try {
      await alertsApi.markRead(id);
      refresh();
    } catch {
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: false } : a));
    }
  };

  const markAllRead = async () => {
    const unread = alerts.filter(a => !a.read);
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    try {
      await Promise.all(unread.map(a => alertsApi.markRead(a.id)));
      refresh();
    } catch {
      // best effort
    }
  };

  return (
    <main className="main-content">
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-sub">{unreadCount} UNREAD · {alerts.length} TOTAL</div>
        </div>
        <button className="btn btn-ghost" onClick={markAllRead} disabled={unreadCount === 0}>
          <CheckCheck size={13} /> Mark all read
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }} className="fade-in-d1">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card fade-in-d2" style={{ padding: 0, overflow: "hidden" }}>
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 12 }}>
            Loading alerts…
          </div>
        )}
        {error && (
          <div style={{ padding: 20, color: "var(--red)", fontFamily: "var(--mono)", fontSize: 12, background: "var(--red-bg)" }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 12 }}>
            {alerts.length === 0
              ? "No alerts yet — alerts appear when the rover detects disease."
              : "No alerts match this filter."}
          </div>
        )}
        {filtered.map(alert => {
          const sev = alert.severity ?? 0;
          const cfg = SEV_CONFIG[sev] || SEV_CONFIG[0];
          return (
            <div
              key={alert.id}
              className="alert-row"
              style={{ alignItems: "center", background: !alert.read ? "#fafcfa" : undefined }}
              onClick={() => markRead(alert.id)}
            >
              <div className="alert-icon" style={{ background: cfg.bg, fontSize: 14 }}>
                {SEV_ICONS[sev] ?? "ℹ️"}
              </div>
              <div className="alert-body">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span className="alert-title">{alert.Scan?.disease_label || alert.type || "Alert"}</span>
                  <span className={`sev-badge sev-${sev}`}>{cfg.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 2 }}>{alert.message}</div>
                <div className="alert-meta">
                  {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                </div>
              </div>
              {!alert.read && <div className="unread-dot" />}
            </div>
          );
        })}
      </div>
    </main>
  );
}
