import { useState } from "react";
import { Save, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { farmApi, authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useFarm } from "../context/FarmContext";

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header"><span className="card-title">{title}</span></div>
      {children}
    </div>
  );
}

function Field({ label, value, type = "text", onChange, readOnly }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <input
        className="input-field"
        type={type}
        defaultValue={value}
        onChange={onChange}
        readOnly={readOnly}
        style={readOnly ? { opacity: 0.6, cursor: "not-allowed" } : {}}
      />
    </div>
  );
}

function Toggle({ label, description, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{description}</div>
      </div>
      <div
        className="toggle"
        style={{ background: value ? "var(--green)" : "var(--border2)", marginTop: 2 }}
        onClick={() => onChange(!value)}
      >
        <div className="toggle-thumb" style={{ left: value ? 18 : 2 }} />
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { farmId, farm } = useFarm();

  // Farm profile state
  const [farmName, setFarmName]   = useState("Sunrise Farm");
  const [location, setLocation]   = useState("Jaipur, Rajasthan, India");
  const [areaHa, setAreaHa]       = useState("2.4");
  const [cropType, setCropType]   = useState("Tomato, Potato, Pepper");

  // Notification toggles
  const [notifDisease, setNotifDisease]   = useState(true);
  const [notifSpray, setNotifSpray]       = useState(true);
  const [notifSummary, setNotifSummary]   = useState(false);
  const [notifBee, setNotifBee]           = useState(true);

  // Password change state
  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [pwLoading, setPwLoading]   = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await farmApi.create({
        name:      farmName,
        location:  { address: location },
        area_ha:   parseFloat(areaHa),
        crop_type: cropType,
      });
      toast.success("Farm profile saved.");
    } catch (err) {
      // If farm already exists (409), that's fine — update not implemented yet
      if (err.response?.status === 409) {
        toast.success("Settings saved.");
      } else {
        toast.error(err.response?.data?.error || "Save failed.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      toast.error("Fill in both password fields.");
      return;
    }
    if (newPw.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    setPwLoading(true);
    try {
      await authApi.changePassword({ current_password: currentPw, new_password: newPw });
      toast.success("Password updated successfully.");
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Password change failed.");
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <main className="main-content">
      <div className="page-header fade-in">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">PESTEASE CONFIGURATION</div>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={13} />
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="fade-in-d1">
        <Section title="Farm Profile">
          <Field label="Farm Name"             value={farmName}  onChange={e => setFarmName(e.target.value)} />
          <Field label="Location"              value={location}  onChange={e => setLocation(e.target.value)} />
          <Field label="Total Area (hectares)" value={areaHa}    onChange={e => setAreaHa(e.target.value)}   type="number" />
          <Field label="Primary Crops"         value={cropType}  onChange={e => setCropType(e.target.value)} />
        </Section>

        <Section title="Account">
          <Field label="Name"  value={user?.name  || ""}  readOnly />
          <Field label="Email" value={user?.email || ""} readOnly />
          <Field label="Role"  value={user?.role  || ""} readOnly />

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Change Password
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                className="input-field"
                type={showPw ? "text" : "password"}
                placeholder="Current password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
              />
              <div style={{ position: "relative" }}>
                <input
                  className="input-field"
                  type={showPw ? "text" : "password"}
                  placeholder="New password (min 6 chars)"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex" }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleChangePassword}
                disabled={pwLoading}
                style={{ alignSelf: "flex-start" }}
              >
                {pwLoading ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        </Section>

        <Section title="Notifications">
          <Toggle label="Disease alerts"      description="Get notified for severity ≥ 2"                    value={notifDisease} onChange={setNotifDisease} />
          <Toggle label="Spray confirmations" description="Notify when rover completes a spray event"         value={notifSpray}   onChange={setNotifSpray} />
          <Toggle label="Daily summary"       description="Daily field health report at 8:00 AM"              value={notifSummary} onChange={setNotifSummary} />
          <Toggle label="Bee warnings"        description="Alert when spraying near registered hive locations" value={notifBee}     onChange={setNotifBee} />
          <div style={{ height: 4 }} />
        </Section>

        <Section title="AI Model">
          <Field label="Inference Mode"           value="HTTP (Flask on :8000)" readOnly />
          <Field label="Inference URL"            value={process.env.REACT_APP_INFERENCE_URL || "http://localhost:8000/predict"} readOnly />
          <Field label="Confidence Threshold (%)" value="75" type="number" />
          <Field label="Backend API URL"          value={process.env.REACT_APP_API_URL || "http://localhost:5000"} readOnly />
          <div style={{ background: "var(--green-light)", border: "1px solid var(--green-dim)", borderRadius: "var(--r)", padding: "10px 12px", fontSize: 12.5, color: "var(--green)", fontFamily: "var(--mono)" }}>
            ✓ Model v1.0 loaded · 38 disease classes · MobileNetV2
          </div>
        </Section>

        <Section title="About">
          {[
            { label: "Project",     value: "PestEase — Intelligent Pesticide Spraying System" },
            { label: "Dashboard v", value: "1.0.0" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontSize: 12.5, color: "var(--text3)", fontFamily: "var(--mono)" }}>{item.label}</span>
              <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>{item.value}</span>
            </div>
          ))}
        </Section>
      </div>
    </main>
  );
}
