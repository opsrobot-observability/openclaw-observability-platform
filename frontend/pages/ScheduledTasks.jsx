import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import intl from "react-intl-universal";
import JobPerformancePanel from "../components/JobPerformancePanel.jsx";
import JobRunResultsPanel from "../components/JobRunResultsPanel.jsx";
import { extractUsageTokens, formatTokenInt } from "../lib/jobTokenMetrics.js";
import { isRunFailureStatus } from "../lib/jobStabilityMetrics.js";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import SortableTableTh from "../components/SortableTableTh.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../components/TablePagination.jsx";
import CostTimeRangeFilter, { defaultRangeLastDays } from "../components/CostTimeRangeFilter.jsx";
import TaskDetailRunEventsTimeRangeFilter from "../components/TaskDetailRunEventsTimeRangeFilter.jsx";
import ScheduledTasksRunOverviewCharts from "../components/ScheduledTasksRunOverviewCharts.jsx";
import JobRunTraceTimeline from "../components/JobRunTraceTimeline.jsx";
import JobRunTraceStatusTrendChart from "../components/JobRunTraceStatusTrendChart.jsx";
import { filterRunEventsByTimeRange, parseDateTimeLocalInput, parseRunEventAnchorMs } from "../lib/runEventsTimeRange.js";
import { useRunEventsTimeRangeFilter } from "../hooks/useRunEventsTimeRangeFilter.js";
import Icon from "../components/Icon.jsx";

/** 任务详情列表每页条数 */
const JOB_LIST_PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

/** `local`：jobs.json + jsonl；否则：Doris `cron_jobs` + `cron_runs`（`/api/cron-jobs`） */
const TASK_DETAIL_SOURCE_IS_LOCAL = import.meta.env.VITE_SCHEDULED_TASK_DETAIL_SOURCE === "local";

/** 任务详情「运行日志」表格每页条数 */
const RUN_LOG_PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

/** 运行记录 Tab（全局 cron_runs 列表）每页条数 */
const RUN_RECORDS_PAGE_SIZE = 20;

const MAIN_TABS = [
  { key: "runOverview", labelKey: "scheduledTasks.tab.runOverview" },
  { key: "taskDetail", labelKey: "scheduledTasks.tab.taskDetail" },
  { key: "executionDetail", labelKey: "scheduledTasks.tab.executionDetail" },
];

/** 选中任务后，右侧详情区内子 Tab */
const JOB_DETAIL_SUB_TABS = [
  { key: "summary", labelKey: "scheduledTasks.taskDetail.subTab.summary" },
  { key: "results", labelKey: "scheduledTasks.taskDetail.subTab.results" },
  { key: "trace", labelKey: "scheduledTasks.taskDetail.subTab.trace" },
  { key: "execution", labelKey: "scheduledTasks.taskDetail.subTab.execution" },
];

