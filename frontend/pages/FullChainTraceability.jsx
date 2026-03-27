import { useCallback, useMemo, useState } from "react";
import CodeBlock from "../components/CodeBlock.jsx";
import { TRACE_SESSION_SAMPLES, findTraceSessionByQuery } from "../data/traceSessions.js";

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
    success: { label: "成功", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/15" },
    degraded: { label: "降级完成", cls: "bg-amber-50 text-amber-900 ring-amber-600/15" },
    error: { label: "失败", cls: "bg-rose-50 text-rose-800 ring-rose-600/15" },
  };
  const o = map[outcome] ?? { label: outcome, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${o.cls}`}>{o.label}</span>
  );
}

export default function FullChainTraceability() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const session = useMemo(() => (query ? findTraceSessionByQuery(query) : null), [query]);

  const runSearch = useCallback(() => {
    setQuery(input.trim());
    setExpandedId(null);
  }, [input]);

  const exampleIds = useMemo(() => TRACE_SESSION_SAMPLES.map((s) => s.sessionId), []);

  return (
    <div className="space-y-6">
      <section className="app-card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900">会话溯源</h2>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
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
              placeholder="例如 sess_a1b2c3d4e5f67890"
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90"
          >
            溯源查询
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">快速填入样例：</span>
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
          未找到与会话 ID 匹配的演示数据，请检查拼写或点击上方样例。
        </div>
      )}

      {session && (
        <>
          <section className="app-card p-4 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                  {outcomeBadge(session.outcome)}
                </div>
                <p className="font-mono text-xs text-gray-500 break-all">会话 ID：{session.sessionId}</p>
                <p className="text-sm text-gray-600">
                  数字员工：<span className="font-medium text-gray-800">{session.agentName}</span>
                  <span className="mx-2 text-gray-300">·</span>
                  渠道 {session.channel}
                  <span className="mx-2 text-gray-300">·</span>
                  租户 {session.tenant}
                </p>
              </div>
              <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-right">
                <div>
                  <dt className="text-xs text-gray-500">开始时间</dt>
                  <dd className="font-mono text-gray-900">{formatDateTime(session.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">结束时间</dt>
                  <dd className="font-mono text-gray-900">{formatDateTime(session.endedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">持续时长</dt>
                  <dd className="tabular-nums text-gray-900">{durationMs(session.startedAt, session.endedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Token（约）</dt>
                  <dd className="tabular-nums text-gray-900">{session.totalTokens.toLocaleString("zh-CN")}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-900">链路时间轴</h4>
              <p className="mt-1 text-xs text-gray-500">按时间顺序展示各组件调用；点击步骤可展开元数据与说明。</p>

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
                                {step.status === "ok" ? "成功" : step.status === "error" ? "失败" : step.status === "warn" ? "警告" : step.status}
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
                            <span className="text-gray-400">{open ? "收起" : "详情"}</span>
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
            <h4 className="text-sm font-semibold text-gray-900">参与者</h4>
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full border-collapse text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <th className="w-32 bg-gray-50/90 px-4 py-2.5 font-medium text-gray-600">用户 / 主体</th>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{session.user}</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50/90 px-4 py-2.5 font-medium text-gray-600">数字员工</th>
                    <td className="px-4 py-2.5 text-gray-900">{session.agentName}</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50/90 px-4 py-2.5 font-medium text-gray-600">涉及服务（去重）</th>
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
        <p className="text-center text-xs text-gray-400">演示数据 · 可对接 Trace ID、日志平台与审计流水</p>
      )}
      {session && (
        <p className="text-center text-xs text-gray-400">以上为静态样例；生产环境请对接实时检索与权限控制</p>
      )}
    </div>
  );
}
