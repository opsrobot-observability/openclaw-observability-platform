import { useState, useEffect, useCallback, useRef } from "react";

/**
 * 大屏 OTel 指标数据 Hook
 * 数据源：/api/monitor-dashboard
 *
 * @param {{ trendDays?: number; topLimit?: number; refreshInterval?: number }} opts
 * @returns {{ data: object|null; loading: boolean; error: string|null; refresh: () => void }}
 */
export function useMonitorDashboard({
  trendDays = 14,
  topLimit = 10,
  refreshInterval = 60_000,
} = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const params = new URLSearchParams({
        trendDays: String(trendDays),
        topLimit: String(topLimit),
      });
      const res = await fetch(`/api/monitor-dashboard?${params}`, { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message || String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [trendDays, topLimit]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const timer = setInterval(fetchData, refreshInterval);
    return () => {
      clearInterval(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refresh: fetchData };
}
