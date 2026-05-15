import { useEffect, useRef, useState } from "react";
import { Navigation, Layers } from "lucide-react";

// ── Data ───────────────────────────────────────────────
const FARM_CENTER = [26.9117, 75.7881];

const PLOTS = [
  { id: "plot-a", name: "Plot A", sev: 2, status: "3 infected", coverage: 80,
    bounds: [[26.9130, 75.7860],[26.9130, 75.7880],[26.9118, 75.7880],[26.9118, 75.7860]],
    color: "f59e0b", fillColor: "fef9c3" },
  { id: "plot-b", name: "Plot B", sev: 3, status: "7 infected", coverage: 63,
    bounds: [[26.9130, 75.7882],[26.9130, 75.7902],[26.9118, 75.7902],[26.9118, 75.7882]],
    color: "ef4444", fillColor: "fee2e2" },
  { id: "plot-c", name: "Plot C", sev: 1, status: "1 infected", coverage: 45,
    bounds: [[26.9116, 75.7860],[26.9116, 75.7880],[26.9104, 75.7880],[26.9104, 75.7860]],
    color: "4caf7d", fillColor: "dcfce7" },
  { id: "plot-d", name: "Plot D", sev: 0, status: "Healthy",    coverage: 20,
    bounds: [[26.9116, 75.7882],[26.9116, 75.7902],[26.9104, 75.7902],[26.9104, 75.7882]],
    color: "4caf7d", fillColor: "e8f5ee" },
];

const SCANS = [
  { lat: 26.9125, lng: 75.7890, sev: 3, disease: "Late Blight",  crop: "Tomato", conf: 97.4 },
  { lat: 26.9122, lng: 75.7886, sev: 2, disease: "Leaf Mold",    crop: "Tomato", conf: 88.6 },
  { lat: 26.9119, lng: 75.7893, sev: 2, disease: "Leaf Mold",    crop: "Tomato", conf: 85.1 },
  { lat: 26.9128, lng: 75.7875, sev: 2, disease: "Early Blight", crop: "Potato", conf: 91.2 },
  { lat: 26.9121, lng: 75.7870, sev: 1, disease: "Early Blight", crop: "Potato", conf: 78.4 },
  { lat: 26.9114, lng: 75.7865, sev: 0, disease: "Healthy",      crop: "Pepper", conf: 99.1 },
  { lat: 26.9110, lng: 75.7872, sev: 0, disease: "Healthy",      crop: "Pepper", conf: 96.3 },
  { lat: 26.9107, lng: 75.7895, sev: 0, disease: "Healthy",      crop: "Tomato", conf: 98.0 },
  { lat: 26.9126, lng: 75.7897, sev: 3, disease: "Late Blight",  crop: "Tomato", conf: 95.7 },
  { lat: 26.9123, lng: 75.7900, sev: 2, disease: "Leaf Mold",    crop: "Tomato", conf: 84.2 },
];

const ROVER_PATH = [
  [26.9104,75.7862],[26.9108,75.7862],[26.9112,75.7862],[26.9116,75.7862],[26.9120,75.7862],[26.9124,75.7862],
  [26.9124,75.7866],[26.9120,75.7866],[26.9116,75.7866],[26.9112,75.7866],[26.9108,75.7866],[26.9104,75.7866],
  [26.9104,75.7870],[26.9108,75.7870],[26.9112,75.7870],[26.9116,75.7870],[26.9120,75.7870],[26.9124,75.7870],
  [26.9124,75.7874],[26.9120,75.7874],[26.9116,75.7874],
];
const ROVER_POS = ROVER_PATH[ROVER_PATH.length - 1];

const SEV_HEX    = { 0: "4caf7d", 1: "22c55e", 2: "f59e0b", 3: "ef4444" };
const SEV_CSS    = { 0: "#4caf7d", 1: "#22c55e", 2: "#f59e0b", 3: "#ef4444" };
const SEV_LABELS = ["Healthy", "Mild", "Moderate", "Severe"];
const COV_COLORS = ["#4caf7d", "#3b82f6", "#f59e0b", "#9ca3af"];

