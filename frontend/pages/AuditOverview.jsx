import { useEffect, useMemo, useState } from "react";
import intl from "react-intl-universal";
import CostTimeRangeFilter from "../components/CostTimeRangeFilter.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function num(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("zh-CN");
}

function pctRatio(x) {
  if (x == null || Number.isNaN(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(2)}%`;
}

function MetricCard({ title, value, hint, accent }) {
  return (
    <div
      className={[
        "rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60",
        accent ?? "",
      ].join(" ")}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

export default function AuditOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeDays, setActiveDays] = useState(7);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agent-sessions-audit-overview?days=${activeDays}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setError(e.message || String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDays]);

  const pieData = useMemo(() => {
    const raw = data?.pieRisk ?? [];
    return raw.filter((x) => x && Number(x.value) > 0);
  }, [data]);

  const hasPie = pieData.length > 0;
  const windowKey = activeDays <= 1 ? "today" : activeDays <= 7 ? "week" : "month";
  const summary = data?.summary ?? data?.windows?.[windowKey] ?? null;

  return (
    <div className="space-y-8">
      <CostTimeRangeFilter activeDays={activeDays} onPreset={setActiveDays} />

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          {intl.get("common.loadFailed", { error })}
          <span className="mt-1 block text-xs">{intl.get("common.devHint")}</span>
        </p>
      )}

      {loading && !error && <LoadingSpinner message={intl.get("auditOverview.loadingDashboard")} />}

      {!loading && data && (
        <>
          {/* 核心指标 — 改为单行 4 类，跟随统计时间展示 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.coreMetrics")}</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard
                title={intl.get("auditOverview.sessionTotal")}
                value={num(summary?.session_total)}
                hint={intl.get("auditOverview.sessionTotalHint", { days: activeDays })}
              />
              <MetricCard
                title={intl.get("auditOverview.activeSessions")}
                value={num(summary?.active_sessions)}
                hint={intl.get("auditOverview.activeSessionsHint", { days: activeDays })}
                accent="bg-primary-soft/30 dark:bg-primary/10"
              />
              <MetricCard
                title={intl.get("auditOverview.userAccess")}
                value={num(summary?.user_access)}
                hint={intl.get("auditOverview.userAccessHint")}
              />
              <MetricCard
                title={intl.get("auditOverview.deviceConnections")}
                value={num(summary?.device_connections)}
                hint={intl.get("auditOverview.deviceConnectionsHint")}
              />
            </div>
          </section>

          {/* 风险 + 实时 */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-3 xl:col-span-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.riskStats")}</h3>
              {loading ? (
                <LoadingSpinner message="" className="py-8" />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard title={intl.get("auditOverview.highRisk")} value={num(data.risk?.high)} accent="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30" />
                  <MetricCard title={intl.get("auditOverview.mediumRisk")} value={num(data.risk?.medium)} accent="border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30" />
                  <MetricCard title={intl.get("auditOverview.lowRisk")} value={num(data.risk?.low)} accent="border-sky-200 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-950/30" />
                  <MetricCard
                    title={intl.get("auditOverview.riskSessionRatio")}
                    value={pctRatio(data.risk?.riskSessionRatio)}
                    hint={intl.get("auditOverview.riskSessionRatioHint", {
                      riskCount: num(data.risk?.riskSessionCount),
                      totalCount: num(data.risk?.sessionsInMonth),
                    })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.realtime")}</h3>
              {loading ? (
                <LoadingSpinner message="" className="py-6" />
              ) : (
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <MetricCard
                    title={intl.get("auditOverview.onlineSessions")}
                    value={num(data.realtime?.onlineSessions)}
                    hint={intl.get("auditOverview.onlineSessionsHint")}
                    accent="border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/25"
                  />
                  <MetricCard
                    title={intl.get("auditOverview.abnormalDisconnect")}
                    value={num(data.realtime?.abnormalDisconnectSessions)}
                    hint={intl.get("auditOverview.abnormalDisconnectHint")}
                    accent="border-rose-200 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/25"
                  />
                </div>
              )}
            </div>
          </section>

          {/* 饼图 + 趋势 */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="app-card border border-gray-100 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.riskPieTitle")}</h3>
              <div className="mt-2 h-[280px] w-full">
                {loading ? (
                  <LoadingSpinner message="" className="h-full" />
                ) : hasPie ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => num(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">{intl.get("auditOverview.noRiskSample")}</div>
                )}
              </div>
            </div>

            <div className="app-card border border-gray-100 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.sessionTrendTitle", { days: activeDays })}</h3>
              <div className="mt-2 h-[280px] w-full">
                {loading ? (
                  <LoadingSpinner message="" className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trends?.sessions7d ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} activeBar={{ stroke: 'none' }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(l) => intl.get("auditOverview.dateLabel", { label: l })}
                        formatter={(v) => [num(v), intl.get("auditOverview.sessionCount")]}
                      />
                      <Line type="monotone" dataKey="sessions" name={intl.get("auditOverview.sessionCount")} stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="app-card border border-gray-100 p-4 xl:col-span-2 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.riskTrendTitle", { days: activeDays })}</h3>
              <div className="mt-2 h-[300px] w-full">
                {loading ? (
                  <LoadingSpinner message="" className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart activeDot={false} data={data.trends?.risk7d ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(v) => num(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="high" name={intl.get("auditOverview.high")} stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="medium" name={intl.get("auditOverview.medium")} stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="low" name={intl.get("auditOverview.low")} stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
