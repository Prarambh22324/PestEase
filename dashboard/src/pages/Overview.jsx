import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Leaf, Droplets, AlertTriangle, Cpu } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { farmApi, alertsApi, predictApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useFarm } from "../context/FarmContext";

const SEV_LABELS = ["Healthy", "Mild", "Moderate", "Severe"];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8df", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontFamily: "var(--mono)" }}>
      <div style={{ color: "var(--text3)", marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function Overview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { farmId } = useFarm();

  const [stats, setStats]         = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, scansRes, alertsRes] = await Promise.allSettled([
          farmApi.stats(farmId),
          predictApi.history(farmId, 1),
          alertsApi.list(farmId),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data.stats);
        if (scansRes.status === "fulfilled") setRecentScans(scansRes.value.data.scans?.slice(0, 5) || []);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data.alerts?.slice(0, 3) || []);
      } catch (err) {
        console.error("Overview load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const unreadCount = alerts.filter(a => !a.read).length;

  const statCards = stats ? [
    { label: "Total Scans",     value: stats.total_scans,        unit: "",  delta: `${stats.healthy_count} healthy`, trend: "up",      color: "#4caf7d", icon: <Leaf size={32} /> },
    { label: "Infection Rate",  value: stats.infection_rate_pct, unit: "%", delta: `${stats.infected_count} infected`, trend: "down", color: "#f59e0b", icon: <AlertTriangle size={32} /> },
    { label: "Severe Cases",    value: stats.severe_count,       unit: "",  delta: "severity ≥ 3",  trend: "up",      color: "#ef4444", icon: <AlertTriangle size={32} /> },
    { label: "Spray Used",      value: stats.total_spray_ml,     unit: "mL", delta: "total dispensed", trend: "neutral", color: "#3b82f6", icon: <Droplets size={32} /> },
  ] : [];

  return (
    <main className="main-content">
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Farm Overview</div>
          <div className="page-sub">SUNRISE FARM · FIELD A · JAIPUR, RAJASTHAN</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/scan")}>
          <Leaf size={13} /> New Scan
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>
          Loading farm data…
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="stats-grid fade-in-d1">
            {statCards.map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-top" style={{ background: s.color }} />
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}<span className="stat-unit">{s.unit}</span></div>
                <div className="stat-delta" style={{ color: s.color }}>
                  {s.trend === "up"   && <TrendingUp  size={10} />}
                  {s.trend === "down" && <TrendingDown size={10} />}
                  {" "}{s.delta}
                </div>
                <div className="stat-icon">{s.icon}</div>
              </div>
            ))}
          </div>

          {/* Main grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }} className="fade-in-d2">
            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Recent Scans table */}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="card-header" style={{ padding: "14px 16px 10px" }}>
                  <span className="card-title">Recent Scans</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate("/scan")}>New scan</button>
                </div>
                {recentScans.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>
                    No scans yet — upload a leaf image to get started.
                  </div>
                ) : (
                  <table className="scan-table">
                    <thead>
                      <tr>
                        <th>Disease</th><th>Crop</th><th>Confidence</th>
                        <th>Severity</th><th>Dose</th><th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentScans.map((s, i) => (
                        <tr key={i}>
                          <td>{s.disease_label || "—"}</td>
                          <td className="mono">{s.crop_type || "—"}</td>
                          <td className="mono">{s.confidence ? `${s.confidence.toFixed(1)}%` : "—"}</td>
                          <td><span className={`sev-badge sev-${s.severity_level ?? 0}`}>{SEV_LABELS[s.severity_level ?? 0]}</span></td>
                          <td className="mono">{s.spray_dose_ml > 0 ? `${s.spray_dose_ml} mL/m²` : "—"}</td>
                          <td className="mono">{formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Rover widget */}
              <div className="card" style={{ background: "var(--green-light)", borderColor: "var(--green-dim)" }}>
                <div className="card-header">
                  <span className="card-title" style={{ color: "var(--green)" }}>ROVER-01</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--mono)", color: "var(--green)" }}>
                    <span className="online-dot" style={{ display: "inline-block" }} />ACTIVE
                  </span>
                </div>
                <div className="rover-grid">
                  {[
                    { label: "Battery",     value: "72%", bar: 72, barColor: "#4caf7d" },
                    { label: "Coverage",    value: "63%", bar: 63, barColor: "#3b82f6" },
                    { label: "Speed",       value: "0.4 m/s" },
                    { label: "Scans Today", value: recentScans.length.toString() },
                  ].map((t, i) => (
                    <div className="rover-tile" key={i}>
                      <div className="rover-tile-label">{t.label}</div>
                      <div className="rover-tile-val">{t.value}</div>
                      {t.bar !== undefined && (
                        <div className="batt-bar">
                          <div className="batt-fill" style={{ width: `${t.bar}%`, background: t.barColor }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => navigate("/rover")}>
                  <Cpu size={12} /> Open Rover Control
                </button>
              </div>

              {/* Alerts */}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="card-header" style={{ padding: "12px 14px 8px" }}>
                  <span className="card-title">Recent Alerts</span>
                  {unreadCount > 0 && (
                    <span style={{ fontSize: 11, color: "var(--red)", fontFamily: "var(--mono)" }}>{unreadCount} unread</span>
                  )}
                </div>
                {alerts.length === 0 ? (
                  <div style={{ padding: "16px 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>No alerts yet.</div>
                ) : alerts.map((a, i) => {
                  const bgMap = { 3: "#fdecea", 2: "#fef3c7", 1: "#f0fdf4", 0: "var(--green-light)" };
                  const iconMap = { 3: "🚨", 2: "🔶", 1: "⚠️", 0: "✅" };
                  return (
                    <div className="alert-row" key={i}>
                      <div className="alert-icon" style={{ background: bgMap[a.severity] ?? bgMap[0], fontSize: 13 }}>{iconMap[a.severity] ?? "ℹ️"}</div>
                      <div className="alert-body">
                        <div className="alert-title">{a.Scan?.disease_label || a.type}</div>
                        <div className="alert-meta">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</div>
                      </div>
                      {!a.read && <div className="unread-dot" />}
                    </div>
                  );
                })}
                <div style={{ padding: "10px 14px" }}>
                  <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => navigate("/alerts")}>
                    View all alerts
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
