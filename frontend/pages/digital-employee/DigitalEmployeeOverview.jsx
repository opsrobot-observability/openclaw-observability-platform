import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import intl from "react-intl-universal";
import CostTimeRangeFilter from "../../components/CostTimeRangeFilter.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import { dedupeEmployeesBySessionKey, rowSessionKey } from "../../utils/digitalEmployeeRows.js";

/** 版本 1.0.1 */
function fmtPct(x) {
  if (x == null || Number.isNaN(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(1)}%`;
}

/** 版本 1.0.1 */
function fmtUsd(x) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  return `$${Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 版本 1.0.1 */
function fmtDurationMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  const n = Number(ms);
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60000) return `${(n / 1000).toFixed(1)} s`;
  return `${(n / 60000).toFixed(1)} min`;
}

/** 版本 1.0.1 */
function sourceLabel(s) {
  if (s === "doris") return "Doris";
  if (s === "file") return intl.get("digitalEmployee.overview.source.localSnapshot");
  if (s === "mock") return "Mock";
  return String(s ?? "—");
}

/** 版本 1.0.1 */
function healthBadgeClass(tier) {
  switch (tier) {
    case "green":
      return "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "yellow":
      return "bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200";
    case "red":
      return "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-200";
    default:
      return "bg-gray-100 text-gray-600 ring-gray-500/15 dark:bg-gray-800 dark:text-gray-400";
  }
}

function riskScoreClass(score) {
  if (score == null || !Number.isFinite(Number(score))) return "text-gray-600 dark:text-gray-300";
  const n = Number(score);
  if (n >= 70) return "font-semibold text-rose-600 dark:text-rose-300";
  if (n >= 45) return "text-amber-600 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-400";
}

function healthLabel(tier) {
  if (tier === "green") return intl.get("digitalEmployee.overview.health.green");
  if (tier === "yellow") return intl.get("digitalEmployee.overview.health.yellow");
  if (tier === "red") return intl.get("digitalEmployee.overview.health.red");
  return intl.get("digitalEmployee.overview.health.unknown");
}

const HEALTH_COLORS = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#f43f5e",
};

