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
  const [inOutHidden, setInOutHidden] = useState(() => new Set());

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
      setInOutHidden(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [trendDays]);

  useEffect(() => {
    load();
  }, [load]);

  const barSeries = snapshot?.dailyByAgent?.series ?? [];
  const barRows = snapshot?.dailyByAgent?.rows ?? [];
  const trend14 = snapshot?.trend14d ?? [];
  const agentShare = snapshot?.agentShare ?? [];
  const modelShare = snapshot?.modelShare ?? [];
  const topSessions = snapshot?.topSessions ?? [];
  const agentTokenDetail = snapshot?.agentTokenDetail ?? [];
  const inOutPie = snapshot?.inOut?.pie ?? [];
  const cards = snapshot?.cards;
  const meta = snapshot?.meta;

  const trendWithCost = useMemo(
    () =>
      trend14.map((row) => ({
        ...row,
        costYuan: Math.round(Number(row.tokens || 0) * COST_YUAN_PER_M_TOKEN * 100) / 100,
      })),
    [trend14]
  );

  const overviewCards = useMemo(() => {
    if (!cards) return [];
    return [
      {
        kind: "total",
        title: intl.get("costAnalysis.todayToken"),
        value: cards.today.totalTokens,
        mom: cards.today.momPct,
        compareLabel: intl.get("costAnalysis.vsYesterday"),
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
      {
        kind: "avg",
        title: intl.get("costAnalysis.dailyAvg7d"),
        subtitle: intl.get("costAnalysis.dailyAvg7dSubtitle"),
        avgValue: cards.dailyAvg7d.avgTokens,
        peakDay: cards.dailyAvg7d.peakDay,
        peakValue: cards.dailyAvg7d.peakTokens,
        accent: "bg-white",
        border: "border-gray-100",
      },
    ];
  }, [cards, locale]);

  const dailySingleSeries =
    dailyAgentFilter == null ? null : barSeries.find((x) => x.dataKey === dailyAgentFilter) ?? null;

  const hasInOutData =
    (snapshot?.inOut?.inputTokens ?? 0) + (snapshot?.inOut?.outputTokens ?? 0) > 0;

  const inOutPieFiltered = useMemo(() => {
    return inOutPie.filter((e) => !inOutHidden.has(String(e.name)));
  }, [inOutPie, inOutHidden]);

  const handleInOutLegendClick = (o) => {
    const name = o?.value ?? o?.payload?.name;
    if (name == null || name === "—") return;
    setInOutHidden((prev) => {
      const next = new Set(prev);
      const key = String(name);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading && !snapshot) {
    return (
      <div className="space-y-3">
        <div className="app-card h-12 animate-pulse bg-gray-100/80 dark:bg-gray-800/80" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
        onPreset={(p) => setTrendDays(p.days ?? 7)}
      />

      {/* KPI：紧凑高度 + 左侧色条（整体约缩短 1/4） */}
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* 每日 Token 消耗情况 */}
      <section className="app-card p-3 sm:p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">{intl.get("costAnalysis.dailyTokenTitle")}</h2>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
        <div className="mt-2 h-[188px] w-full sm:h-[200px]">
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
      </section>

      {/* 大模型消耗占比 + 输入输出占比 并排 */}
      <section className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        {/* 大模型消耗占比 */}
        <div className="app-card flex flex-col p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">{intl.get("costAnalysis.modelShareTitle")}</h2>
          <div className="mt-2 w-full min-w-0 flex-1">
            {modelShare.length > 0 ? (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
                <div className="h-[188px] w-full max-w-[250px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={modelShare}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={66}
                        paddingAngle={2}
                      >
                        {modelShare.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => {
                          const m = modelShare.find((x) => x.name === name);
                          return [`${v}% ${m ? `(${fmtTokens(m.tokens)} Tokens)` : ""}`, name];
                        }}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full min-w-0 max-w-sm flex-1 space-y-1 text-[11px] sm:w-auto">
                  {modelShare.map((m) => (
                    <div key={m.name} className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.fill }} aria-hidden />
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{m.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">{intl.get("costAnalysis.noModelData")}</p>
            )}
          </div>
        </div>

        {/* Token 消耗占比：输入 / 输出 */}
        <div className="app-card flex flex-col p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">{intl.get("costAnalysis.tokenShareTitle")}</h2>
          <div className="mt-2 w-full min-w-0 flex-1">
            {hasInOutData ? (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
                <div className="h-[188px] w-full max-w-[250px] shrink-0">
                  {inOutPieFiltered.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
                      <p>{intl.get("costAnalysis.legendHidden")}</p>
                      <button
                        type="button"
                        onClick={() => setInOutHidden(new Set())}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {intl.get("costAnalysis.restoreDisplay")}
                      </button>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={inOutPieFiltered}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={38}
                          outerRadius={66}
                          paddingAngle={2}
                        >
                          {inOutPieFiltered.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => [`${v}%`, intl.get("costAnalysis.share")]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="w-full min-w-0 max-w-xs flex-1 space-y-2 text-[11px] sm:w-auto">
                  <div className="space-y-1">
                    {inOutPie.map((entry) => {
                      const hidden = inOutHidden.has(String(entry.name));
                      return (
                        <button
                          key={entry.name}
                          type="button"
                          onClick={() => handleInOutLegendClick({ value: entry.name })}
                          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md py-0.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <span
                            className={[
                              "flex min-w-0 items-center gap-1.5",
                              hidden ? "text-gray-400 line-through" : "text-gray-600 dark:text-gray-400",
                            ].join(" ")}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-gray-900"
                              style={{ background: entry.fill }}
                              aria-hidden
                            />
                            <span className="truncate">{entry.name}</span>
                          </span>
                          <span
                            className={[
                              "shrink-0 font-semibold tabular-nums",
                              hidden
                                ? "text-gray-400 line-through"
                                : entry.name === "输入 Token"
                                  ? "text-primary"
                                  : "text-emerald-700 dark:text-emerald-400",
                            ].join(" ")}
                          >
                            {entry.value}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-100 pt-2 dark:border-gray-800">
                    <div className="flex flex-col gap-1.5 text-gray-600 dark:text-gray-400 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
                      <span>
                        {intl.get("costAnalysis.input")}
                        <span className="font-semibold text-primary">{snapshot?.inOut?.inputPct ?? 0}%</span>
                      </span>
                      <span>
                        {intl.get("costAnalysis.output")}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {snapshot?.inOut?.outputPct ?? 0}%
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">{intl.get("costAnalysis.noInOutData")}</p>
            )}
          </div>
        </div>
      </section>

      {/* Agent 占比 + Top10 会话：宽屏两列并排 */}
      <section className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        <div className="app-card flex flex-col p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">{intl.get("costAnalysis.agentShareTitle")}</h2>
          <div className="mx-auto mt-2 w-full min-w-0 max-w-3xl">
            {agentShare.length > 0 ? (
              <AgentTokenRoseChart data={agentShare} height={195} />
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">{intl.get("costAnalysis.noAgentData")}</p>
            )}
            {agentShare.length > 0 ? (
              <div className="mt-2 grid gap-1 text-[11px] text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                {agentShare.map((e) => (
                  <div key={e.name} className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-gray-600 dark:text-gray-400">{e.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{e.value}%</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="app-card flex min-h-0 flex-col p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">{intl.get("costAnalysis.top10SessionTitle")}</h2>
          <div className="mt-2 min-h-0 flex-1">
            {topSessions.length > 0 ? (
              <ResponsiveContainer width="100%" height={260} minWidth={0}>
                <BarChart
                  data={topSessions}
                  layout="vertical"
                  margin={{ top: 4, right: 60, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v) => `${v}M`}
                  />
                  <YAxis
                    type="category"
                    dataKey="session_id"
                    width={120}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    tickFormatter={(v) =>
                      v.length > 16 ? `${v.slice(0, 14)}…` : v
                    }
                  />
                  <Tooltip
                    formatter={(v) => [`${v}M Tokens`, intl.get("costAnalysis.totalConsumption")]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(label) => {
                      const s = topSessions.find((x) => x.session_id === label);
                      if (!s) return label;
                      return (
                        <div className="space-y-1 text-left">
                          <div className="font-mono text-[11px]">{s.session_id}</div>
                          <div className="text-[10px] text-gray-500">{s.agentName}</div>
                          {s.userName && (
                            <div className="text-[10px] text-gray-500">{intl.get("costAnalysis.user", { name: s.userName })}</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="tokens" name={intl.get("costAnalysis.totalConsumption")} fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {topSessions.map((s, i) => (
                      <Cell key={`cell-${i}`} fill={i === 0 ? "#4f46e5" : i < 3 ? "#6366f1" : "#a5b4fc"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">{intl.get("costAnalysis.noSessionData")}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
