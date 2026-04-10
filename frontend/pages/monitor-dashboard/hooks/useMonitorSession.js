import { useCallback, useEffect, useRef, useState } from "react";

const MIN_LOADING_MS = 600;

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
 * - /api/monitor-session-risk（消息级风险对话）
 * - /api/monitor-session-trend
 *
 * @param {{ trendDays?: number; riskLimit?: number; refreshInterval?: number }} opts
 */
export function useMonitorSession({
  trendDays = 30,
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
  const reqSeqOverviewRef = useRef(0);
  const reqSeqRiskRef = useRef(0);
  const reqSeqTrendRef = useRef(0);

  const fetchOverview = useCallback(async () => {
    reqSeqOverviewRef.current += 1;
    const reqSeq = reqSeqOverviewRef.current;
    const startAt = Date.now();
    if (abortOverviewRef.current) abortOverviewRef.current.abort();
    const ctrl = new AbortController();
    abortOverviewRef.current = ctrl;
    setLoadingOverview(true);
    try {
      const json = await fetchJson("/api/monitor-session-overview", ctrl.signal);
      if (reqSeq !== reqSeqOverviewRef.current) return;
      setOverview(json);
      setErrorOverview(null);
    } catch (e) {
      if (reqSeq !== reqSeqOverviewRef.current) return;
      if (e.name !== "AbortError") {
        setErrorOverview(e.message || String(e));
      }
    } finally {
      if (reqSeq !== reqSeqOverviewRef.current) return;
      const elapsed = Date.now() - startAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }
      if (reqSeq !== reqSeqOverviewRef.current) return;
      setLoadingOverview(false);
    }
  }, []);

  const fetchRisk = useCallback(async () => {
    reqSeqRiskRef.current += 1;
    const reqSeq = reqSeqRiskRef.current;
    const startAt = Date.now();
    if (abortRiskRef.current) abortRiskRef.current.abort();
    const ctrl = new AbortController();
    abortRiskRef.current = ctrl;
    setLoadingRisk(true);
    try {
      const params = new URLSearchParams({ riskLimit: String(riskLimit) });
      const json = await fetchJson(`/api/monitor-session-risk?${params}`, ctrl.signal);
      if (reqSeq !== reqSeqRiskRef.current) return;
      setRisk(json);
      setErrorRisk(null);
    } catch (e) {
      if (reqSeq !== reqSeqRiskRef.current) return;
      if (e.name !== "AbortError") {
        setErrorRisk(e.message || String(e));
      }
    } finally {
      if (reqSeq !== reqSeqRiskRef.current) return;
      const elapsed = Date.now() - startAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }
      if (reqSeq !== reqSeqRiskRef.current) return;
      setLoadingRisk(false);
    }
  }, [riskLimit]);

  const fetchTrend = useCallback(async () => {
    reqSeqTrendRef.current += 1;
    const reqSeq = reqSeqTrendRef.current;
    const startAt = Date.now();
    if (abortTrendRef.current) abortTrendRef.current.abort();
    const ctrl = new AbortController();
    abortTrendRef.current = ctrl;
    setLoadingTrend(true);
    try {
      const params = new URLSearchParams({ trendDays: String(trendDays) });
      const json = await fetchJson(`/api/monitor-session-trend?${params}`, ctrl.signal);
      if (reqSeq !== reqSeqTrendRef.current) return;
      setTrend(json);
      setErrorTrend(null);
    } catch (e) {
      if (reqSeq !== reqSeqTrendRef.current) return;
      if (e.name !== "AbortError") {
        setErrorTrend(e.message || String(e));
      }
    } finally {
      if (reqSeq !== reqSeqTrendRef.current) return;
      const elapsed = Date.now() - startAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }
      if (reqSeq !== reqSeqTrendRef.current) return;
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
