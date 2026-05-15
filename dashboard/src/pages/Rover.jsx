import { useState, useEffect } from "react";
import { Cpu, Wifi, Droplets, Play, Square } from "lucide-react";
import toast from "react-hot-toast";
import { roverApi } from "../services/api";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../context/AuthContext";
import { useFarm } from "../context/FarmContext";

const EVENT_COLORS = {
  scan:     "#4caf7d",
  spray:    "#3b82f6",
  navigate: "#9ca3af",
  error:    "#ef4444",
  manual_spray_command: "#f59e0b",
  telemetry: "#9ca3af",
  spray_complete: "#4caf7d",
};

function TelemetryTile({ label, value, bar, barColor }) {
  return (
    <div className="rover-tile">
      <div className="rover-tile-label">{label}</div>
      <div className="rover-tile-val">{value}</div>
      {bar !== undefined && (
        <div className="batt-bar">
          <div className="batt-fill" style={{ width: `${bar}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
}

export default function Rover() {
  const { user } = useAuth();
  const { farmId } = useFarm();
  const { connected, roverTelemetry, sprayComplete } = useSocket(farmId);

  const [status, setStatus]           = useState("active");
  const [sprayLocation, setSprayLocation] = useState("");
  const [sprayDose, setSprayDose]     = useState(15);
  const [sending, setSending]         = useState(false);
  const [logs, setLogs]               = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Load historical logs
  useEffect(() => {
    if (farmId) roverApi.logs(farmId)
      .then(res => setLogs(res.data.logs || []))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, []);

  // Prepend new spray_complete events from WebSocket
  useEffect(() => {
    if (!sprayComplete) return;
    setLogs(prev => [{
      id: Date.now(),
      event: "spray_complete",
      payload: sprayComplete,
      createdAt: sprayComplete.timestamp,
    }, ...prev]);
  }, [sprayComplete]);

  // Live telemetry from socket
  const telemetry = roverTelemetry || {};

  const handleSpray = async () => {
    if (!sprayLocation.trim()) {
      toast.error("Enter a target location first.");
      return;
    }
    setSending(true);
    try {
      await roverApi.manualSpray({
        farm_id: farmId,
        rover_id: "ROVER-01",
        location: sprayLocation,
        dose_ml: parseFloat(sprayDose),
      });
      toast.success(`Spray command sent — ${sprayDose} mL`);
      // Add to local log immediately
      setLogs(prev => [{
        id: Date.now(),
        event: "manual_spray_command",
        payload: { target_location: sprayLocation, dose_ml: sprayDose },
        createdAt: new Date().toISOString(),
      }, ...prev]);
      setSprayLocation("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to send spray command.");
    } finally {
      setSending(false);
    }
  };

  const statusConfig = {
    active:  { label: "ACTIVE",  dotColor: "var(--green-mid)", textColor: "var(--green)" },
    paused:  { label: "PAUSED",  dotColor: "var(--amber)",     textColor: "var(--amber)" },
    stopped: { label: "STOPPED", dotColor: "var(--red)",       textColor: "var(--red)"   },
  };
  const sc = statusConfig[status];

  const formatLogMsg = (log) => {
    const p = log.payload || {};
    switch (log.event) {
      case "manual_spray_command": return `Manual spray → ${p.target_location || "—"} · ${p.dose_ml} mL`;
      case "spray_complete":       return `Spray complete · ${p.dose_dispensed_ml ?? p.dose_ml ?? "—"} mL dispensed`;
      case "telemetry":            return `GPS ${log.location?.lat?.toFixed(4)}°N, ${log.location?.lng?.toFixed(4)}°E · Batt ${p.battery_pct}%`;
      default:                     return log.event;
    }
  };

  return (
    <main className="main-content">
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Rover Control</div>
          <div className="page-sub">ROVER-01 · FIELD A · {connected ? "LIVE TELEMETRY" : "OFFLINE"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {status === "active" && (
            <button className="btn btn-ghost" onClick={() => setStatus("paused")}>
              <Square size={12} /> Pause
            </button>
          )}
          {status === "paused" && (
            <button className="btn btn-primary" onClick={() => setStatus("active")}>
              <Play size={12} /> Resume
            </button>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => setStatus("stopped")}>
            <Square size={12} /> E-Stop
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Left col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Live Status */}
          <div className="card fade-in-d1">
            <div className="card-header">
              <span className="card-title">Live Status</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--mono)", color: sc.textColor }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dotColor, display: "inline-block" }} />
                {sc.label}
              </span>
            </div>
            <div className="rover-grid">
              <TelemetryTile label="Battery"       value={telemetry.battery_pct ? `${telemetry.battery_pct}%` : "—"}   bar={telemetry.battery_pct} barColor="#4caf7d" />
              <TelemetryTile label="Temperature"   value={telemetry.sensors?.temp_c ? `${telemetry.sensors.temp_c}°C` : "—"} />
              <TelemetryTile label="Humidity"      value={telemetry.sensors?.humidity_pct ? `${telemetry.sensors.humidity_pct}%` : "—"} bar={telemetry.sensors?.humidity_pct} barColor="#3b82f6" />
              <TelemetryTile label="Soil Moisture" value={telemetry.sensors?.soil_moisture ? `${telemetry.sensors.soil_moisture}%` : "—"} bar={telemetry.sensors?.soil_moisture} barColor="#f59e0b" />
            </div>
          </div>

          {/* GPS */}
          <div className="card fade-in-d1">
            <div className="card-header">
              <span className="card-title">GPS Position</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Wifi size={12} color={connected ? "var(--green-mid)" : "var(--text3)"} />
                <span className="tag">{connected ? "LIVE" : "OFFLINE"}</span>
              </span>
            </div>
            <div className="map-box" style={{ height: 160 }}>
              <div className="map-grid-bg" />
              <div className="map-content">
                <div style={{ fontSize: 22, marginBottom: 6 }}>📍</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--green)", fontWeight: 500 }}>
                  {telemetry.location
                    ? `${telemetry.location.lat?.toFixed(4)}°N, ${telemetry.location.lng?.toFixed(4)}°E`
                    : "Waiting for GPS…"}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 4 }}>
                  {connected ? "Live position" : "Connect rover to see position"}
                </div>
              </div>
            </div>
          </div>

          {/* Manual Spray */}
          <div className="card fade-in-d2">
            <div className="card-header">
              <span className="card-title">Manual Spray Override</span>
              <span style={{ fontSize: 11, color: "var(--amber)", fontFamily: "var(--mono)" }}>⚠ use with caution</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>Target Location</div>
                <input className="input-field" placeholder="e.g. Row 14, Plot B"
                  value={sprayLocation} onChange={e => setSprayLocation(e.target.value)} />
              </div>
              <div style={{ width: 84 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>Dose (mL)</div>
                <input className="input-field" type="number" value={sprayDose}
                  onChange={e => setSprayDose(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={handleSpray} disabled={sending} style={{ whiteSpace: "nowrap" }}>
                <Droplets size={13} />
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* Right col — event log */}
        <div className="card fade-in-d2" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 560 }}>
          <div className="card-header" style={{ padding: "14px 16px 10px", flexShrink: 0 }}>
            <span className="card-title">Event Log</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>
              {connected && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green-mid)", display: "inline-block", marginRight: 4, animation: "pulse 1.5s infinite" }} />
              )}
              {connected ? "LIVE" : "HISTORICAL"}
            </span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {logsLoading && (
              <div style={{ padding: 20, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", textAlign: "center" }}>Loading logs…</div>
            )}
            {!logsLoading && logs.length === 0 && (
              <div style={{ padding: 20, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", textAlign: "center" }}>No events yet.</div>
            )}
            {logs.map((log, i) => (
              <div className="log-row" key={log.id || i}>
                <div className="log-time">
                  {new Date(log.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div className="log-dot" style={{ background: EVENT_COLORS[log.event] || "#9ca3af" }} />
                <div>
                  <div className="log-event" style={{ color: EVENT_COLORS[log.event] || "#9ca3af" }}>{log.event}</div>
                  <div className="log-msg">{formatLogMsg(log)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
