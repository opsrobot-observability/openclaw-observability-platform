import { useMemo } from "react";
import intl from "react-intl-universal";
import { formatRunStatusLabel } from "../lib/formatRunStatusLabel.js";
import { parseRunEventAnchorMs } from "../lib/runEventsTimeRange.js";
import Icon from "./Icon.jsx";

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

function dotClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "success" || s === "succeeded" || s === "ok" || s === "completed") {
    return "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950/80";
  }
  if (s === "failed" || s === "error" || s === "failure") {
    return "bg-rose-500 ring-rose-100 dark:ring-rose-950/80";
  }
  if (s === "running" || s === "pending" || s === "started") {
    return "bg-amber-500 ring-amber-100 dark:ring-amber-950/80";
  }
  return "bg-gray-400 ring-gray-100 dark:ring-gray-800";
}

/**
 * 运行日志行展示的 Agent：优先事件 `agentId`；否则当前任务 `job.agentId`；再解析 `sessionKey`。
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

function navigateSessionToAudit(sessionId) {
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
 * @param {{
 *   events: object[],
 *   job: object | null,
 *   loading: boolean,
 *   drillEvent: object | null,
 *   onEventToggle: (ev: object) => void,
 *   renderDrillPanel?: (ev: object) => import('react').ReactNode,
 *   onAgentTrace?: (agentId: string, sessionKey?: string | null) => void,
 * }} props
 */
