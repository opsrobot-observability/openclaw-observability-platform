import { useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";
import CostTimeRangeFilter, { defaultRangeLastDays } from "../components/CostTimeRangeFilter.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import AuditOverviewContent from "./audit-overview/index.jsx";
import { generateMockData } from "./audit-overview/mockData.js";
import { adaptApiToUI } from "./audit-overview/adaptApiToUI.js";

const USE_MOCK = import.meta.env.VITE_MOCK === "true";

export default function AuditOverview() {
  const [activeDays, setActiveDays] = useState(7);
  const [range, setRange] = useState(() => defaultRangeLastDays(7));
  const { start: rangeStart, end: rangeEnd } = range;
  const [apiData, setApiData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ── 真实模式：fetch API ── */
  useEffect(() => {
    if (USE_MOCK) return;
    let cancelled = false;
    setLoading(true);
    const days = activeDays ?? 7;
    fetch(`/api/agent-sessions-audit-overview?days=${days}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        return body;
      })
      .then((d) => {
        if (!cancelled) { setApiData(d); setError(null); }
      })
      .catch((e) => {
        if (!cancelled) { setApiData(null); setError(e.message || String(e)); }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeDays]);

  /* ── 数据源：mock 直接生成，真实 API 经适配器转换 ── */
  const data = useMemo(() => {
    if (USE_MOCK) {
      return generateMockData(activeDays ?? 7);
    }
    if (!apiData) return null;
    return adaptApiToUI(apiData, activeDays ?? 7);
  }, [activeDays, apiData]);

  return (
    <div className="space-y-6">
      <CostTimeRangeFilter
        activeDays={activeDays}
        onPreset={(p) => {
          const days = p?.days ?? 7;
          setActiveDays(days);
          setRange(defaultRangeLastDays(days));
        }}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onRangeChange={(start, end) => {
          setActiveDays(null);
          setRange({ start, end });
        }}
      />

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          {intl.get("common.loadFailed", { error })}
        </p>
      )}

      {!USE_MOCK && loading && !error && (
        <LoadingSpinner message={intl.get("auditOverview.loadingDashboard")} />
      )}

      <AuditOverviewContent data={data} />
    </div>
  );
}
