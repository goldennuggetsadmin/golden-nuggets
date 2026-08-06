import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, apiAuth, formatApiErrorDetail } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, obj = user
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) setUser(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (arg1, arg2) => {
    setError("");
    let email = "goldennuggets.admin@gmail.com";
    let password = arg1;
    if (arg2 !== undefined) {
      email = arg1;
      password = arg2;
    }
    const t0 = performance.now();
    try {
      const { data } = await apiAuth.post("/auth/login", { email, password });
      if (data?.access_token) {
        localStorage.setItem("gn_access_token", data.access_token);
      }
      setUser(data);
      return true;
    } catch (e) {
      let msg = "Unable to contact server. Please check your internet connection or try again.";
      if (e.response?.data?.detail) {
        msg = formatApiErrorDetail(e.response.data.detail) || msg;
      } else if (e.code === "ECONNABORTED" || e.message?.includes("timeout")) {
        msg = "Unable to contact server (Request timed out after 10s). Please try again.";
      }
      setError(msg);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("gn_access_token");
    setUser(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, error, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
