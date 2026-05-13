import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import TablePagination from "./TablePagination.jsx";
import {
  aggregateDurationStats,
  buildDurationHistogram,
  buildDurationTrendPairs,
  formatDurationMs,
  listRunsByDurationMsDesc,
} from "../lib/jobDurationMetrics.js";
import { formatRunStatusLabel } from "../lib/formatRunStatusLabel.js";

/** 任务执行耗时列表默认每页条数（与原先「Top 10」首屏一致） */
const DURATION_RUN_LIST_PAGE_SIZE = 10;

/** @param {number | null | undefined} ms */
function formatEpochMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  return new Date(Number(ms)).toLocaleString();
}

function statusClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "success" || s === "succeeded" || s === "ok" || s === "completed") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20";
  }
  if (s === "failed" || s === "error" || s === "failure") {
    return "bg-rose-50 text-rose-800 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/20";
  }
  if (s === "running" || s === "pending" || s === "started") {
    return "bg-amber-50 text-amber-900 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/20";
  }
  return "bg-gray-50 text-gray-700 ring-gray-500/15 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600/30";
}

function IconAvg(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 18h16M7 14l3-4 3 2 5-6" />
    </svg>
  );
}

function IconMax(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M8 16l4-8 4 5 4-10" />
    </svg>
  );
}

function IconMin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M8 8l4 8 4-5 4 3" />
    </svg>
  );
}

