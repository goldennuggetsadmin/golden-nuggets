import axios from "axios";

const getBackendUrl = () => {
  if (process.env.REACT_APP_BACKEND_URL) return process.env.REACT_APP_BACKEND_URL;
  if (typeof window !== "undefined" && window.location.hostname) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `http://${window.location.hostname}:8000`;
    }
  }
  return "https://web-production-1fc9d.up.railway.app";
};

const BACKEND_URL = getBackendUrl();

/** Axios client scoped to /api/v1 — call paths like `/auth/me`, `/admin/sermons`, `/mobile/home`. */
export const api = axios.create({
  baseURL: `${BACKEND_URL}/api/v1`,
  withCredentials: true,
  timeout: 30000,
});

/** Dedicated auth client with 30s timeout for auth requests */
export const apiAuth = axios.create({
  baseURL: `${BACKEND_URL}/api/v1`,
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gn_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      originalRequest._retry = true;
      try {
        const refreshRes = await axios.post(
          `${BACKEND_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        );
        if (refreshRes.data?.access_token) {
          localStorage.setItem("gn_access_token", refreshRes.data.access_token);
          originalRequest.headers.Authorization = `Bearer ${refreshRes.data.access_token}`;
        }
        return axios(originalRequest);
      } catch (refreshErr) {
        localStorage.removeItem("gn_access_token");
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login") &&
          !window.location.pathname.includes("/reset-password")
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export const MEDIA_FILE_URL = (id) => `${BACKEND_URL}/api/v1/admin/media/file/${id}`;

export function formatApiErrorDetail(err) {
  if (!err) return null;
  if (err.response?.data) {
    const data = err.response.data;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
        .filter(Boolean)
        .join(" ");
    }
  }
  if (typeof err === "string") return err;
  if (err.detail != null) {
    if (typeof err.detail === "string") return err.detail;
    if (Array.isArray(err.detail)) {
      return err.detail
        .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
        .filter(Boolean)
        .join(" ");
    }
  }
  if (typeof err.message === "string") return err.message;
  return String(err);
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${units[i]}`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
