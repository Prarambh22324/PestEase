import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { authApi } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef(null);

  // ── Token helpers ──────────────────────────────────────
  function saveTokens(token, refreshToken) {
    localStorage.setItem("fe_token", token);
    if (refreshToken) localStorage.setItem("fe_refresh_token", refreshToken);
  }

  function clearTokens() {
    localStorage.removeItem("fe_token");
    localStorage.removeItem("fe_refresh_token");
  }

  // ── Silent refresh ─────────────────────────────────────
  // Decodes the JWT locally (no crypto — just parsing) to schedule
  // a refresh ~1 minute before it expires.
  function scheduleRefresh(token) {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const expiresIn = payload.exp * 1000 - Date.now() - 60_000; // 1 min early
      if (expiresIn <= 0) {
        // Already expired or about to — refresh immediately
        silentRefresh();
        return;
      }
      refreshTimer.current = setTimeout(silentRefresh, expiresIn);
    } catch {
      // Malformed token — let the next API call handle it
    }
  }

  const silentRefresh = useCallback(async () => {
    const refreshToken = localStorage.getItem("fe_refresh_token");
    if (!refreshToken) {
      clearTokens();
      setUser(null);
      return;
    }
    try {
      const res = await authApi.refresh(refreshToken);
      const { token, refresh_token } = res.data;
      saveTokens(token, refresh_token);
      scheduleRefresh(token);
    } catch {
      // Refresh token also expired — user must log in again
      clearTokens();
      setUser(null);
    }
  }, []);

  // ── On mount: rehydrate from stored token ──────────────
  useEffect(() => {
    const token = localStorage.getItem("fe_token");
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then((res) => {
        setUser(res.data.user);
        scheduleRefresh(token);
      })
      .catch(async (err) => {
        const code = err?.response?.data?.code;
        if (code === "TOKEN_EXPIRED") {
          // Access token expired — try a silent refresh before giving up
          await silentRefresh();
          // If silentRefresh succeeded, user will now be set via the rehydrate flow
          if (localStorage.getItem("fe_token")) {
            try {
              const res = await authApi.me();
              setUser(res.data.user);
            } catch {
              clearTokens();
            }
          }
        } else {
          clearTokens();
        }
      })
      .finally(() => setLoading(false));

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  // ── Login ──────────────────────────────────────────────
  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const { token, refresh_token, user: userData } = res.data;
    saveTokens(token, refresh_token);
    setUser(userData);
    scheduleRefresh(token);
    return userData;
  };

  // ── Logout ─────────────────────────────────────────────
  const logout = async () => {
    const refreshToken = localStorage.getItem("fe_refresh_token");
    try {
      // Tell backend to invalidate the refresh token
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // Best effort — clear locally regardless
    }
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
