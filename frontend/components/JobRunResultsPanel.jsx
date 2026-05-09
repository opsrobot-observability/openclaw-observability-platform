import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import { analyzeRunHistory, buildDailyExecutionChartsFromRunEvents } from "../lib/jobRunHistoryMetrics.js";
import { aggregateRunResults } from "../lib/jobRunResultsMetrics.js";
import JobRunHistoryTrendChart from "./JobRunHistoryTrendChart.jsx";
import ScheduledTasksRunOverviewCharts from "./ScheduledTasksRunOverviewCharts.jsx";

function IconTotal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  );
}

function IconOk(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconFail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconRate(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3v18M6 8l5-5 5 5M6 16l5 5 5-5" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.events
 * @param {boolean} props.loading
 * @param {string | null} props.error
 */
export default function JobRunResultsPanel({ events, loading, error }) {
  const list = Array.isArray(events) ? events : [];
  const dailyExecutionCharts = useMemo(() => buildDailyExecutionChartsFromRunEvents(list), [list]);
  const history = useMemo(() => analyzeRunHistory(list), [list]);
  const agg = useMemo(() => aggregateRunResults(list), [list]);

  const cards = useMemo(
    () => [
      {
        key: "total",
        label: intl.get("scheduledTasks.taskDetail.results.cardTotalRuns"),
        value: String(history.total),
        sub: null,
        iconBox: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
        Icon: IconTotal,
      },
      {
        key: "ok",
        label: intl.get("scheduledTasks.taskDetail.results.cardOk"),
        value: String(history.ok),
        sub: null,
        iconBox: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-400",
        Icon: IconOk,
      },
      {
        key: "fail",
        label: intl.get("scheduledTasks.taskDetail.results.cardFail"),
        value: String(history.fail),
        sub: null,
        iconBox: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
        Icon: IconFail,
      },
      {
        key: "rate",
        label: intl.get("scheduledTasks.taskDetail.results.cardRate"),
        value: history.successRatePct != null ? `${history.successRatePct}%` : "—",
        sub: null,
        iconBox: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
        Icon: IconRate,
      },
    ],
    [history],
  );

  const pieOption = useMemo(() => {
    const data = [];
    if (agg.ok > 0) {
      data.push({
        value: agg.ok,
        name: intl.get("scheduledTasks.taskDetail.results.pieOk"),
        itemStyle: { color: "#22c55e" },
      });
    }
    if (agg.bad > 0) {
      data.push({
        value: agg.bad,
        name: intl.get("scheduledTasks.taskDetail.results.pieFail"),
        itemStyle: { color: "#ef4444" },
      });
    }
    if (agg.neutral > 0) {
      data.push({
        value: agg.neutral,
        name: intl.get("scheduledTasks.taskDetail.results.pieOther"),
        itemStyle: { color: "#94a3b8" },
      });
    }
    return {
      tooltip: { trigger: "item", textStyle: { fontSize: 12 } },
      legend: { bottom: 2, textStyle: { fontSize: 10, color: "#64748b" } },
      series: [
        {
          type: "pie",
          radius: ["34%", "58%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 5, borderColor: "#fff", borderWidth: 2 },
          label: { formatter: "{b}\n{d}%", fontSize: 10 },
          data: data.length ? data : [{ value: 1, name: intl.get("common.noData"), itemStyle: { color: "#e2e8f0" } }],
        },
      ],
    };
  }, [agg.ok, agg.bad, agg.neutral]);

  return (
    <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
      {error && (
        <p className="border-b border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {intl.get("common.loadFailed", { error })}
        </p>
      )}
      <div className={`space-y-4 px-4 py-4 ${loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ key, label, value, sub, iconBox, Icon }) => (
            <div
              key={key}
              className="flex min-h-[88px] items-center gap-3.5 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${iconBox}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-tight text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-gray-900 tabular-nums dark:text-gray-50">{value}</p>
                {sub ? <p className="mt-1 text-[10px] leading-snug text-gray-400 dark:text-gray-500">{sub}</p> : null}
              </div>
            </div>
          ))}
        </div>

        <ScheduledTasksRunOverviewCharts charts={dailyExecutionCharts} loading={loading} heatmapOnly />

        <div className="grid gap-3 lg:grid-cols-[3fr_1fr] lg:items-stretch">
          <div className="flex min-h-[202px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900/40">
            <JobRunHistoryTrendChart events={list} compact chartHeightPx={216} />
          </div>

          <div className="flex min-h-[202px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900/40">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.results.chartPieTitle")}</h3>
            <div className="mt-1.5 min-h-0 flex-1">
              <ReactECharts option={pieOption} style={{ height: "100%", minHeight: "163px", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
