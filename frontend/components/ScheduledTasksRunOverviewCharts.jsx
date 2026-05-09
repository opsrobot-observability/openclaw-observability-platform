import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import Icon from "./Icon.jsx";
import LogTimeRangePicker, { resolvePresetRangeMs } from "./LogTimeRangePicker.jsx";

/** @param {number | null | undefined} ms */
function formatAvgMsAxis(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** @param {number | null | undefined} ms */
function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

/** @param {number | null | undefined} n */
function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n}%`;
}

/** @param {number | null | undefined} n */
function formatTokenAxis(n) {
  if (n == null || !Number.isFinite(n)) return "0";
  const abs = Math.abs(Number(n));
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(Number(n)));
}

/** Token 趋势按任务堆叠时的配色（与输入/输出双色区分） */
const TOKEN_JOB_STACK_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

const JOB_TOP10_TABLE_DASH = "—";

/** 运行概览图表区空状态占位高度，与有数据时 ECharts 高度一致，避免卡片塌缩 */
const RUN_OVERVIEW_BAR_CHART_EMPTY_MIN_PX = 240;
const RUN_OVERVIEW_PIE_CHART_EMPTY_MIN_PX = 300;

/** 作业执行 Top10：展示单次最慢/最近执行的开始时刻（ISO 或后端 DATETIME 字符串） */
function formatJobTop10ExecTime(raw) {
  if (raw == null || String(raw).trim() === "") return JOB_TOP10_TABLE_DASH;
  const t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return JOB_TOP10_TABLE_DASH;
  return new Date(t).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** 成功率徽章：高为好（与主机资源「高为差」相反） */
function jobTop10SuccessRateBadgeClass(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
  if (n >= 90) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300";
  if (n >= 70) return "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/35 dark:text-red-300";
}

/**
 * 任务 TOP10：表格式展示，版式对齐主机监控 TopHostsTable。
 * @param {{
 *   tab: "runCount" | "failCount" | "maxDur" | "avgDur" | "successRate",
 *   rows: object[],
 *   maxRows?: number,
 *   showExecTimeColumn?: boolean,
 *   showAgentColumn?: boolean,
 *   showMetricProgressBars?: boolean,
 *   hideJobIdColumn?: boolean,
 *   rowDrillable?: boolean,
 *   onJobRowClick?: (row: object) => void,
 * }} props
 */
function JobTop10Table({
  tab,
  rows,
  maxRows = 10,
  showExecTimeColumn = false,
  showAgentColumn = false,
  showMetricProgressBars = false,
  hideJobIdColumn = false,
  rowDrillable = false,
  onJobRowClick,
}) {
  const nameCol = intl.get("scheduledTasks.execution.colJobName");
  const agentCol =
    intl.get("scheduledTasks.runOverview.jobTop10ColAgentName") || intl.get("scheduledTasks.taskDetail.listTableColAgent");
  const idCol = intl.get("scheduledTasks.execution.colJobId");
  const execStatusCol = intl.get("scheduledTasks.runOverview.execJobTop10ColStatus");
  const execTimeCol = intl.get("scheduledTasks.runOverview.execJobTop10ColExecTime");
  const runsCol = intl.get("scheduledTasks.runOverview.analysisColRuns");
  const failCol = intl.get("scheduledTasks.runOverview.analysisColFailRuns");
  const okCol = intl.get("scheduledTasks.runOverview.analysisColOk");
  const failShortCol = intl.get("scheduledTasks.runOverview.analysisColFail");
  const srCol = intl.get("scheduledTasks.runOverview.analysisColSuccessRate");
  const maxDurCol = intl.get("scheduledTasks.taskDetail.listColMaxDuration");
  const avgDurCol = intl.get("scheduledTasks.taskDetail.listColAvgDuration");
  const emptyText = intl.get("scheduledTasks.runOverview.chartEmpty");
  const drillHint = intl.get("scheduledTasks.runOverview.jobTop10RowDrillHint");

  const showExecTime = Boolean(showExecTimeColumn) && tab === "maxDur";
  const showExecStatus = showExecTime;
  const hideJobId = Boolean(hideJobIdColumn) || showExecTime;
  const showAgent = Boolean(showAgentColumn);
  const metricCols = tab === "runCount" ? 1 : tab === "successRate" ? 4 : 2;
  let colSpan = 1 + (showExecStatus ? 1 : 0) + (showExecTime ? 1 : 0) + 1 + (showAgent ? 1 : 0) + (hideJobId ? 0 : 1) + metricCols;

  const okStatusLabel = intl.get("scheduledTasks.execution.filterStatusSuccess");
  const failStatusLabel = intl.get("scheduledTasks.execution.filterStatusFailure");
  const otherStatusLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesOther");
  const execStatusBadge = (raw) => {
    const s = raw != null ? String(raw).trim() : "";
    if (!s) return { text: JOB_TOP10_TABLE_DASH, cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" };
    const k = s.toLowerCase();
    if (k === "success" || k === "succeeded" || k === "ok" || k === "completed") {
      return { text: okStatusLabel, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300" };
    }
    if (k === "error" || k === "failed" || k === "failure") {
      return { text: failStatusLabel, cls: "bg-red-100 text-red-700 dark:bg-red-900/35 dark:text-red-300" };
    }
    return { text: otherStatusLabel || s, cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" };
  };

  const thead = (
    <thead className="bg-gray-50/80 dark:bg-gray-800/50">
      <tr>
        <th className="w-8 px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">#</th>
        {showExecStatus ? (
          <th className="whitespace-nowrap px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{execStatusCol}</th>
        ) : null}
        {showExecTime ? (
          <th className="whitespace-nowrap px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{execTimeCol}</th>
        ) : null}
        <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{nameCol}</th>
        {showAgent ? (
          <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{agentCol}</th>
        ) : null}
        {hideJobId ? null : <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{idCol}</th>}
        {tab === "runCount" ? null : (
          <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{runsCol}</th>
        )}
        {tab === "failCount" ? (
          <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{failCol}</th>
        ) : null}
        {tab === "maxDur" ? (
          <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{maxDurCol}</th>
        ) : null}
        {tab === "avgDur" ? (
          <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{avgDurCol}</th>
        ) : null}
        {tab === "successRate" ? (
          <>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{okCol}</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{failShortCol}</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{srCol}</th>
          </>
        ) : null}
        {tab === "runCount" ? (
          <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{runsCol}</th>
        ) : null}
      </tr>
    </thead>
  );

  if (!rows || rows.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="min-w-full text-left text-xs">
          {thead}
          <tbody>
            <tr>
              <td colSpan={colSpan} className="px-3 py-4 text-center text-gray-400 dark:text-gray-500">
                {emptyText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const slice = rows.slice(0, maxRows);
  const showProgressBar =
    showExecTime ||
    (Boolean(showMetricProgressBars) &&
      !showExecTime &&
      (tab === "runCount" || tab === "failCount" || tab === "avgDur" || tab === "successRate"));
  let progressMax = 1;
  if (showProgressBar && showExecTime) {
    for (const r of slice) {
      const v = r?.maxDurationMs != null && Number.isFinite(Number(r.maxDurationMs)) ? Number(r.maxDurationMs) : 0;
      progressMax = Math.max(progressMax, v);
    }
  } else if (showProgressBar && !showExecTime) {
    if (tab === "runCount") {
      for (const r of slice) progressMax = Math.max(progressMax, Number(r?.runCount) || 0);
    } else if (tab === "failCount") {
      for (const r of slice) progressMax = Math.max(progressMax, Number(r?.failureCount) || 0);
    } else if (tab === "avgDur") {
      for (const r of slice) {
        const v = r?.avgDurationMs != null && Number.isFinite(Number(r.avgDurationMs)) ? Number(r.avgDurationMs) : 0;
        progressMax = Math.max(progressMax, v);
      }
    } else if (tab === "successRate") {
      progressMax = 100;
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
      <table className="min-w-full text-left text-xs">
        {thead}
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {slice.map((row, index) => {
            const runs = Number(row.runCount) || 0;
            const fails = Number(row.failureCount) || 0;
            const ok = Number(row.successCount) || 0;
            const sr = row.successRatePct != null && Number.isFinite(Number(row.successRatePct)) ? Number(row.successRatePct) : null;
            const maxMs = row.maxDurationMs != null && Number.isFinite(Number(row.maxDurationMs)) ? Number(row.maxDurationMs) : null;
            const avgMs = row.avgDurationMs != null && Number.isFinite(Number(row.avgDurationMs)) ? Number(row.avgDurationMs) : null;
            const execAtRaw = showExecTime ? row.maxDurationRunStartedAt : null;
            const execStatusRaw = showExecTime ? row.maxDurationRunStatus : null;
            const execStatus = showExecStatus ? execStatusBadge(execStatusRaw) : null;
            const agentNameStr = row.jobAgentName != null && String(row.jobAgentName).trim() ? String(row.jobAgentName).trim() : "";
            const agentIdStr = row.jobAgentId != null && String(row.jobAgentId).trim() ? String(row.jobAgentId).trim() : "";
            const agentColumnText = agentNameStr || agentIdStr || JOB_TOP10_TABLE_DASH;
            const clickable = Boolean(rowDrillable && onJobRowClick && row?.jobId != null && String(row.jobId).trim());
            return (
              <tr
                key={String(row.jobId ?? index)}
                className={[
                  "transition-colors",
                  clickable
                    ? "cursor-pointer hover:bg-primary/5 focus-within:bg-primary/5 dark:hover:bg-primary/10"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/30",
                ].join(" ")}
                onClick={() => {
                  if (!clickable) return;
                  onJobRowClick(row);
                }}
                onKeyDown={(e) => {
                  if (!clickable) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onJobRowClick(row);
                  }
                }}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `${row.jobName ? String(row.jobName) : String(row.jobId)}。${drillHint}` : undefined}
              >
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{index + 1}</td>
                {showExecStatus ? (
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={["inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-semibold", execStatus?.cls].join(" ")}>
                      {execStatus?.text ?? JOB_TOP10_TABLE_DASH}
                    </span>
                  </td>
                ) : null}
                {showExecTime ? (
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">{formatJobTop10ExecTime(execAtRaw)}</td>
                ) : null}
                <td className="max-w-[180px] px-3 py-2 font-medium text-gray-800 dark:text-gray-200">
                  <div className="truncate">{row.jobName ? String(row.jobName) : JOB_TOP10_TABLE_DASH}</div>
                  {!showExecTime && !showAgent && agentColumnText !== JOB_TOP10_TABLE_DASH ? (
                    <div className="mt-0.5 truncate font-mono text-[10px] font-normal text-gray-500 dark:text-gray-400">{agentColumnText}</div>
                  ) : null}
                </td>
                {showAgent ? (
                  <td className="max-w-[160px] truncate px-3 py-2 text-gray-700 dark:text-gray-300" title={agentColumnText}>
                    {agentColumnText}
                  </td>
                ) : null}
                {hideJobId ? null : (
                  <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[10px] text-gray-600 dark:text-gray-400">{String(row.jobId ?? "")}</td>
                )}
                {tab === "runCount" ? (
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                    {showProgressBar && !showExecTime ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums">{runs}</span>
                        <div className="h-1.5 w-28 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.max(0, (runs / progressMax) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono tabular-nums">{runs}</span>
                    )}
                  </td>
                ) : null}
                {tab === "failCount" || tab === "maxDur" || tab === "avgDur" || tab === "successRate" ? (
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 dark:text-gray-100">{runs}</td>
                ) : null}
                {tab === "failCount" ? (
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                    {showProgressBar && !showExecTime ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums">{fails}</span>
                        <div className="h-1.5 w-28 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.max(0, (fails / progressMax) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono tabular-nums">{fails}</span>
                    )}
                  </td>
                ) : null}
                {tab === "maxDur" ? (
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono tabular-nums">{maxMs != null ? formatDurationMs(maxMs) : JOB_TOP10_TABLE_DASH}</span>
                      {showProgressBar ? (
                        <div className="h-1.5 w-28 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.max(0, ((maxMs ?? 0) / progressMax) * 100))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {tab === "avgDur" ? (
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                    {showProgressBar && !showExecTime ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums">{avgMs != null ? formatDurationMs(avgMs) : JOB_TOP10_TABLE_DASH}</span>
                        <div className="h-1.5 w-28 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.max(0, (((avgMs ?? 0) / progressMax) * 100))) }%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono tabular-nums">{avgMs != null ? formatDurationMs(avgMs) : JOB_TOP10_TABLE_DASH}</span>
                    )}
                  </td>
                ) : null}
                {tab === "successRate" ? (
                  <>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 dark:text-gray-100">{ok}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 dark:text-gray-100">{fails}</td>
                    <td className="px-3 py-2 text-right">
                      {showProgressBar && !showExecTime ? (
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={[
                              "inline-flex min-w-[3rem] justify-end rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                              jobTop10SuccessRateBadgeClass(sr ?? NaN),
                            ].join(" ")}
                          >
                            {sr != null ? formatPct(sr) : JOB_TOP10_TABLE_DASH}
                          </span>
                          <div className="h-1.5 w-28 rounded-full bg-gray-100 dark:bg-gray-800">
                            <div
                              className="h-1.5 rounded-full bg-primary"
                              style={{ width: `${Math.min(100, Math.max(0, ((Number(sr) || 0) / progressMax) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span
                          className={[
                            "inline-flex min-w-[3rem] justify-end rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                            jobTop10SuccessRateBadgeClass(sr ?? NaN),
                          ].join(" ")}
                        >
                          {sr != null ? formatPct(sr) : JOB_TOP10_TABLE_DASH}
                        </span>
                      )}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 与趋势图一致：将接口 `day` 规范为 `YYYY-MM-DD` */
function normalizeTrendDayLabel(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 或时间戳字符串 → 本地日历日 `YYYY-MM-DD` */
function isoToLocalDayStr(iso) {
  if (iso == null || String(iso).trim() === "") return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 本地时区日历日 `YYYY-MM-DD`（与 `isoToLocalDayStr` 一致） */
function msToLocalYmd(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} ymd */
function parseYmdParts(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

/** 本地自然日边界（与热力图 `YYYY-MM-DD` 键一致），供运行记录下钻筛选 */
function localDayStartEndIso(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0);
  const end = new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** 公历月天数，m 为 1–12 */
function daysInCalendarMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/** 从 startYmd 到 endYmd 覆盖的每个自然月 `{ y, m }`（m 为 1–12） */
function monthsInRangeInclusive(startYmd, endYmd) {
  const a = parseYmdParts(startYmd);
  const b = parseYmdParts(endYmd);
  if (!a || !b) return [];
  const out = [];
  let y = a.y;
  let mo = a.m;
  const endKey = b.y * 12 + b.m;
  while (y * 12 + mo <= endKey) {
    out.push({ y, m: mo });
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

/** @param {number} y @param {number} m 1–12 @param {number} d */
function ymdFromYmdParts(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 自然月按「周一打头」铺成 7 列周历；筛选用 startYmd/endYmd 截断。
 * @returns {({ kind: "empty" } | { kind: "day", date: string, dom: number, ok: number, fail: number, other: number, total: number })[][]}
 */
function buildMonthWeekRowsMonFirst(y, m, startYmd, endYmd, byDay) {
  const dim = daysInCalendarMonth(y, m);
  const first = new Date(y, m - 1, 1);
  const dow = first.getDay();
  const padMon = dow === 0 ? 6 : dow - 1;
  /** @type {({ kind: "empty" } | { kind: "day", date: string, dom: number, ok: number, fail: number, other: number, total: number })[]} */
  const flat = [];
  for (let i = 0; i < padMon; i += 1) flat.push({ kind: "empty" });
  for (let dom = 1; dom <= dim; dom += 1) {
    const date = ymdFromYmdParts(y, m, dom);
    if (date < startYmd || date > endYmd) flat.push({ kind: "empty" });
    else {
      const r = byDay.get(date) ?? { ok: 0, fail: 0, other: 0, total: 0 };
      flat.push({ kind: "day", date, dom, ...r });
    }
  }
  while (flat.length % 7 !== 0) flat.push({ kind: "empty" });
  const rows = [];
  for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
  return rows;
}

/**
 * 日历格底色：按当日执行结果语义着色（与右侧「执行总数/失败次数/成功率」图例无关）。
 * 灰=无执行；绿=全部成功；红=无成功；黄=部分成功。
 * @param {{ kind: string, total?: number, ok?: number }} cell
 */
function dayHeatmapOutcomeBgClass(cell) {
  if (!cell || cell.kind !== "day") return "bg-slate-50/90 dark:bg-slate-900/55";
  const total = Number(cell.total) || 0;
  const ok = Number(cell.ok) || 0;
  if (total <= 0) {
    return "bg-slate-200/95 text-slate-600 dark:bg-slate-700/90 dark:text-slate-300";
  }
  if (ok === total) {
    return "bg-emerald-500/90 dark:bg-emerald-600/85";
  }
  if (ok <= 0) {
    return "bg-rose-600/90 dark:bg-rose-700/85";
  }
  return "bg-amber-400/90 dark:bg-amber-500/80";
}

/** 热力图格子右上角日期数字：与底色对比可读 */
function dayHeatmapCornerDateClass(cell) {
  if (!cell || cell.kind !== "day") return "text-slate-500 dark:text-slate-400";
  const total = Number(cell.total) || 0;
  const ok = Number(cell.ok) || 0;
  if (total <= 0) return "text-slate-600 dark:text-slate-300";
  if (ok === total) return "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]";
  if (ok <= 0) return "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]";
  return "text-amber-950/95 drop-shadow-sm dark:text-amber-950/90";
}

/**
 * @param {{ dates: boolean, totalRuns: boolean, failures: boolean, successRate: boolean }} d
 * @returns {string}
 */
function heatmapCellPaddingClass(d) {
  const anyStat = d.totalRuns || d.failures || d.successRate;
  if (d.dates && anyStat) return "min-h-[48px] pt-5";
  if (d.dates && !anyStat) return "min-h-[40px] pt-5 pb-2";
  if (!d.dates && anyStat) return "min-h-[44px] pt-3";
  return "min-h-[44px] pt-3";
}

/** @param {string} ymd `YYYY-MM-DD` @returns {string} 月份-日期，如 `4-23` */
function heatmapCornerDateLabel(ymd) {
  const p = typeof ymd === "string" ? ymd.split("-") : [];
  if (p.length !== 3) return "";
  const m = Number(p[1]);
  const d = Number(p[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return "";
  return `${m}-${d}`;
}

/** @param {number} ok @param {number} total */
function formatDaySuccessRateLabel(ok, total) {
  if (total <= 0) return "—";
  const pct = (ok / total) * 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-6) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

/** @param {number} ok @param {number} total @returns {number | null} 0–100 */
function daySuccessRatePct(ok, total) {
  if (total <= 0) return null;
  return (ok / total) * 100;
}

/**
 * 成功率模式下：区间外淡化（含无执行数据的格子）。
 * @param {number | null} pct
 * @param {number} minPct
 * @param {number} maxPct
 */
function successRateCellDimmed(pct, minPct, maxPct) {
  if (minPct === 0 && maxPct === 100) return false;
  if (pct == null) return true;
  return pct < minPct || pct > maxPct;
}

/**
 * 执行总数 / 失败次数 区间外淡化（与竖条刻度一致：0 … domainMax）。
 * @param {number} value
 * @param {number} minV
 * @param {number} maxV
 * @param {number} domainMax 至少为 1
 */
function countRangeCellDimmed(value, minV, maxV, domainMax) {
  const d = Math.max(1, Math.floor(domainMax));
  if (minV === 0 && maxV >= d) return false;
  return value < minV || value > maxV;
}

/**
 * 竖直渐变条上的双柄区间（0% 在下、100% 在上），与日历热力格子筛选联动。
 * @param {{ min: number, max: number, setMin: (n: number) => void, setMax: (n: number) => void }} p
 */
function SuccessRateVerticalRangeSlider({ min, max, setMin, setMax }) {
  const trackRef = useRef(null);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  minRef.current = min;
  maxRef.current = max;

  const [dragKind, setDragKind] = useState(/** @type {"min" | "max" | null} */ (null));

  useEffect(() => {
    if (!dragKind) return undefined;
    const onMove = (e) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      const v = Math.round(Math.min(100, Math.max(0, ((r.bottom - e.clientY) / r.height) * 100)));
      if (dragKind === "min") setMin(Math.min(v, maxRef.current));
      else setMax(Math.max(v, minRef.current));
    };
    const onEnd = () => setDragKind(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragKind, setMin, setMax]);

  const onTrackPointerDown = (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest?.("button")) return;
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const v = Math.round(Math.min(100, Math.max(0, ((r.bottom - e.clientY) / r.height) * 100)));
    const dMin = Math.abs(v - minRef.current);
    const dMax = Math.abs(v - maxRef.current);
    if (dMin <= dMax) {
      setMin(Math.min(v, maxRef.current));
      setDragKind("min");
    } else {
      setMax(Math.max(v, minRef.current));
      setDragKind("max");
    }
  };

  const thumbClass =
    "absolute z-[2] min-h-[1.25rem] min-w-[2rem] max-w-[2.75rem] cursor-grab rounded-md border-2 border-white bg-slate-800 px-0.5 py-0.5 text-center text-[9px] font-semibold leading-tight text-white shadow-md outline-none hover:bg-slate-700 active:cursor-grabbing dark:border-slate-100 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 self-center lg:self-center">
      <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">100%</span>
      <div
        ref={trackRef}
        role="group"
        aria-label={intl.get("scheduledTasks.runOverview.chartCalendarSrRangeGroup")}
        className="relative h-[8.05rem] w-6 shrink-0 cursor-ns-resize touch-none select-none sm:h-[10.35rem] lg:h-[12.65rem] lg:w-7"
        onPointerDown={onTrackPointerDown}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-emerald-600 via-amber-200 to-red-300 ring-1 ring-inset ring-slate-200/55 dark:from-emerald-700 dark:via-amber-800/60 dark:to-red-900/70 dark:ring-slate-600/55"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${min}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${100 - max}%` }}
          aria-hidden
        />
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - min}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMin")} ${min}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={min}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("min");
          }}
        >
          {min}%
        </button>
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - max}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMax")} ${max}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={max}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("max");
          }}
        >
          {max}%
        </button>
      </div>
      <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">0%</span>
    </div>
  );
}

/** @param {number} n */
function formatCountThumb(n) {
  if (!Number.isFinite(n)) return "0";
  const v = Math.round(n);
  if (v > 999) return "999+";
  return String(Math.max(0, v));
}

/**
 * 竖直渐变条上的双柄区间（0 在下、domainMax 在上），与日历格子按执行总数或失败次数筛选联动。
 * @param {{
 *   kind: "total" | "failures",
 *   domainMax: number,
 *   min: number,
 *   max: number,
 *   setMin: (n: number) => void,
 *   setMax: (n: number) => void,
 * }} p
 */
function CountVerticalRangeSlider({ kind, domainMax, min, max, setMin, setMax }) {
  const d = Math.max(1, Math.floor(domainMax));
  const trackRef = useRef(null);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const dRef = useRef(d);
  minRef.current = min;
  maxRef.current = max;
  dRef.current = d;

  const [dragKind, setDragKind] = useState(/** @type {"min" | "max" | null} */ (null));

  useEffect(() => {
    if (!dragKind) return undefined;
    const onMove = (e) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      const dm = dRef.current;
      const raw = ((r.bottom - e.clientY) / r.height) * dm;
      const v = Math.round(Math.min(dm, Math.max(0, raw)));
      if (dragKind === "min") setMin(Math.min(v, maxRef.current));
      else setMax(Math.max(v, minRef.current));
    };
    const onEnd = () => setDragKind(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragKind, setMin, setMax]);

  const onTrackPointerDown = (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest?.("button")) return;
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const raw = ((r.bottom - e.clientY) / r.height) * d;
    const v = Math.round(Math.min(d, Math.max(0, raw)));
    const dMin = Math.abs(v - minRef.current);
    const dMax = Math.abs(v - maxRef.current);
    if (dMin <= dMax) {
      setMin(Math.min(v, maxRef.current));
      setDragKind("min");
    } else {
      setMax(Math.max(v, minRef.current));
      setDragKind("max");
    }
  };

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const minPct = (lo / d) * 100;
  const maxPct = (hi / d) * 100;
  const topLabel = d > 999 ? "999+" : String(d);
  const gradientBar =
    kind === "total"
      ? "bg-gradient-to-b from-blue-800 via-blue-300 to-slate-100 dark:from-blue-950 dark:via-blue-700 dark:to-slate-800"
      : "bg-gradient-to-b from-rose-900 via-rose-300 to-slate-100 dark:from-rose-950 dark:via-rose-700 dark:to-slate-800";

  const thumbClass =
    "absolute z-[2] min-h-[1.25rem] min-w-[2rem] max-w-[2.75rem] cursor-grab rounded-md border-2 border-white bg-slate-800 px-0.5 py-0.5 text-center text-[9px] font-semibold leading-tight text-white shadow-md outline-none hover:bg-slate-700 active:cursor-grabbing dark:border-slate-100 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 self-center lg:self-center">
      <span className="max-w-[4.5rem] truncate text-center text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
        {topLabel}
      </span>
      <div
        ref={trackRef}
        role="group"
        aria-label={intl.get("scheduledTasks.runOverview.chartCalendarCountRangeGroup")}
        className="relative h-[8.05rem] w-6 shrink-0 cursor-ns-resize touch-none select-none sm:h-[10.35rem] lg:h-[12.65rem] lg:w-7"
        onPointerDown={onTrackPointerDown}
      >
        <div
          className={["pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-slate-200/55 dark:ring-slate-600/55", gradientBar].join(
            " ",
          )}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${minPct}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-full bg-slate-900/40 dark:bg-black/45"
          style={{ height: `${100 - maxPct}%` }}
          aria-hidden
        />
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - minPct}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMin")} ${formatCountThumb(lo)}`}
          aria-valuemin={0}
          aria-valuemax={d}
          aria-valuenow={lo}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("min");
          }}
        >
          {formatCountThumb(lo)}
        </button>
        <button
          type="button"
          className={`${thumbClass} -translate-x-1/2 -translate-y-1/2`}
          style={{ left: "50%", top: `${100 - maxPct}%` }}
          aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarSrMax")} ${formatCountThumb(hi)}`}
          aria-valuemin={0}
          aria-valuemax={d}
          aria-valuenow={hi}
          role="slider"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragKind("max");
          }}
        >
          {formatCountThumb(hi)}
        </button>
      </div>
      <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-300">0</span>
    </div>
  );
}