export default function FarmMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef  = useRef(null);
  const pathLayerRef    = useRef(null);
  const [ready,       setReady]       = useState(false);
  const [satellite,   setSatellite]   = useState(false);
  const [showPath,    setShowPath]    = useState(true);
  const [selected,    setSelected]    = useState(null);

  // ── Bootstrap Leaflet ──────────────────────────────
  useEffect(() => {
    // CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const init = () => {
      if (mapInstanceRef.current || !mapContainerRef.current) return;
      buildMap();
    };

    if (window.L) { init(); }
    else {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = init;
      document.head.appendChild(s);
    }

    // Tooltip styles
    const style = document.createElement("style");
    style.id = "fe-map-styles";
    if (!document.getElementById("fe-map-styles")) {
      style.textContent = `
        .fe-tip { background:#fff!important; border:1px solid #e2e8df!important; border-radius:6px!important;
                  padding:4px 9px!important; font-size:12px!important; box-shadow:0 2px 8px rgba(0,0,0,.08)!important; }
        .fe-tip::before { display:none!important; }
      `;
      document.head.appendChild(style);
    }

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  function buildMap() {
    const L   = window.L;
    const map = L.map(mapContainerRef.current, { center: FARM_CENTER, zoom: 17, zoomControl: true });
    mapInstanceRef.current = map;

    // Street tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 20,
    }).addTo(map);

    // Plot polygons
    PLOTS.forEach((p) => {
      L.polygon(p.bounds, {
        color: "#" + p.color, fillColor: "#" + p.fillColor, fillOpacity: 0.5, weight: 2,
      }).addTo(map).bindTooltip(
        `<b style="font-family:DM Sans,sans-serif">${p.name}</b><br>
         <span style="font-family:DM Mono,monospace;font-size:11px">${p.status}</span>`,
        { sticky: true, className: "fe-tip" }
      );

      // Plot label
      const lats = p.bounds.map(b => b[0]), lngs = p.bounds.map(b => b[1]);
      L.marker([(Math.min(...lats)+Math.max(...lats))/2, (Math.min(...lngs)+Math.max(...lngs))/2], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font:600 12px 'DM Sans',sans-serif;color:#${p.color};background:#fff;border:1px solid #${p.color};border-radius:5px;padding:1px 7px;box-shadow:0 1px 4px rgba(0,0,0,.1)">${p.name}</div>`,
          iconAnchor: [24, 10],
        }),
      }).addTo(map);
    });

    // Scan markers
    SCANS.forEach((s, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:13px;height:13px;border-radius:50%;background:${SEV_CSS[s.sev]};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)"></div>`,
        iconAnchor: [6, 6],
      });
      L.marker([s.lat, s.lng], { icon })
        .addTo(map)
        .bindTooltip(`<span style="font-family:DM Mono,monospace;font-size:11px">${s.disease}</span>`, { sticky: true, className: "fe-tip" })
        .on("click", () => setSelected({ ...s, idx: i }));
    });

    // Rover path
    const path = L.polyline(ROVER_PATH, { color: "#3b82f6", weight: 2.5, opacity: .7, dashArray: "6 4" });
    path.addTo(map);
    pathLayerRef.current = path;

    // Rover marker
    L.marker(ROVER_POS, {
      icon: L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#3b82f6;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(59,130,246,.45)">
                 <div style="width:8px;height:8px;border-radius:50%;background:#fff"></div></div>`,
        iconAnchor: [11, 11],
      }),
    }).addTo(map).bindTooltip('<span style="font-family:DM Mono,monospace;font-size:11px">ROVER-01 · Live</span>', { className: "fe-tip" });

    setReady(true);
  }

  // ── Satellite toggle ──────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;
    const L = window.L;
    map.eachLayer((l) => { if (l._url) map.removeLayer(l); });
    if (satellite) {
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "© Esri", maxZoom: 20,
      }).addTo(map);
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 20,
      }).addTo(map);
    }
  }, [satellite]);

  // ── Path toggle ───────────────────────────────────
  useEffect(() => {
    const map  = mapInstanceRef.current;
    const path = pathLayerRef.current;
    if (!map || !path) return;
    if (showPath) path.addTo(map);
    else          path.remove();
  }, [showPath]);

  const centreOnRover = () => {
    const map = mapInstanceRef.current;
    if (map) map.setView(ROVER_POS, 18);
  };

  const zoomToPlot = (plot) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const lats = plot.bounds.map(b => b[0]);
    const lngs = plot.bounds.map(b => b[1]);
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [24, 24] });
  };

  return (
    <main className="main-content">
      {/* Header */}
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Farm Map</div>
          <div className="page-sub">SUNRISE FARM · FIELD A · LIVE ROVER TRACKING</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-sm ${showPath ? "btn-primary" : "btn-ghost"}`} onClick={() => setShowPath(!showPath)}>
            <Navigation size={12} /> Rover Path
          </button>
          <button className={`btn btn-sm ${satellite ? "btn-primary" : "btn-ghost"}`} onClick={() => setSatellite(!satellite)}>
            <Layers size={12} /> {satellite ? "Street" : "Satellite"}
          </button>
          <button className="btn btn-ghost btn-sm">Export</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 14 }} className="fade-in-d1">
        {/* Map column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Toolbar */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span className="card-title">Field A</span>
              <div style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)" }}>
                {[
                  { bg: "#ef4444", label: "Severe", dot: true },
                  { bg: "#f59e0b", label: "Moderate", dot: true },
                  { bg: "#22c55e", label: "Mild", dot: true },
                  { bg: "#4caf7d", label: "Healthy", dot: true },
                  { bg: "#3b82f6", label: "Rover path", dot: false },
                ].map((item, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      width: item.dot ? 9 : 14, height: item.dot ? 9 : 3,
                      borderRadius: item.dot ? "50%" : 2,
                      background: item.bg, display: "inline-block",
                    }} />
                    {item.label}
                  </span>
                ))}
              </div>
              {ready && (
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--mono)", color: "var(--green)" }}>
                  <span className="online-dot" style={{ display: "inline-block" }} /> Live
                </span>
              )}
            </div>

            {/* Map */}
            <div style={{ position: "relative" }}>
              {!ready && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, background: "var(--surface2)", color: "var(--text3)" }}>
                  <div className="spinner" />
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>Loading map…</div>
                </div>
              )}
              <div ref={mapContainerRef} style={{ height: 390, width: "100%" }} />
            </div>
          </div>

          {/* Selected scan info bar */}
          {selected && (
            <div className="card fade-in" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
              <div style={{ width: 34, height: 34, borderRadius: "var(--r)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: SEV_CSS[selected.sev] + "22", border: `1.5px solid ${SEV_CSS[selected.sev]}` }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: SEV_CSS[selected.sev] }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{selected.disease}</div>
                <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginTop: 2 }}>
                  {selected.crop} · {selected.conf}% conf · {selected.lat.toFixed(4)}°N {selected.lng.toFixed(4)}°E
                </div>
              </div>
              <span className={`sev-badge sev-${selected.sev}`}>{SEV_LABELS[selected.sev]}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Plots */}
          <div className="card">
            <div className="card-header"><span className="card-title">Plots</span><span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)" }}>click to zoom</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PLOTS.map((p) => (
                <div key={p.id}
                  style={{ background: "#" + p.fillColor, border: `1.5px solid #${p.color}`, borderRadius: "var(--r)", padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "opacity .15s" }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = ".8"}
                  onMouseOut={(e)  => e.currentTarget.style.opacity = "1"}
                  onClick={() => zoomToPlot(p)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text2)", marginTop: 2 }}>{p.status}</div>
                  </div>
                  <span className={`sev-badge sev-${p.sev}`} style={{ fontSize: 10 }}>{SEV_LABELS[p.sev]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Coverage */}
          <div className="card">
            <div className="card-header"><span className="card-title">Today's Coverage</span></div>
            {PLOTS.map((p, i) => (
              <div className="prog-row" key={p.id} style={{ marginBottom: i < PLOTS.length - 1 ? 10 : 0 }}>
                <div className="prog-label">{p.name}</div>
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${p.coverage}%`, background: COV_COLORS[i] }} />
                </div>
                <div className="prog-val">{p.coverage}%</div>
              </div>
            ))}
          </div>

          {/* Rover */}
          <div className="card" style={{ background: "var(--blue-bg)", borderColor: "#bfdbfe" }}>
            <div className="card-header">
              <span className="card-title" style={{ color: "var(--blue)" }}>ROVER-01</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--mono)", color: "var(--blue)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite", display: "inline-block" }} />
                LIVE
              </span>
            </div>
            {[
              { label: "Lat",        value: `${ROVER_POS[0].toFixed(4)}°N` },
              { label: "Lng",        value: `${ROVER_POS[1].toFixed(4)}°E` },
              { label: "Location",   value: "Row 14, Plot B" },
              { label: "Waypoints",  value: `${ROVER_PATH.length} visited` },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < 3 ? "1px solid #bfdbfe" : "none" }}>
                <span style={{ fontSize: 11.5, color: "var(--blue)", opacity: .6, fontFamily: "var(--mono)" }}>{item.label}</span>
                <span style={{ fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--blue)", fontWeight: 500 }}>{item.value}</span>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10, borderColor: "#bfdbfe", color: "var(--blue)" }} onClick={centreOnRover}>
              <Navigation size={12} /> Centre on Rover
            </button>
          </div>

          {/* Summary */}
          <div className="card" style={{ background: "var(--green-light)", borderColor: "var(--green-dim)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Field Summary</div>
            {[
              { label: "Total scans",  value: `${SCANS.length} today` },
              { label: "Infected",     value: `${SCANS.filter(s => s.sev > 0).length} plants` },
              { label: "Severe",       value: `${SCANS.filter(s => s.sev === 3).length} plants` },
              { label: "Area covered", value: "1.51 ha (63%)" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 3 ? "1px solid var(--green-dim)" : "none" }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{item.label}</span>
                <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--green)", fontWeight: 500 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
