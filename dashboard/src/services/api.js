import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({ baseURL: BASE_URL });

// ── Request interceptor — attach token ─────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fe_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor — silent refresh on 401 ───────
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const code = error.response?.data?.code;

    // Only attempt refresh on TOKEN_EXPIRED, not other 401s (wrong password, etc.)
    if (
      error.response?.status === 401 &&
      code === "TOKEN_EXPIRED" &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue requests that arrive while a refresh is in-flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;
      const refreshToken = localStorage.getItem("fe_refresh_token");

      if (!refreshToken) {
        localStorage.removeItem("fe_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { token, refresh_token: newRefresh } = res.data;
        localStorage.setItem("fe_token", token);
        localStorage.setItem("fe_refresh_token", newRefresh);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        processQueue(null, token);
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("fe_token");
        localStorage.removeItem("fe_refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ───────────────────────────────────────────────
export const authApi = {
  login:          (data)         => api.post("/auth/login", data),
  register:       (data)         => api.post("/auth/register", data),
  me:             ()             => api.get("/auth/me"),
  refresh:        (refreshToken) => api.post("/auth/refresh", { refresh_token: refreshToken }),
  logout:         (refreshToken) => api.post("/auth/logout",  { refresh_token: refreshToken }),
  changePassword: (data)         => api.post("/auth/change-password", data),
  forgotPassword: (email)        => api.post("/auth/forgot-password", { email }),
  resetPassword:  (data)         => api.post("/auth/reset-password", data),
};

export const predictApi = {
  uploadImage: (formData) =>
    api.post("/predict", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  history: (farmId, page = 1) =>
    api.get(`/predict/history/${farmId}?page=${page}&limit=20`),
};

export const farmApi = {
  list:   ()       => api.get("/farm"),
  create: (data)   => api.post("/farm", data),
  stats:  (farmId) => api.get(`/farm/${farmId}/stats`),
};

export const alertsApi = {
  list:     (farmId)  => api.get(`/alerts/${farmId}`),
  markRead: (alertId) => api.patch(`/alerts/${alertId}/read`),
};

export const roverApi = {
  logs:        (farmId) => api.get(`/rover/logs/${farmId}`),
  manualSpray: (data)   => api.post("/rover/manual-spray", data),
};

export default api;
