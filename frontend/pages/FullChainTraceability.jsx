import { useCallback, useEffect, useMemo, useState } from "react";
import CodeBlock from "../components/CodeBlock.jsx";
import CostTimeRangeFilter, { defaultRangeLastDays } from "../components/CostTimeRangeFilter.jsx";
import { TRACE_SESSION_SAMPLES, findTraceSessionByQuery } from "../data/traceSessions.js";
import intl from "react-intl-universal";

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function durationMs(startIso, endIso) {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "—";
  const ms = b - a;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function statusBadgeClass(status) {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-800 ring-emerald-600/15";
    case "error":
      return "bg-rose-50 text-rose-800 ring-rose-600/15";
    case "warn":
      return "bg-amber-50 text-amber-900 ring-amber-600/15";
    default:
      return "bg-gray-100 text-gray-700 ring-gray-500/10";
  }
}

function outcomeBadge(outcome) {
  const map = {
    success: { label: intl.get("fullChain.success"), cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/15" },
    degraded: { label: intl.get("fullChain.degraded"), cls: "bg-amber-50 text-amber-900 ring-amber-600/15" },
    error: { label: intl.get("fullChain.failed"), cls: "bg-rose-50 text-rose-800 ring-rose-600/15" },
  };
  const o = map[outcome] ?? { label: outcome, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${o.cls}`}>{o.label}</span>
  );
}

export default function FullChainTraceability({ setHeaderExtra }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [activeDays, setActiveDays] = useState(7);
  const [range, setRange] = useState(() => defaultRangeLastDays(7));
  const { start: rangeStart, end: rangeEnd } = range;

  const session = useMemo(() => (query ? findTraceSessionByQuery(query) : null), [query]);

  const runSearch = useCallback(() => {
    setQuery(input.trim());
    setExpandedId(null);
  }, [input]);

  const handleBack = useCallback(() => {
    setQuery("");
    setInput("");
    setExpandedId(null);
  }, []);

  useEffect(() => {
    if (session) {
      setHeaderExtra(
        <div className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md px-1.5 py-1 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {intl.get("fullChain.backToList")}
          </button>
          <span className="text-gray-400">/</span>
          <span className="font-mono text-[13px] font-semibold text-violet-700 dark:text-violet-300">
            {session.session_id}
          </span>
          <span className="ml-1 text-xs text-gray-400 font-medium font-sans">{intl.get("fullChain.detailView")}</span>
        </div>
      );
    } else {
      setHeaderExtra(null);
    }
  }, [session, setHeaderExtra, handleBack]);

  const exampleIds = useMemo(() => TRACE_SESSION_SAMPLES.map((s) => s.session_id), []);

  return (
    <div className="space-y-6">
      <CostTimeRangeFilter
        activeDays={activeDays}
        onPreset={(days) => {
          setActiveDays(days);
          setRange(defaultRangeLastDays(days));
        }}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onRangeChange={(start, end) => {
          setActiveDays(null);
          setRange({ start, end });
        }}
      />

      <section className="app-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3 mb-6 dark:text-gray-100 dark:border-gray-800">{intl.get("fullChain.sessionList")}</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder={intl.get("fullChain.searchPlaceholder")}
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90"
          >
            {intl.get("fullChain.traceQuery")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">{intl.get("fullChain.quickFill")}</span>
          {exampleIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setInput(id);
                setQuery(id);
                setExpandedId(null);
              }}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[11px] text-gray-700 transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
            >
              {id.slice(0, 14)}…
            </button>
          ))}
        </div>
      </section>

      {query && !session && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-6 text-center text-sm text-amber-900">
          {intl.get("fullChain.noMatch")}
        </div>
      )}

      {session && (
        <>
          <section className="app-card p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3 mb-6 dark:text-gray-100 dark:border-gray-800">{intl.get("fullChain.indexMeta")}</h2>
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                  {outcomeBadge(session.outcome)}
                </div>
                <p className="font-mono text-xs text-gray-500 break-all">{intl.get("fullChain.sessionIdLabel", { id: session.session_id })}</p>
                <p className="text-sm text-gray-600">
                  {intl.get("fullChain.digitalEmployee")}
                  <span className="font-medium text-gray-800">{session.agentName}</span>
                  <span className="mx-2 text-gray-300">·</span>
                  {intl.get("fullChain.channel")} {session.channel}
                  <span className="mx-2 text-gray-300">·</span>
                  {intl.get("fullChain.tenant")} {session.tenant}
                </p>
              </div>
              <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-right">
                <div>
                  <dt className="text-xs text-gray-500">{intl.get("fullChain.startTime")}</dt>
                  <dd className="font-mono text-gray-900">{formatDateTime(session.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">{intl.get("fullChain.endTime")}</dt>
                  <dd className="font-mono text-gray-900">{formatDateTime(session.endedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">{intl.get("fullChain.duration")}</dt>
                  <dd className="tabular-nums text-gray-900">{durationMs(session.startedAt, session.endedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">{intl.get("fullChain.tokenApprox")}</dt>
                  <dd className="tabular-nums text-gray-900">{session.totalTokens.toLocaleString("zh-CN")}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-900">{intl.get("fullChain.timeline")}</h4>
              <p className="mt-1 text-xs text-gray-500">{intl.get("fullChain.timelineDesc")}</p>

              <ol className="relative mt-6 space-y-0 border-l-2 border-gray-200 pl-6">
                {session.steps.map((step, idx) => {
                  const open = expandedId === step.id;
                  return (
                    <li key={step.id} className="relative pb-8 last:pb-0">
                      <span className="absolute -left-[1.4rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-primary text-[10px] font-bold text-white shadow-sm">
                        {idx + 1}
                      </span>
                      <div className="rounded-lg border border-gray-100 bg-gray-50/50 transition hover:border-primary/25">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : step.id)}
                          className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium uppercase tracking-wide text-primary">{step.phase}</span>
                              <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(step.status)}`}>
                                {step.status === "ok" ? intl.get("fullChain.success") : step.status === "error" ? intl.get("fullChain.failed") : step.status === "warn" ? intl.get("fullChain.warning") : step.status}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">{step.action}</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {step.component} · <span className="font-mono text-gray-600">{step.service}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-4 font-mono text-xs text-gray-600">
                            <span>{formatDateTime(step.ts)}</span>
                            <span className="tabular-nums">+{step.latencyMs} ms</span>
                            <span className="text-gray-400">{open ? intl.get("common.collapse") : intl.get("fullChain.detail")}</span>
                          </div>
                        </button>
                        {open && (
                          <div className="border-t border-gray-100 bg-white px-4 py-3 text-sm">
                            <p className="leading-relaxed text-gray-700">{step.detail}</p>
                            {step.meta && (
                              <CodeBlock text={JSON.stringify(step.meta, null, 2)} variant="dark" height="sm" className="mt-3">
                                {JSON.stringify(step.meta, null, 2)}
                              </CodeBlock>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <section className="app-card p-4 sm:p-6">
            <h4 className="text-sm font-semibold text-gray-900">{intl.get("fullChain.participants")}</h4>
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full border-collapse text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <th className="w-32 bg-gray-50/90 px-4 py-2.5 font-medium text-gray-600">{intl.get("fullChain.userSubject")}</th>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{session.user}</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50/90 px-4 py-2.5 font-medium text-gray-600">{intl.get("fullChain.digitalEmployeeLabel")}</th>
                    <td className="px-4 py-2.5 text-gray-900">{session.agentName}</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50/90 px-4 py-2.5 font-medium text-gray-600">{intl.get("fullChain.involvedServices")}</th>
                    <td className="px-4 py-2.5 text-xs text-gray-700">
                      {[...new Set(session.steps.map((s) => s.service))].join(" → ")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!query && (
        <p className="text-center text-xs text-gray-400">{intl.get("fullChain.demoHint")}</p>
      )}
      {session && (
        <p className="text-center text-xs text-gray-400">{intl.get("fullChain.productionHint")}</p>
      )}
    </div>
  );
}
