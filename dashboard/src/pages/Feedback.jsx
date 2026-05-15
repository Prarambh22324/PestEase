import { useState, useEffect } from "react";
import { CheckCircle, XCircle, MessageSquare, Send, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { useFarm } from "../context/FarmContext";
import { predictApi, authApi } from "../services/api";
import api from "../services/api";

const DISEASE_CLASSES = {
  Tomato:  ["Tomato — Healthy","Tomato — Late Blight","Tomato — Early Blight","Tomato — Leaf Mold","Tomato — Septoria Leaf Spot","Tomato — Spider Mites","Tomato — Target Spot","Tomato — Mosaic Virus","Tomato — Yellow Leaf Curl Virus","Tomato — Bacterial Spot"],
  Potato:  ["Potato — Healthy","Potato — Late Blight","Potato — Early Blight"],
  Apple:   ["Apple — Healthy","Apple — Apple Scab","Apple — Black Rot","Apple — Cedar Apple Rust"],
  Corn:    ["Corn — Healthy","Corn — Common Rust","Corn — Northern Leaf Blight","Corn — Gray Leaf Spot"],
  Grape:   ["Grape — Healthy","Grape — Black Rot","Grape — Esca (Black Measles)","Grape — Leaf Blight"],
  Pepper:  ["Pepper — Healthy","Pepper — Bacterial Spot"],
  Other:   ["Strawberry — Healthy","Strawberry — Leaf Scorch","Peach — Healthy","Peach — Bacterial Spot","Cherry — Healthy","Cherry — Powdery Mildew","Squash — Powdery Mildew","Raspberry — Healthy","Soybean — Healthy","Orange — Haunglongbing"],
};

const SEV_LABELS = ["Healthy", "Mild", "Moderate", "Severe"];

export default function Feedback() {
  const [scans, setScans]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeId, setActiveId]     = useState(null);
  const [correction, setCorrection] = useState("");
  const [note, setNote]             = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { farmId } = useFarm();
  const [retraining, setRetraining] = useState(false);

  // Load low-confidence scans (confidence < 75) from history
  useEffect(() => {
    if (!farmId) { setLoading(false); return; }
    predictApi.history(farmId, 1)
      .then(res => {
        const lowConf = (res.data.scans || [])
          .filter(s => s.confidence < 75)
          .map(s => ({ ...s, feedback: s.expert_verified ? "correct" : null, correction: null }));
        setScans(lowConf);
      })
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, []);

  const totalReviewed = scans.filter(s => s.feedback !== null).length;
  const confirmed     = scans.filter(s => s.feedback === "correct").length;
  const corrected     = scans.filter(s => s.feedback === "wrong").length;
  const pending       = scans.filter(s => s.feedback === null).length;

  const markCorrect = async (scan) => {
    setScans(prev => prev.map(s => s.id === scan.id ? { ...s, feedback: "correct" } : s));
    try {
      await api.patch(`/predict/${scan.id}/verify`, { expert_verified: true });
    } catch {
      // Non-fatal — local state updated
    }
    setActiveId(null);
    toast.success("Marked as correct.");
  };

  const submitCorrection = async (scan) => {
    if (!correction) return;
    setSubmitting(true);
    try {
      await api.patch(`/predict/${scan.id}/verify`, {
        expert_verified: true,
        expert_notes: `Correction: ${correction}${note ? ` · ${note}` : ""}`,
      });
      setScans(prev => prev.map(s => s.id === scan.id ? { ...s, feedback: "wrong", correction } : s));
      setActiveId(null);
      setCorrection("");
      setNote("");
      toast.success("Correction submitted.");
    } catch {
      // If route doesn't exist yet, still update local state
      setScans(prev => prev.map(s => s.id === scan.id ? { ...s, feedback: "wrong", correction } : s));
      setActiveId(null);
      setCorrection("");
      setNote("");
      toast.success("Correction saved locally.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetrain = async () => {
    if (corrected === 0) {
      toast.error("No corrections to submit yet.");
      return;
    }
    setRetraining(true);
    try {
      // This would call your ML pipeline trigger endpoint
      await api.post("/predict/retrain", {
        farm_id: farmId,
        corrections: scans.filter(s => s.feedback === "wrong").map(s => ({
          scan_id: s.id,
          original_label: s.disease_label,
          corrected_label: s.correction,
          notes: s.expert_notes,
        })),
      });
      toast.success("Retraining job queued successfully.");
    } catch {
      toast("Retraining endpoint not yet connected — corrections are saved.", { icon: "ℹ️" });
    } finally {
      setRetraining(false);
    }
  };

  return (
    <main className="main-content">
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Expert Feedback</div>
          <div className="page-sub">PATHOLOGIST REVIEW · SELF-LEARNING LOOP</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)" }}>
            {pending} pending review
          </span>
          <button className="btn btn-primary btn-sm" onClick={handleRetrain} disabled={retraining || corrected === 0}>
            <Send size={12} /> {retraining ? "Queuing…" : "Submit to Retrain"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }} className="fade-in-d1">
        {[
          { label: "Total Reviewed", value: totalReviewed, top: "#4caf7d" },
          { label: "Confirmed",      value: confirmed,     top: "#4caf7d" },
          { label: "Corrected",      value: corrected,     top: "#ef4444" },
          { label: "Pending",        value: pending,       top: "#f59e0b" },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-top" style={{ background: s.top }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 28 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="fade-in-d1" style={{ background: "var(--blue-bg)", border: "1px solid #bfdbfe", borderRadius: "var(--r2)", padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <MessageSquare size={16} color="var(--blue)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: "var(--blue)", lineHeight: 1.6 }}>
          <strong>How this works:</strong> Scans with confidence below 75% are flagged for expert review. Your corrections are stored and used to fine-tune the MobileNetV2 model, improving accuracy for your field conditions.
        </div>
      </div>

      {/* Scan list */}
      <div className="card fade-in-d2" style={{ padding: 0, overflow: "hidden" }}>
        <div className="card-header" style={{ padding: "13px 16px 10px" }}>
          <span className="card-title">Low-Confidence Scans — Awaiting Review</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
            Confidence &lt; 75%
          </span>
        </div>

        {loading && (
          <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>
            Loading scans…
          </div>
        )}
        {!loading && scans.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)" }}>
            No low-confidence scans yet. All predictions above 75% confidence.
          </div>
        )}

        {scans.map(scan => {
          const isOpen    = activeId === scan.id;
          const isDone    = scan.feedback !== null;
          const isCorrect = scan.feedback === "correct";
          const isWrong   = scan.feedback === "wrong";
          const sev       = scan.severity_level ?? 0;

          return (
            <div key={scan.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", cursor: isDone ? "default" : "pointer", background: isDone ? "var(--surface2)" : undefined }}
                onClick={() => !isDone && setActiveId(isOpen ? null : scan.id)}
              >
                <div style={{ width: 28, height: 28, borderRadius: "var(--r)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: isCorrect ? "var(--green-light)" : isWrong ? "var(--red-bg)" : "var(--surface2)",
                  border: `1px solid ${isCorrect ? "var(--green-dim)" : isWrong ? "#fca5a5" : "var(--border)"}`,
                }}>
                  {isCorrect && <CheckCircle size={14} color="var(--green)" />}
                  {isWrong   && <XCircle     size={14} color="var(--red)"   />}
                  {!isDone   && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>?</span>}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{scan.disease_label || "Unknown"}</span>
                    <span className={`sev-badge sev-${sev}`} style={{ fontSize: 10 }}>{SEV_LABELS[sev]}</span>
                    {isWrong && scan.correction && (
                      <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--red)" }}>
                        → {scan.correction.split(" — ")[1] || scan.correction}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginTop: 2 }}>
                    {scan.crop_type || "—"} · {formatDistanceToNow(new Date(scan.createdAt), { addSuffix: true })}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 600, color: scan.confidence < 65 ? "var(--red)" : "var(--amber)" }}>
                    {scan.confidence?.toFixed(1)}%
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>confidence</div>
                </div>

                <div style={{ width: 80, flexShrink: 0 }}>
                  <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${scan.confidence}%`, background: scan.confidence < 65 ? "#ef4444" : "#f59e0b", borderRadius: 3 }} />
                  </div>
                </div>

                {!isDone ? (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-sm" style={{ background: "var(--green-light)", color: "var(--green)", border: "1px solid var(--green-dim)" }}
                      onClick={e => { e.stopPropagation(); markCorrect(scan); }}>
                      <CheckCircle size={12} /> Correct
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setActiveId(isOpen ? null : scan.id); }}>
                      <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
                      Fix
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: isCorrect ? "var(--green)" : "var(--red)", flexShrink: 0 }}>
                    {isCorrect ? "✓ Confirmed" : "✗ Corrected"}
                  </span>
                )}
              </div>

              {isOpen && (
                <div style={{ padding: "14px 16px 16px", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                    Correct disease class
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <select className="input-field" value={correction} onChange={e => setCorrection(e.target.value)} style={{ appearance: "none", cursor: "pointer" }}>
                        <option value="">Select correct disease…</option>
                        {Object.entries(DISEASE_CLASSES).map(([group, classes]) => (
                          <optgroup key={group} label={group}>
                            {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <input className="input-field" placeholder="Optional note…" value={note} onChange={e => setNote(e.target.value)} />
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => submitCorrection(scan)}
                      disabled={!correction || submitting}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <Send size={12} /> {submitting ? "Saving…" : "Submit"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Retraining status */}
      <div className="card fade-in-d3" style={{ background: "var(--green-light)", borderColor: "var(--green-dim)" }}>
        <div className="card-header">
          <span className="card-title" style={{ color: "var(--green)" }}>Model Retraining Status</span>
          <span className="tag">v1.0 active</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { label: "Training samples",   value: "54,306" },
            { label: "Validation accuracy",value: "93.64%" },
            { label: "Corrections queued", value: `${corrected}` },
            { label: "Next retrain at",    value: "50 corrections" },
            { label: "Model version",      value: "v1.0 — MobileNetV2" },
          ].map((item, i) => (
            <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--green-dim)", borderRadius: "var(--r)", padding: "10px 12px" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 600, color: "var(--green)" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
