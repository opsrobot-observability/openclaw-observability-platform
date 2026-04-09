import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const MonitorDashboardContext = createContext(null);

export function MonitorDashboardProvider({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/monitor-dashboard?otelHours=24&trendDays=14");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const j = await r.json();
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      reload: load,
    }),
    [data, loading, error, load],
  );

  return <MonitorDashboardContext.Provider value={value}>{children}</MonitorDashboardContext.Provider>;
}

export function useMonitorDashboard() {
  const ctx = useContext(MonitorDashboardContext);
  if (!ctx) {
    throw new Error("useMonitorDashboard must be used within MonitorDashboardProvider");
  }
  return ctx;
}