function CoreMetricCard({ title, value, hint, accent, children }) {
  const baseClass = [
    "rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm ring-1 ring-black/[0.03]",
    "dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]",
    accent ?? "",
  ].join(" ");
  return (
    <div className={baseClass}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

/** 多员工成本折线配色 */
const EMPLOYEE_COST_LINE_COLORS = [
  "#f97316",
  "#6366f1",
  "#22c55e",
  "#ec4899",
  "#0ea5e9",
  "#a855f7",
  "#eab308",
  "#14b8a6",
  "#f43f5e",
  "#84cc16",
];

/**
 * 数字员工概览：O1 核心指标 + O2 五维 + O3 列表与 TopN（对齐设计文档 §3）
 * 版本 1.0.1
 */
export default function DigitalEmployeeOverview() {
  const [activeDays, setActiveDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterHealthTier, setFilterHealthTier] = useState(null);
  const [filterChannel, setFilterChannel] = useState(null);
  const [listSort, setListSort] = useState(null);
  const [sideTab, setSideTab] = useState("highRisk");

  const fetchUrl = useMemo(() => `/api/digital-employees/overview?days=${activeDays}`, [activeDays]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(fetchUrl)
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
  }, [fetchUrl]);

  const o1 = data?.o1_summary;
  const o2 = data?.o2_dimensions;

  /** 与画像页一致：按数字员工主键（agent_name）去重后的行 */
  const o3EmployeesDeduped = useMemo(
    () => dedupeEmployeesBySessionKey(data?.o3_employees ?? []),
    [data],
  );
  /** 后端按 employeeKey(agent_name) 聚合后的员工行（健康度口径基准） */
  const agentsAggregated = useMemo(() => data?.agentsAggregated ?? [], [data]);
  const aggByEmployeeKey = useMemo(
    () => new Map(agentsAggregated.map((a) => [String(a.employeeKey ?? "").trim(), a])),
    [agentsAggregated],
  );
  /** 驾驶舱图表数据：优先使用后端 Doris 聚合结果 */
  const employeesForCharts = useMemo(
    () => (agentsAggregated.length > 0 ? agentsAggregated : o3EmployeesDeduped),
    [agentsAggregated, o3EmployeesDeduped],
  );

  /** 各员工成功率的算术平均，作为「人均效率」主指标 */
  const avgEmployeeSuccessRate = useMemo(() => {
    const list = agentsAggregated.length > 0 ? agentsAggregated : o3EmployeesDeduped;
    if (!list.length) return null;
    const rates = list.map((a) => a.successRate).filter((x) => x != null && Number.isFinite(Number(x)));
    if (!rates.length) return null;
    return rates.reduce((s, x) => s + Number(x), 0) / rates.length;
  }, [agentsAggregated, o3EmployeesDeduped]);

  const channelBarData = useMemo(() => {
    const ch = data?.channels ?? [];
    const total = ch.reduce((s, c) => s + c.count, 0) || 1;
    return ch.slice(0, 8).map((c) => ({
      name: c.name,
      count: c.count,
      pct: Math.round((c.count / total) * 1000) / 10,
    }));
  }, [data]);

  /** 后端 o1.costTrendByEmployee：与顶部统计时间（activeDays）同一请求窗口 */
  const costTrendByEmployee = o1?.costTrendByEmployee;
  const employeeCostChartRows = useMemo(() => {
    const ct = costTrendByEmployee;
    if (!ct?.days?.length || !ct.series?.length) return [];
    const { days, series } = ct;
    return days.map((day, i) => {
      const row = { day };
      series.forEach((s, j) => {
        row[`s${j}`] = s.values[i] ?? 0;
      });
      return row;
    });
  }, [costTrendByEmployee]);
  const capabilityChartRows = useMemo(
    () =>
      employeesForCharts
        .map((a) => ({
          agentName: String(a.agentName ?? a.employeeKey ?? "").trim(),
          value: Number.isFinite(Number(a.avgSkillCount)) ? Number(a.avgSkillCount) : 0,
        }))
        .filter((x) => x.agentName)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [employeesForCharts],
  );
  const qualityChartRows = useMemo(
    () =>
      employeesForCharts
        .map((a) => ({
          agentName: String(a.agentName ?? a.employeeKey ?? "").trim(),
          value: Number.isFinite(Number(a.successRate)) ? Number(a.successRate) : 0,
        }))
        .filter((x) => x.agentName)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [employeesForCharts],
  );
  const efficacyChartRows = useMemo(
    () =>
      employeesForCharts
        .map((a) => ({
          agentName: String(a.agentName ?? a.employeeKey ?? "").trim(),
          value: Number.isFinite(Number(a.p95DurationMs)) ? Number(a.p95DurationMs) : 0,
        }))
        .filter((x) => x.agentName)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [employeesForCharts],
  );
  const securityChartRows = useMemo(
    () =>
      employeesForCharts
        .map((a) => ({
          agentName: String(a.agentName ?? a.employeeKey ?? "").trim(),
          value: Number.isFinite(Number(a.riskHighTotal)) ? Number(a.riskHighTotal) : 0,
        }))
        .filter((x) => x.agentName)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [employeesForCharts],
  );

  const tableRows = useMemo(() => {
    let list = o3EmployeesDeduped.map((r) => {
      const employeeKey = String(rowSessionKey(r) ?? "").trim();
      const agg = aggByEmployeeKey.get(employeeKey);
      if (!agg) return r;
      return {
        ...r,
        healthOverall: agg.healthOverall ?? r.healthOverall,
        securityRiskScore: agg.securityRiskScore ?? r.securityRiskScore,
        compositeScore: agg.compositeScore ?? r.compositeScore,
        successRate: agg.successRate ?? r.successRate,
        totalCostUsd: agg.totalCostUsd ?? r.totalCostUsd,
        p95DurationMs: agg.p95DurationMs ?? r.p95DurationMs,
      };
    });
    if (filterChannel) {
      list = list.filter((a) => (a.channels ?? []).some((c) => c.name === filterChannel));
    }
    if (filterHealthTier) {
      list = list.filter((a) => a.healthOverall === filterHealthTier);
    }
    if (listSort === "success_rate_asc") {
      list.sort((a, b) => (a.successRate ?? 1) - (b.successRate ?? 1));
    } else if (listSort === "cost_desc") {
      list.sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0));
    } else if (listSort === "p95_desc") {
      list.sort((a, b) => (b.p95DurationMs ?? 0) - (a.p95DurationMs ?? 0));
    } else if (listSort === "skill_asc") {
      list.sort((a, b) => (a.avgSkillCount ?? 999) - (b.avgSkillCount ?? 999));
    } else if (listSort === "risk_desc") {
      list.sort((a, b) => (b.securityRiskScore ?? 0) - (a.securityRiskScore ?? 0));
    } else if (listSort === "composite_desc") {
      list.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
    }
    return list;
  }, [o3EmployeesDeduped, aggByEmployeeKey, filterChannel, filterHealthTier, listSort]);

  // 概览列表：员工级行，已按 agent_name 去重；不做 TopN 截断
  const tableRowsDisplay = tableRows;

  const topRisk = useMemo(() => (data?.topN?.highRisk ?? []).slice(0, 5), [data]);
  const topEfficiency = useMemo(() => (data?.topN?.highEfficiency ?? []).slice(0, 5), [data]);
  const employeeTotal = o1?.employeeTotal ?? agentsAggregated.length ?? 0;
  const onlineEmployeeCount = o1?.onlineEmployeeCount15m ?? agentsAggregated.filter((a) => {
    const u = Number(a?.lastUpdatedAt) || 0;
    return u > 0 && Date.now() - u <= 15 * 60 * 1000;
  }).length;

  const goPortrait = useCallback((row) => {
    const payload = { agentName: row.agentName, days: activeDays };
    const sk = rowSessionKey(row);
    if (sk) payload.sessionKey = sk;
    sessionStorage.setItem("digital-employee:focusAgent", JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("openclaw-nav", { detail: { id: "digital-employee-list" } }));
  }, [activeDays]);
  const employeeByAgentName = useMemo(() => {
    const m = new Map();
    for (const r of employeesForCharts) {
      const k = String(r.agentName ?? "").trim();
      if (k) m.set(k, r);
    }
    return m;
  }, [employeesForCharts]);
  const drillByAgentName = useCallback(
    (agentName) => {
      const k = String(agentName ?? "").trim();
      if (!k) return;
      const row = employeeByAgentName.get(k);
      if (!row) return;
      goPortrait(row);
    },
    [employeeByAgentName, goPortrait],
  );

  const resetInteractions = () => {
    setFilterHealthTier(null);
    setFilterChannel(null);
    setListSort(null);
  };

  return (
    <div className="space-y-6">
      <CostTimeRangeFilter
        activeDays={activeDays}
        onPreset={(d) => {
          setActiveDays(d);
          resetInteractions();
        }}
      />

      {!loading && data && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {intl.get("digitalEmployee.overview.dataSource", { source: sourceLabel(data.source) })}
          {data?.days != null ? ` · ${intl.get("digitalEmployee.overview.rangeDays", { days: data.days })}` : ""}
        </p>
      )}

      {(filterHealthTier || filterChannel || listSort) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.filter.applied")}</span>
          <button
            type="button"
            onClick={resetInteractions}
            className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {intl.get("digitalEmployee.overview.filter.reset")}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {!loading && error && (
        <div className="app-card border-rose-200/80 bg-rose-50/50 p-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* O1 综合指标看板 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.overview.coreMetrics")}</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.health")}
                value={o1?.healthScorePct != null ? `${o1.healthScorePct}%` : "—"}
                accent="bg-primary-soft/30 dark:bg-primary/10"
              >
                <div className="mt-3 flex flex-wrap gap-1">
                  {(["green", "yellow", "red"]).map((tier) => {
                    const n = o1?.healthBuckets?.[tier] ?? 0;
                    return (
                      <span
                        key={tier}
                        className={[
                          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                          "text-gray-600 ring-gray-200 dark:text-gray-400 dark:ring-gray-600",
                        ].join(" ")}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: HEALTH_COLORS[tier] ?? "#94a3b8" }}
                        />
                        <span>{intl.get(`digitalEmployee.overview.tier.${tier}`)} {n}</span>
                      </span>
                    );
                  })}
                </div>
              </CoreMetricCard>
              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.employeeTotal")}
                value={employeeTotal}
                hint={intl.get("digitalEmployee.overview.metric.employeeTotalHint")}
              />
              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.onlineEmployee")}
                value={onlineEmployeeCount}
                hint={intl.get("digitalEmployee.overview.metric.onlineEmployeeHint")}
              />

              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.channelDistribution")}
                value={`${o1?.channelCount ?? 0}`}
                hint={intl.get("digitalEmployee.overview.metric.topChannelHint", {
                  channel: o1?.topChannel?.name ?? "—",
                  pct: o1?.topChannel?.pct != null ? fmtPct(o1.topChannel.pct) : "",
                })}
              >

              </CoreMetricCard>

              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.avgCost")}
                value={o1?.hasCostData ? fmtUsd(o1.avgDailyCostUsdPerEmployee) : "—"}
              >
                <p className="mt-2 text-[10px] text-gray-400">{intl.get("digitalEmployee.overview.metric.avgCostHint")}</p>
              </CoreMetricCard>

              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.avgEfficiency")}
                value={fmtPct(avgEmployeeSuccessRate ?? o1?.overallSuccessRate)}
              >
                <p className="mt-2 text-[10px] text-gray-400">{intl.get("digitalEmployee.overview.metric.avgEfficiencyHint")}</p>
              </CoreMetricCard>

              <CoreMetricCard
                title={intl.get("digitalEmployee.overview.metric.highRiskEmployee")}
                value={o1?.highRiskEmployeeCount ?? 0}
              >
                <p className="mt-2 text-[10px] text-rose-600 dark:text-rose-400">{intl.get("digitalEmployee.overview.metric.highRiskEmployeeHint")}</p>
              </CoreMetricCard>
            </div>
          </section>

          {/* O2 数字员工驾驶舱 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{intl.get("digitalEmployee.overview.cockpit.title")}</h3>
            {/* 成本：各员工在统计时间窗口内的按日成本趋势（与顶部 CostTimeRangeFilter 联动） */}
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <div className="app-card p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.cockpit.costTrend")}</p>
                <div className="mt-3 h-64 w-full">
                  {!o1?.hasCostData ? (
                    <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                      {intl.get("digitalEmployee.overview.cockpit.noCostData")}
                    </p>
                  ) : employeeCostChartRows.length === 0 || !costTrendByEmployee?.series?.length ? (
                    <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                      {intl.get("digitalEmployee.overview.cockpit.noEmployeeCostDailyData")}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={employeeCostChartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                        />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtUsd(v)} width={86} />
                        <Tooltip
                          formatter={(v, name) => [fmtUsd(v), name]}
                          labelFormatter={(d) => intl.get("digitalEmployee.overview.chart.dateLabel", { date: d })}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10 }}
                          formatter={(value) => <span className="text-gray-600 dark:text-gray-400">{value}</span>}
                          onClick={(e) => drillByAgentName(e?.value)}
                        />
                        {costTrendByEmployee.series.map((s, j) => (
                          <Line
                            key={s.agentName ?? `series-${j}`}
                            type="monotone"
                            dataKey={`s${j}`}
                            name={s.agentName}
                            stroke={EMPLOYEE_COST_LINE_COLORS[j % EMPLOYEE_COST_LINE_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div className="app-card p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.cockpit.sessionTrend")}</p>
                <div className="mt-3 h-64 w-full">
                  {!o1?.sessionTrendDaily?.length ? (
                    <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                      {intl.get("digitalEmployee.overview.cockpit.noSessionTrend")}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={o1.sessionTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)} />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        <Tooltip formatter={(v) => [`${v}`, intl.get("digitalEmployee.overview.chart.sessionCount")]} labelFormatter={(d) => intl.get("digitalEmployee.overview.chart.dateLabel", { date: d })} />
                        <Line type="monotone" dataKey="sessions" name={intl.get("digitalEmployee.overview.chart.sessionCount")} stroke="#2f6fed" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* 左：能力 / 质量 */}
              <div className="space-y-4">
                <div className="app-card p-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.cockpit.capabilityDist")}</p>
                  <div className="mt-2 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      {capabilityChartRows.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.overview.cockpit.noCapabilityData")}</p>
                      ) : (
                        <BarChart data={capabilityChartRows}>
                          <XAxis dataKey="agentName" tick={{ fontSize: 9 }} tickLine={false} />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip formatter={(v) => [`${v} ${intl.get("digitalEmployee.common.unit.count")}`, intl.get("digitalEmployee.overview.chart.avgSkillCount")]} />
                          <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} onClick={(p) => drillByAgentName(p?.payload?.agentName)} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">{intl.get("digitalEmployee.overview.cockpit.capabilityDistHint")}</p>
                </div>

                <div className="app-card p-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.cockpit.qualityDist")}</p>
                  <div className="mt-2 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      {qualityChartRows.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.overview.cockpit.noQualityData")}</p>
                      ) : (
                        <BarChart data={qualityChartRows}>
                          <XAxis dataKey="agentName" tick={{ fontSize: 9 }} tickLine={false} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                          <Tooltip formatter={(v) => [fmtPct(v), intl.get("digitalEmployee.overview.chart.successRate")]} />
                          <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} onClick={(p) => drillByAgentName(p?.payload?.agentName)} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">{intl.get("digitalEmployee.overview.cockpit.qualityDistHint")}</p>
                </div>
              </div>

              {/* 右：效能 / 安全 分布图 */}
              <div className="space-y-4">
                <div className="app-card p-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.cockpit.efficacyDist")}</p>
                  <div className="mt-2 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      {efficacyChartRows.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.overview.cockpit.noEfficacyData")}</p>
                      ) : (
                        <BarChart data={efficacyChartRows}>
                          <XAxis dataKey="agentName" tick={{ fontSize: 9 }} tickLine={false} />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip formatter={(v) => [fmtDurationMs(v), intl.get("digitalEmployee.overview.chart.p95Duration")]} />
                          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} onClick={(p) => drillByAgentName(p?.payload?.agentName)} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">{intl.get("digitalEmployee.overview.cockpit.efficacyDistHint")}</p>
                </div>

                <div className="app-card p-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.overview.cockpit.securityDist")}</p>
                  <div className="mt-2 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      {securityChartRows.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.overview.cockpit.noSecurityData")}</p>
                      ) : (
                        <BarChart data={securityChartRows}>
                          <XAxis dataKey="agentName" tick={{ fontSize: 9 }} tickLine={false} />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip formatter={(v) => [`${v} ${intl.get("digitalEmployee.common.unit.times")}`, intl.get("digitalEmployee.overview.chart.highRiskTag")]} />
                          <Bar dataKey="value" fill="#f43f5e" radius={[4, 4, 0, 0]} onClick={(p) => drillByAgentName(p?.payload?.agentName)} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">{intl.get("digitalEmployee.overview.cockpit.securityDistHint")}</p>
                </div>
              </div>
            </div>
          </section>

          {/* O3 + TopN：始终 TopN 在上、员工总表在下 */}
          <section>
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{intl.get("digitalEmployee.overview.top.title")}</h3>
          <div className="flex flex-col gap-4">
            <aside className="w-full shrink-0">
              <div className="app-card overflow-hidden p-0">
                <div className="flex border-b border-gray-100 dark:border-gray-800">
                  {[
                    { id: "highRisk", label: intl.get("digitalEmployee.overview.top.highRiskList") },
                    { id: "highEfficiency", label: intl.get("digitalEmployee.overview.top.highEfficiencyList") },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSideTab(t.id)}
                      className={[
                        "flex-1 px-3 py-2.5 text-xs font-medium transition",
                        sideTab === t.id
                          ? "border-b-2 border-primary bg-primary-soft/50 text-primary dark:bg-primary/10"
                          : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/80",
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* 高风险 / 高效率 Top5 小图表 + 清单 */}
                <div className="px-4 py-3">
                  {sideTab === "highRisk" && topRisk.length > 0 && (
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={topRisk.map((x, i) => ({
                            name: `${i + 1}. ${x.agentName}`,
                            high: x.riskHighTotal ?? 0,
                            medium: x.riskMediumTotal ?? 0,
                          }))}
                          margin={{ left: 12, right: 8, top: 4, bottom: 4 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} />
                          <Tooltip formatter={(v, n) => [`${v} ${intl.get("digitalEmployee.common.unit.times")}`, n === "high" ? intl.get("digitalEmployee.overview.risk.high") : intl.get("digitalEmployee.overview.risk.medium")]} />
                          <Bar dataKey="medium" stackId="risk" fill="#facc15" />
                          <Bar dataKey="high" stackId="risk" fill="#f97316" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {sideTab === "highEfficiency" && topEfficiency.length > 0 && (
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={topEfficiency.map((x, i) => ({
                            name: `${i + 1}. ${x.agentName}`,
                            score: x.efficiencyScore ?? 0,
                          }))}
                          margin={{ left: 12, right: 8, top: 4, bottom: 4 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} />
                          <Tooltip formatter={(v) => [`${v}`, intl.get("digitalEmployee.overview.chart.efficiencyScore")]} />
                          <Bar dataKey="score" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <ul className="max-h-[360px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
                  {sideTab === "highRisk" &&
                    topRisk.map((item, idx) => (
                      <li key={item.sessionKey || item.agentName}>
                        <button
                          type="button"
                          onClick={() =>
                            goPortrait({
                              agentName: item.agentName,
                              displayLabel: item.displayLabel,
                              sessionKey: item.sessionKey,
                            })
                          }
                          className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {idx + 1}. {item.agentName}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {intl.get("digitalEmployee.overview.top.highRiskStat", { high: item.riskHighTotal, medium: item.riskMediumTotal })}
                          </span>
                          <span className="line-clamp-1 max-w-full break-all font-mono text-[10px] text-gray-500 dark:text-gray-400">
                            {item.sessionKey || "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  {sideTab === "highEfficiency" &&
                    topEfficiency.map((item, idx) => (
                      <li key={item.sessionKey || item.agentName}>
                        <button
                          type="button"
                          onClick={() =>
                            goPortrait({
                              agentName: item.agentName,
                              displayLabel: item.displayLabel,
                              sessionKey: item.sessionKey,
                            })
                          }
                          className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {idx + 1}. {item.agentName}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {intl.get("digitalEmployee.overview.top.highEfficiencyStat", { score: item.efficiencyScore, successRate: fmtPct(item.successRate) })}
                          </span>
                          <span className="line-clamp-1 max-w-full break-all font-mono text-[10px] text-gray-500 dark:text-gray-400">
                            {item.sessionKey || "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </aside>

            {/* 员工总表（Top10） */}
            <section className="min-w-0 w-full app-card overflow-hidden p-0">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.overview.employeeList.title")}</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {intl.get("digitalEmployee.overview.list.sortLabel")}：{listSort ?? intl.get("digitalEmployee.overview.list.defaultSort")} · {intl.get("digitalEmployee.overview.list.showing")} {tableRowsDisplay.length} / {intl.get("digitalEmployee.overview.list.total")} {tableRows.length} {intl.get("digitalEmployee.overview.list.rows")}
                </p>
              </div>
              <div className="overflow-x-auto">
                {tableRows.length === 0 ? (
                  <p className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    {intl.get("digitalEmployee.overview.employeeList.empty")}
                  </p>
                ) : (
                  <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.name")}</th>
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.health")}</th>
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.type")}</th>
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.channel")}</th>
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.modelProvider")}</th>
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.modelName")}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.totalToken")}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.estimatedCost")}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.securityRiskScore")}</th>
                        <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("digitalEmployee.overview.employeeList.col.action")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {tableRowsDisplay.map((row, i) => (
                        <tr
                          key={rowSessionKey(row) || `${row.agentName}-${i}`}
                          className={[
                            "transition-colors hover:bg-primary-soft/40 dark:hover:bg-primary/10",
                            i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/40" : "bg-white dark:bg-transparent",
                          ].join(" ")}
                        >
                          <td className="px-3 py-3">
                            <p className="font-medium text-gray-900 dark:text-gray-100">{row.agentName}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={[
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                healthBadgeClass(row.healthOverall),
                              ].join(" ")}
                            >
                              {healthLabel(row.healthOverall)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{row.chatTypeTop ?? "—"}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{row.channels?.[0]?.name ?? "—"}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{row.dominantModelProvider ?? "—"}</td>
                          <td className="px-3 py-3 font-mono text-[11px] text-gray-700 dark:text-gray-200">{row.dominantModelName ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                            {(row.totalTokens ?? 0).toLocaleString("zh-CN")}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                            {row.totalCostUsd != null && row.totalCostUsd > 0 ? fmtUsd(row.totalCostUsd) : "—"}
                          </td>
                          <td className={`px-3 py-3 text-right tabular-nums ${riskScoreClass(row.securityRiskScore)}`}>
                            {row.securityRiskScore != null && Number.isFinite(Number(row.securityRiskScore))
                              ? Number(row.securityRiskScore).toFixed(1)
                              : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => goPortrait(row)}
                              className="rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/20 transition hover:bg-primary/10 dark:bg-primary/15"
                            >
                              {intl.get("digitalEmployee.overview.employeeList.viewPortrait")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
          </section>
        </>
      )}
    </div>
  );
}
