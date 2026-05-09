import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import { analyzeJobStability } from "../lib/jobStabilityMetrics.js";
import LoadingSpinner from "./LoadingSpinner.jsx";

/** @param {number | null | undefined} ms */
function formatEpochMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  return new Date(Number(ms)).toLocaleString();
}

/** @param {number | null | undefined} ms */
function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function statusClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "success" || s === "succeeded" || s === "ok" || s === "completed") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20";
  }
  if (s === "failed" || s === "error" || s === "failure") {
    return "bg-rose-50 text-rose-800 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/20";
  }
  return "bg-gray-50 text-gray-700 ring-gray-500/15 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600/30";
}

/**
 * @param {object} props
 * @param {object[]} props.events
 * @param {number} props.totalLines
 * @param {object | null} props.job
 * @param {boolean} props.loading
 * @param {string | null} props.error
 */
export default function JobStabilityPanel({ events, totalLines, job, loading, error }) {
  const [trendDays, setTrendDays] = useState(7);

  const a = useMemo(() => analyzeJobStability(events, job, totalLines), [events, job, totalLines]);

  const trendRows = trendDays === 30 ? a.trend30 : a.trend7;

  const pieOption = useMemo(() => {
    const data = [];
    if (a.ok > 0) {
      data.push({
        value: a.ok,
        name: intl.get("scheduledTasks.taskDetail.stability.pieSuccess"),
        itemStyle: { color: "#22c55e" },
      });
    }
    if (a.bad > 0) {
      data.push({
        value: a.bad,
        name: intl.get("scheduledTasks.taskDetail.stability.pieFailure"),
        itemStyle: { color: "#ef4444" },
      });
    }
    if (a.neutral > 0) {
      data.push({
        value: a.neutral,
        name: intl.get("scheduledTasks.taskDetail.stability.pieOther"),
        itemStyle: { color: "#94a3b8" },
      });
    }
    return {
      tooltip: { trigger: "item", textStyle: { fontSize: 12 } },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
      series: [
        {
          type: "pie",
          radius: ["40%", "68%"],
          center: ["50%", "46%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
          label: { formatter: "{b}\n{c}", fontSize: 11 },
          data: data.length ? data : [{ value: 1, name: intl.get("common.noData"), itemStyle: { color: "#e2e8f0" } }],
        },
      ],
    };
  }, [a.ok, a.bad, a.neutral]);

  const lineOption = useMemo(() => {
    const dates = trendRows.map((r) => r.date.slice(5));
    const ok = trendRows.map((r) => r.ok);
    const fail = trendRows.map((r) => r.fail);
    return {
      tooltip: { trigger: "axis", textStyle: { fontSize: 12 } },
      legend: {
        data: [intl.get("scheduledTasks.taskDetail.stability.legendOk"), intl.get("scheduledTasks.taskDetail.stability.legendFail")],
        bottom: 0,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      grid: { left: 48, right: 16, top: 24, bottom: 56 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: trendDays === 30 ? 45 : 0 },
      },
      yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10, color: "#64748b" }, splitLine: { lineStyle: { color: "#f1f5f9" } } },
      series: [
        {
          name: intl.get("scheduledTasks.taskDetail.stability.legendOk"),
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { width: 2, color: "#22c55e" },
          itemStyle: { color: "#22c55e" },
          data: ok,
        },
        {
          name: intl.get("scheduledTasks.taskDetail.stability.legendFail"),
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { width: 2, color: "#ef4444" },
          itemStyle: { color: "#ef4444" },
          data: fail,
        },
      ],
    };
  }, [trendRows, trendDays]);

  const verdictLabel = intl.get(`scheduledTasks.taskDetail.stability.verdict.${a.verdict}`);
  const verdictBanner =
    a.verdict === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
      : a.verdict === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100";

  const punctualityLabel = intl.get(`scheduledTasks.taskDetail.stability.punctuality.${a.lastPunctuality.kind}`);
  const punctualityExtra =
    a.lastPunctuality.deltaMs != null && Number.isFinite(a.lastPunctuality.deltaMs) && a.lastPunctuality.kind !== "unknown"
      ? ` (${a.lastPunctuality.deltaMs > 0 ? "+" : ""}${formatDuration(Math.abs(a.lastPunctuality.deltaMs))})`
      : "";

  const lastStatusLabel =
    a.lastIsSuccess
      ? intl.get("scheduledTasks.taskDetail.stability.lastStatusSuccess")
      : a.lastIsFailure
        ? intl.get("scheduledTasks.taskDetail.stability.lastStatusFailure")
        : intl.get("scheduledTasks.taskDetail.stability.lastStatusUnknown");

  if (loading && (!events || events.length === 0)) {
    return <LoadingSpinner message={intl.get("scheduledTasks.taskDetail.stability.loading")} className="py-16" />;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {intl.get("common.loadFailed", { error })}
        </p>
      )}

      <div className={`rounded-xl border px-4 py-3 ${verdictBanner}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{verdictLabel}</p>
            <p className="mt-1 text-xs opacity-90">{intl.get("scheduledTasks.taskDetail.stability.positioning")}</p>
          </div>
          {a.verdictReasons.length > 0 && (
            <ul className="max-w-xl list-inside list-disc text-xs opacity-95">
              {a.verdictReasons.map((k) => (
                <li key={k}>{intl.get(`scheduledTasks.taskDetail.stability.reason.${k}`)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {a.partial && (
        <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
          {intl.get("scheduledTasks.taskDetail.stability.partialNote", { loaded: a.loaded, total: a.fileTotal })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.totalRuns")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{a.fileTotal}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.okVsFail")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            <span className="text-emerald-600 dark:text-emerald-400">{a.ok}</span>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-rose-600 dark:text-rose-400">{a.bad}</span>
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.successRateLabel")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {a.successRatePct == null ? "—" : `${a.successRatePct}%`}
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.consecutiveFail")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">{a.consecutiveFailFromNewest}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.lastRunStatus")}</div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{lastStatusLabel}</div>
          {a.lastStatus != null && String(a.lastStatus) ? (
            <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(a.lastStatus)}`}>{String(a.lastStatus)}</span>
          ) : null}
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.lastRunTime")}</div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{formatEpochMs(a.lastRunAtMs)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.punctualityTitle")}</div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {punctualityLabel}
            {punctualityExtra}
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:col-span-2 lg:col-span-2">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.stability.schedulerState")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
            <span>
              {intl.get("scheduledTasks.taskDetail.stability.schedulerLast")}:{" "}
              {a.schedulerLastRunStatus != null && String(a.schedulerLastRunStatus) ? (
                <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass(a.schedulerLastRunStatus)}`}>
                  {String(a.schedulerLastRunStatus)}
                </span>
              ) : (
                "—"
              )}
            </span>
            <span>
              {intl.get("scheduledTasks.taskDetail.stability.schedulerConsecutive")}:{" "}
              <span className="font-semibold tabular-nums">{a.schedulerConsecutiveErrors ?? "—"}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.stability.chartPie")}</h3>
          </div>
          <div className="p-2">
            <ReactECharts option={pieOption} style={{ height: 300, width: "100%" }} opts={{ renderer: "svg" }} />
          </div>
        </section>

        <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.stability.chartTrend")}</h3>
            </div>
            <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setTrendDays(7)}
                className={[
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  trendDays === 7 ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                ].join(" ")}
              >
                {intl.get("scheduledTasks.taskDetail.stability.trend7")}
              </button>
              <button
                type="button"
                onClick={() => setTrendDays(30)}
                className={[
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  trendDays === 30 ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                ].join(" ")}
              >
                {intl.get("scheduledTasks.taskDetail.stability.trend30")}
              </button>
            </div>
          </div>
          <div className="p-2">
            <ReactECharts option={lineOption} style={{ height: 320, width: "100%" }} opts={{ renderer: "svg" }} />
          </div>
        </section>
      </div>
    </div>
  );
}