export default function JobRunTraceTimeline({ events, job, loading, drillEvent, onEventToggle, renderDrillPanel, onAgentTrace }) {
  const sorted = useMemo(() => {
    const list = Array.isArray(events) ? [...events] : [];
    list.sort((a, b) => {
      const ba = parseRunEventAnchorMs(b);
      const aa = parseRunEventAnchorMs(a);
      const bn = Number.isFinite(ba) ? ba : Number.NEGATIVE_INFINITY;
      const an = Number.isFinite(aa) ? aa : Number.NEGATIVE_INFINITY;
      return bn - an;
    });
    return list;
  }, [events]);

  if (loading && sorted.length === 0) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.runHistory.loading")}</p>;
  }

  if (!sorted.length) {
    return (
      <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        {intl.get("scheduledTasks.taskDetail.trace.empty")}
      </p>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute bottom-3 left-[13px] top-3 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />

      <ul className="relative space-y-0">
        {sorted.map((ev, idx) => {
          const runAtAnchor = parseRunEventAnchorMs({ runAtMs: ev?.runAtMs, ts: undefined });
          const tsAnchor = parseRunEventAnchorMs({ runAtMs: undefined, ts: ev?.ts });
          const primaryMs = Number.isFinite(runAtAnchor) ? runAtAnchor : tsAnchor;
          const drillOpen = Boolean(drillEvent && sameRunLogEvent(drillEvent, ev));
          const agentDisp = runLogRowAgentDisplay(ev, job);
          const rowKey = `trace-${String(ev.ts ?? "")}-${String(ev.runAtMs ?? "")}-${idx}`;
          const runIdStr = ev?.runId != null && String(ev.runId).trim() !== "" ? String(ev.runId).trim() : "";
          const actionStr = ev?.action != null && String(ev.action).trim() !== "" ? String(ev.action).trim() : "";
          const sessionIdStr = ev?.sessionId != null && String(ev.sessionId).trim() !== "" ? String(ev.sessionId).trim() : "";
          const summaryStr = ev?.summary != null && String(ev.summary).trim() !== "" ? String(ev.summary).trim() : "";
          const showBothTimes =
            Number.isFinite(runAtAnchor) &&
            Number.isFinite(tsAnchor) &&
            Math.abs(runAtAnchor - tsAnchor) > 999;

          return (
            <li key={rowKey} className="relative flex gap-4 pb-8 last:pb-1">
              <div className="relative z-[1] flex shrink-0 flex-col items-center pt-1">
                <span
                  className={[
                    "inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white dark:ring-gray-950",
                    dotClass(ev?.status),
                  ].join(" ")}
                  aria-hidden
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={drillOpen}
                className={[
                  "min-w-0 flex-1 cursor-pointer rounded-xl border text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "border-gray-100 bg-white hover:border-primary/25 hover:bg-primary/[0.03] dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-primary/30 dark:hover:bg-primary/[0.06]",
                  drillOpen ? "border-primary/35 bg-primary/[0.06] ring-1 ring-primary/15 dark:bg-primary/10" : "",
                ].join(" ")}
                onClick={() => onEventToggle(ev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEventToggle(ev);
                  }
                }}
              >
                <div className="border-b border-gray-50 px-3 py-2.5 dark:border-gray-800/80">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.colRunAt")}
                        </span>
                        <time
                          className="font-semibold text-gray-900 dark:text-gray-100"
                          dateTime={Number.isFinite(primaryMs) ? new Date(primaryMs).toISOString() : undefined}
                        >
                          {formatEpochMs(Number.isFinite(primaryMs) ? primaryMs : null)}
                        </time>
                        {ev.status != null && String(ev.status) ? (
                          <span
                            className={[
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              statusClass(ev.status),
                            ].join(" ")}
                          >
                            {formatRunStatusLabel(ev.status) || String(ev.status)}
                          </span>
                        ) : null}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.colDuration")}: {formatDurationMs(ev.durationMs)}
                        </span>
                      </div>
                      {showBothTimes ? (
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>{intl.get("scheduledTasks.taskDetail.colEventTs")}:</span>
                          <time dateTime={new Date(tsAnchor).toISOString()}>{formatEpochMs(tsAnchor)}</time>
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={[
                        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary",
                        "bg-primary/5 ring-1 ring-primary/15 dark:bg-primary/10",
                      ].join(" ")}
                    >
                      {intl.get("scheduledTasks.taskDetail.trace.viewDetail")}
                      <span className={["inline-flex transition-transform", drillOpen ? "rotate-0" : "-rotate-90"].join(" ")}>
                        <Icon name="chevron" className="h-4 w-4" />
                      </span>
                    </span>
                  </div>
                </div>

                <div className="space-y-2 px-3 py-2.5">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                    {ev.deliveryStatus != null && String(ev.deliveryStatus) ? (
                      <div className="flex min-w-0 gap-2 sm:col-span-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.colDelivery")}</dt>
                        <dd className="min-w-0 break-words text-gray-800 dark:text-gray-200">{String(ev.deliveryStatus)}</dd>
                      </div>
                    ) : null}
                    {runIdStr ? (
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.execution.colRunId")}</dt>
                        <dd className="min-w-0 font-mono text-gray-800 dark:text-gray-200">{runIdStr}</dd>
                      </div>
                    ) : null}
                    {actionStr ? (
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.runLog.drillAction")}</dt>
                        <dd className="min-w-0 break-words text-gray-800 dark:text-gray-200">{actionStr}</dd>
                      </div>
                    ) : null}
                    {ev.model != null && String(ev.model) ? (
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.colModel")}</dt>
                        <dd className="min-w-0 truncate font-mono text-gray-800 dark:text-gray-200" title={String(ev.model)}>
                          {String(ev.model)}
                        </dd>
                      </div>
                    ) : null}
                    {ev.provider != null && String(ev.provider) ? (
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.colProvider")}</dt>
                        <dd className="min-w-0 truncate text-gray-800 dark:text-gray-200" title={String(ev.provider)}>
                          {String(ev.provider)}
                        </dd>
                      </div>
                    ) : null}
                    {agentDisp.label ? (
                      <div className="flex min-w-0 gap-2 sm:col-span-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.listTableColAgent")}</dt>
                        <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words text-gray-800 dark:text-gray-200" title={agentDisp.titleTip || undefined}>
                            {agentDisp.label}
                          </span>
                          {typeof onAgentTrace === "function" && agentDisp.id ? (
                            <button
                              type="button"
                              className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/10"
                              title={intl.get("scheduledTasks.taskDetail.trace.agentTraceTitle")}
                              onClick={(e) => {
                                e.stopPropagation();
                                onAgentTrace(agentDisp.id, ev.sessionKey ?? null);
                              }}
                            >
                              {intl.get("scheduledTasks.taskDetail.trace.agentTrace")}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {sessionIdStr ? (
                      <div className="flex min-w-0 items-start gap-2 sm:col-span-2">
                        <dt className="shrink-0 pt-0.5 text-gray-500 dark:text-gray-400">
                          {intl.get("scheduledTasks.taskDetail.colSessionId")}
                        </dt>
                        <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <span className="break-all font-mono text-gray-800 dark:text-gray-200">{truncateText(sessionIdStr, 80)}</span>
                          <button
                            type="button"
                            className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateSessionToAudit(sessionIdStr);
                            }}
                          >
                            {intl.get("scheduledTasks.taskDetail.runLog.sessionIdOpenAudit")}
                          </button>
                        </dd>
                      </div>
                    ) : null}
                    {ev.nextRunAtMs != null && Number.isFinite(Number(ev.nextRunAtMs)) ? (
                      <div className="flex min-w-0 gap-2 sm:col-span-2">
                        <dt className="shrink-0 text-gray-500 dark:text-gray-400">{intl.get("scheduledTasks.taskDetail.colNextRun")}</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{formatEpochMs(Number(ev.nextRunAtMs))}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {summaryStr ? (
                    <div className="rounded-md border border-gray-100 bg-gray-50/80 px-2.5 py-2 dark:border-gray-800 dark:bg-gray-950/40">
                      <p className="mb-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        {intl.get("scheduledTasks.taskDetail.runLog.drillSummary")}
                      </p>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-gray-700 dark:text-gray-300">{summaryStr}</p>
                    </div>
                  ) : null}

                  {ev.error != null && String(ev.error).trim() !== "" ? (
                    <p className="line-clamp-3 text-xs text-rose-700 dark:text-rose-300" title={String(ev.error)}>
                      <span className="font-medium">{intl.get("scheduledTasks.taskDetail.colError")}: </span>
                      {truncateText(String(ev.error), 320)}
                    </p>
                  ) : null}

                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{intl.get("scheduledTasks.taskDetail.trace.clickHint")}</p>
                </div>
              </div>

              {drillOpen && typeof renderDrillPanel === "function" ? (
                <div className="min-w-0 w-full">{renderDrillPanel(ev)}</div>
              ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