/**
 * @param {{
 *   charts: object | null,
 *   loading?: boolean,
 *   error?: string | null,
 * }} props
 * error 由父级统一展示横幅，此处仅接收 loading / charts。
 */
export default function ScheduledTasksRunOverviewCharts({
  charts,
  loading,
  heatmapOnly = false,
  onOpenTaskDetail,
  onOpenExecutionForJob,
}) {
  const [heatmapMetric, setHeatmapMetric] = useState(/** @type {"total" | "failures" | "successRate"} */ ("total"));
  /** 与日志检索相同的时间预设 + 自定义区间；在已加载的 chart 时间范围内取交集 */
  const [heatmapTimePreset, setHeatmapTimePreset] = useState("30d");
  const [heatmapCustomStart, setHeatmapCustomStart] = useState("");
  const [heatmapCustomEnd, setHeatmapCustomEnd] = useState("");
  /** 热力图格子内展示项：日期、执行次数、失败次数、成功率（默认仅显示成功率） */
  const [heatmapDisplay, setHeatmapDisplay] = useState(() => ({
    dates: false,
    totalRuns: false,
    failures: false,
    successRate: true,
  }));
  /** `<details>` 点击外部不会收起，改用受控菜单 + 文档 mousedown 关闭 */
  const [heatmapDisplayOpen, setHeatmapDisplayOpen] = useState(false);
  const heatmapDisplayMenuRef = useRef(null);
  /** 成功率视图：仅显示成功率 ∈ [min,max] 的日期（0–100）；其它指标下不使用 */
  const [srFilterMin, setSrFilterMin] = useState(0);
  const [srFilterMax, setSrFilterMax] = useState(100);
  /** 执行总数视图：格子 total ∈ [min,max]（刻度 0…maxTotal） */
  const [totalFilterMin, setTotalFilterMin] = useState(0);
  const [totalFilterMax, setTotalFilterMax] = useState(1);
  /** 失败次数视图：格子 fail ∈ [min,max]（刻度 0…maxFail） */
  const [failFilterMin, setFailFilterMin] = useState(0);
  const [failFilterMax, setFailFilterMax] = useState(1);
  const trend = Array.isArray(charts?.trend) ? charts.trend : [];

  useEffect(() => {
    if (!heatmapDisplayOpen) return;
    const onDoc = (e) => {
      const t = /** @type {Node} */ (e.target);
      if (heatmapDisplayMenuRef.current?.contains(t)) return;
      setHeatmapDisplayOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setHeatmapDisplayOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [heatmapDisplayOpen]);

  const slowTop10 = Array.isArray(charts?.slowTop10) ? charts.slowTop10 : [];
  const jt = charts?.jobTop10Analysis && typeof charts.jobTop10Analysis === "object" ? charts.jobTop10Analysis : {};
  const byRunCount = Array.isArray(jt.byRunCount) ? jt.byRunCount : [];
  const byFailCount = Array.isArray(jt.byFailCount) ? jt.byFailCount : [];
  const byMaxDurationMs = Array.isArray(jt.byMaxDurationMs) ? jt.byMaxDurationMs : slowTop10;
  const byAvgDurationMs = Array.isArray(jt.byAvgDurationMs) ? jt.byAvgDurationMs : [];
  const bySuccessRate = Array.isArray(jt.bySuccessRate) ? jt.bySuccessRate : [];
  const distribution = charts?.distribution && typeof charts.distribution === "object" ? charts.distribution : {};
  const failureReasonDistribution = Array.isArray(charts?.failureReasonDistribution)
    ? charts.failureReasonDistribution
    : [];
  const tokenDistributionByJob = Array.isArray(charts?.tokenDistributionByJob) ? charts.tokenDistributionByJob : [];
  const chartRange = charts?.range && typeof charts.range === "object" ? charts.range : {};

  /** @type {"runCount" | "failCount" | "avgDur" | "successRate"} */
  const [jobTop10Tab, setJobTop10Tab] = useState("runCount");

  const trendOption = useMemo(() => {
    if (!trend.length) return null;
    const days = trend.map((t) => normalizeTrendDayLabel(t.day));
    const ok = trend.map((t) => Number(t.successCount) || 0);
    const fail = trend.map((t) => Number(t.failureCount) || 0);
    const other = trend.map((t) => {
      const tot =
        t.totalCount != null && Number.isFinite(Number(t.totalCount))
          ? Math.max(0, Math.floor(Number(t.totalCount)))
          : Number(t.successCount) + Number(t.failureCount);
      const o = Number(t.successCount) || 0;
      const f = Number(t.failureCount) || 0;
      return Math.max(0, tot - o - f);
    });
    const hasOther = other.some((v) => v > 0);
    const avgRaw = trend.map((t) => (t.avgDurationMs != null && Number.isFinite(Number(t.avgDurationMs)) ? Number(t.avgDurationMs) : null));
    const hasAvgLine = avgRaw.some((v) => v != null && Number.isFinite(v));
    const avgForEcharts = hasAvgLine
      ? avgRaw.map((v) => (v != null && Number.isFinite(v) ? v : "-"))
      : null;
    const okLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesSuccess") || "OK";
    const failLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesFailure") || "Fail";
    const otherLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesOther") || "Other";
    const avgLabel = intl.get("scheduledTasks.runOverview.chartTrendSeriesAvgDur") || "Avg";
    const barLegend = hasOther ? [okLabel, failLabel, otherLabel] : [okLabel, failLabel];
    const legendData = hasAvgLine ? [...barLegend, avgLabel] : barLegend;
    const gridRight = hasAvgLine ? 56 : 20;
    const series = [
      {
        name: okLabel,
        type: "bar",
        stack: "runs",
        barMaxWidth: 28,
        itemStyle: { color: "#22c55e" },
        data: ok,
      },
      {
        name: failLabel,
        type: "bar",
        stack: "runs",
        barMaxWidth: 28,
        itemStyle: { color: "#f43f5e" },
        data: fail,
      },
    ];
    if (hasOther) {
      series.push({
        name: otherLabel,
        type: "bar",
        stack: "runs",
        barMaxWidth: 28,
        itemStyle: { color: "#94a3b8" },
        data: other,
      });
    }
    if (hasAvgLine && avgForEcharts) {
      series.push({
        name: avgLabel,
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        connectNulls: false,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: "#6366f1" },
        lineStyle: { width: 2 },
        data: avgForEcharts,
      });
    }
    return {
      tooltip: {
        trigger: "axis",
        textStyle: { fontSize: 12 },
        formatter(params) {
          if (!Array.isArray(params) || !params.length) return "";
          const day = params[0]?.axisValue ?? "";
          const lines = [day];
          for (const p of params) {
            const val = p.data;
            if (p.seriesName === avgLabel && val != null && val !== "-" && Number.isFinite(Number(val))) {
              lines.push(`${p.marker}${p.seriesName}: ${formatDurationMs(Number(val))}`);
            } else if (val != null && val !== "-") {
              lines.push(`${p.marker}${p.seriesName}: ${val}`);
            }
          }
          return lines.join("<br/>");
        },
      },
      legend: { data: legendData, bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
      grid: { left: 52, right: gridRight, top: 28, bottom: 52 },
      xAxis: {
        type: "category",
        data: days,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: days.length > 10 ? 32 : 0 },
      },
      yAxis: hasAvgLine
        ? [
            {
              type: "value",
              name: intl.get("scheduledTasks.runOverview.chartTrendAxisRuns") || "",
              min: 0,
              minInterval: 1,
              axisLabel: { fontSize: 10, color: "#64748b" },
              splitLine: { lineStyle: { color: "#f1f5f9" } },
            },
            {
              type: "value",
              name: intl.get("scheduledTasks.runOverview.chartTrendAxisAvgDur") || "",
              min: 0,
              scale: false,
              axisLabel: {
                fontSize: 10,
                color: "#94a3b8",
                formatter: (v) => formatAvgMsAxis(Number(v)),
              },
              splitLine: { show: false },
            },
          ]
        : [
            {
              type: "value",
              name: intl.get("scheduledTasks.runOverview.chartTrendAxisRuns") || "",
              min: 0,
              minInterval: 1,
              axisLabel: { fontSize: 10, color: "#64748b" },
              splitLine: { lineStyle: { color: "#f1f5f9" } },
            },
          ],
      series,
    };
  }, [trend]);

  const dailyTokenTrendOption = useMemo(() => {
    if (!trend.length) return null;
    const days = trend.map((t) => normalizeTrendDayLabel(t.day));
    const tokenTrendRows = Array.isArray(charts?.tokenTrendByJob) ? charts.tokenTrendByJob : [];
    const tokAxis = intl.get("scheduledTasks.runOverview.chartTokenAxis");
    const countLbl = intl.get("scheduledTasks.runOverview.failureReason.tooltipCount");

    const buildByJobStack = () => {
      if (!tokenTrendRows.length) return null;
      const TOP_N = 8;
      const jobTotals = new Map();
      for (const r of tokenTrendRows) {
        const jid = String(r.jobId ?? "").trim();
        if (!jid) continue;
        jobTotals.set(jid, (jobTotals.get(jid) || 0) + (Number(r.totalTokens) || 0));
      }
      if (!jobTotals.size) return null;
      const topJobIds = [...jobTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_N)
        .map(([id]) => id);
      const jobNameById = new Map();
      for (const r of tokenTrendRows) {
        const jid = String(r.jobId ?? "").trim();
        if (!jid || !topJobIds.includes(jid)) continue;
        if (!jobNameById.has(jid)) {
          const nm = r.jobName != null && String(r.jobName).trim() ? String(r.jobName).trim() : jid;
          jobNameById.set(jid, nm);
        }
      }
      const cell = new Map();
      for (const r of tokenTrendRows) {
        const d = normalizeTrendDayLabel(r.day);
        const jid = String(r.jobId ?? "").trim();
        if (!d || !jid) continue;
        const k = `${d}\t${jid}`;
        cell.set(k, (cell.get(k) || 0) + (Number(r.totalTokens) || 0));
      }
      /** @type {object[]} */
      const series = [];
      for (let i = 0; i < topJobIds.length; i++) {
        const jid = topJobIds[i];
        const rawName = jobNameById.get(jid) || jid;
        const short = String(rawName).length > 16 ? `${String(rawName).slice(0, 15)}…` : String(rawName);
        const data = days.map((d) => Math.floor(cell.get(`${d}\t${jid}`) || 0));
        series.push({
          name: short,
          type: "bar",
          stack: "jobTok",
          barMaxWidth: 22,
          itemStyle: { color: TOKEN_JOB_STACK_COLORS[i % TOKEN_JOB_STACK_COLORS.length] },
          data,
        });
      }
      const otherLbl = intl.get("scheduledTasks.runOverview.tokenTrendByJobOther");
      const otherData = days.map((d) => {
        let s = 0;
        for (const r of tokenTrendRows) {
          if (normalizeTrendDayLabel(r.day) !== d) continue;
          const jid = String(r.jobId ?? "").trim();
          if (!jid || topJobIds.includes(jid)) continue;
          s += Number(r.totalTokens) || 0;
        }
        return Math.floor(s);
      });
      if (otherData.some((v) => v > 0)) {
        series.push({
          name: otherLbl,
          type: "bar",
          stack: "jobTok",
          barMaxWidth: 22,
          itemStyle: { color: "#94a3b8" },
          data: otherData,
        });
      }
      const hasAny = series.some((s) => Array.isArray(s.data) && s.data.some((v) => Number(v) > 0));
      if (!hasAny) return null;
      const legendNames = series.map((s) => String(s.name ?? ""));
      return {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: 12 },
          formatter(params) {
            if (!Array.isArray(params) || !params.length) return "";
            const day = params[0]?.axisValue ?? "";
            const sum = params.reduce((acc, p) => acc + (Number(p?.data) || 0), 0);
            const lines = [day];
            for (const p of params) {
              lines.push(`${p.marker}${p.seriesName}: ${formatTokenAxis(Number(p?.data) || 0)}`);
            }
            lines.push(`${tokAxis} ${countLbl}: ${formatTokenAxis(sum)}`);
            return lines.join("<br/>");
          },
        },
        legend: { type: "scroll", data: legendNames, bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
        grid: { left: 56, right: 20, top: 20, bottom: 56 },
        xAxis: {
          type: "category",
          data: days,
          axisLabel: { fontSize: 10, color: "#64748b", rotate: days.length > 10 ? 32 : 0 },
        },
        yAxis: {
          type: "value",
          name: tokAxis,
          min: 0,
          axisLabel: { fontSize: 10, color: "#64748b", formatter: (v) => formatTokenAxis(Number(v)) },
          splitLine: { lineStyle: { color: "#f1f5f9" } },
        },
        series,
      };
    };

    const byJob = buildByJobStack();
    if (byJob) return byJob;

    const inputLabel = intl.get("scheduledTasks.runOverview.chartDailyTokenTrendSeriesInput");
    const outputLabel = intl.get("scheduledTasks.runOverview.chartDailyTokenTrendSeriesOutput");
    const inData = trend.map((t) => {
      const v = Number(t?.inputTokens);
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    });
    const outData = trend.map((t) => {
      const v = Number(t?.outputTokens);
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    });
    const hasAny = inData.some((v) => v > 0) || outData.some((v) => v > 0);
    if (!hasAny) return null;
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        textStyle: { fontSize: 12 },
        formatter(params) {
          if (!Array.isArray(params) || !params.length) return "";
          const day = params[0]?.axisValue ?? "";
          const sum = params.reduce((acc, p) => acc + (Number(p?.data) || 0), 0);
          const lines = [day];
          for (const p of params) {
            lines.push(`${p.marker}${p.seriesName}: ${formatTokenAxis(Number(p?.data) || 0)}`);
          }
          lines.push(`${intl.get("scheduledTasks.runOverview.analysisColTokens")}: ${formatTokenAxis(sum)}`);
          return lines.join("<br/>");
        },
      },
      legend: { data: [inputLabel, outputLabel], bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
      grid: { left: 56, right: 20, top: 20, bottom: 44 },
      xAxis: {
        type: "category",
        data: days,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: days.length > 10 ? 32 : 0 },
      },
      yAxis: {
        type: "value",
        name: tokAxis,
        min: 0,
        axisLabel: { fontSize: 10, color: "#64748b", formatter: (v) => formatTokenAxis(Number(v)) },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [
        { name: inputLabel, type: "bar", stack: "tok", barMaxWidth: 28, itemStyle: { color: "#3b82f6" }, data: inData },
        { name: outputLabel, type: "bar", stack: "tok", barMaxWidth: 28, itemStyle: { color: "#10b981" }, data: outData },
      ],
    };
  }, [trend, charts?.tokenTrendByJob]);

  const pieOption = useMemo(() => {
    const data = [
      { key: "success", labelKey: "scheduledTasks.runOverview.dist.runSuccess" },
      { key: "failure", labelKey: "scheduledTasks.runOverview.dist.runFailure" },
    ]
      .map(({ key, labelKey }) => ({
        name: intl.get(labelKey),
        value: Number(distribution[key]) || 0,
      }))
      .filter((d) => d.value > 0);
    if (!data.length) return null;
    return {
      tooltip: { trigger: "item", textStyle: { fontSize: 12 } },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: "#64748b" } },
      series: [
        {
          type: "pie",
          radius: ["36%", "62%"],
          center: ["50%", "44%"],
          data,
          label: { fontSize: 10 },
        },
      ],
    };
  }, [distribution]);

  const failureReasonPieOption = useMemo(() => {
    const rows = failureReasonDistribution.filter((r) => r && (Number(r.count) || 0) > 0);
    if (!rows.length) return null;
    const emptyLbl = intl.get("scheduledTasks.runOverview.failureReason.empty");
    const data = rows.map((r) => {
      const key = String(r.reasonKey ?? "");
      const label = key === "__EMPTY__" ? emptyLbl : key.length > 40 ? `${key.slice(0, 39)}…` : key;
      return {
        value: Number(r.count) || 0,
        name: label,
        /** 完整原因，供 tooltip */
        fullName: key === "__EMPTY__" ? emptyLbl : key,
      };
    });
    return {
      tooltip: {
        trigger: "item",
        textStyle: { fontSize: 12 },
        formatter: (p) => {
          const raw = p?.data;
          const fullName =
            raw && typeof raw === "object" && raw.fullName != null ? String(raw.fullName) : String(p?.name ?? "");
          const v = p?.value ?? "";
          const pct = p?.percent != null ? Number(p.percent).toFixed(1) : "";
          return `${fullName}<br/>${intl.get("scheduledTasks.runOverview.failureReason.tooltipCount")}: ${v}${pct !== "" ? ` (${pct}%)` : ""}`;
        },
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: 0,
        top: "middle",
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 10,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      series: [
        {
          type: "pie",
          radius: ["34%", "58%"],
          center: ["58%", "50%"],
          data,
          label: {
            fontSize: 9,
            formatter: (p) => {
              const c = p.value ?? 0;
              const cnt = intl.get("scheduledTasks.runOverview.failureReason.tooltipCount");
              const name = p.name ?? "";
              return `${name}\n${cnt}: ${c}`;
            },
          },
        },
      ],
    };
  }, [failureReasonDistribution]);

  const tokenJobPieOption = useMemo(() => {
    const rows = tokenDistributionByJob.filter((r) => r && (Number(r.totalTokens) || 0) > 0);
    if (!rows.length) return null;
    const otherLbl = intl.get("scheduledTasks.runOverview.tokenDistPieOther");
    const tokLbl = intl.get("scheduledTasks.runOverview.analysisColTokens");
    const data = rows.map((r) => {
      const jid = String(r.jobId ?? "");
      const isOther = jid === "__other__";
      const rawName = r.jobName ? String(r.jobName).trim() : "";
      const displayName = rawName || jid;
      const label = isOther ? otherLbl : displayName.length > 36 ? `${displayName.slice(0, 35)}…` : displayName;
      return {
        value: Number(r.totalTokens) || 0,
        name: label,
        fullName: isOther ? otherLbl : displayName,
      };
    });
    return {
      tooltip: {
        trigger: "item",
        textStyle: { fontSize: 12 },
        formatter: (p) => {
          const raw = p?.data;
          const fullName =
            raw && typeof raw === "object" && raw.fullName != null ? String(raw.fullName) : String(p?.name ?? "");
          const v = p?.value ?? 0;
          const pct = p?.percent != null ? Number(p.percent).toFixed(1) : "";
          return `${fullName}<br/>${tokLbl}: ${formatTokenAxis(Number(v))}${pct !== "" ? ` (${pct}%)` : ""}`;
        },
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: 0,
        top: "middle",
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 10,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      series: [
        {
          type: "pie",
          radius: ["34%", "58%"],
          center: ["58%", "50%"],
          data,
          label: { fontSize: 9 },
        },
      ],
    };
  }, [tokenDistributionByJob]);

  /** 与原先柱状图一致：仅含 jobId 的行，API 返回多为「低→高」，展示为排名「高→低」故 reverse */
  const jobTop10Rows = useMemo(() => {
    const src =
      jobTop10Tab === "runCount"
        ? byRunCount
        : jobTop10Tab === "failCount"
          ? byFailCount
          : jobTop10Tab === "avgDur"
            ? byAvgDurationMs
            : bySuccessRate;
    return [...src].filter((r) => r?.jobId).reverse();
  }, [jobTop10Tab, byRunCount, byFailCount, byAvgDurationMs, bySuccessRate]);

  const execJobTop10Rows = useMemo(() => [...byMaxDurationMs].filter((r) => r?.jobId).reverse(), [byMaxDurationMs]);

  /**
   * 日历热力图：与 `trend` 同源；左侧月份、上侧星期、每月按周历排布；格内以「执行次数 / 失败次数 / 成功率」单行展示；格底色按当日成败语义（灰/绿/黄/红）。
   */
  const dailyHeatmap = useMemo(() => {
    /** @type {Map<string, { ok: number, fail: number, other: number, total: number }>} */
    const byDay = new Map();
    for (const t of trend) {
      const d = normalizeTrendDayLabel(t.day);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const ok = Number(t.successCount) || 0;
      const fail = Number(t.failureCount) || 0;
      const totFromRow =
        t.totalCount != null && Number.isFinite(Number(t.totalCount))
          ? Math.max(0, Math.floor(Number(t.totalCount)))
          : null;
      const other = totFromRow != null ? Math.max(0, totFromRow - ok - fail) : 0;
      const total = totFromRow != null ? totFromRow : ok + fail + other;
      const prev = byDay.get(d);
      if (prev) {
        byDay.set(d, {
          ok: prev.ok + ok,
          fail: prev.fail + fail,
          other: prev.other + other,
          total: prev.total + total,
        });
      } else {
        byDay.set(d, { ok, fail, other, total });
      }
    }

    let startYmd = isoToLocalDayStr(chartRange.startIso);
    let endYmd = isoToLocalDayStr(chartRange.endIso);
    const sortedFromData = [...byDay.keys()].sort();
    if (!startYmd || !endYmd) {
      if (sortedFromData.length) {
        startYmd = startYmd ?? sortedFromData[0];
        endYmd = endYmd ?? sortedFromData[sortedFromData.length - 1];
      }
    }
    if (!startYmd || !endYmd) return null;
    if (startYmd > endYmd) {
      const x = startYmd;
      startYmd = endYmd;
      endYmd = x;
    }
    /** 任务详情嵌入的热力图：数据已是父级时间窗内的历史事件，勿再与「相对当前时刻」预设求交，否则会与 chartRange 错位导致整图为空 */
    const pick = heatmapOnly ? null : resolvePresetRangeMs(heatmapTimePreset, heatmapCustomStart, heatmapCustomEnd);
    if (pick) {
      const ps = msToLocalYmd(pick.startMs);
      const pe = msToLocalYmd(pick.endMs);
      if (ps && pe) {
        if (ps > startYmd) startYmd = ps;
        if (pe < endYmd) endYmd = pe;
      }
    }

    let maxTotal = 0;
    let maxFail = 0;
    for (const [k, v] of byDay) {
      if (k >= startYmd && k <= endYmd) {
        maxTotal = Math.max(maxTotal, v.total);
        maxFail = Math.max(maxFail, v.fail);
      }
    }

    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
    const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const weekdayShort = [];
    for (let i = 0; i < 7; i += 1) {
      const dt = new Date(2024, 0, 1 + i);
      weekdayShort.push(weekdayFmt.format(dt));
    }

    const monthWeekBlocks = monthsInRangeInclusive(startYmd, endYmd).map(({ y, m }) => ({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: monthFmt.format(new Date(y, m - 1, 1)),
      weekRows: buildMonthWeekRowsMonFirst(y, m, startYmd, endYmd, byDay),
    }));

    if (!monthWeekBlocks.length) return null;

    return { monthWeekBlocks, weekdayShort, maxTotal, maxFail, startYmd, endYmd };
  }, [trend, chartRange.startIso, chartRange.endIso, heatmapTimePreset, heatmapCustomStart, heatmapCustomEnd]);

  useLayoutEffect(() => {
    if (!dailyHeatmap) return;
    if (heatmapMetric === "successRate") {
      setSrFilterMin(0);
      setSrFilterMax(100);
    } else if (heatmapMetric === "total") {
      setTotalFilterMin(0);
      setTotalFilterMax(Math.max(1, dailyHeatmap.maxTotal));
    } else {
      setFailFilterMin(0);
      setFailFilterMax(Math.max(1, dailyHeatmap.maxFail));
    }
  }, [heatmapMetric, dailyHeatmap?.startYmd, dailyHeatmap?.endYmd]);

  /** 数据上限缩小后钳制区间，避免滑块越界；不依赖此 effect 做「默认全量」初始化（由上方 useLayoutEffect 负责） */
  useEffect(() => {
    if (!dailyHeatmap) return;
    const mt = Math.max(1, dailyHeatmap.maxTotal);
    const mf = Math.max(1, dailyHeatmap.maxFail);
    setTotalFilterMin((lo) => Math.max(0, Math.min(lo, mt)));
    setTotalFilterMax((hi) => Math.min(hi, mt));
    setFailFilterMin((lo) => Math.max(0, Math.min(lo, mf)));
    setFailFilterMax((hi) => Math.min(hi, mf));
  }, [dailyHeatmap?.maxTotal, dailyHeatmap?.maxFail]);

  if (loading && !charts) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("common.loadingList")}</p>;
  }

  const hasJobTop10Any =
    byRunCount.length > 0 ||
    byFailCount.length > 0 ||
    byMaxDurationMs.length > 0 ||
    byAvgDurationMs.length > 0 ||
    bySuccessRate.length > 0;
  const hasAnyChart =
    trendOption ||
    dailyTokenTrendOption ||
    pieOption ||
    tokenJobPieOption ||
    failureReasonPieOption ||
    hasJobTop10Any ||
    dailyHeatmap;

  const heatmapCard = (
      <div className="w-full min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div
          className={[
            "flex min-w-0 gap-2",
            dailyHeatmap ? "flex-wrap items-center justify-between gap-x-3 gap-y-1.5" : "",
          ].join(" ")}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("scheduledTasks.runOverview.chartCalendarTitle")}
            </h3>
          </div>
          {dailyHeatmap ? (
            <div
              className="flex shrink-0 flex-wrap items-center justify-end gap-1"
              role="group"
              aria-label={intl.get("scheduledTasks.runOverview.chartCalendarMetricPickerAria")}
            >
              <div className="mr-1 flex items-center gap-1.5">
                <span className="whitespace-nowrap text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">
                  {intl.get("scheduledTasks.runOverview.chartCalendarDisplayMenu")}：
                </span>
                <div ref={heatmapDisplayMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    aria-expanded={heatmapDisplayOpen}
                    aria-haspopup="true"
                    aria-label={intl.get("scheduledTasks.runOverview.chartCalendarDisplayMenuAria")}
                    onClick={() => setHeatmapDisplayOpen((o) => !o)}
                    className="flex h-[26px] w-full min-w-[7rem] cursor-pointer items-center justify-between gap-2 rounded-full border border-slate-200 bg-white px-2 py-0 text-[11px] font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800/80 sm:h-[28px] sm:text-xs"
                  >
                    <span className="truncate">
                      {heatmapDisplay.dates && heatmapDisplay.totalRuns && heatmapDisplay.failures && heatmapDisplay.successRate
                        ? intl.get("common.all")
                        : [
                            heatmapDisplay.dates ? intl.get("scheduledTasks.runOverview.chartCalendarShowDates") : null,
                            heatmapDisplay.totalRuns ? intl.get("scheduledTasks.runOverview.chartCalendarDisplayOptTotalRuns") : null,
                            heatmapDisplay.failures ? intl.get("scheduledTasks.runOverview.chartCalendarDisplayOptFailures") : null,
                            heatmapDisplay.successRate ? intl.get("scheduledTasks.runOverview.chartCalendarDisplayOptSuccessRate") : null,
                          ]
                            .filter(Boolean)
                            .join(" / ") || intl.get("common.noData")}
                    </span>
                    <Icon
                      name="chevron"
                      className={`h-3.5 w-3.5 shrink-0 text-slate-500 opacity-90 transition-transform dark:text-slate-400 ${heatmapDisplayOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {heatmapDisplayOpen ? (
                    <div
                      className="absolute right-0 top-[calc(100%+4px)] z-40 min-w-[13rem] rounded-lg border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-600 dark:bg-gray-900"
                      role="group"
                      aria-label={intl.get("scheduledTasks.runOverview.chartCalendarDisplayMenuAria")}
                    >
                      {(
                        [
                          ["dates", "scheduledTasks.runOverview.chartCalendarShowDates"],
                          ["totalRuns", "scheduledTasks.runOverview.chartCalendarDisplayOptTotalRuns"],
                          ["failures", "scheduledTasks.runOverview.chartCalendarDisplayOptFailures"],
                          ["successRate", "scheduledTasks.runOverview.chartCalendarDisplayOptSuccessRate"],
                        ]
                      ).map(([key, labelKey]) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 sm:text-xs"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-primary accent-primary focus:ring-primary/40 dark:border-slate-500 dark:bg-slate-900"
                            checked={Boolean(heatmapDisplay[/** @type {"dates"|"totalRuns"|"failures"|"successRate"} */ (key)])}
                            onChange={(e) =>
                              setHeatmapDisplay((prev) => ({
                                ...prev,
                                [key]: e.target.checked,
                              }))
                            }
                          />
                          <span>{intl.get(labelKey)}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mr-1 flex items-center gap-1.5">
                <span className="whitespace-nowrap text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">
                  {intl.get("scheduledTasks.runOverview.chartCalendarRangeLabel")}
                </span>
                <div className="min-w-[7.5rem] max-w-[16rem] shrink-0 self-stretch sm:min-w-[9rem]">
                  <LogTimeRangePicker
                    timePreset={heatmapTimePreset}
                    setTimePreset={setHeatmapTimePreset}
                    customStart={heatmapCustomStart}
                    setCustomStart={setHeatmapCustomStart}
                    customEnd={heatmapCustomEnd}
                    setCustomEnd={setHeatmapCustomEnd}
                    onCommit={() => {}}
                    relativePresetsMode="day"
                  />
                </div>
              </div>
              {[
                ["total", "scheduledTasks.runOverview.chartCalendarMetricTotal"],
                ["failures", "scheduledTasks.runOverview.chartCalendarMetricFailures"],
                ["successRate", "scheduledTasks.runOverview.chartCalendarMetricSuccessRate"],
              ].map(([key, labelKey]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHeatmapMetric(/** @type {"total" | "failures" | "successRate"} */ (key))}
                  className={[
                    "h-[26px] shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none transition sm:h-[28px] sm:px-2.5 sm:text-xs",
                    heatmapMetric === key
                      ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/25 dark:bg-primary/15 dark:text-primary-200"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800/80",
                  ].join(" ")}
                >
                  {intl.get(labelKey)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {dailyHeatmap ? (
          <div className="mt-1.5 w-full min-w-0 space-y-3">
            <p className="text-left text-[10px] tabular-nums text-slate-500 dark:text-slate-400 sm:text-[11px]">
              {dailyHeatmap.startYmd} — {dailyHeatmap.endYmd}
            </p>
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <div className="w-[4.75rem] shrink-0" aria-hidden />
                  <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
                    {dailyHeatmap.weekdayShort.map((w, wi) => (
                      <div
                        key={`wd-${wi}`}
                        className="py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                </div>

                {dailyHeatmap.monthWeekBlocks.map((block) => (
                  <div key={block.key} className="flex gap-2">
                    <div className="sticky left-0 z-[1] flex w-[4.75rem] shrink-0 items-start bg-white py-1 pr-1 text-left text-[11px] font-semibold leading-snug text-slate-700 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)] dark:bg-gray-900 dark:text-slate-200 dark:shadow-[4px_0_14px_-4px_rgba(0,0,0,0.5)]">
                      {block.label}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {block.weekRows.map((row, wi) => (
                        <div key={`${block.key}-r${wi}`} className="grid grid-cols-7 gap-0.5">
                          {row.map((c, ci) =>
                            c.kind === "empty" ? (
                              <div
                                key={`e-${block.key}-${wi}-${ci}`}
                                className="min-h-[44px] rounded-sm bg-slate-50/70 dark:bg-slate-900/45"
                                aria-hidden
                              />
                            ) : (
                              <div
                                key={c.date}
                                title={[
                                  c.date,
                                  `${intl.get("scheduledTasks.runOverview.chartCalendarTooltipTotal")}: ${c.total}`,
                                  `${intl.get("scheduledTasks.runOverview.chartTrendSeriesSuccess")}: ${c.ok}`,
                                  `${intl.get("scheduledTasks.runOverview.chartTrendSeriesFailure")}: ${c.fail}`,
                                  `${intl.get("scheduledTasks.runOverview.chartTrendSeriesOther")}: ${c.other}`,
                                  `${intl.get("scheduledTasks.runOverview.chartCalendarTooltipSuccessRate")}: ${
                                    c.total > 0 ? `${((c.ok / c.total) * 100).toFixed(1)}%` : "—"
                                  }`,
                                  heatmapMetric === "successRate" && (srFilterMin > 0 || srFilterMax < 100)
                                    ? `\n${intl.get("scheduledTasks.runOverview.chartCalendarSrFilterActive")}: ${srFilterMin}%–${srFilterMax}%`
                                    : "",
                                  heatmapMetric === "total" &&
                                  (totalFilterMin > 0 || totalFilterMax < Math.max(1, dailyHeatmap.maxTotal))
                                    ? `\n${intl.get("scheduledTasks.runOverview.chartCalendarCountFilterActive")}: ${totalFilterMin}–${totalFilterMax}`
                                    : "",
                                  heatmapMetric === "failures" &&
                                  (failFilterMin > 0 || failFilterMax < Math.max(1, dailyHeatmap.maxFail))
                                    ? `\n${intl.get("scheduledTasks.runOverview.chartCalendarCountFilterActive")}: ${failFilterMin}–${failFilterMax}`
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join("\n")}
                                className={[
                                  "relative flex flex-col items-center justify-center rounded-sm px-0.5 pb-0.5 ring-1 ring-inset ring-slate-200/55 transition hover:z-[2] hover:ring-2 hover:ring-primary/35 dark:ring-slate-600/65",
                                  heatmapCellPaddingClass(heatmapDisplay),
                                  dayHeatmapOutcomeBgClass(c),
                                  heatmapMetric === "successRate" &&
                                    successRateCellDimmed(daySuccessRatePct(c.ok, c.total), srFilterMin, srFilterMax)
                                    ? "opacity-[0.28] saturate-[0.45] contrast-[0.92] grayscale-[0.35]"
                                    : "",
                                  heatmapMetric === "total" &&
                                    countRangeCellDimmed(c.total, totalFilterMin, totalFilterMax, dailyHeatmap.maxTotal)
                                    ? "opacity-[0.28] saturate-[0.45] contrast-[0.92] grayscale-[0.35]"
                                    : "",
                                  heatmapMetric === "failures" &&
                                    countRangeCellDimmed(c.fail, failFilterMin, failFilterMax, dailyHeatmap.maxFail)
                                    ? "opacity-[0.28] saturate-[0.45] contrast-[0.92] grayscale-[0.35]"
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {heatmapDisplay.dates ? (
                                  <span
                                    className={[
                                      "pointer-events-none absolute right-0.5 top-0.5 z-[1] text-sm font-bold tabular-nums leading-none sm:text-base",
                                      dayHeatmapCornerDateClass(c),
                                    ].join(" ")}
                                    aria-hidden
                                  >
                                    {heatmapCornerDateLabel(c.date)}
                                  </span>
                                ) : null}
                                {heatmapDisplay.totalRuns ||
                                heatmapDisplay.failures ||
                                heatmapDisplay.successRate ? (
                                  <p className="w-full min-w-0 truncate text-center text-xs font-bold leading-snug tabular-nums tracking-tight sm:text-[13px]">
                                    {(() => {
                                      const rows = [];
                                      const hd = heatmapDisplay;
                                      if (hd.totalRuns) {
                                        rows.push({
                                          key: "t",
                                          node: (
                                            <span className="text-blue-700 drop-shadow-sm dark:text-blue-200">
                                              {c.total > 999 ? "999+" : c.total}
                                            </span>
                                          ),
                                        });
                                      }
                                      if (hd.failures) {
                                        rows.push({
                                          key: "f",
                                          node: (
                                            <span className="text-rose-700 drop-shadow-sm dark:text-rose-100">
                                              {c.fail > 999 ? "999+" : c.fail}
                                            </span>
                                          ),
                                        });
                                      }
                                      if (hd.successRate) {
                                        rows.push({
                                          key: "sr",
                                          node: (
                                            <span className="text-slate-900 drop-shadow-sm dark:text-white">
                                              {formatDaySuccessRateLabel(c.ok, c.total)}
                                            </span>
                                          ),
                                        });
                                      }
                                      return rows.map((row, idx) => (
                                        <Fragment key={row.key}>
                                          {idx > 0 ? (
                                            <span className="mx-0.5 font-normal text-slate-500 dark:text-slate-400">
                                              /
                                            </span>
                                          ) : null}
                                          {row.node}
                                        </Fragment>
                                      ));
                                    })()}
                                  </p>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <aside
                className={[
                  "flex shrink-0 flex-col items-center justify-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700",
                  "lg:w-[5.5rem] lg:border-l lg:border-t-0 lg:pl-3 lg:pt-1",
                ].join(" ")}
                aria-label={`${intl.get("scheduledTasks.runOverview.chartCalendarVisualLow")}–${intl.get("scheduledTasks.runOverview.chartCalendarVisualHigh")}`}
              >
                {heatmapMetric === "successRate" ? (
                  <SuccessRateVerticalRangeSlider
                    min={srFilterMin}
                    max={srFilterMax}
                    setMin={setSrFilterMin}
                    setMax={setSrFilterMax}
                  />
                ) : heatmapMetric === "total" ? (
                  <CountVerticalRangeSlider
                    kind="total"
                    domainMax={Math.max(1, dailyHeatmap.maxTotal)}
                    min={totalFilterMin}
                    max={totalFilterMax}
                    setMin={setTotalFilterMin}
                    setMax={setTotalFilterMax}
                  />
                ) : (
                  <CountVerticalRangeSlider
                    kind="failures"
                    domainMax={Math.max(1, dailyHeatmap.maxFail)}
                    min={failFilterMin}
                    max={failFilterMax}
                    setMin={setFailFilterMin}
                    setMax={setFailFilterMax}
                  />
                )}
              </aside>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
        )}
      </div>
  );

  if (heatmapOnly) {
    return <div className={`w-full min-w-0 ${loading ? "opacity-70" : ""}`}>{heatmapCard}</div>;
  }

  return (
    <div className={`space-y-4 ${loading ? "opacity-70" : ""}`}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.runOverview.chartTrendTitle")}</h3>
          {trendOption ? (
            <div className="mt-2 w-full min-w-0">
              <ReactECharts
                option={trendOption}
                style={{ height: 240, width: "100%", minHeight: 240 }}
                opts={{ renderer: "canvas" }}
                notMerge
                lazyUpdate
              />
            </div>
          ) : (
            <div
              className="mt-2 flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/40"
              style={{ minHeight: RUN_OVERVIEW_BAR_CHART_EMPTY_MIN_PX }}
            >
              <p className="px-3 text-center text-xs text-gray-400 dark:text-gray-500">
                {intl.get("scheduledTasks.runOverview.chartEmpty")}
              </p>
            </div>
          )}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {intl.get("scheduledTasks.runOverview.chartDailyTokenTrendTitle")}
          </h3>
          {dailyTokenTrendOption ? (
            <div className="mt-2 min-h-0 w-full min-w-0 flex-1">
              <ReactECharts option={dailyTokenTrendOption} style={{ height: 240, width: "100%", minHeight: 240 }} notMerge lazyUpdate opts={{ renderer: "canvas" }} />
            </div>
          ) : (
            <div
              className="mt-2 flex w-full min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/40"
              style={{ minHeight: RUN_OVERVIEW_BAR_CHART_EMPTY_MIN_PX }}
            >
              <p className="px-3 text-center text-xs text-gray-400 dark:text-gray-500">
                {intl.get("scheduledTasks.runOverview.chartEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.runOverview.chartFailureReasonPieTitle")}</h3>
          {failureReasonPieOption ? (
            <div className="mt-2 min-h-0 w-full min-w-0">
              <ReactECharts option={failureReasonPieOption} style={{ height: 300, width: "100%", minHeight: 280 }} notMerge lazyUpdate opts={{ renderer: "canvas" }} />
            </div>
          ) : (
            <div
              className="mt-2 flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/40"
              style={{ minHeight: RUN_OVERVIEW_PIE_CHART_EMPTY_MIN_PX }}
            >
              <p className="px-3 text-center text-xs text-gray-400 dark:text-gray-500">
                {intl.get("scheduledTasks.runOverview.chartEmpty")}
              </p>
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.runOverview.chartTokenDistPieTitle")}</h3>
          {tokenJobPieOption ? (
            <div className="mt-2 min-h-0 w-full min-w-0">
              <ReactECharts option={tokenJobPieOption} style={{ height: 300, width: "100%", minHeight: 280 }} notMerge lazyUpdate opts={{ renderer: "canvas" }} />
            </div>
          ) : (
            <div
              className="mt-2 flex w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/40"
              style={{ minHeight: RUN_OVERVIEW_PIE_CHART_EMPTY_MIN_PX }}
            >
              <p className="px-3 text-center text-xs text-gray-400 dark:text-gray-500">
                {intl.get("scheduledTasks.runOverview.chartEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0">{heatmapCard}</div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {intl.get("scheduledTasks.runOverview.jobTop10AnalysisTitle")}
          </h3>
          <nav
            className="mt-3 flex flex-wrap gap-1 border-b border-gray-100 dark:border-gray-800"
            role="tablist"
            aria-label={intl.get("scheduledTasks.runOverview.jobTop10AnalysisTitle")}
          >
            {[
              ["runCount", "scheduledTasks.runOverview.jobTop10Tab.runCount"],
              ["failCount", "scheduledTasks.runOverview.jobTop10Tab.failCount"],
              ["avgDur", "scheduledTasks.runOverview.jobTop10Tab.avgDur"],
              ["successRate", "scheduledTasks.runOverview.jobTop10Tab.successRate"],
            ].map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={jobTop10Tab === key}
                onClick={() => setJobTop10Tab(key)}
                className={[
                  "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px",
                  jobTop10Tab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
                ].join(" ")}
              >
                {intl.get(labelKey)}
              </button>
            ))}
          </nav>
          <div className="mt-4 w-full min-w-0" role="tabpanel">
            <JobTop10Table
              tab={jobTop10Tab}
              rows={jobTop10Rows}
              maxRows={10}
              showMetricProgressBars
              hideJobIdColumn
              showAgentColumn
              rowDrillable={!heatmapOnly && typeof onOpenTaskDetail === "function"}
              onJobRowClick={
                !heatmapOnly && onOpenTaskDetail ? (row) => onOpenTaskDetail(String(row.jobId ?? "")) : undefined
              }
            />
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {intl.get("scheduledTasks.runOverview.execJobTop10AnalysisTitle")}
          </h3>
          <div className="mt-4 w-full min-w-0">
            <JobTop10Table
              tab="maxDur"
              rows={execJobTop10Rows}
              maxRows={10}
              showExecTimeColumn
              rowDrillable={!heatmapOnly && typeof onOpenExecutionForJob === "function"}
              onJobRowClick={
                !heatmapOnly && onOpenExecutionForJob ? (row) => onOpenExecutionForJob(String(row.jobId ?? "")) : undefined
              }
            />
          </div>
        </div>

      </div>

      {!hasAnyChart ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.runOverview.chartEmpty")}</p>
      ) : null}
    </div>
  );
}
