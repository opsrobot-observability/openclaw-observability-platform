import { useMemo } from "react";
import intl from "react-intl-universal";
import { analyzeRunHistory } from "../lib/jobRunHistoryMetrics.js";
import JobRunHistoryTrendChart from "./JobRunHistoryTrendChart.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";

/**
 * @param {object} props
 * @param {object[]} props.events
 * @param {boolean} props.loading
 * @param {string | null} props.error
 */
export default function JobRunHistoryPanel({ events, loading, error }) {
  const h = useMemo(() => analyzeRunHistory(events), [events]);

  if (loading && (!events || events.length === 0)) {
    return <LoadingSpinner message={intl.get("scheduledTasks.taskDetail.runHistory.loading")} className="py-12" />;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {intl.get("common.loadFailed", { error })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.runHistory.cardRuns")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{h.total}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.runHistory.cardFails")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-300">{h.fail}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.runHistory.cardSuccessRate")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {h.successRatePct != null ? `${h.successRatePct}%` : "—"}
          </div>
        </div>
      </div>

      <JobRunHistoryTrendChart events={events} />
    </div>
  );
}