function IconLast(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.events
 * @param {boolean} props.loading
 * @param {string | null} props.error
 */
export default function JobPerformancePanel({ events, loading, error }) {
  const list = Array.isArray(events) ? events : [];
  const [durationListPage, setDurationListPage] = useState(1);
  const stats = useMemo(() => aggregateDurationStats(list), [list]);
  const trendPairs = useMemo(() => buildDurationTrendPairs(list), [list]);
  const hist = useMemo(() => buildDurationHistogram(list), [list]);
  const histLabels = useMemo(() => hist.labelKeys.map((k) => intl.get(k)), [hist]);
  const runsByDurationDesc = useMemo(() => listRunsByDurationMsDesc(list), [list]);

  useEffect(() => {
    setDurationListPage(1);
  }, [list]);

  useEffect(() => {
    const total = runsByDurationDesc.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / DURATION_RUN_LIST_PAGE_SIZE);
    if (durationListPage > totalPages) setDurationListPage(totalPages);
  }, [runsByDurationDesc.length, durationListPage]);

  const pagedDurationRows = useMemo(() => {
    const start = (durationListPage - 1) * DURATION_RUN_LIST_PAGE_SIZE;
    return runsByDurationDesc.slice(start, start + DURATION_RUN_LIST_PAGE_SIZE);
  }, [runsByDurationDesc, durationListPage]);

  const cards = useMemo(
    () => [
      {
        key: "avg",
        label: intl.get("scheduledTasks.taskDetail.performance.cardAvg"),
        value: formatDurationMs(stats.avg),
        iconBox: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
        Icon: IconAvg,
      },
      {
        key: "max",
        label: intl.get("scheduledTasks.taskDetail.performance.cardMax"),
        value: formatDurationMs(stats.max),
        iconBox: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
        Icon: IconMax,
      },
      {
        key: "min",
        label: intl.get("scheduledTasks.taskDetail.performance.cardMin"),
        value: formatDurationMs(stats.min),
        iconBox: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-400",
        Icon: IconMin,
      },
      {
        key: "last",
        label: intl.get("scheduledTasks.taskDetail.performance.cardLast"),
        value: formatDurationMs(stats.last),
        iconBox: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
        Icon: IconLast,
      },
    ],
    [stats],
  );

  const lineOption = useMemo(() => {
    if (!trendPairs.length) return null;
    return {
      tooltip: {
        trigger: "axis",
        textStyle: { fontSize: 12 },
        formatter(params) {
          const p = Array.isArray(params) ? params[0] : params;
          const raw = p?.value ?? p?.data;
          const pair = Array.isArray(raw) ? raw : null;
          if (!pair || pair.length < 2) return "";
          const [t, d] = pair;
          const when = Number.isFinite(t) ? new Date(t).toLocaleString() : "";
          return `${when}<br/>${intl.get("scheduledTasks.taskDetail.performance.tooltipDuration")} ${formatDurationMs(d)}`;
        },
      },
      grid: { left: 56, right: 16, top: 28, bottom: 48 },
      xAxis: {
        type: "time",
        axisLabel: { fontSize: 10, color: "#64748b", hideOverlap: true },
      },
      yAxis: {
        type: "value",
        name: intl.get("scheduledTasks.taskDetail.performance.axisDurationMs"),
        nameTextStyle: { fontSize: 11, color: "#64748b" },
        axisLabel: {
          fontSize: 10,
          color: "#64748b",
          formatter(v) {
            if (!Number.isFinite(v)) return "";
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
            if (v >= 1000) return `${Math.round(v / 1000)}k`;
            return String(Math.round(v));
          },
        },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [
        {
          type: "line",
          encode: { x: 0, y: 1 },
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { width: 2, color: "#0ea5e9" },
          itemStyle: { color: "#0ea5e9" },
          data: trendPairs,
        },
      ],
    };
  }, [trendPairs]);

  const barOption = useMemo(() => {
    if (!histLabels.length) return null;
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, textStyle: { fontSize: 12 } },
      grid: { left: 48, right: 16, top: 28, bottom: 72 },
      xAxis: {
        type: "category",
        data: histLabels,
        axisLabel: { fontSize: 9, color: "#64748b", rotate: 28, interval: 0 },
      },
      yAxis: {
        type: "value",
        name: intl.get("scheduledTasks.taskDetail.performance.axisRunCount"),
        minInterval: 1,
        axisLabel: { fontSize: 10, color: "#64748b" },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 28,
          itemStyle: { color: "#6366f1", borderRadius: [4, 4, 0, 0] },
          data: hist.values,
        },
      ],
    };
  }, [hist.values, histLabels]);

  return (
    <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
      {error && (
        <p className="border-b border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {intl.get("common.loadFailed", { error })}
        </p>
      )}
      <div className={`space-y-4 px-4 py-4 ${loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ key, label, value, iconBox, Icon }) => (
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
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          <div className="flex min-h-[300px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.performance.chartTrendTitle")}</h3>
            <div className="mt-2 min-h-0 flex-1">
              {lineOption ? (
                <ReactECharts option={lineOption} style={{ height: "100%", minHeight: "260px", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
              ) : (
                <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  {intl.get("common.noData")}
                </p>
              )}
            </div>
          </div>

          <div className="flex min-h-[300px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.performance.chartHistTitle")}</h3>
            <div className="mt-2 min-h-0 flex-1">
              {barOption ? (
                <ReactECharts option={barOption} style={{ height: "100%", minHeight: "260px", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
              ) : (
                <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  {intl.get("common.noData")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.performance.topDurationTitle")}</h3>
          {runsByDurationDesc.length > 0 ? (
            <div className="mt-3 space-y-3">
              <TablePagination
                page={durationListPage}
                pageSize={DURATION_RUN_LIST_PAGE_SIZE}
                total={runsByDurationDesc.length}
                onPageChange={setDurationListPage}
                loading={loading}
              />
              <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                    <th className="w-10 whitespace-nowrap px-2 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">
                      {intl.get("scheduledTasks.taskDetail.performance.colRank")}
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-semibold text-gray-700 dark:text-gray-300">
                      {intl.get("scheduledTasks.taskDetail.colRunAt")}
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
                      {intl.get("scheduledTasks.taskDetail.colDuration")}
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-semibold text-gray-700 dark:text-gray-300">
                      {intl.get("scheduledTasks.taskDetail.colStatus")}
                    </th>
                    <th className="min-w-[120px] px-2 py-2 font-semibold text-gray-700 dark:text-gray-300">
                      {intl.get("scheduledTasks.taskDetail.colModel")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDurationRows.map((row, idx) => (
                    <tr
                      key={`dur-run-${String(row.ts)}-${String(row.runAtMs)}-${row.durationMs}-${durationListPage}-${idx}`}
                      className="border-b border-gray-50 dark:border-gray-800/80"
                    >
                      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-gray-500 dark:text-gray-400">
                        {(durationListPage - 1) * DURATION_RUN_LIST_PAGE_SIZE + idx + 1}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-700 dark:text-gray-300">{formatEpochMs(row.runAtMs ?? row.ts)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {formatDurationMs(row.durationMs)}
                      </td>
                      <td className="px-2 py-2">
                        {row.status != null && String(row.status) ? (
                          <span
                            className={["inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", statusClass(row.status)].join(" ")}
                          >
                            {formatRunStatusLabel(row.status)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-2 py-2 text-gray-700 dark:text-gray-300" title={row.model != null ? String(row.model) : ""}>
                        {row.model != null && String(row.model) ? String(row.model) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            <p className="mt-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("common.noData")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
