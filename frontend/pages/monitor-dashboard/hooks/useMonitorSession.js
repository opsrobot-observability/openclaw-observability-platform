import { useCallback, useEffect, useRef, useState } from "react";

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 大屏会话模块数据 Hook（拆分为三个独立接口）
 * - /api/monitor-session-overview
 * - /api/monitor-session-risk
 * - /api/monitor-session-trend
 *
 * @param {{ trendDays?: number; riskLimit?: number; refreshInterval?: number }} opts
 */
export function useMonitorSession({
  trendDays = 14,
  riskLimit = 0,
  refreshInterval = 120_000,
} = {}) {
  const [overview, setOverview] = useState(null);
  const [risk, setRisk] = useState(null);
  const [trend, setTrend] = useState(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingRisk, setLoadingRisk] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);

  const [errorOverview, setErrorOverview] = useState(null);
  const [errorRisk, setErrorRisk] = useState(null);
  const [errorTrend, setErrorTrend] = useState(null);

  const abortOverviewRef = useRef(null);
  const abortRiskRef = useRef(null);
  const abortTrendRef = useRef(null);

  const fetchOverview = useCallback(async () => {
    if (abortOverviewRef.current) abortOverviewRef.current.abort();
    const ctrl = new AbortController();
    abortOverviewRef.current = ctrl;
    setLoadingOverview(true);
    try {
      const json = await fetchJson("/api/monitor-session-overview", ctrl.signal);
      setOverview(json);
      setErrorOverview(null);
    } catch (e) {
      if (e.name !== "AbortError") {
        setErrorOverview(e.message || String(e));
      }
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchRisk = useCallback(async () => {
    if (abortRiskRef.current) abortRiskRef.current.abort();
    const ctrl = new AbortController();
    abortRiskRef.current = ctrl;
    setLoadingRisk(true);
    try {
      const params = new URLSearchParams({ riskLimit: String(riskLimit) });
      const json = await fetchJson(`/api/monitor-session-risk?${params}`, ctrl.signal);
      setRisk(json);
      setErrorRisk(null);
    } catch (e) {
      if (e.name !== "AbortError") {
        setErrorRisk(e.message || String(e));
      }
    } finally {
      setLoadingRisk(false);
    }
  }, [riskLimit]);

  const fetchTrend = useCallback(async () => {
    if (abortTrendRef.current) abortTrendRef.current.abort();
    const ctrl = new AbortController();
    abortTrendRef.current = ctrl;
    setLoadingTrend(true);
    try {
      const params = new URLSearchParams({ trendDays: String(trendDays) });
      const json = await fetchJson(`/api/monitor-session-trend?${params}`, ctrl.signal);
      setTrend(json);
      setErrorTrend(null);
    } catch (e) {
      if (e.name !== "AbortError") {
        setErrorTrend(e.message || String(e));
      }
    } finally {
      setLoadingTrend(false);
    }
  }, [trendDays]);

  const refreshAll = useCallback(() => {
    void fetchOverview();
    void fetchRisk();
    void fetchTrend();
  }, [fetchOverview, fetchRisk, fetchTrend]);

  useEffect(() => {
    refreshAll();
    const timer = setInterval(refreshAll, refreshInterval);
    return () => {
      clearInterval(timer);
      if (abortOverviewRef.current) abortOverviewRef.current.abort();
      if (abortRiskRef.current) abortRiskRef.current.abort();
      if (abortTrendRef.current) abortTrendRef.current.abort();
    };
  }, [refreshAll, refreshInterval]);

  return {
    data: {
      overview: overview?.overview ?? null,
      riskSessions: risk?.riskSessions ?? [],
      riskSessionsTotal: risk?.riskSessionsTotal ?? 0,
      sessionTrend: trend?.sessionTrend ?? [],
      sessionTrendTotal: trend?.sessionTrendTotal ?? 0,
    },
    loading: {
      overview: loadingOverview,
      risk: loadingRisk,
      trend: loadingTrend,
      any: loadingOverview || loadingRisk || loadingTrend,
    },
    error: {
      overview: errorOverview,
      risk: errorRisk,
      trend: errorTrend,
      any: errorOverview || errorRisk || errorTrend,
    },
    refresh: {
      all: refreshAll,
      overview: fetchOverview,
      risk: fetchRisk,
      trend: fetchTrend,
    },
  };
}
