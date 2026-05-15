import { useState, useRef, useCallback } from "react";
import { Camera, CheckCircle, Droplets, X } from "lucide-react";
import toast from "react-hot-toast";
import { predictApi, roverApi } from "../services/api";
import { useFarm } from "../context/FarmContext";

const SEV_COLORS = ["#4caf7d", "#22c55e", "#f59e0b", "#ef4444"];

function Spinner() {
  return <div className="spinner" />;
}

// farmId passed as prop — useFarm() NOT called here (outside component tree = crash)
function PredictionResult({ result, farmId }) {
  const [sending, setSending] = useState(false);

  const color = SEV_COLORS[result.severity_level] || "#4caf7d";
  const sevClass = `sev-${result.severity_level}`;
  const displayClass = result.disease_class
    ?.split("___").join(" / ").replace(/_/g, " ");

  const sendToRover = async () => {
    setSending(true);
    try {
      await roverApi.manualSpray({
        farm_id:  farmId,
        rover_id: "ROVER-01",
        location: "Current scan position",
        dose_ml:  result.spray_dose_ml_per_m2,
        disease:  result.disease_label,
        severity: result.severity_level,
      });
      toast.success(`Spray command sent — ${result.spray_dose_ml_per_m2} mL/m²`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Rover unreachable. Check backend connection.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 4, background: color }} />
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{result.disease_label}</div>
              <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginTop: 3 }}>
                {result.crop_type} · {displayClass}
              </div>
            </div>
            <span className={`sev-badge ${sevClass}`}>{result.severity_label}</span>
          </div>

          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, marginBottom: 6 }}>CONFIDENCE</div>
            <div className="conf-wrap">
              <div className="conf-track">
                <div className="conf-fill" style={{ width: `${result.confidence}%`, background: color }} />
              </div>
              <div className="conf-pct" style={{ color }}>{result.confidence}%</div>
            </div>
          </div>

          <div className="dose-box">
            <div>
              <div className="dose-label">RECOMMENDED SPRAY DOSE</div>
              <div style={{ fontSize: 11, color: "var(--blue)", fontFamily: "var(--mono)", opacity: .7, marginTop: 2 }}>Solenoid valve will dispense</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Droplets size={16} color="var(--blue)" />
              <div className="dose-val">
                {result.spray_dose_ml_per_m2 > 0 ? `${result.spray_dose_ml_per_m2} mL/m²` : "No spray"}
              </div>
            </div>
          </div>

          <div style={{ background: "var(--surface2)", borderRadius: "var(--r)", padding: "12px 14px", fontSize: 12.5, color: "var(--text2)", lineHeight: 1.6 }}>
            {result.action}
          </div>

          <button
            className="btn btn-primary"
            style={{ justifyContent: "center", opacity: sending ? 0.7 : 1 }}
            onClick={sendToRover}
            disabled={sending || result.spray_dose_ml_per_m2 === 0}
          >
            <CheckCircle size={13} />
            {sending
              ? "Sending…"
              : result.spray_dose_ml_per_m2 === 0
              ? "No spray needed"
              : "Send to Rover"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Top 3 Predictions</span></div>
        {result.top3_predictions?.map((p, i) => (
          <div key={i} style={{ marginBottom: i < 2 ? 10 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text2)" }}>
                {p.class?.split("___").join(" / ").replace(/_/g, " ")}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: i === 0 ? "var(--green)" : "var(--text3)" }}>
                {p.confidence}%
              </span>
            </div>
            <div style={{ height: 5, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p.confidence}%`, background: i === 0 ? color : "var(--border2)", borderRadius: 3, transition: "width .6s" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScanPlant() {
  // useFarm() called here — safely inside the component, within FarmProvider
  const { farmId } = useFarm();

  const [preview, setPreview]   = useState(null);
  const [file, setFile]         = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const fileInputRef = useRef();

  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }, []);

  const reset = () => {
    setPreview(null); setFile(null); setResult(null); setError(null);
  };

  const runPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      if (farmId) formData.append("farm_id", farmId);
      const res = await predictApi.uploadImage(formData);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Prediction failed. Is the Flask server running on :8000?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="main-content">
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Scan Plant</div>
          <div className="page-sub">UPLOAD LEAF IMAGE → AI DISEASE DETECTION</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }} className="fade-in-d1">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Image Upload</span>
              {preview && (
                <button className="btn btn-ghost btn-sm" onClick={reset}>
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {!preview ? (
              <div
                className={`upload-zone ${dragOver ? "drag" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              >
                <div style={{ fontSize: 28, marginBottom: 10, color: "var(--text3)" }}>📷</div>
                <div className="upload-zone-title">Drop a leaf image here</div>
                <div className="upload-zone-sub">or click to browse · JPEG / PNG · max 8MB</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ borderRadius: "var(--r)", overflow: "hidden", border: "1px solid var(--border)" }}>
                  <img src={preview} alt="leaf preview" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                  {file?.name} · {Math.round(file?.size / 1024)} KB
                </div>
                <button className="btn btn-primary" onClick={runPrediction} disabled={loading} style={{ justifyContent: "center" }}>
                  {loading ? <><Spinner /> Analysing…</> : <><Camera size={13} /> Run AI Detection</>}
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Tips for best results</span></div>
            {[
              "Photograph a single leaf showing the affected area clearly",
              "Use natural lighting — avoid harsh shadows or glare",
              "Hold camera steady, 20–30 cm from the leaf",
              "Use the rover camera for automated field scanning",
            ].map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < 3 ? 8 : 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--green-light)", border: "1px solid var(--green-dim)", color: "var(--green)", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--mono)" }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text2)" }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          {error && (
            <div style={{ background: "var(--red-bg)", border: "1px solid #fca5a5", borderRadius: "var(--r2)", padding: 16, color: "var(--red)", fontFamily: "var(--mono)", fontSize: 12 }}>
              {error}
            </div>
          )}
          {!result && !error && (
            <div className="card" style={{ minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text3)" }}>
              <div style={{ fontSize: 36 }}>🌿</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>Upload an image to see results</div>
            </div>
          )}
          {result && <PredictionResult result={result} farmId={farmId} />}
        </div>
      </div>
    </main>
  );
}
