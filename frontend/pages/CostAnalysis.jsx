import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import AgentTokenRoseChart from "../components/AgentTokenRoseChart.jsx";
import CostTimeRangeFilter from "../components/CostTimeRangeFilter.jsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import intl from "react-intl-universal";
import { useLocale } from "../context/LocaleContext.jsx";

/** Token 折算费用：仅作代理指标（元/百万 Token） */
const COST_YUAN_PER_M_TOKEN = 3;

/** Token 数展示：自适应 K / M / B 单位 */
function fmtTokens(n) {
  const x = Math.round(Number(n) || 0);
  if (x >= 1e9) {
    const v = x / 1e9;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}B`;
  }
  if (x >= 1e6) {
    const v = x / 1e6;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (x >= 1e3) {
    const v = x / 1e3;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return String(x);
}

const CARD_ACCENTS = [
  "from-primary/10 to-blue-50 dark:from-primary/20 dark:to-gray-900",
  "from-emerald-50 to-emerald-50/50 dark:from-emerald-950/50 dark:to-gray-900",
  "from-sky-50 to-indigo-50/80 dark:from-sky-950/40 dark:to-gray-900",
  "from-amber-50 to-orange-50/70 dark:from-amber-950/40 dark:to-gray-900",
];

const CARD_BORDER = [
  "border-l-primary",
  "border-l-emerald-500",
  "border-l-indigo-500",
  "border-l-amber-500",
];

function MomBadge({ pct }) {
  const pos = pct >= 0;
  return (
    <span
      className={[
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        pos
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20"
          : "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/20",
      ].join(" ")}
    >
      {intl.get("costAnalysis.mom")} {pos ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}



export default function CostAnalysis() {
  const { locale } = useLocale();
  const [trendDays, setTrendDays] = useState(14);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [dailyAgentFilter, setDailyAgentFilter] = useState(null);
  const [dailyModelFilter, setDailyModelFilter] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/cost-overview?trendDays=${trendDays}`);
      const text = await r.text();
      if (!r.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text);
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg || `HTTP ${r.status}`);
      }
      const j = JSON.parse(text);
      setSnapshot(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [trendDays, rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const barSeries = snapshot?.dailyByAgent?.series ?? [];
  const barRows = snapshot?.dailyByAgent?.rows ?? [];
  const trend14 = snapshot?.trend14d ?? [];
  const agentShare = snapshot?.agentShare ?? [];
  const modelShare = snapshot?.modelShare ?? [];
  const agentTokenDetail = snapshot?.agentTokenDetail ?? [];
  const cards = snapshot?.cards;
  const abnormalities = snapshot?.abnormalities;
  const meta = snapshot?.meta;

  const trendWithCost = useMemo(
    () =>
      trend14.map((row) => ({
        ...row,
        costYuan: Math.round(Number(row.tokens || 0) * COST_YUAN_PER_M_TOKEN * 100) / 100,
      })),
    [trend14]
  );

  const modelDistSeries = snapshot?.dailyByModel?.series ?? [];
  const modelDistRows = snapshot?.dailyByModel?.rows ?? [];

  const overviewCards = useMemo(() => {
    if (!cards) return [];
    const isToday = trendDays === 1;
    const firstCardTitle = isToday
      ? intl.get("costAnalysis.todayToken")
      : trendDays
        ? intl.get("costAnalysis.lastNDaysTotal", { days: trendDays })
        : intl.get("costAnalysis.periodTotal");

    return [
      {
        kind: "total",
        title: firstCardTitle,
        value: cards.today.totalTokens,
        mom: cards.today.momPct,
        compareLabel: isToday ? intl.get("costAnalysis.vsYesterday") : intl.get("costAnalysis.vsPrevPeriod"),
        accent: CARD_ACCENTS[0],
        border: CARD_BORDER[0],
      },
      {
        kind: "total",
        title: intl.get("costAnalysis.weekToken"),
        value: cards.week.totalTokens,
        mom: cards.week.momPct,
        compareLabel: intl.get("costAnalysis.vsLastWeek"),
        accent: CARD_ACCENTS[1],
        border: CARD_BORDER[1],
      },
      {
        kind: "total",
        title: intl.get("costAnalysis.monthToken"),
        value: cards.month.totalTokens,
        mom: cards.month.momPct,
        compareLabel: intl.get("costAnalysis.vsLastMonth"),
        accent: CARD_ACCENTS[2],
        border: CARD_BORDER[2],
      },
    ];
  }, [cards, locale, trendDays]);

  const top5Instances = useMemo(() => {
    return agentShare.slice(0, 5);
  }, [agentShare]);

  const maxTokens = useMemo(() => {
    if (top5Instances.length === 0) return 0;
    return Math.max(...top5Instances.map((x) => x.tokens || 0));
  }, [top5Instances]);

  const topModels = useMemo(() => {
    return modelShare.slice(0, 5);
  }, [modelShare]);

  const maxModelTokens = useMemo(() => {
    if (topModels.length === 0) return 0;
    return Math.max(...topModels.map((x) => x.tokens || 0));
  }, [topModels]);

  const dailySingleSeries =
    dailyAgentFilter == null ? null : barSeries.find((x) => x.dataKey === dailyAgentFilter) ?? null;

  const modelSingleSeries =
    dailyModelFilter == null ? null : modelDistSeries.find((x) => x.dataKey === dailyModelFilter) ?? null;

  const handleModelClick = (name) => {
    window.dispatchEvent(
      new CustomEvent("openclaw-nav", {
        detail: { id: "llm-cost", params: { modelName: name } },
      })
    );
  };

  const handleInstanceClick = (name) => {
    window.dispatchEvent(
      new CustomEvent("openclaw-nav", {
        detail: { id: "agent-cost-detail", params: { agentName: name } },
      })
    );
  };

  if (loading && !snapshot) {
    return (
      <div className="space-y-3">
        <div className="app-card h-12 animate-pulse bg-gray-100/80 dark:bg-gray-800/80" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="app-card h-[5.25rem] animate-pulse bg-gray-100/80 dark:bg-gray-800/80" />
          ))}
        </div>
        <LoadingSpinner message={intl.get("costAnalysis.loadingOverview")} />
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
        {intl.get("costAnalysis.loadFailed", { error: err })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 顶部工具栏 */}
      <CostTimeRangeFilter
        activeDays={trendDays}
        onPreset={setTrendDays}
      />

      {/* KPI：紧凑高度 */}
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {overviewCards.map((m) => (
          <article
            key={m.title}
            className="app-card p-3.5 transition duration-200 hover:shadow-card-hover dark:hover:shadow-none border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
          >
            <div className="relative">
              {m.kind === "total" ? (
                <>
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{m.title}</p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-xl">
                      {fmtTokens(m.value)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {m.mom != null ? (
                      <MomBadge pct={m.mom} />
                    ) : (
                      <span className="text-[11px] text-gray-400">{intl.get("costAnalysis.noBaseline")}</span>
                    )}
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{m.compareLabel}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{m.title}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{m.subtitle}</p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-xl">
                      {fmtTokens(m.avgValue)}
                    </span>
                  </div>
                  <div className="mt-1.5 rounded-md border border-amber-200/80 bg-white/80 px-2 py-1 text-[10px] text-gray-600 dark:border-amber-800/60 dark:bg-gray-900/60 dark:text-gray-300">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{intl.get("costAnalysis.peakDay")}</span>
                    <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                    <span className="font-mono text-gray-800 dark:text-gray-200">{m.peakDay}</span>
                    <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                    <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-200">{fmtTokens(m.peakValue)}</span>
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      {/* 算力损耗异常 */}
      {abnormalities && (
        <section className="grid gap-3 sm:grid-cols-3">
          {/* 网关无效损耗 */}
          <div className="app-card overflow-hidden bg-white p-4 transition-all hover:shadow-md dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-950/30">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {intl.get("costAnalysis.gatewayLossTitle")}
              </h3>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {fmtTokens(abnormalities.gatewayLoss.tokens)}
              </span>
              <span className="text-xs text-rose-500 font-medium">({abnormalities.gatewayLoss.percentage}%)</span>
            </div>
            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {intl.get("costAnalysis.shareOfTotal")}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2 dark:border-gray-800">
              <span className="text-[10px] text-gray-500">{intl.get("costAnalysis.affectedSessions")}</span>
              <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{abnormalities.gatewayLoss.sessions} 次</span>
            </div>
          </div>

          {/* 实例死循环损耗 */}
          <div className="app-card overflow-hidden bg-white p-4 transition-all hover:shadow-md dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-500 dark:bg-amber-950/30">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {intl.get("costAnalysis.loopLossTitle")}
              </h3>
            </div>
            <div className="mt-3 flex items-center">
              <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {fmtTokens(abnormalities.loopLoss.tokens)}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {intl.get("costAnalysis.wastedTokens")}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2 dark:border-gray-800">
              <span className="text-[10px] text-gray-500">{intl.get("costAnalysis.abnormalCalls")}</span>
              <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{abnormalities.loopLoss.sessions} 次</span>
            </div>
          </div>

          {/* 模型异常报错 */}
          <div className="app-card overflow-hidden bg-white p-4 transition-all hover:shadow-md dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500 dark:bg-indigo-950/30">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {intl.get("costAnalysis.modelErrorTitle")}
              </h3>
            </div>
            <div className="mt-3 flex items-baseline">
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {abnormalities.modelErrors.errorRate}%
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {intl.get("costAnalysis.errorRate")} 激增中
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2 dark:border-gray-800">
              <span className="text-[10px] text-gray-500">{intl.get("costAnalysis.affectedSessions")}</span>
              <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{abnormalities.modelErrors.errorCalls} 次</span>
            </div>
          </div>
        </section>
      )}

      {/* 实例消耗分布情况 */}
      <section className="app-card p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
          {intl.get("costAnalysis.instanceDistTitle")}
        </h2>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row">
          {/* 左侧：图表 */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("costAnalysis.agentFilter")}</span>
              <button
                type="button"
                onClick={() => setDailyAgentFilter(null)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  dailyAgentFilter == null
                    ? "border-primary bg-primary-soft text-primary dark:bg-primary/20"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600",
                ].join(" ")}
              >
                {intl.get("common.all")}
              </button>
              {barSeries.map((s) => {
                const active = dailyAgentFilter === s.dataKey;
                return (
                  <button
                    key={s.dataKey}
                    type="button"
                    onClick={() => setDailyAgentFilter(active ? null : s.dataKey)}
                    className={[
                      "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary-soft text-primary dark:bg-primary/20"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600",
                    ].join(" ")}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 h-[220px] w-full">
              {barRows.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-gray-400">{intl.get("common.noData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={barRows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickMargin={8} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={40} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [`${v}M`, name]}
                      labelFormatter={(l) => intl.get("costAnalysis.dateLabel", { label: l })}
                    />
                    {dailyAgentFilter == null ? (
                      barSeries.map((s, idx) => (
                        <Bar
                          key={s.dataKey}
                          dataKey={s.dataKey}
                          name={s.name}
                          stackId={barSeries.length > 1 ? "agent" : undefined}
                          fill={s.color}
                          maxBarSize={48}
                          radius={idx === barSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      ))
                    ) : dailySingleSeries ? (
                      <Bar
                        dataKey={dailySingleSeries.dataKey}
                        name={dailySingleSeries.name}
                        fill={dailySingleSeries.color}
                        maxBarSize={48}
                        radius={[4, 4, 0, 0]}
                      />
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 右侧：TOP5 榜单 */}
          <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 pt-4 lg:pt-0 lg:pl-6">
            <h3 className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">
              {intl.get("costAnalysis.top5InstanceTitle")}
            </h3>
            <div className="space-y-4">
              {top5Instances.map((item, idx) => (
                <div
                  key={item.name}
                  onClick={() => handleInstanceClick(item.name)}
                  className="group flex cursor-pointer flex-col gap-1.5 rounded-lg p-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <div className="flex items-center justify-between gap-3 overflow-hidden">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={[
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white shadow-sm",
                          idx < 3 ? "bg-primary text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800",
                        ].join(" ")}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                        {item.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {fmtTokens(item.tokens)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/80 transition-all duration-500"
                      style={{ width: `${maxTokens > 0 ? (item.tokens / maxTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {top5Instances.length === 0 && (
                <p className="text-center py-8 text-xs text-gray-400">{intl.get("common.noData")}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 模型消耗分布情况 */}
      <section className="app-card p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
          {intl.get("costAnalysis.modelDistTitle")}
        </h2>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row">
          {/* 左侧：图表 */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("costAnalysis.modelFilter")}</span>
              <button
                type="button"
                onClick={() => setDailyModelFilter(null)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  dailyModelFilter == null
                    ? "border-primary bg-primary-soft text-primary dark:bg-primary/20"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600",
                ].join(" ")}
              >
                {intl.get("common.all")}
              </button>
              {modelDistSeries.map((s) => {
                const active = dailyModelFilter === s.dataKey;
                return (
                  <button
                    key={s.dataKey}
                    type="button"
                    onClick={() => setDailyModelFilter(active ? null : s.dataKey)}
                    className={[
                      "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary-soft text-primary dark:bg-primary/20"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600",
                    ].join(" ")}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 h-[220px] w-full">
              {modelDistRows.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-gray-400">{intl.get("common.noData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={modelDistRows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickMargin={8} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={40} tickFormatter={(v) => `${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [`${v}M`, name]}
                      labelFormatter={(l) => intl.get("costAnalysis.dateLabel", { label: l })}
                    />
                    {dailyModelFilter == null ? (
                      modelDistSeries.map((s, idx) => (
                        <Bar
                          key={s.dataKey}
                          dataKey={s.dataKey}
                          name={s.name}
                          stackId={modelDistSeries.length > 1 ? "model" : undefined}
                          fill={s.color}
                          maxBarSize={48}
                          radius={idx === modelDistSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      ))
                    ) : modelSingleSeries ? (
                      <Bar
                        dataKey={modelSingleSeries.dataKey}
                        name={modelSingleSeries.name}
                        fill={modelSingleSeries.color}
                        maxBarSize={48}
                        radius={[4, 4, 0, 0]}
                      />
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 右侧：TOP 模型榜单 */}
          <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 pt-4 lg:pt-0 lg:pl-6">
            <h3 className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">
              {intl.get("costAnalysis.topModelTitle")}
            </h3>
            <div className="space-y-4">
              {topModels.map((item, idx) => (
                <div
                  key={item.name}
                  onClick={() => handleModelClick(item.name)}
                  className="group flex cursor-pointer flex-col gap-1.5 rounded-lg p-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <div className="flex items-center justify-between gap-3 overflow-hidden">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={[
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white shadow-sm",
                          idx === 0
                            ? "bg-primary"
                            : idx < 3
                              ? "bg-primary/70"
                              : "bg-gray-300 dark:bg-gray-700",
                        ].join(" ")}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate text-xs font-medium text-gray-700 group-hover:text-primary dark:text-gray-300 transition-colors">
                        {item.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {fmtTokens(item.tokens)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/80 transition-all duration-500"
                      style={{ width: `${maxModelTokens > 0 ? (item.tokens / maxModelTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {topModels.length === 0 && (
                <p className="text-center py-8 text-xs text-gray-400">{intl.get("common.noData")}</p>
              )}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