/** 与「统计时间」预设一致：返回 ISO 字符串供 `/api/cron-runs-overview` 使用 */
function cronOverviewRangeIso(activeDays) {
  const end = new Date();
  const start = new Date(end.getTime() - (activeDays ?? 7) * 86400000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** 自定义 `datetime-local` 与快捷天数二选一；非法自定义时回落到预设窗口 */
function cronOverviewRangeFromState(useCustomRange, rangeStartLocal, rangeEndLocal, activeDays) {
  if (useCustomRange) {
    const s = parseDateTimeLocalInput(rangeStartLocal);
    const e = parseDateTimeLocalInput(rangeEndLocal);
    if (s != null && e != null && e >= s) {
      return { startIso: new Date(s).toISOString(), endIso: new Date(e).toISOString() };
    }
  }
  return cronOverviewRangeIso(activeDays);
}

/**
 * 运行概览指标卡片组：外框一张 + 标题 + 内嵌多列 KPI（与任务详情「运行性能」小卡风格一致）
 * @param {{ title: string, gridClass: string, items: { key: string, label: string, value: unknown, iconBox: string, Icon: (p: { className?: string }) => unknown }[], drillTab?: 'taskDetail' | 'executionDetail', onNavigateToTab?: (tab: string) => void }} props
 */
function RunOverviewKpiGroup({ title, gridClass, items, drillTab, onNavigateToTab }) {
  const canDrill = typeof onNavigateToTab === "function" && drillTab;
  const drillAria =
    drillTab === "taskDetail"
      ? intl.get("scheduledTasks.runOverview.kpiDrillAriaTaskDetail")
      : drillTab === "executionDetail"
        ? intl.get("scheduledTasks.runOverview.kpiDrillAriaExecutionLog")
        : "";

  return (
    <div className="h-full rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/60 p-4 shadow-sm ring-1 ring-black/[0.02] dark:border-gray-800 dark:from-gray-900 dark:to-gray-900/40 dark:ring-white/5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/60" aria-hidden />
        <h3 className="text-sm font-semibold tracking-wide text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      <div className={gridClass}>
        {items.map(({ key, label, value, iconBox, Icon }) => {
          const display = value === null || value === undefined ? "—" : String(value);
          const body = (
            <>
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-[1.04] dark:ring-white/10 sm:h-12 sm:w-12 ${iconBox}`}
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium leading-tight text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-gray-900 tabular-nums dark:text-gray-50">
                  {display}
                </p>
              </div>
            </>
          );
          const cardClass =
            "group flex min-h-[72px] w-full items-center gap-3 rounded-xl border border-gray-100/80 bg-white px-3 py-2.5 text-left shadow-[0_1px_0_rgba(15,23,42,0.02)] transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/70 dark:hover:border-primary/40 sm:min-h-0";

          if (canDrill) {
            return (
              <button
                key={key}
                type="button"
                className={`${cardClass} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
                onClick={() => onNavigateToTab(drillTab)}
                aria-label={`${label} ${display}。${drillAria}`}
              >
                {body}
              </button>
            );
          }

          return (
            <div key={key} className={cardClass}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IconOvRunsTotal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m4 14V9m4 10v-6m4 6V7" />
    </svg>
  );
}

function IconOvRunsOk(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconOvRunsFail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconOvSuccessRate(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
    </svg>
  );
}

/** @param {{ total?: unknown, success?: unknown } | null | undefined} runs */
function formatOverviewRunSuccessRate(runs) {
  if (runs == null) return null;
  const t = Number(runs.total);
  const ok = Number(runs.success);
  if (!Number.isFinite(t) || t <= 0) return null;
  if (!Number.isFinite(ok) || ok < 0) return null;
  const pct = (ok / t) * 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-6) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

function IconOvJobsTotal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75zm0 5.25h.008v.008H3.75V12zm0 5.25h.008v.008H3.75v-.008z" />
    </svg>
  );
}

function IconOvAlertRange(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

/** 定时任务「运行概览」：时间筛选 + 任务状态 / 作业概况与任务概况 KPI 卡片 */
function ScheduledTasksRunOverview({ onNavigateToTab, onOpenTaskDetailFromOverview, onOpenExecutionForJobFromOverview }) {
  const [activeDays, setActiveDays] = useState(7);
  const initRange = useMemo(() => defaultRangeLastDays(7), []);
  const [rangeStartLocal, setRangeStartLocal] = useState(initRange.start);
  const [rangeEndLocal, setRangeEndLocal] = useState(initRange.end);
  const [useCustomRange, setUseCustomRange] = useState(false);

  const handlePreset = useCallback((p) => {
    setUseCustomRange(false);
    const d = p.days ?? 7;
    setActiveDays(d);
    const r = defaultRangeLastDays(d);
    setRangeStartLocal(r.start);
    setRangeEndLocal(r.end);
  }, []);

  const handleRangeLocalChange = useCallback((start, end) => {
    setUseCustomRange(true);
    setRangeStartLocal(start);
    setRangeEndLocal(end);
  }, []);

  const [jobs, setJobs] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [errorJobs, setErrorJobs] = useState(null);
  const [errorOverview, setErrorOverview] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [errorCharts, setErrorCharts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer = null;

    const runFetch = () => {
      if (cancelled) return;
      const { startIso, endIso } = cronOverviewRangeFromState(
        useCustomRange,
        rangeStartLocal,
        rangeEndLocal,
        activeDays,
      );
      const jobsUrl = TASK_DETAIL_SOURCE_IS_LOCAL ? "/api/local-jobs" : "/api/cron-jobs";
      const ovUrl = `/api/cron-runs-overview?startIso=${encodeURIComponent(startIso)}&endIso=${encodeURIComponent(endIso)}`;
      const chartsUrl = `/api/cron-runs-run-overview?startIso=${encodeURIComponent(startIso)}&endIso=${encodeURIComponent(endIso)}`;

      setLoadingJobs(true);
      setLoadingOverview(true);
      setLoadingCharts(true);
      setErrorJobs(null);
      setErrorOverview(null);
      setErrorCharts(null);

      (async () => {
        try {
          const res = await fetch(jobsUrl);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || res.statusText || "error");
          if (!cancelled) setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        } catch (e) {
          if (!cancelled) {
            setJobs([]);
            setErrorJobs(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) setLoadingJobs(false);
        }
      })();

      (async () => {
        try {
          const res = await fetch(ovUrl);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || res.statusText || "error");
          if (!cancelled) setOverview(data && typeof data === "object" ? data : null);
        } catch (e) {
          if (!cancelled) {
            setOverview(null);
            setErrorOverview(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) setLoadingOverview(false);
        }
      })();

      (async () => {
        try {
          const res = await fetch(chartsUrl);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || res.statusText || "error");
          if (!cancelled) setCharts(data && typeof data === "object" ? data : null);
        } catch (e) {
          if (!cancelled) {
            setCharts(null);
            setErrorCharts(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) setLoadingCharts(false);
        }
      })();
    };

    if (useCustomRange) {
      debounceTimer = setTimeout(() => {
        if (!cancelled) runFetch();
      }, 400);
    } else {
      runFetch();
    }

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [activeDays, useCustomRange, rangeStartLocal, rangeEndLocal]);

  /** 任务表快照「最近一次执行」为失败状态的任务数（与任务列表同源） */
  const jobsLastRunFailedCount = useMemo(
    () => jobs.filter((j) => isRunFailureStatus(j?.state?.lastRunStatus)).length,
    [jobs],
  );

  const runs = overview?.runs ?? null;
  const alerts = overview?.alerts ?? null;
  const loading = loadingJobs || loadingOverview || loadingCharts;

  const runOverviewExecutionItems = useMemo(
    () => [
      {
        key: "runsTotal",
        label: intl.get("scheduledTasks.runOverview.cardRuns.total"),
        value: runs?.total,
        iconBox: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
        Icon: IconOvRunsTotal,
      },
      {
        key: "runsOk",
        label: intl.get("scheduledTasks.runOverview.cardRuns.success"),
        value: runs?.success,
        iconBox: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-400",
        Icon: IconOvRunsOk,
      },
      {
        key: "runsFail",
        label: intl.get("scheduledTasks.runOverview.cardRuns.failure"),
        value: runs?.failure,
        iconBox: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
        Icon: IconOvRunsFail,
      },
      {
        key: "runsSuccessRate",
        label: intl.get("scheduledTasks.runOverview.cardRuns.successRate"),
        value: formatOverviewRunSuccessRate(runs),
        iconBox: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300",
        Icon: IconOvSuccessRate,
      },
    ],
    [runs],
  );

  const runOverviewAlertItems = [
    {
      key: "totalJobs",
      label: intl.get("scheduledTasks.runOverview.cardAlerts.totalJobs"),
      value: jobs.length,
      iconBox: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
      Icon: IconOvJobsTotal,
    },
    {
      key: "recentFailed",
      label: intl.get("scheduledTasks.runOverview.cardAlerts.recentFailedJobs"),
      value: jobsLastRunFailedCount,
      iconBox: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
      Icon: IconOvRunsFail,
    },
    {
      key: "alertRange",
      label: intl.get("scheduledTasks.runOverview.cardAlerts.failJobsInRange"),
      value: alerts?.jobsWithFailureInRange,
      iconBox: "bg-orange-50 text-orange-600 dark:bg-orange-950/35 dark:text-orange-300",
      Icon: IconOvAlertRange,
    },
  ];

  return (
    <div className="space-y-5">
      <CostTimeRangeFilter
        activeDays={activeDays}
        onPreset={handlePreset}
        allowCustomRange
        rangeStartLocal={rangeStartLocal}
        rangeEndLocal={rangeEndLocal}
        onRangeLocalChange={handleRangeLocalChange}
        highlightPresets={!useCustomRange}
      />

      {(errorJobs || errorOverview || errorCharts) && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-300"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="min-w-0 flex-1 space-y-1">
            {errorJobs ? (
              <p>{intl.get("scheduledTasks.runOverview.loadJobsFailed", { error: errorJobs })}</p>
            ) : null}
            {errorOverview ? (
              <p>{intl.get("scheduledTasks.runOverview.loadOverviewFailed", { error: errorOverview })}</p>
            ) : null}
            {errorCharts ? (
              <p>{intl.get("scheduledTasks.runOverview.loadChartsFailed", { error: errorCharts })}</p>
            ) : null}
          </div>
        </div>
      )}

      {loading && jobs.length === 0 && !overview ? (
        <LoadingSpinner message={intl.get("common.loadingList")} className="py-10" />
      ) : (
        <div className={`space-y-4 transition-opacity duration-200 ${loading ? "opacity-70" : ""}`}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
            <div className="min-w-0">
              <RunOverviewKpiGroup
                title={intl.get("scheduledTasks.runOverview.cardAlertsTitle")}
                gridClass="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3"
                items={runOverviewAlertItems}
                drillTab="taskDetail"
                onNavigateToTab={onNavigateToTab}
              />
            </div>
            <div className="min-w-0">
              <RunOverviewKpiGroup
                title={intl.get("scheduledTasks.runOverview.groupExecutionTitle")}
                gridClass="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                items={runOverviewExecutionItems}
                drillTab="executionDetail"
                onNavigateToTab={onNavigateToTab}
              />
            </div>
          </div>
          {!errorCharts ? (
            <ScheduledTasksRunOverviewCharts
              charts={charts}
              loading={loadingCharts}
              onOpenTaskDetail={onOpenTaskDetailFromOverview}
              onOpenExecutionForJob={onOpenExecutionForJobFromOverview}
            />
          ) : null}
        </div>
      )}
    </div>
  );
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

/** @param {string | null | undefined} iso */
function formatDateTime(iso) {
  if (!iso) return "—";
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString();
}

/** @param {number | null | undefined} ms */
function formatEpochMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  return new Date(Number(ms)).toLocaleString();
}

/** @param {string | null | undefined} s @param {number} max */
function truncateText(s, max) {
  const t = s == null ? "" : String(s);
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * 运行日志行展示的 Agent：优先事件 `agentId`；否则当前任务 `job.agentId`；再解析 `sessionKey`（`agent:<id>:cron:`）。
 * @param {object | null | undefined} ev
 * @param {object | null | undefined} job
 */
function runLogRowAgentId(ev, job) {
  if (ev?.agentId != null && String(ev.agentId).trim() !== "") return String(ev.agentId).trim();
  if (job?.agentId != null && String(job.agentId).trim() !== "") return String(job.agentId).trim();
  const sk = ev?.sessionKey != null ? String(ev.sessionKey) : "";
  const m = /^agent:([^:]+):cron:/.exec(sk);
  if (m && m[1]) return m[1].trim();
  return "";
}

/**
 * 列表「Agent」列展示：与当前任务 agentId 一致时优先 `agentName`，否则回退为 ID（不再单独占一列 AgentID）。
 * @param {object | null | undefined} ev
 * @param {object | null | undefined} job
 */
function runLogRowAgentDisplay(ev, job) {
  const id = runLogRowAgentId(ev, job);
  if (!id) return { label: "", id: "", titleTip: "" };
  const nameFromJob =
    job?.agentId != null &&
    String(job.agentId).trim() === id &&
    job?.agentName != null &&
    String(job.agentName).trim() !== ""
      ? String(job.agentName).trim()
      : null;
  const label = nameFromJob ?? id;
  const titleTip = nameFromJob ? id : "";
  return { label, id, titleTip };
}

/** @param {unknown} v */
function formatJobPayloadTextValue(v) {
  if (v == null) return "";
  if (typeof v === "string") {
    const t = v.trim();
    return t;
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v).trim();
}

/**
 * 任务负载中的正文（与 jobs.json / cron_jobs `payload.message|body|text|prompt` 对齐）。
 * @param {object | null | undefined} job
 */
function jobPayloadTaskContent(job) {
  const p = job?.payload;
  if (!p || typeof p !== "object") return "";
  for (const k of ["message", "body", "text", "prompt"]) {
    const s = formatJobPayloadTextValue(/** @type {Record<string, unknown>} */ (p)[k]);
    if (s !== "") return s;
  }
  return "";
}

/** 运行日志会话 ID → 侧边栏「会话链路溯源」：预填搜索并可选直达详情（与 SessionAudit 约定一致） */
function navigateRunLogSessionToSessionAudit(sessionId) {
  const sid = sessionId != null ? String(sessionId).trim() : "";
  if (!sid) return;
  try {
    sessionStorage.setItem("openclaw-session-audit-query", sid);
    sessionStorage.setItem("openclaw-session-audit-open-detail", "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("openclaw-nav", { detail: { id: "session-audit" } }));
}

/**
 * 运行日志 Agent → 侧边栏「数字员工」运行详情（与 DigitalEmployeePortrait / Overview 的 `digital-employee:focusAgent` 约定一致）
 * @param {string} agentName 与画像接口 `agentName` 对齐的标识（常为 agent_id / agent_name 同源字符串）
 * @param {string | null | undefined} sessionKey 可选，写入 payload 以便左侧列表预选中会话键
 */
function navigateRunLogAgentToDigitalEmployeePortrait(agentName, sessionKey) {
  const name = agentName != null ? String(agentName).trim() : "";
  if (!name) return;
  try {
    /** @type {{ agentName: string, days: number, sessionKey?: string }} */
    const payload = { agentName: name, days: 7 };
    const sk = sessionKey != null ? String(sessionKey).trim() : "";
    if (sk) payload.sessionKey = sk;
    sessionStorage.setItem("digital-employee:focusAgent", JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("openclaw-nav", { detail: { id: "digital-employee-list" } }));
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

/** @param {object | null | undefined} a @param {object | null | undefined} b */
function sameRunLogEvent(a, b) {
  if (!a || !b) return false;
  const aR = a.runId != null ? String(a.runId).trim() : "";
  const bR = b.runId != null ? String(b.runId).trim() : "";
  if (aR !== "" && bR !== "") return aR === bR;
  return (
    Number(a.ts) === Number(b.ts) &&
    Number(a.runAtMs ?? 0) === Number(b.runAtMs ?? 0) &&
    String(a.sessionId ?? "") === String(b.sessionId ?? "")
  );
}

/** log_attributes 下次运行时间：毫秒数字串、秒级时间戳或 ISO（与后端 parseNextRunAtMsFromLogRaw 一致） */
function parseNextRunAtMsFromExecutionRowRaw(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1e11) return Math.floor(n);
    if (n >= 1e9) return Math.floor(n * 1000);
    return null;
  }
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : null;
}

/**
 * `/api/cron-runs` 列表行 → RunLogDrillPanel 所需 event（与 mapCronRunPageRowToJsonlEvent 字段对齐）
 * @param {object} r
 */
function executionRunRowToRunLogDrillEvent(r) {
  const pick = (...parts) => {
    for (const p of parts) {
      if (p == null) continue;
      const s = String(p).trim();
      if (s) return s;
    }
    return null;
  };
  const parsePos = (v) => {
    if (v == null) return null;
    if (typeof v === "bigint") {
      const bn = Number(v);
      if (!Number.isFinite(bn) || bn < 0) return null;
      return Math.floor(bn);
    }
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
    const n = Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };

  const startedMs = r?.startedAt != null ? Date.parse(String(r.startedAt)) : NaN;
  const finishedMs = r?.finishedAt != null ? Date.parse(String(r.finishedAt)) : NaN;
  const ts = Number.isFinite(finishedMs) ? finishedMs : Number.isFinite(startedMs) ? startedMs : Date.now();
  const runAtMs = Number.isFinite(startedMs) ? startedMs : Number.isFinite(finishedMs) ? finishedMs : ts;

  const wallDur =
    r?.durationMs != null && Number.isFinite(Number(r.durationMs)) && Number(r.durationMs) >= 0
      ? Math.floor(Number(r.durationMs))
      : null;
  const logDur = parsePos(r?.run_duration_ms_raw);
  const durationMs = logDur != null ? logDur : wallDur;

  const sessionId = pick(r?.run_log_session_id_raw, r?.jobSessionId);
  const errLog = pick(r?.run_log_error_raw);
  const errCol = r?.errorMessage != null ? String(r.errorMessage).trim() : "";
  const error = errLog ?? errCol ?? "";

  const summary = pick(r?.run_log_summary_raw);

  const inn = parsePos(r?.run_usage_in_raw ?? r?.RUN_USAGE_IN_RAW);
  const outt = parsePos(r?.run_usage_out_raw ?? r?.RUN_USAGE_OUT_RAW);
  const tot = parsePos(r?.run_usage_total_raw ?? r?.RUN_USAGE_TOTAL_RAW);
  let usage = null;
  if (inn != null || outt != null || tot != null) {
    usage = {};
    if (inn != null) usage.input_tokens = inn;
    if (outt != null) usage.output_tokens = outt;
    if (tot != null) usage.total_tokens = tot;
  }
  if (usage == null && r?.usage != null && typeof r.usage === "object") {
    const u = /** @type {Record<string, unknown>} */ (r.usage);
    const i2 = parsePos(u.input_tokens ?? u.prompt_tokens ?? u.inputTokens);
    const o2 = parsePos(u.output_tokens ?? u.completion_tokens ?? u.outputTokens);
    const t2 = parsePos(u.total_tokens ?? u.totalTokens);
    if (i2 != null || o2 != null || t2 != null) {
      usage = {};
      if (i2 != null) usage.input_tokens = i2;
      if (o2 != null) usage.output_tokens = o2;
      if (t2 != null) usage.total_tokens = t2;
    }
  }

  const model = pick(r?.run_log_model_raw, r?.model);
  const provider = pick(r?.run_log_provider_raw, r?.provider);
  const deliveryStatus = pick(r?.deliveryStatus) ?? "unknown";
  const nextRunAtMs = parseNextRunAtMsFromExecutionRowRaw(r?.run_log_next_run_raw);

  return {
    ts,
    runAtMs,
    jobId: r?.jobId != null ? String(r.jobId) : null,
    runId: r?.runId != null ? String(r.runId) : null,
    action: "finished",
    status: r?.status != null ? String(r.status) : null,
    error: error || "",
    deliveryStatus,
    durationMs,
    nextRunAtMs,
    summary: summary ?? null,
    sessionId,
    sessionKey: null,
    agentId: r?.agentId != null && String(r.agentId).trim() !== "" ? String(r.agentId).trim() : null,
    model,
    provider,
    usage,
  };
}

const RUN_LOG_DRILL_TABS = [
  { key: "fields", labelKey: "scheduledTasks.taskDetail.runLog.drillTabFields" },
  { key: "summary", labelKey: "scheduledTasks.taskDetail.runLog.drillTabSummary" },
  { key: "json", labelKey: "scheduledTasks.taskDetail.runLog.drillTabJson" },
];

/**
 * 运行日志：点击行后的下钻面板（事件字段 / 产出摘要 / 完整 JSON）
 * @param {{ event: object, job: object | null, onClose: () => void, onNavigateToTaskDetail?: (jobId: string) => void }} props
 */
function RunLogDrillPanel({ event, job = null, onClose, onNavigateToTaskDetail }) {
  const [drillTab, setDrillTab] = useState(/** @type {"fields" | "summary" | "json"} */ ("fields"));

  useEffect(() => {
    setDrillTab("fields");
  }, [event?.ts, event?.runAtMs, event?.sessionId, event?.runId]);

  let rawJson = "";
  try {
    rawJson = JSON.stringify(event, null, 2);
  } catch {
    rawJson = "{}";
  }
  const st = event?.status;
  const textOrDash = (v) => (v == null || v === "" ? "—" : String(v));
  const drillAgentId = runLogRowAgentId(event, job);
  const summaryText = event?.summary != null && String(event.summary).trim() !== "" ? String(event.summary) : "";
  const drillJobIdStr = event?.jobId != null ? String(event.jobId).trim() : "";
  const sameTaskAsContextJob = job?.id != null && drillJobIdStr !== "" && String(job.id) === drillJobIdStr;

  return (
    <div
      className="rounded-lg border border-primary/25 bg-primary/[0.04] px-4 pb-3 pt-2 dark:border-primary/30 dark:bg-primary/[0.06]"
      role="region"
      aria-label={intl.get("scheduledTasks.taskDetail.runLog.drillTitle")}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="app-btn-outline shrink-0 px-2.5 py-1 text-xs">
          {intl.get("common.close")}
        </button>
      </div>
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex flex-wrap gap-1" aria-label={intl.get("scheduledTasks.taskDetail.runLog.drillTitle")}>
          {RUN_LOG_DRILL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDrillTab(/** @type {"fields" | "summary" | "json"} */ (t.key))}
              className={[
                "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                drillTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
              ].join(" ")}
            >
              {intl.get(t.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-3 min-h-[12rem]">
        {drillTab === "fields" && (
          <div className="space-y-3">
            <dl className="rounded-md border border-gray-100 bg-white/90 px-3 py-1 dark:border-gray-800 dark:bg-gray-900/70">
              {event.runId != null && String(event.runId).trim() !== "" ? (
                <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                  <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">
                    {intl.get("scheduledTasks.execution.colRunId")}
                  </dt>
                  <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{String(event.runId)}</dd>
                </div>
              ) : null}
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colEventTs")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(event.ts)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colRunAt")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(event.runAtMs)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.runLog.drillAction")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">{textOrDash(event.action)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colStatus")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">
                  {st != null && String(st) ? (
                    <span className={["inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusClass(st)].join(" ")}>{String(st)}</span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colDuration")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">{formatDuration(event.durationMs)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colDelivery")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">{textOrDash(event.deliveryStatus)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colModel")}</dt>
                <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{textOrDash(event.model)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.listTableColAgent")}</dt>
                <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                  {drillAgentId === "" ? (
                    "—"
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-all">{drillAgentId}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25 transition-colors hover:bg-primary/10"
                        onClick={() => navigateRunLogAgentToDigitalEmployeePortrait(drillAgentId, event.sessionKey)}
                      >
                        {intl.get("digitalEmployee.portrait.pageTab.overview")}
                      </button>
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colProvider")}</dt>
                <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{textOrDash(event.provider)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colSessionId")}</dt>
                <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                  {event.sessionId != null && String(event.sessionId).trim() !== "" ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-all">{String(event.sessionId)}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25 transition-colors hover:bg-primary/10"
                        onClick={() => navigateRunLogSessionToSessionAudit(event.sessionId)}
                      >
                        {intl.get("scheduledTasks.taskDetail.runLog.sessionIdOpenAudit")}
                      </button>
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.sessionKey")}</dt>
                <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{textOrDash(event.sessionKey)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colNextRun")}</dt>
                <dd className="min-w-0 text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(event.nextRunAtMs)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 dark:border-gray-800/80 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.runLog.drillJobId")}</dt>
                <dd className="min-w-0 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                  {drillJobIdStr !== "" ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-all">{drillJobIdStr}</span>
                      {typeof onNavigateToTaskDetail === "function" && !sameTaskAsContextJob && (
                        <button
                          type="button"
                          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25 transition-colors hover:bg-primary/10"
                          title={intl.get("scheduledTasks.taskDetail.runLog.jobIdOpenTaskDetailTitle")}
                          onClick={() => onNavigateToTaskDetail(drillJobIdStr)}
                        >
                          {intl.get("scheduledTasks.taskDetail.runLog.jobIdOpenTaskDetail")}
                        </button>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-start">
                <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.colError")}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100">{event.error != null ? String(event.error) : "—"}</dd>
              </div>
            </dl>
          </div>
        )}

        {drillTab === "summary" &&
          (summaryText ? (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-gray-100 bg-white/90 p-3 text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-200 [overflow-wrap:anywhere]">
              {summaryText}
            </pre>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.runLog.drillSummaryEmpty")}</p>
          ))}

        {drillTab === "json" && (
          <pre className="max-h-72 overflow-auto rounded-md border border-gray-100 bg-white/90 p-3 font-mono text-[11px] leading-relaxed text-gray-800 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-200">
            {rawJson}
          </pre>
        )}
      </div>
    </div>
  );
}

/** @param {string | number} dow */
function cronDowIndex(dow) {
  const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const u = String(dow).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(map, u)) return map[u];
  const n = Number.parseInt(String(dow), 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 6) return n;
  if (n === 7) return 0;
  return null;
}

/** @param {unknown} tz */
function scheduleTzSuffix(tz, intl) {
  if (tz == null || String(tz).trim() === "") return "";
  return intl.get("scheduledTasks.taskDetail.scheduleSemantic.tzSuffix", { tz: String(tz).trim() });
}

/**
 * @param {{ expr?: string, kind?: string, tz?: string } | null | undefined} schedule
 * @returns {{ primary: string, detail: string }}
 */
function scheduleSemantic(schedule, intl) {
  const tzS = scheduleTzSuffix(schedule?.tz, intl);
  const exprRaw = schedule?.expr;
  if (exprRaw == null || String(exprRaw).trim() === "") {
    const k = schedule?.kind;
    return { primary: k ? String(k) : "—", detail: "" };
  }
  const expr = String(exprRaw).trim();
  const parts = expr.split(/\s+/);
  if (parts.length < 5) {
    return {
      primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.kindExpr", { kind: String(schedule?.kind || "cron"), expr }) + tzS,
      detail: expr,
    };
  }
  const [min, hour, dom, mon, dow] = parts;

  const everyMin = /^\*\/(\d+)$/.exec(min);
  if (everyMin && hour === "*" && dom === "*" && mon === "*" && (dow === "*" || dow === "?")) {
    return { primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.everyMinutes", { n: everyMin[1] }) + tzS, detail: expr };
  }

  const everyHour = /^\*\/(\d+)$/.exec(hour);
  if (everyHour && /^\d+$/.test(min) && (dom === "*" || dom === "?") && (mon === "*" || mon === "?") && (dow === "*" || dow === "?")) {
    return { primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.everyHoursAtMinute", { n: everyHour[1], m: min }) + tzS, detail: expr };
  }

  const minNum = /^\d+$/.test(min);
  const hourNum = /^\d+$/.test(hour);
  if (minNum && hourNum) {
    const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const domWild = dom === "*" || dom === "?";
    const monWild = mon === "*" || mon === "?";
    const dowWild = dow === "*" || dow === "?";
    if (domWild && monWild && dowWild) {
      return { primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.dailyAt", { time }) + tzS, detail: expr };
    }
    if (domWild && monWild && !dowWild) {
      const idx = cronDowIndex(dow);
      const dowLabel = idx != null ? intl.get(`scheduledTasks.taskDetail.scheduleSemantic.dow${idx}`) : String(dow);
      return { primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.weeklyAt", { dow: dowLabel, time }) + tzS, detail: expr };
    }
    if (!domWild && monWild && dowWild) {
      return { primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.monthlyAt", { day: dom, time }) + tzS, detail: expr };
    }
  }

  return { primary: intl.get("scheduledTasks.taskDetail.scheduleSemantic.cronExpr", { expr }) + tzS, detail: expr };
}

/** @param {unknown} v */
function numSortableMs(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} a
 * @param {object} b
 * @param {string} key
 */
function compareScheduledTaskListJobs(a, b, key, intl) {
  const sa = a.listRunSummary;
  const sb = b.listRunSummary;
  switch (key) {
    case "lastRun":
      return String(a.state?.lastRunStatus ?? "").localeCompare(String(b.state?.lastRunStatus ?? ""));
    case "name":
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    case "agent":
      return String(a.agentId ?? "").localeCompare(String(b.agentId ?? ""));
    case "schedule": {
      const xa = scheduleSemantic(a.schedule, intl);
      const xb = scheduleSemantic(b.schedule, intl);
      return `${xa.primary}\u0000${xa.detail}`.localeCompare(`${xb.primary}\u0000${xb.detail}`);
    }
    case "nextRunAt":
      return (numSortableMs(a.state?.nextRunAtMs) ?? -Infinity) - (numSortableMs(b.state?.nextRunAtMs) ?? -Infinity);
    case "totalRuns":
      return (numSortableMs(sa?.totalLines) ?? -Infinity) - (numSortableMs(sb?.totalLines) ?? -Infinity);
    case "failCount":
      return (numSortableMs(sa?.failCount) ?? -Infinity) - (numSortableMs(sb?.failCount) ?? -Infinity);
    case "successRate":
      return (numSortableMs(sa?.successRatePct) ?? -Infinity) - (numSortableMs(sb?.successRatePct) ?? -Infinity);
    case "avgDur":
      return (numSortableMs(sa?.avgDurationMs) ?? -Infinity) - (numSortableMs(sb?.avgDurationMs) ?? -Infinity);
    case "maxDur":
      return (numSortableMs(sa?.maxDurationMs) ?? -Infinity) - (numSortableMs(sb?.maxDurationMs) ?? -Infinity);
    case "lastRunAt":
      return (numSortableMs(a.state?.lastRunAtMs) ?? -Infinity) - (numSortableMs(b.state?.lastRunAtMs) ?? -Infinity);
    case "lastDur":
      return (numSortableMs(a.state?.lastDurationMs) ?? -Infinity) - (numSortableMs(b.state?.lastDurationMs) ?? -Infinity);
    case "lastSuccessAt":
      return (numSortableMs(sa?.lastSuccessAtMs) ?? -Infinity) - (numSortableMs(sb?.lastSuccessAtMs) ?? -Infinity);
    case "enabled":
      return (a.enabled === false ? 1 : 0) - (b.enabled === false ? 1 : 0);
    default:
      return 0;
  }
}

function IconJobListTotal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
    </svg>
  );
}

function IconJobListEnabled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconJobListDisabled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636L5.636 18.364M5.636 5.636l12.728 12.728" />
    </svg>
  );
}

/** 卡片模式任务项图标（文档任务） */
function IconJobCard(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/** 列表视图（行列表图示） */
function IconViewList(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

/** 卡片视图：四宫格线框（小尺寸下更清晰，语义接近 Layout grid / 卡片栅格） */
function IconViewGrid(props) {
  const cn = props.className;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn} aria-hidden>
      <rect x="3.25" y="3.25" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="2" />
      <rect x="13.25" y="3.25" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="2" />
      <rect x="3.25" y="13.25" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="2" />
      <rect x="13.25" y="13.25" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconRefresh(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 005.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function TaskDetailPanel({ runOverviewPickJobId, onRunOverviewPickConsumed }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [events, setEvents] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [errorJobs, setErrorJobs] = useState(null);
  const [errorEvents, setErrorEvents] = useState(null);
  const [jobDetailTab, setJobDetailTab] = useState("summary");
  const [runLogPage, setRunLogPage] = useState(1);
  const [runLogSearch, setRunLogSearch] = useState("");
  const [runLogStatus, setRunLogStatus] = useState("");
  const [runLogModel, setRunLogModel] = useState("");
  const [runLogDelivery, setRunLogDelivery] = useState("");
  const [runLogAgent, setRunLogAgent] = useState("");
  /** 运行日志：当前下钻选中的事件 */
  const [runLogDrillEvent, setRunLogDrillEvent] = useState(/** @type {object | null} */ (null));
  const runLogDrillRef = useRef(null);
  /** 任务详情：运行日志 / 运行结果 / 运行追溯 等共用「统计时间」窗口（见 `TaskDetailRunEventsTimeRangeFilter`） */
  const {
    activeDays: tokenTimeActiveDays,
    activePresetHours: tokenTimeActiveHours,
    rangeStartLocal: tokenTimeRangeStartLocal,
    rangeEndLocal: tokenTimeRangeEndLocal,
    highlightPresets: tokenTimeHighlightPresets,
    onPreset: handleTokenTimePreset,
    onRangeLocalChange: handleTokenTimeRangeLocalChange,
    resetToDefault: resetTokenTimeRunEventsRange,
  } = useRunEventsTimeRangeFilter();
  const [jobListPage, setJobListPage] = useState(1);
  const [jobListQuery, setJobListQuery] = useState("");
  const [jobListEnabledFilter, setJobListEnabledFilter] = useState(/** @type {'all' | 'enabled' | 'disabled'} */ ("all"));
  /** Agent 下拉："" 全部； "__UNSET__" 无 Agent；否则为精确 agentId */
  const [jobListAgentFilter, setJobListAgentFilter] = useState("");
  const [jobListLastStatusFilter, setJobListLastStatusFilter] = useState("");
  const [jobListDisplayMode, setJobListDisplayMode] = useState(/** @type {'list' | 'cards'} */ ("list"));
  const [jobListSortKey, setJobListSortKey] = useState(/** @type {string | null} */ (null));
  const [jobListSortOrder, setJobListSortOrder] = useState(/** @type {'asc' | 'desc'} */ ("asc"));

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    setErrorJobs(null);
    try {
      const url = TASK_DETAIL_SOURCE_IS_LOCAL ? "/api/local-jobs" : "/api/cron-jobs";
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || res.statusText || "error");
      }
      const list = Array.isArray(data.jobs) ? data.jobs : [];
      setJobs(list);
      setSelectedJobId((cur) => (cur && list.some((j) => j && j.id === cur) ? cur : ""));
    } catch (e) {
      setJobs([]);
      setSelectedJobId("");
      setErrorJobs(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (runOverviewPickJobId == null || String(runOverviewPickJobId).trim() === "") return;
    if (loadingJobs) return;
    const id = String(runOverviewPickJobId).trim();
    setSelectedJobId(id);
    onRunOverviewPickConsumed?.();
  }, [runOverviewPickJobId, loadingJobs, onRunOverviewPickConsumed]);

  const loadEvents = useCallback(async (jobId) => {
    if (!jobId) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    setErrorEvents(null);
    try {
      const evUrl = TASK_DETAIL_SOURCE_IS_LOCAL
        ? `/api/local-jobs/${encodeURIComponent(jobId)}/run-events?limit=500`
        : `/api/cron-jobs/${encodeURIComponent(jobId)}/run-events?limit=500`;
      const res = await fetch(evUrl);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || res.statusText || "error");
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (e) {
      setEvents([]);
      setErrorEvents(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents(selectedJobId);
  }, [selectedJobId, loadEvents]);

  useEffect(() => {
    setJobDetailTab("summary");
  }, [selectedJobId]);

  useEffect(() => {
    resetTokenTimeRunEventsRange();
  }, [selectedJobId, resetTokenTimeRunEventsRange]);

  const tokenTimeFilteredEvents = useMemo(
    () => filterRunEventsByTimeRange(events, tokenTimeRangeStartLocal, tokenTimeRangeEndLocal),
    [events, tokenTimeRangeStartLocal, tokenTimeRangeEndLocal],
  );

  useEffect(() => {
    runLogDrillRef.current = runLogDrillEvent;
  }, [runLogDrillEvent]);

  useEffect(() => {
    setRunLogPage(1);
    setRunLogSearch("");
    setRunLogStatus("");
    setRunLogModel("");
    setRunLogDelivery("");
    setRunLogAgent("");
    setRunLogDrillEvent(null);
  }, [selectedJobId]);

  useEffect(() => {
    if (jobDetailTab !== "execution" && jobDetailTab !== "trace") setRunLogDrillEvent(null);
  }, [jobDetailTab]);

  useEffect(() => {
    setRunLogPage(1);
  }, [runLogSearch, runLogStatus, runLogModel, runLogDelivery, runLogAgent, tokenTimeRangeStartLocal, tokenTimeRangeEndLocal]);

  useEffect(() => {
    if (!selectedJobId) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (runLogDrillRef.current) {
        e.preventDefault();
        setRunLogDrillEvent(null);
        return;
      }
      setSelectedJobId("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedJobId]);

  const job = jobs.find((j) => j && j.id === selectedJobId) ?? null;

  const runLogStatusOptions = useMemo(() => {
    const uniq = new Set();
    for (const ev of events) {
      if (ev?.status != null && String(ev.status).trim()) uniq.add(String(ev.status));
    }
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const runLogModelOptions = useMemo(() => {
    const uniq = new Set();
    for (const ev of events) {
      if (ev?.model != null && String(ev.model).trim()) uniq.add(String(ev.model));
    }
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const runLogDeliveryOptions = useMemo(() => {
    const uniq = new Set();
    for (const ev of events) {
      if (ev?.deliveryStatus != null && String(ev.deliveryStatus).trim()) uniq.add(String(ev.deliveryStatus));
    }
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const runLogAgentOptions = useMemo(() => {
    const uniq = new Set();
    let hasUnset = false;
    for (const ev of events) {
      const aid = runLogRowAgentId(ev, job);
      if (aid === "") hasUnset = true;
      else uniq.add(aid);
    }
    return { agentIds: [...uniq].sort((a, b) => a.localeCompare(b)), hasUnset };
  }, [events, job]);

  const runLogFiltered = useMemo(() => {
    const list = Array.isArray(events) ? events : [];
    const q = runLogSearch.trim().toLowerCase();
    const fromMs = parseDateTimeLocalInput(tokenTimeRangeStartLocal);
    const toMs = parseDateTimeLocalInput(tokenTimeRangeEndLocal);
    return list.filter((ev) => {
      const anchor = parseRunEventAnchorMs(ev);
      if (fromMs != null && (!Number.isFinite(anchor) || anchor < fromMs)) return false;
      if (toMs != null && (!Number.isFinite(anchor) || anchor > toMs)) return false;
      if (runLogStatus) {
        const st = ev?.status != null ? String(ev.status) : "";
        if (st !== runLogStatus) return false;
      }
      if (runLogModel) {
        const m = ev?.model != null ? String(ev.model) : "";
        if (m !== runLogModel) return false;
      }
      if (runLogDelivery) {
        const d = ev?.deliveryStatus != null ? String(ev.deliveryStatus) : "";
        if (d !== runLogDelivery) return false;
      }
      if (runLogAgent) {
        const aid = runLogRowAgentId(ev, job);
        if (runLogAgent === "__UNSET__") {
          if (aid !== "") return false;
        } else if (aid !== runLogAgent) {
          return false;
        }
      }
      if (q) {
        const agentDisp = runLogRowAgentDisplay(ev, job);
        const blob = [
          ev.ts,
          ev.runAtMs,
          ev.status,
          ev.durationMs,
          ev.deliveryStatus,
          ev.model,
          agentDisp.label,
          agentDisp.id,
          ev.sessionId,
          ev.nextRunAtMs,
          ev.error,
        ]
          .filter((x) => x != null)
          .map((x) => String(x))
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [events, job, runLogSearch, runLogStatus, runLogModel, runLogDelivery, runLogAgent, tokenTimeRangeStartLocal, tokenTimeRangeEndLocal]);

  useEffect(() => {
    const totalPages = runLogFiltered.length === 0 ? 1 : Math.ceil(runLogFiltered.length / RUN_LOG_PAGE_SIZE);
    if (runLogPage > totalPages) setRunLogPage(totalPages);
  }, [runLogFiltered.length, runLogPage]);

  const runLogPageRows = useMemo(() => {
    const start = (runLogPage - 1) * RUN_LOG_PAGE_SIZE;
    return runLogFiltered.slice(start, start + RUN_LOG_PAGE_SIZE);
  }, [runLogFiltered, runLogPage]);

  useEffect(() => {
    if (!runLogDrillEvent) return;
    const still = runLogFiltered.some((e) => sameRunLogEvent(e, runLogDrillEvent));
    if (!still) setRunLogDrillEvent(null);
  }, [runLogFiltered, runLogDrillEvent]);

  const handleRunLogRowClick = useCallback((ev) => {
    setRunLogDrillEvent((cur) => (cur && sameRunLogEvent(cur, ev) ? null : ev));
  }, []);

  const jobListCounts = useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    for (const j of jobs) {
      if (!j) continue;
      if (j.enabled === false) disabled += 1;
      else enabled += 1;
    }
    return { total: jobs.length, enabled, disabled };
  }, [jobs]);

  const jobListAgentOptions = useMemo(() => {
    const ids = new Set();
    let hasUnset = false;
    for (const j of jobs) {
      if (!j) continue;
      const raw = j.agentId;
      if (raw == null || String(raw).trim() === "") hasUnset = true;
      else ids.add(String(raw));
    }
    return { agentIds: [...ids].sort((a, b) => a.localeCompare(b)), hasUnset };
  }, [jobs]);

  useEffect(() => {
    if (!jobListAgentFilter) return;
    if (jobListAgentFilter === "__UNSET__") {
      if (!jobs.some((j) => j && (j.agentId == null || String(j.agentId).trim() === ""))) setJobListAgentFilter("");
      return;
    }
    if (!jobs.some((j) => j && String(j.agentId ?? "") === jobListAgentFilter)) setJobListAgentFilter("");
  }, [jobs, jobListAgentFilter]);

  const jobListLastStatusOptions = useMemo(() => {
    const set = new Set();
    for (const j of jobs) {
      if (!j) continue;
      const st = j.state?.lastRunStatus;
      if (st != null && String(st).trim()) set.add(String(st));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    let list = jobs.filter(Boolean);
    if (jobListEnabledFilter === "enabled") list = list.filter((j) => j.enabled !== false);
    else if (jobListEnabledFilter === "disabled") list = list.filter((j) => j.enabled === false);

    if (jobListAgentFilter === "__UNSET__") {
      list = list.filter((j) => j.agentId == null || String(j.agentId).trim() === "");
    } else if (jobListAgentFilter) {
      list = list.filter((j) => String(j.agentId ?? "") === jobListAgentFilter);
    }

    if (jobListLastStatusFilter) {
      list = list.filter((j) => String(j.state?.lastRunStatus ?? "") === jobListLastStatusFilter);
    }

    const q = jobListQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) => {
      const name = String(j.name ?? "").toLowerCase();
      const id = String(j.id ?? "").toLowerCase();
      const agent = j.agentId != null ? String(j.agentId).toLowerCase() : "";
      const sem = scheduleSemantic(j.schedule, intl);
      const sch = `${sem.primary} ${sem.detail || ""}`.toLowerCase();
      const status = j.state?.lastRunStatus != null ? String(j.state.lastRunStatus).toLowerCase() : "";
      const sum = j.listRunSummary;
      const extra = sum
        ? [String(sum.totalLines ?? ""), String(sum.failCount ?? ""), String(sum.successRatePct ?? "")]
            .join(" ")
            .toLowerCase()
        : "";
      return name.includes(q) || id.includes(q) || agent.includes(q) || sch.includes(q) || status.includes(q) || extra.includes(q);
    });
  }, [jobs, jobListQuery, jobListEnabledFilter, jobListAgentFilter, jobListLastStatusFilter, intl]);

  const sortedFilteredJobs = useMemo(() => {
    if (!jobListSortKey) return filteredJobs;
    const dir = jobListSortOrder === "asc" ? 1 : -1;
    const arr = [...filteredJobs];
    arr.sort((a, b) => {
      const c = compareScheduledTaskListJobs(a, b, jobListSortKey, intl);
      if (c !== 0) return c * dir;
      return String(a.id).localeCompare(String(b.id));
    });
    return arr;
  }, [filteredJobs, jobListSortKey, jobListSortOrder, intl]);

  const handleJobListSort = useCallback((columnKey) => {
    setJobListPage(1);
    setJobListSortKey((prev) => {
      if (prev === columnKey) {
        setJobListSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setJobListSortOrder("asc");
      return columnKey;
    });
  }, []);

  const pagedJobs = useMemo(() => {
    const start = (jobListPage - 1) * JOB_LIST_PAGE_SIZE;
    return sortedFilteredJobs.slice(start, start + JOB_LIST_PAGE_SIZE);
  }, [sortedFilteredJobs, jobListPage]);

  useEffect(() => {
    setJobListPage(1);
  }, [jobListQuery, jobListEnabledFilter, jobListAgentFilter, jobListLastStatusFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOB_LIST_PAGE_SIZE));
    if (jobListPage > totalPages) setJobListPage(totalPages);
  }, [filteredJobs.length, jobListPage]);

  return (
    <div className="space-y-4">
      {errorJobs && (
        <p className="rounded-lg border border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {intl.get("common.loadFailed", { error: errorJobs })}
        </p>
      )}

      {loadingJobs && jobs.length === 0 ? (
        <LoadingSpinner message={intl.get("common.loadingList")} className="py-12" />
      ) : jobs.length === 0 ? (
        <div className="app-card rounded-xl border border-gray-100 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("common.noData")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-stretch">
            <div className="flex min-h-[92px] items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
                <IconJobListTotal className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {intl.get("scheduledTasks.taskDetail.listCardTotal")}
                </p>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-gray-900 tabular-nums dark:text-gray-50">{jobListCounts.total}</p>
              </div>
            </div>
            <div className="flex min-h-[92px] items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <IconJobListEnabled className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {intl.get("scheduledTasks.taskDetail.listCardEnabled")}
                </p>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-emerald-700 tabular-nums dark:text-emerald-300">{jobListCounts.enabled}</p>
              </div>
            </div>
            <div className="flex min-h-[92px] items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <IconJobListDisabled className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {intl.get("scheduledTasks.taskDetail.listCardDisabled")}
                </p>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-gray-800 tabular-nums dark:text-gray-100">{jobListCounts.disabled}</p>
              </div>
            </div>
          </div>

          <div className="app-card w-full overflow-hidden px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,50%)_auto] sm:items-center">
            <div className="flex min-w-0 max-w-full items-center gap-2 sm:max-w-[50%]">
                  <label htmlFor="job-list-search" className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">
                    {intl.get("scheduledTasks.taskDetail.listFilterSearchLabel")}
                  </label>
                  <input
                    id="job-list-search"
                    type="search"
                    value={jobListQuery}
                    onChange={(e) => setJobListQuery(e.target.value)}
                    placeholder={intl.get("scheduledTasks.taskDetail.listFilterSearchPlaceholder")}
                    className="app-input h-8 min-w-0 w-full flex-1 px-2.5 py-0 text-xs leading-8"
                    autoComplete="off"
                  />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <label
                      htmlFor="job-list-enabled-filter"
                      className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400"
                      title={intl.get("scheduledTasks.taskDetail.listFilterEnabledLabel")}
                    >
                      {intl.get("scheduledTasks.taskDetail.listFilterEnabledLabel")}
                    </label>
                    <select
                      id="job-list-enabled-filter"
                      value={jobListEnabledFilter}
                      onChange={(e) => setJobListEnabledFilter(/** @type {'all' | 'enabled' | 'disabled'} */ (e.target.value))}
                      className="app-input h-8 min-w-0 flex-1 px-2.5 py-0 text-xs leading-8"
                    >
                      <option value="all">{intl.get("scheduledTasks.taskDetail.listFilterStatusAll")}</option>
                      <option value="enabled">{intl.get("scheduledTasks.taskDetail.listFilterStatusEnabled")}</option>
                      <option value="disabled">{intl.get("scheduledTasks.taskDetail.listFilterStatusDisabled")}</option>
                    </select>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <label
                      htmlFor="job-list-last-status-filter"
                      className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400"
                      title={intl.get("scheduledTasks.taskDetail.listFilterLastRunLabel")}
                    >
                      {intl.get("scheduledTasks.taskDetail.listFilterLastRunLabel")}
                    </label>
                    <select
                      id="job-list-last-status-filter"
                      value={jobListLastStatusFilter}
                      onChange={(e) => setJobListLastStatusFilter(e.target.value)}
                      className="app-input h-8 min-w-0 flex-1 px-2.5 py-0 text-xs leading-8"
                    >
                      <option value="">{intl.get("scheduledTasks.taskDetail.listFilterLastStatusAll")}</option>
                      {jobListLastStatusOptions.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <label
                      htmlFor="job-list-agent-filter"
                      className="shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400"
                      title={intl.get("scheduledTasks.taskDetail.listFilterAgentFilterLabel")}
                    >
                      {intl.get("scheduledTasks.taskDetail.listFilterAgentFilterLabel")}
                    </label>
                    <select
                      id="job-list-agent-filter"
                      value={jobListAgentFilter}
                      onChange={(e) => setJobListAgentFilter(e.target.value)}
                      className="app-input h-8 min-w-0 flex-1 px-2.5 py-0 text-xs leading-8"
                    >
                      <option value="">{intl.get("scheduledTasks.taskDetail.listFilterAgentAll")}</option>
                      {jobListAgentOptions.hasUnset ? (
                        <option value="__UNSET__">{intl.get("scheduledTasks.taskDetail.listFilterAgentUnset")}</option>
                      ) : null}
                      {jobListAgentOptions.agentIds.map((id) => (
                        <option key={id} value={id} title={id}>
                          {id.length > 36 ? `${id.slice(0, 34)}…` : id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex h-8 shrink-0 flex-wrap items-center gap-2 self-start sm:self-center">
                  <div
                    className="inline-flex h-8 items-stretch rounded-lg border border-gray-200 bg-gray-50/90 p-0.5 dark:border-gray-700 dark:bg-gray-800/70"
                    role="radiogroup"
                    aria-label={intl.get("scheduledTasks.taskDetail.jobListViewGroupLabel")}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={jobListDisplayMode === "list"}
                      onClick={() => setJobListDisplayMode("list")}
                      title={intl.get("scheduledTasks.taskDetail.jobListViewList")}
                      aria-label={intl.get("scheduledTasks.taskDetail.jobListViewList")}
                      className={[
                        "flex h-full w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                        jobListDisplayMode === "list"
                          ? "bg-primary text-white shadow-sm dark:bg-primary dark:text-white"
                          : "text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100",
                      ].join(" ")}
                    >
                      <IconViewList className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={jobListDisplayMode === "cards"}
                      onClick={() => setJobListDisplayMode("cards")}
                      title={intl.get("scheduledTasks.taskDetail.jobListViewCards")}
                      aria-label={intl.get("scheduledTasks.taskDetail.jobListViewCards")}
                      className={[
                        "flex h-full w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                        jobListDisplayMode === "cards"
                          ? "bg-primary text-white shadow-sm dark:bg-primary dark:text-white"
                          : "text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100",
                      ].join(" ")}
                    >
                      <IconViewGrid className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadJobs()}
                    className="app-btn-outline inline-flex h-8 w-8 shrink-0 items-center justify-center !p-0"
                    title={intl.get("scheduledTasks.taskDetail.refresh")}
                    aria-label={intl.get("scheduledTasks.taskDetail.refresh")}
                  >
                    <IconRefresh className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                  </button>
                </div>
              </div>
          </div>

          <div className="app-card flex w-full flex-col overflow-hidden border border-gray-100 dark:border-gray-800">
              <div className="min-h-0 flex-1 overflow-auto">
                {jobListDisplayMode === "list" ? (
                <table className="w-full min-w-[120rem] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-[1] border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
                    <tr>
                      <th className="!px-3 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {intl.get("scheduledTasks.taskDetail.listTableColName")}
                      </th>
                      <SortableTableTh
                        label={intl.get("scheduledTasks.execution.colJobName")}
                        columnKey="name"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-3 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColAgent")}
                        columnKey="agent"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-3 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColSchedule")}
                        columnKey="schedule"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!min-w-[10rem] !px-3 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColNextRunAt")}
                        columnKey="nextRunAt"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listColTotalRuns")}
                        columnKey="totalRuns"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                        title={intl.get("scheduledTasks.taskDetail.listColTotalRunsHint")}
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listColFailCount")}
                        columnKey="failCount"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                        title={intl.get("scheduledTasks.taskDetail.listColFailCountHint")}
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listColSuccessRate")}
                        columnKey="successRate"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                        title={intl.get("scheduledTasks.taskDetail.listColSuccessRateHint")}
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listColAvgDuration")}
                        columnKey="avgDur"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listColMaxDuration")}
                        columnKey="maxDur"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColLastRun")}
                        columnKey="lastRun"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColLastRunAt")}
                        columnKey="lastRunAt"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColLastDuration")}
                        columnKey="lastDur"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listColLastSuccessAt")}
                        columnKey="lastSuccessAt"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTableTh
                        label={intl.get("scheduledTasks.taskDetail.listTableColEnabled")}
                        columnKey="enabled"
                        sortKey={jobListSortKey}
                        sortOrder={jobListSortOrder}
                        onSort={handleJobListSort}
                        className="!px-2 !py-2 whitespace-nowrap text-center text-xs font-semibold text-gray-700 dark:text-gray-300 [&_button]:justify-center"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {pagedJobs.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                          {intl.get("common.noData")}
                        </td>
                      </tr>
                    ) : (
                      pagedJobs.map((j) => {
                      const selected = Boolean(j?.id && j.id === selectedJobId);
                      const lastSt = j.state?.lastRunStatus != null && String(j.state.lastRunStatus) ? String(j.state.lastRunStatus) : "";
                      const sem = scheduleSemantic(j.schedule, intl);
                      const stratTitle = sem.detail || j.schedule?.expr || undefined;
                      const s = j.listRunSummary;
                      const truncHint = s?.truncated ? intl.get("scheduledTasks.taskDetail.listSummaryTruncatedHint") : undefined;
                      return (
                        <tr
                          key={j.id}
                          role="button"
                          tabIndex={0}
                          aria-current={selected ? "true" : undefined}
                          onClick={() => setSelectedJobId(j.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedJobId(j.id);
                            }
                          }}
                          className={[
                            "cursor-pointer border-l-4 transition-colors",
                            selected
                              ? "border-primary bg-primary/10 dark:bg-primary/15"
                              : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60",
                          ].join(" ")}
                        >
                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                            {lastSt ? (
                              <span className={["inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", statusClass(j.state.lastRunStatus)].join(" ")}>
                                {lastSt}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">—</span>
                            )}
                          </td>
                          <td className="max-w-[14rem] px-3 py-2 align-middle">
                            <div className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100" title={j.name || j.id}>
                              {j.name ? truncateText(j.name, 80) : j.id}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-gray-500 dark:text-gray-400" title={j.id}>
                              {j.id}
                            </div>
                          </td>
                          <td className="max-w-[6rem] whitespace-nowrap px-3 py-2 align-middle font-mono text-xs text-gray-700 dark:text-gray-300" title={j.agentId != null ? String(j.agentId) : ""}>
                            {j.agentId != null && String(j.agentId) ? truncateText(String(j.agentId), 24) : "—"}
                          </td>
                          <td className="max-w-[14rem] px-3 py-2 align-middle text-gray-800 dark:text-gray-200" title={stratTitle}>
                            <span className="line-clamp-2 text-[11px] leading-snug">{sem.primary}</span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-gray-700 dark:text-gray-300">
                            {formatEpochMs(j.state?.nextRunAtMs)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle tabular-nums text-gray-700 dark:text-gray-300">{s?.totalLines != null ? String(s.totalLines) : "—"}</td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle tabular-nums text-gray-700 dark:text-gray-300" title={truncHint}>
                            {s?.failCount != null ? String(s.failCount) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle tabular-nums text-gray-700 dark:text-gray-300" title={truncHint}>
                            {s?.successRatePct != null ? `${s.successRatePct}%` : "—"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-gray-700 dark:text-gray-300" title={truncHint}>
                            {formatDuration(s?.avgDurationMs)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-gray-700 dark:text-gray-300" title={truncHint}>
                            {formatDuration(s?.maxDurationMs)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-gray-700 dark:text-gray-300">
                            {formatEpochMs(j.state?.lastRunAtMs)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-gray-700 dark:text-gray-300">
                            {formatDuration(j.state?.lastDurationMs)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-gray-700 dark:text-gray-300">
                            {formatEpochMs(s?.lastSuccessAtMs)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-middle text-center">
                            {j.enabled === false ? (
                              <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                {intl.get("scheduledTasks.taskDetail.listDisabled")}
                              </span>
                            ) : (
                              <span className="inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {intl.get("scheduledTasks.taskDetail.listEnabled")}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
                ) : (
                  <div className="px-3 py-3">
                    {pagedJobs.length === 0 ? (
                      <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("common.noData")}</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {pagedJobs.map((j) => {
                          const selected = Boolean(j?.id && j.id === selectedJobId);
                          const lastSt = j.state?.lastRunStatus != null && String(j.state.lastRunStatus) ? String(j.state.lastRunStatus) : "";
                          const sem = scheduleSemantic(j.schedule, intl);
                          const stratTitle = sem.detail || j.schedule?.expr || undefined;
                          const s = j.listRunSummary;
                          const truncHint = s?.truncated ? intl.get("scheduledTasks.taskDetail.listSummaryTruncatedHint") : undefined;
                          const sr = s?.successRatePct;
                          const fc = s?.failCount ?? 0;
                          const rateDdClass =
                            sr != null && Number(sr) === 0 && fc > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : sr != null && Number(sr) >= 100
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-900 dark:text-slate-50";
                          const failDdClass = fc > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-50";
                          const metricTile =
                            "flex min-h-[3.75rem] flex-col justify-between rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 text-left shadow-sm dark:border-slate-600/40 dark:bg-slate-950/55 dark:shadow-none";
                          const metricDt =
                            "min-h-[1.75rem] text-[10px] font-medium leading-snug tracking-wide text-slate-500 dark:text-slate-400";
                          const metricDdBase = "mt-1 text-[11px] font-semibold tabular-nums leading-tight";
                          const metricSectionResults =
                            "rounded-lg border border-sky-200/70 bg-sky-50/90 p-2 ring-1 ring-sky-900/[0.04] dark:border-sky-800/45 dark:bg-sky-950/40 dark:ring-sky-400/[0.07]";
                          const metricSectionTitleResults =
                            "mb-1.5 border-b border-sky-200/70 pb-1 text-[10px] font-semibold uppercase leading-tight tracking-wider text-sky-800/90 dark:border-sky-700/50 dark:text-sky-300";
                          const metricSectionPerformance =
                            "flex min-h-0 flex-col rounded-lg border border-emerald-200/70 bg-emerald-50/90 p-2 ring-1 ring-emerald-900/[0.04] dark:border-emerald-800/45 dark:bg-emerald-950/40 dark:ring-emerald-400/[0.08]";
                          const metricSectionTitlePerformance =
                            "mb-1.5 border-b border-emerald-200/70 pb-1 text-[10px] font-semibold uppercase leading-tight tracking-wider text-emerald-800/90 dark:border-emerald-700/50 dark:text-emerald-300";
                          const metricSectionRecent =
                            "rounded-lg border border-violet-200/70 bg-violet-50/90 p-2 ring-1 ring-violet-900/[0.04] dark:border-violet-800/50 dark:bg-violet-950/40 dark:ring-violet-400/[0.09]";
                          const metricSectionTitleRecent =
                            "mb-1.5 border-b border-violet-200/70 pb-1 text-[10px] font-semibold uppercase leading-tight tracking-wider text-violet-800/90 dark:border-violet-700/50 dark:text-violet-300";
                          return (
                            <article
                              key={j.id}
                              role="button"
                              tabIndex={0}
                              aria-current={selected ? "true" : undefined}
                              onClick={() => setSelectedJobId(j.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedJobId(j.id);
                                }
                              }}
                              className={[
                                "flex cursor-pointer flex-col rounded-xl border border-gray-100 bg-white p-2 text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-200 dark:border-gray-800 dark:bg-gray-900",
                                selected
                                  ? "border-primary ring-2 ring-primary/30 hover:ring-primary/45 dark:ring-primary/35"
                                  : "hover:border-primary hover:ring-2 hover:ring-primary/40 hover:ring-offset-0 hover:ring-offset-transparent dark:hover:border-primary dark:hover:ring-primary/35",
                                !selected ? "hover:bg-gray-50/90 dark:hover:bg-gray-800/50" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <div className="flex items-start gap-1.5">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                                  <IconJobCard className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex min-w-0 flex-1 items-start justify-between gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <h3 className="line-clamp-2 text-[11px] font-semibold leading-tight text-gray-900 dark:text-gray-100 sm:text-xs" title={j.name || j.id}>
                                      {j.name ? truncateText(j.name, 100) : j.id}
                                    </h3>
                                    <p className="mt-px truncate font-mono text-[9px] leading-tight text-gray-500 dark:text-gray-400" title={j.id}>
                                      {j.id}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                                    <span
                                      className="max-w-[12rem] truncate rounded border border-slate-200/90 bg-slate-50 px-1 py-px text-[9px] leading-tight text-slate-700 shadow-sm dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-200"
                                      title={
                                        j.agentId != null && String(j.agentId).trim() !== ""
                                          ? `${intl.get("scheduledTasks.taskDetail.listTableColAgent")}: ${String(j.agentId)}`
                                          : `${intl.get("scheduledTasks.taskDetail.listTableColAgent")}: ${intl.get("scheduledTasks.taskDetail.listFilterAgentUnset")}`
                                      }
                                    >
                                      <span className="font-sans text-slate-500 dark:text-slate-400">
                                        {intl.get("scheduledTasks.taskDetail.listTableColAgent")}:
                                      </span>
                                      <span className="font-mono">
                                        {j.agentId != null && String(j.agentId).trim() !== ""
                                          ? ` ${truncateText(String(j.agentId), 26)}`
                                          : " —"}
                                      </span>
                                    </span>
                                    {j.enabled === false ? (
                                      <span className="inline-flex rounded bg-gray-100 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                        {intl.get("scheduledTasks.taskDetail.listDisabled")}
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded bg-emerald-50 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                        {intl.get("scheduledTasks.taskDetail.listEnabled")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-1.5 space-y-1.5 text-xs text-gray-800 dark:text-gray-200">
                                <div className="space-y-1 rounded-lg border border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-slate-100/40 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-slate-600/50 dark:from-slate-900/60 dark:to-slate-900/35 dark:shadow-none">
                                  <div>
                                    <div className="text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">
                                      {intl.get("scheduledTasks.taskDetail.listTableColSchedule")}
                                    </div>
                                    <p className="mt-px line-clamp-2 text-[11px] leading-tight text-slate-800 dark:text-slate-100" title={stratTitle}>
                                      {sem.primary}
                                    </p>
                                  </div>
                                  <div className="border-t border-slate-200/60 pt-1 dark:border-slate-600/45">
                                    <div className="text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">
                                      {intl.get("scheduledTasks.taskDetail.listTableColNextRunAt")}
                                    </div>
                                    <p className="mt-px font-mono text-[11px] leading-tight text-slate-800 dark:text-slate-100" title={formatEpochMs(j.state?.nextRunAtMs)}>
                                      {formatEpochMs(j.state?.nextRunAtMs)}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-2" title={truncHint || undefined}>
                                  <section className={metricSectionRecent}>
                                    <h4 className={metricSectionTitleRecent}>{intl.get("scheduledTasks.taskDetail.cardMetricSectionRecent")}</h4>
                                    <dl className="grid grid-cols-2 gap-1.5">
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listTableColLastRunAt")}</dt>
                                        <dd className={`${metricDdBase} font-mono text-slate-800 dark:text-slate-100`}>
                                          {formatEpochMs(j.state?.lastRunAtMs)}
                                        </dd>
                                      </div>
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listTableColLastRun")}</dt>
                                        <dd className={`${metricDdBase} flex min-h-[1.125rem] items-end`}>
                                          {lastSt ? (
                                            <span
                                              className={["inline-flex rounded px-1 py-px text-[9px] font-medium ring-1 ring-inset", statusClass(j.state?.lastRunStatus)].join(" ")}
                                            >
                                              {lastSt}
                                            </span>
                                          ) : (
                                            <span className="text-gray-400 dark:text-gray-500">—</span>
                                          )}
                                        </dd>
                                      </div>
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listTableColLastDuration")}</dt>
                                        <dd className={`${metricDdBase} text-slate-800 dark:text-slate-100`}>{formatDuration(j.state?.lastDurationMs)}</dd>
                                      </div>
                                    </dl>
                                  </section>
                                  <section className={metricSectionResults}>
                                    <h4 className={metricSectionTitleResults}>{intl.get("scheduledTasks.taskDetail.cardMetricSectionResults")}</h4>
                                    <dl className="grid grid-cols-2 gap-1.5">
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listColTotalRuns")}</dt>
                                        <dd className={`${metricDdBase} text-slate-900 dark:text-slate-50`}>
                                          {s?.totalLines != null ? String(s.totalLines) : "—"}
                                        </dd>
                                      </div>
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listColFailCount")}</dt>
                                        <dd className={`${metricDdBase} ${failDdClass}`}>{s?.failCount != null ? String(s.failCount) : "—"}</dd>
                                      </div>
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listColSuccessRate")}</dt>
                                        <dd className={`${metricDdBase} ${rateDdClass}`}>
                                          {s?.successRatePct != null ? `${s.successRatePct}%` : "—"}
                                        </dd>
                                      </div>
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listColLastSuccessAt")}</dt>
                                        <dd className={`${metricDdBase} font-mono text-slate-800 dark:text-slate-100`}>
                                          {formatEpochMs(s?.lastSuccessAtMs)}
                                        </dd>
                                      </div>
                                    </dl>
                                  </section>
                                  <section className={metricSectionPerformance}>
                                    <h4 className={metricSectionTitlePerformance}>{intl.get("scheduledTasks.taskDetail.cardMetricSectionPerformance")}</h4>
                                    <dl className="grid grid-cols-2 gap-1.5">
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listColAvgDuration")}</dt>
                                        <dd className={`${metricDdBase} text-slate-800 dark:text-slate-100`}>{formatDuration(s?.avgDurationMs)}</dd>
                                      </div>
                                      <div className={metricTile}>
                                        <dt className={metricDt}>{intl.get("scheduledTasks.taskDetail.listColMaxDuration")}</dt>
                                        <dd className={`${metricDdBase} text-slate-800 dark:text-slate-100`}>{formatDuration(s?.maxDurationMs)}</dd>
                                      </div>
                                    </dl>
                                  </section>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-gray-100 px-3 py-3 dark:border-gray-800">
                <TablePagination
                  page={jobListPage}
                  pageSize={JOB_LIST_PAGE_SIZE}
                  total={filteredJobs.length}
                  onPageChange={setJobListPage}
                />
              </div>
          </div>

          {selectedJobId && job ? (
            <>
              <div
                role="presentation"
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                onClick={() => setSelectedJobId("")}
                aria-hidden
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="scheduled-task-drawer-title"
                className="fixed inset-y-0 right-0 z-50 flex max-h-[100dvh] w-full max-w-[min(100vw,51.84rem)] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:max-w-[51.84rem] md:max-w-[60.48rem] lg:max-w-[74.88rem] xl:max-w-[86.4rem]"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                  <div className="min-w-0 flex-1">
                    <h2 id="scheduled-task-drawer-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {intl.get("scheduledTasks.taskDetail.detailTitle")}
                    </h2>
                  </div>
                  <button type="button" onClick={() => setSelectedJobId("")} className="app-btn-outline shrink-0 text-sm">
                    {intl.get("common.close")}
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-4 pb-6">
                  <div className="border-b border-gray-100 dark:border-gray-800/60">
                    <nav className="flex flex-wrap gap-1" aria-label={intl.get("scheduledTasks.taskDetail.detailTitle")}>
                      {JOB_DETAIL_SUB_TABS.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setJobDetailTab(t.key)}
                          className={[
                            "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                            jobDetailTab === t.key
                              ? "border-primary text-primary"
                              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
                          ].join(" ")}
                        >
                          {intl.get(t.labelKey)}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {(jobDetailTab === "results" ||
                    jobDetailTab === "execution" ||
                    jobDetailTab === "trace") &&
                    job && (
                    <div>
                      <TaskDetailRunEventsTimeRangeFilter
                        activeDays={tokenTimeActiveDays}
                        activePresetHours={tokenTimeActiveHours}
                        onPreset={handleTokenTimePreset}
                        rangeStartLocal={tokenTimeRangeStartLocal}
                        rangeEndLocal={tokenTimeRangeEndLocal}
                        onRangeLocalChange={handleTokenTimeRangeLocalChange}
                        highlightPresets={tokenTimeHighlightPresets}
                      />
                    </div>
                  )}

                  {jobDetailTab === "summary" && job && (
                    <div className="space-y-4 pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
              <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {intl.get("scheduledTasks.taskDetail.basicTitle")}
                  </h2>
                </div>
                <dl className="px-4 py-2">
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.id")}</dt>
                    <dd className="min-w-0 flex-1 break-all font-mono text-xs text-gray-900 dark:text-gray-100">{job.id ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.name")}</dt>
                    <dd className="min-w-0 flex-1 break-words text-sm text-gray-900 dark:text-gray-100">{job.name ?? "—"}</dd>
                  </div>
                  {job.description != null && String(job.description).trim() !== "" ? (
                    <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                      <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">
                        {intl.get("scheduledTasks.taskDetail.f.description")}
                      </dt>
                      <dd className="min-w-0 flex-1 break-words text-sm text-gray-900 dark:text-gray-100">{String(job.description)}</dd>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.enabled")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.enabled === true ? intl.get("common.yes") : job.enabled === false ? intl.get("common.no") : "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.agentId")}</dt>
                    <dd className="font-mono text-xs text-gray-900 dark:text-gray-100">{job.agentId ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.sessionKey")}</dt>
                    <dd className="break-all font-mono text-xs text-gray-900 dark:text-gray-100">{job.sessionKey ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.sessionTarget")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.sessionTarget ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.wakeMode")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.wakeMode ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.deliveryMode")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.delivery?.mode ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.createdAtMs")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(job.createdAtMs)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.updatedAtMs")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(job.updatedAtMs)}</dd>
                  </div>
                </dl>
              </section>

              <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {intl.get("scheduledTasks.taskDetail.stateTitle")}
                  </h2>
                </div>
                <dl className="px-4 py-2">
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.nextRunAtMs")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(job.state?.nextRunAtMs)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.lastRunAtMs")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{formatEpochMs(job.state?.lastRunAtMs)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.lastRunStatus")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.state?.lastRunStatus ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.lastDurationMs")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{formatDuration(job.state?.lastDurationMs)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.lastDeliveryStatus")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.state?.lastDeliveryStatus ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 border-b border-gray-50 py-2 dark:border-gray-800/80 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.consecutiveErrors")}</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{job.state?.consecutiveErrors ?? "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start">
                    <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 sm:w-36">{intl.get("scheduledTasks.taskDetail.f.lastError")}</dt>
                    <dd className="min-w-0 flex-1 break-words text-sm text-gray-900 dark:text-gray-100">{job.state?.lastError ?? "—"}</dd>
                  </div>
                </dl>
              </section>
              </div>

              <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {intl.get("scheduledTasks.taskDetail.f.taskContent")}
                  </h2>
                </div>
                <div className="px-4 py-3">
                  {(() => {
                    const text = jobPayloadTaskContent(job);
                    return text !== "" ? (
                      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-gray-100 bg-gray-50/90 px-2.5 py-2 font-sans text-xs text-gray-900 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-100">
                        {text}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">—</p>
                    );
                  })()}
                </div>
              </section>
            </div>
          )}

          {jobDetailTab === "trace" && job && (
            <div className="pt-4">
              <section className="app-card border border-gray-100 dark:border-gray-800">
                {errorEvents && (
                  <p className="border-b border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                    {intl.get("common.loadFailed", { error: errorEvents })}
                  </p>
                )}
                <div className={`space-y-6 px-4 py-4 ${loadingEvents ? "opacity-60" : ""}`}>
                  <JobRunTraceStatusTrendChart
                    events={tokenTimeFilteredEvents}
                    loading={loadingEvents}
                    rangeStartLocal={tokenTimeRangeStartLocal}
                    rangeEndLocal={tokenTimeRangeEndLocal}
                  />
                  <div className="border-t border-gray-100 pt-5 dark:border-gray-800">
                    <JobRunTraceTimeline
                      events={tokenTimeFilteredEvents}
                      job={job}
                      loading={loadingEvents}
                      drillEvent={runLogDrillEvent}
                      onEventToggle={handleRunLogRowClick}
                      onAgentTrace={(agentId, sessionKey) => navigateRunLogAgentToDigitalEmployeePortrait(agentId, sessionKey)}
                      renderDrillPanel={(ev) => (
                        <RunLogDrillPanel
                          event={ev}
                          job={job}
                          onClose={() => setRunLogDrillEvent(null)}
                          onNavigateToTaskDetail={(jid) => {
                            const s = String(jid ?? "").trim();
                            if (s) setSelectedJobId(s);
                          }}
                        />
                      )}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {jobDetailTab === "execution" && (
            <div className="pt-4">
              <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
                {errorEvents && (
                  <p className="border-b border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                    {intl.get("common.loadFailed", { error: errorEvents })}
                  </p>
                )}
                <div className={`space-y-3 px-4 py-3 ${loadingEvents ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0 w-full flex-1 basis-52 sm:max-w-xl">
                      <label htmlFor="run-log-search" className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        {intl.get("scheduledTasks.taskDetail.runLog.searchLabel")}
                      </label>
                      <input
                        id="run-log-search"
                        type="search"
                        value={runLogSearch}
                        onChange={(e) => setRunLogSearch(e.target.value)}
                        placeholder={intl.get("scheduledTasks.taskDetail.runLog.searchPlaceholder")}
                        className="app-input h-8 w-full px-2.5 py-0 text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex w-full flex-wrap items-end justify-end gap-2 sm:w-auto sm:flex-none sm:justify-end">
                      <div className="min-w-[3.25rem]">
                        <label htmlFor="run-log-status" className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.runLog.filterStatus")}
                        </label>
                        <select
                          id="run-log-status"
                          value={runLogStatus}
                          onChange={(e) => setRunLogStatus(e.target.value)}
                          className="app-input h-8 min-w-[3.25rem] px-2 py-0 text-xs leading-8"
                        >
                          <option value="">{intl.get("scheduledTasks.taskDetail.runLog.filterAll")}</option>
                          {runLogStatusOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[7.5rem]">
                        <label htmlFor="run-log-model" className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.runLog.filterModel")}
                        </label>
                        <select
                          id="run-log-model"
                          value={runLogModel}
                          onChange={(e) => setRunLogModel(e.target.value)}
                          className="app-input h-8 min-w-[7.5rem] max-w-[11rem] px-2 py-0 text-xs leading-8"
                        >
                          <option value="">{intl.get("scheduledTasks.taskDetail.runLog.filterAll")}</option>
                          {runLogModelOptions.map((m) => (
                            <option key={m} value={m} title={m}>
                              {m.length > 28 ? `${m.slice(0, 26)}…` : m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[3.25rem]">
                        <label htmlFor="run-log-agent" className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.runLog.filterAgent")}
                        </label>
                        <select
                          id="run-log-agent"
                          value={runLogAgent}
                          onChange={(e) => setRunLogAgent(e.target.value)}
                          className="app-input h-8 min-w-[3.25rem] max-w-[5.5rem] px-2 py-0 text-xs leading-8"
                        >
                          <option value="">{intl.get("scheduledTasks.taskDetail.runLog.filterAll")}</option>
                          {runLogAgentOptions.hasUnset ? (
                            <option value="__UNSET__">{intl.get("scheduledTasks.taskDetail.listFilterAgentUnset")}</option>
                          ) : null}
                          {runLogAgentOptions.agentIds.map((id) => (
                            <option key={id} value={id} title={id}>
                              {id.length > 28 ? `${id.slice(0, 26)}…` : id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[3.25rem]">
                        <label htmlFor="run-log-delivery" className="mb-0.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.runLog.filterDelivery")}
                        </label>
                        <select
                          id="run-log-delivery"
                          value={runLogDelivery}
                          onChange={(e) => setRunLogDelivery(e.target.value)}
                          className="app-input h-8 min-w-[3.25rem] px-2 py-0 text-xs leading-8"
                        >
                          <option value="">{intl.get("scheduledTasks.taskDetail.runLog.filterAll")}</option>
                          {runLogDeliveryOptions.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <TablePagination
                    page={runLogPage}
                    pageSize={RUN_LOG_PAGE_SIZE}
                    total={runLogFiltered.length}
                    onPageChange={setRunLogPage}
                    loading={loadingEvents}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                          <th className="w-10 px-2 py-3 text-center font-semibold text-gray-700 dark:text-gray-300" scope="col">
                            <span className="sr-only">{intl.get("scheduledTasks.taskDetail.runLog.colExpand")}</span>
                          </th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colEventTs")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colRunAt")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colStatus")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colDuration")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colDelivery")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colModel")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.listTableColAgent")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colSessionId")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colNextRun")}</th>
                          <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.taskDetail.colError")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                              {loadingEvents ? intl.get("common.loadingList") : intl.get("common.noData")}
                            </td>
                          </tr>
                        ) : runLogFiltered.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                              {intl.get("scheduledTasks.taskDetail.runLog.noMatch")}
                            </td>
                          </tr>
                        ) : (
                          runLogPageRows.flatMap((ev, idx) => {
                            const agentDisp = runLogRowAgentDisplay(ev, job);
                            const rowKey = `${String(ev.ts ?? "")}-${String(ev.runAtMs ?? "")}-${idx}-${runLogPage}`;
                            const drillOpen = Boolean(runLogDrillEvent && sameRunLogEvent(runLogDrillEvent, ev));
                            const dataRow = (
                              <tr
                                key={rowKey}
                                role="presentation"
                                onClick={() => handleRunLogRowClick(ev)}
                                className={[
                                  "cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50/80 dark:border-gray-800/80 dark:hover:bg-gray-800/40",
                                  drillOpen ? "bg-primary/[0.08] ring-1 ring-inset ring-primary/15 dark:bg-primary/10" : "",
                                ].join(" ")}
                              >
                                <td className="px-2 py-2.5 align-middle text-center text-gray-500 dark:text-gray-400" aria-hidden>
                                  <span
                                    className={[
                                      "inline-flex transition-transform duration-150",
                                      drillOpen ? "rotate-0" : "-rotate-90",
                                    ].join(" ")}
                                  >
                                    <Icon name="chevron" className="h-4 w-4" />
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatEpochMs(ev.ts)}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatEpochMs(ev.runAtMs)}</td>
                                <td className="px-3 py-2.5">
                                  {ev.status != null && String(ev.status) ? (
                                    <span
                                      className={[
                                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                        statusClass(ev.status),
                                      ].join(" ")}
                                    >
                                      {String(ev.status)}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatDuration(ev.durationMs)}</td>
                                <td className="max-w-[100px] truncate px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300" title={ev.deliveryStatus != null ? String(ev.deliveryStatus) : ""}>
                                  {ev.deliveryStatus ?? "—"}
                                </td>
                                <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400" title={ev.model != null ? String(ev.model) : ""}>
                                  {ev.model ?? "—"}
                                </td>
                                <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300" title={agentDisp.titleTip || agentDisp.label || undefined}>
                                  {agentDisp.label !== "" ? (
                                    <button
                                      type="button"
                                      className="max-w-full truncate text-left text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary dark:text-primary dark:hover:text-primary"
                                      title={intl.get("scheduledTasks.taskDetail.runLog.agentOpenPortraitTitle")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigateRunLogAgentToDigitalEmployeePortrait(agentDisp.id, ev.sessionKey);
                                      }}
                                    >
                                      {truncateText(agentDisp.label, 32)}
                                    </button>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400" title={ev.sessionId != null ? String(ev.sessionId) : ""}>
                                  {ev.sessionId != null && String(ev.sessionId).trim() !== "" ? (
                                    <button
                                      type="button"
                                      className="max-w-full truncate text-left text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary dark:text-primary dark:hover:text-primary"
                                      title={intl.get("scheduledTasks.taskDetail.runLog.sessionIdOpenAuditTitle")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigateRunLogSessionToSessionAudit(ev.sessionId);
                                      }}
                                    >
                                      {String(ev.sessionId)}
                                    </button>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatEpochMs(ev.nextRunAtMs)}</td>
                                <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400" title={ev.error != null ? String(ev.error) : ""}>
                                  {ev.error != null ? truncateText(String(ev.error), 160) : "—"}
                                </td>
                              </tr>
                            );
                            if (!drillOpen) return [dataRow];
                            return [
                              dataRow,
                              <tr key={`${rowKey}-drill`} className="border-b border-gray-100 dark:border-gray-800">
                                <td colSpan={11} className="bg-gray-50/95 px-3 pb-3 pt-1.5 align-top dark:bg-gray-900/50">
                                  <RunLogDrillPanel
                                    event={runLogDrillEvent}
                                    job={job}
                                    onClose={() => setRunLogDrillEvent(null)}
                                    onNavigateToTaskDetail={(jid) => {
                                      const s = String(jid ?? "").trim();
                                      if (s) setSelectedJobId(s);
                                    }}
                                  />
                                </td>
                              </tr>,
                            ];
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          )}

          {jobDetailTab === "results" && job && (
            <div className={`space-y-4 pt-4 ${loadingEvents ? "opacity-60" : ""}`}>
              <JobRunResultsPanel events={tokenTimeFilteredEvents} loading={loadingEvents} error={errorEvents} />
              <JobPerformancePanel events={tokenTimeFilteredEvents} loading={loadingEvents} error={errorEvents} />
            </div>
          )}
                </div>
              </aside>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function ExecutionDetailPanel({ runOverviewJobFilter, onRunOverviewJobFilterConsumed, onOpenTaskDetailFromExecution }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(RUN_RECORDS_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [agentOptions, setAgentOptions] = useState([]);
  const [jobIdFilter, setJobIdFilter] = useState("");
  /** 点击行展开的运行详情（与任务详情运行日志下钻同面板） */
  const [executionDrillEvent, setExecutionDrillEvent] = useState(/** @type {object | null} */ (null));
  const execTimeFilter = useRunEventsTimeRangeFilter();

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [agentFilter, statusFilter, searchQ, pageSize, jobIdFilter, execTimeFilter.rangeStartLocal, execTimeFilter.rangeEndLocal]);

  useEffect(() => {
    setExecutionDrillEvent(null);
  }, [page, pageSize, agentFilter, statusFilter, searchQ, jobIdFilter, execTimeFilter.rangeStartLocal, execTimeFilter.rangeEndLocal]);

  useEffect(() => {
    if (runOverviewJobFilter == null || String(runOverviewJobFilter).trim() === "") return;
    setJobIdFilter(String(runOverviewJobFilter).trim());
    setPage(1);
    onRunOverviewJobFilterConsumed?.();
  }, [runOverviewJobFilter, onRunOverviewJobFilterConsumed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cron-jobs");
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !Array.isArray(data?.jobs)) return;
        const set = new Set();
        for (const j of data.jobs) {
          const a = j?.agentId != null && String(j.agentId).trim() ? String(j.agentId).trim() : "";
          if (a) set.add(a);
        }
        setAgentOptions([...set].sort((a, b) => a.localeCompare(b)));
      } catch {
        if (!cancelled) setAgentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (agentFilter) q.set("agentId", agentFilter);
      if (statusFilter) q.set("status", statusFilter);
      if (searchQ) q.set("q", searchQ);
      if (jobIdFilter) q.set("jobId", jobIdFilter);
      const startMs = parseDateTimeLocalInput(execTimeFilter.rangeStartLocal);
      const endMs = parseDateTimeLocalInput(execTimeFilter.rangeEndLocal);
      if (startMs != null) q.set("startIso", new Date(startMs).toISOString());
      if (endMs != null) q.set("endIso", new Date(endMs).toISOString());
      const res = await fetch(`/api/cron-runs?${q.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows([]);
        setTotal(0);
        setError(data?.error || res.statusText || "error");
        return;
      }
      setTotal(Number(data.total) || 0);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, agentFilter, statusFilter, searchQ, jobIdFilter, execTimeFilter.rangeStartLocal, execTimeFilter.rangeEndLocal]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExecutionRowClick = useCallback((r) => {
    const ev = executionRunRowToRunLogDrillEvent(r);
    setExecutionDrillEvent((cur) => (cur && sameRunLogEvent(cur, ev) ? null : ev));
  }, []);

  const executionRowOpenHint = intl.get("scheduledTasks.execution.rowOpenDetailHint");

  const openTaskDetailForJob = useCallback(
    (jobId) => {
      const id = jobId != null ? String(jobId).trim() : "";
      if (!id || typeof onOpenTaskDetailFromExecution !== "function") return;
      onOpenTaskDetailFromExecution(id);
    },
    [onOpenTaskDetailFromExecution],
  );

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-gray-200/90 bg-gradient-to-b from-slate-50/90 to-white shadow-sm ring-1 ring-black/[0.03] dark:border-gray-700 dark:from-gray-900/50 dark:to-gray-900/30 dark:ring-white/[0.04]">
        <TaskDetailRunEventsTimeRangeFilter
          activeDays={execTimeFilter.activeDays}
          activePresetHours={execTimeFilter.activePresetHours}
          onPreset={execTimeFilter.onPreset}
          rangeStartLocal={execTimeFilter.rangeStartLocal}
          rangeEndLocal={execTimeFilter.rangeEndLocal}
          onRangeLocalChange={execTimeFilter.onRangeLocalChange}
          highlightPresets={execTimeFilter.highlightPresets}
          className="border-0 bg-transparent shadow-none ring-0 dark:bg-transparent"
        />
      </section>

      <section className="sticky top-0 z-30 overflow-hidden rounded-xl border border-gray-200/90 bg-gradient-to-b from-slate-50/95 to-white shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:border-gray-700 dark:from-gray-900/95 dark:to-gray-900/80 dark:ring-white/[0.04]">
        <div className="space-y-4 px-4 py-4">
          {jobIdFilter ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-gray-800 dark:border-primary/30 dark:bg-primary/10 dark:text-gray-100">
              <span>
                {intl.get("scheduledTasks.execution.filterByJobBanner", { jobId: jobIdFilter })}
              </span>
              <button
                type="button"
                className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/60"
                onClick={() => setJobIdFilter("")}
              >
                {intl.get("scheduledTasks.execution.clearJobFilter")}
              </button>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
            <div className="min-w-0 flex-1">
              <label htmlFor="execution-run-search" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                {intl.get("scheduledTasks.execution.searchLabel")}
              </label>
              <input
                id="execution-run-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={intl.get("scheduledTasks.execution.searchPlaceholder")}
                className="app-input h-10 w-full min-w-0 px-3 py-0 text-sm"
                autoComplete="off"
              />
            </div>

            <div className="flex min-w-0 shrink-0 flex-wrap items-end justify-start gap-3 sm:justify-end lg:justify-end">
              <div className="min-w-[7.5rem] flex-1 sm:min-w-[9rem] sm:flex-none">
                <label
                  htmlFor="execution-run-agent-filter"
                  className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  {intl.get("scheduledTasks.execution.filterAgent")}
                </label>
                <select
                  id="execution-run-agent-filter"
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="app-input h-10 w-full min-w-0 px-3 py-0 text-sm"
                >
                  <option value="">{intl.get("scheduledTasks.execution.filterAgentAll")}</option>
                  {agentOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[7.5rem] flex-1 sm:min-w-[9rem] sm:flex-none">
                <label
                  htmlFor="execution-run-status-filter"
                  className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  {intl.get("scheduledTasks.execution.filterStatus")}
                </label>
                <select
                  id="execution-run-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="app-input h-10 w-full min-w-0 px-3 py-0 text-sm"
                >
                  <option value="">{intl.get("scheduledTasks.execution.filterStatusAll")}</option>
                  <option value="success">{intl.get("scheduledTasks.execution.filterStatusSuccess")}</option>
                  <option value="failure">{intl.get("scheduledTasks.execution.filterStatusFailure")}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden border border-gray-100 dark:border-gray-800">
        {error && (
          <p className="border-b border-rose-100 bg-rose-50/80 px-4 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {intl.get("common.loadFailed", { error })}
          </p>
        )}

        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            loading={loading}
            trailingControls={
              <button type="button" onClick={() => load()} className="app-btn-outline text-xs">
                {intl.get("scheduledTasks.execution.refresh")}
              </button>
            }
          />
        </div>

        {loading && rows.length === 0 ? (
          <LoadingSpinner message={intl.get("common.loadingList")} className="py-12" />
        ) : (
          <div className={`relative ${loading ? "opacity-60" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                    <th className="w-10 px-2 py-3 text-center font-semibold text-gray-700 dark:text-gray-300" scope="col">
                      <span className="sr-only">{intl.get("scheduledTasks.taskDetail.runLog.colExpand")}</span>
                    </th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colRunId")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colJobId")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colJobName")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colAgent")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colDeliveryStatus")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colStatus")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colStarted")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colFinished")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colDuration")}</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colTokenUsage")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colNextRun")}</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("scheduledTasks.execution.colError")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        {intl.get("common.noData")}
                      </td>
                    </tr>
                  ) : (
                    rows.flatMap((r) => {
                      const rowKey = `${String(r.runId)}-${String(r.jobId)}-${String(r.startedAt ?? "")}`;
                      const drillEv = executionRunRowToRunLogDrillEvent(r);
                      const drillOpen = Boolean(executionDrillEvent && sameRunLogEvent(executionDrillEvent, drillEv));
                      const rowTok = extractUsageTokens(drillEv);
                      const nextRunMs = parseNextRunAtMsFromExecutionRowRaw(r?.run_log_next_run_raw);
                      const agentIdStr = r.agentId != null && String(r.agentId).trim() ? String(r.agentId).trim() : "";
                      const dataRow = (
                        <tr
                          key={rowKey}
                          role="button"
                          tabIndex={0}
                          aria-expanded={drillOpen}
                          aria-label={`${r.jobName ? String(r.jobName) : String(r.jobId ?? "")}。${executionRowOpenHint}`}
                          onClick={() => handleExecutionRowClick(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleExecutionRowClick(r);
                            }
                          }}
                          className={[
                            "cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50/80 dark:border-gray-800/80 dark:hover:bg-gray-800/40",
                            drillOpen ? "bg-primary/[0.08] ring-1 ring-inset ring-primary/15 dark:bg-primary/10" : "",
                          ].join(" ")}
                        >
                          <td className="px-2 py-2.5 align-middle text-center text-gray-500 dark:text-gray-400" aria-hidden>
                            <span
                              className={[
                                "inline-flex transition-transform duration-150",
                                drillOpen ? "rotate-0" : "-rotate-90",
                              ].join(" ")}
                            >
                              <Icon name="chevron" className="h-4 w-4" />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200">{r.runId ?? "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200">{r.jobId ?? "—"}</td>
                          <td className="max-w-[200px] px-3 py-2.5 text-gray-800 dark:text-gray-200" title={r.jobName ? String(r.jobName) : ""}>
                            {r.jobName != null && String(r.jobName).trim() !== "" && r.jobId != null && String(r.jobId).trim() !== "" ? (
                              <button
                                type="button"
                                className="max-w-full truncate text-left text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary dark:text-primary"
                                title={intl.get("scheduledTasks.execution.jobNameOpenTaskDetailTitle")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTaskDetailForJob(r.jobId);
                                }}
                              >
                                {String(r.jobName)}
                              </button>
                            ) : (
                              (r.jobName ?? "—")
                            )}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300" title={agentIdStr || undefined}>
                            {agentIdStr ? (
                              <button
                                type="button"
                                className="max-w-full truncate text-left text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary dark:text-primary dark:hover:text-primary"
                                title={intl.get("scheduledTasks.taskDetail.runLog.agentOpenPortraitTitle")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateRunLogAgentToDigitalEmployeePortrait(agentIdStr, null);
                                }}
                              >
                                {truncateText(agentIdStr, 28)}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300" title={r.deliveryStatus ? String(r.deliveryStatus) : ""}>
                            {r.deliveryStatus ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.status != null && String(r.status) ? (
                              <span
                                className={[
                                  "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                  statusClass(r.status),
                                ].join(" ")}
                              >
                                {String(r.status)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatDateTime(r.startedAt)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatDateTime(r.finishedAt)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatDuration(r.durationMs)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">{formatTokenInt(rowTok.total)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300">{formatEpochMs(nextRunMs)}</td>
                          <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-600 dark:text-gray-400" title={r.errorMessage ? String(r.errorMessage) : ""}>
                            {r.errorMessage ? String(r.errorMessage) : "—"}
                          </td>
                        </tr>
                      );
                      if (!drillOpen) return [dataRow];
                      return [
                        dataRow,
                        <tr key={`${rowKey}-drill`} className="border-b border-gray-100 dark:border-gray-800">
                          <td colSpan={13} className="bg-gray-50/95 px-3 pb-3 pt-1.5 align-top dark:bg-gray-900/50">
                            <RunLogDrillPanel
                              event={executionDrillEvent}
                              job={null}
                              onClose={() => setExecutionDrillEvent(null)}
                              onNavigateToTaskDetail={onOpenTaskDetailFromExecution}
                            />
                          </td>
                        </tr>,
                      ];
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ScheduledTasks() {
  const [mainTab, setMainTab] = useState("runOverview");
  const [runOverviewTaskDetailJobId, setRunOverviewTaskDetailJobId] = useState(null);
  const [runOverviewExecutionJobId, setRunOverviewExecutionJobId] = useState(null);

  const openTaskDetailFromRunOverview = useCallback((jobId) => {
    const id = String(jobId ?? "").trim();
    if (!id) return;
    setRunOverviewTaskDetailJobId(id);
    setMainTab("taskDetail");
  }, []);

  const openExecutionForJobFromRunOverview = useCallback((jobId) => {
    const id = String(jobId ?? "").trim();
    if (!id) return;
    setRunOverviewExecutionJobId(id);
    setMainTab("executionDetail");
  }, []);

  const clearRunOverviewTaskPick = useCallback(() => setRunOverviewTaskDetailJobId(null), []);
  const clearRunOverviewExecFilter = useCallback(() => setRunOverviewExecutionJobId(null), []);

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex gap-1" aria-label={intl.get("page.scheduledTasks.title")}>
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMainTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                mainTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {mainTab === "runOverview" && (
        <ScheduledTasksRunOverview
          onNavigateToTab={setMainTab}
          onOpenTaskDetailFromOverview={openTaskDetailFromRunOverview}
          onOpenExecutionForJobFromOverview={openExecutionForJobFromRunOverview}
        />
      )}
      {mainTab === "taskDetail" && (
        <TaskDetailPanel runOverviewPickJobId={runOverviewTaskDetailJobId} onRunOverviewPickConsumed={clearRunOverviewTaskPick} />
      )}
      {mainTab === "executionDetail" && (
        <ExecutionDetailPanel
          runOverviewJobFilter={runOverviewExecutionJobId}
          onRunOverviewJobFilterConsumed={clearRunOverviewExecFilter}
          onOpenTaskDetailFromExecution={openTaskDetailFromRunOverview}
        />
      )}
    </div>
  );
}
