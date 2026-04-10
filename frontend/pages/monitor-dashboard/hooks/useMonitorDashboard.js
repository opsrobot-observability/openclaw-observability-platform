import { useState, useEffect, useCallback, useRef } from "react";

const MIN_LOADING_MS = 600;

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
  const reqSeqRef = useRef(0);

  const fetchData = useCallback(async () => {
    reqSeqRef.current += 1;
    const reqSeq = reqSeqRef.current;

    const startAt = Date.now();
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

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
      if (reqSeq !== reqSeqRef.current) return;
      setData(json);
      setError(null);
    } catch (e) {
      if (reqSeq !== reqSeqRef.current) return;
      if (e.name !== "AbortError") {
        setError(e.message || String(e));
      }
    } finally {
      if (reqSeq !== reqSeqRef.current) return;
      const elapsed = Date.now() - startAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }
      if (reqSeq !== reqSeqRef.current) return;
      setLoading(false);
    }
  }, [trendDays, topLimit]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, refreshInterval);
    return () => {
      clearInterval(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refresh: fetchData };
}
