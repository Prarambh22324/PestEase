import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Leaf } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/api";

export default function Login() {
  const [email, setEmail]       = useState("farmer@farmease.in");
  const [password, setPassword] = useState("password123");
  const [name, setName]         = useState("Arjun Patel");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      // If credentials are wrong (user doesn't exist yet), auto-register then retry
      const status = err?.response?.status;
      if (status === 401 || status === 404) {
        try {
          await authApi.register({ name, email, password, role: "farmer" });
          await login(email, password);
          navigate("/");
          return;
        } catch (regErr) {
          setError(regErr?.response?.data?.error || "Registration failed.");
        }
      } else {
        setError(err?.response?.data?.error || "Login failed. Check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      {/* Background grid */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", backgroundSize: "50px 50px", opacity: .5, pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 360, position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--green-light)", border: "1.5px solid var(--green-dim)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Leaf size={24} color="var(--green)" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text)", letterSpacing: -.5 }}>PestEase</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", marginTop: 4, letterSpacing: .5 }}>
            INTELLIGENT CROP PROTECTION SYSTEM
          </div>
        </div>

        {/* Card */}
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 18 }}>Sign in</div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Email</div>
              <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Password</div>
              <div style={{ position: "relative" }}>
                <input className="input-field" type={showPass ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 36 }} required />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex" }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: "var(--red-bg)", border: "1px solid #fca5a5", borderRadius: "var(--r)", padding: "8px 12px", color: "var(--red)", fontFamily: "var(--mono)", fontSize: 11 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: "center", marginTop: 4 }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>


      </div>
    </div>
  );
}
