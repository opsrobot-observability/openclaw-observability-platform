import { useCallback, useEffect, useMemo, useState } from "react";
import CodeBlock from "../components/CodeBlock.jsx";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import TablePagination from "../components/TablePagination.jsx";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDatetimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseLocal(s) {
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.getTime();
}

function formatLogTime(ts) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function parseTimestampMs(s) {
  if (s == null || s === "") return 0;
  const t = new Date(String(s)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatTrendBucket(bucket) {
  const b = String(bucket ?? "");
  if (b.length < 13) return b || "—";
  const mo = b.slice(5, 7);
  const dd = b.slice(8, 10);
  const hh = b.slice(11, 13);
  return `${mo}/${dd} ${hh}时`;
}

function buildMessageLine(r) {
  const parts = [r.type, r.message_role, r.message_tool_name, r.message_model || r.model_id].filter(Boolean);
  return parts.length ? parts.join(" · ") : "(无摘要)";
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj);
  }
}

function levelBadge(level) {
  const map = {
    DEBUG: "bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-200",
    INFO: "bg-primary-soft text-primary ring-primary/20 dark:bg-primary/20",
    WARN: "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-200",
    ERROR: "bg-rose-50 text-rose-800 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-200",
  };
  return map[level] || map.INFO;
}

const ALL = "全部";
const PAGE_SIZE = 100;

function SearchIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

export default function LogSearch() {
  const end0 = new Date();
  const start0 = new Date(end0.getTime() - 24 * 3600000);
  const [rangeStart, setRangeStart] = useState(() => toDatetimeLocalValue(start0));
  const [rangeEnd, setRangeEnd] = useState(() => toDatetimeLocalValue(end0));
  const [keyword, setKeyword] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState(ALL);
  const [provider, setProvider] = useState(ALL);
  const [model, setModel] = useState(ALL);
  const [channel, setChannel] = useState(ALL);
  const [agentName, setAgentName] = useState(ALL);
  const [errorFilter, setErrorFilter] = useState(ALL);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [trend, setTrend] = useState([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState({
    types: [],
    providers: [],
    channels: [],
    agents: [],
    models: [],
  });
  const [legend, setLegend] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  /** Doris `otel` 下日志物理表：主表 `agent_sessions_logs` 或日表 `agent_sessions_logs_yyyymmdd` 等 */
  const [logTable, setLogTable] = useState("agent_sessions_logs");
  const [logTables, setLogTables] = useState(["agent_sessions_logs"]);
  const [otelDatabase, setOtelDatabase] = useState("otel");
  const [tablesLoading, setTablesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTablesLoading(true);
      try {
        const r = await fetch("/api/agent-sessions-logs-tables");
        const text = await r.text();
        if (!r.ok) throw new Error(text);
        const j = JSON.parse(text);
        if (cancelled) return;
        const tables = Array.isArray(j.tables) && j.tables.length ? j.tables : ["agent_sessions_logs"];
        const db = typeof j.database === "string" ? j.database : "otel";
        setLogTables(tables);
        setOtelDatabase(db);
        setLogTable((prev) => (tables.includes(prev) ? prev : tables[0]));
      } catch {
        if (!cancelled) {
          setLogTables(["agent_sessions_logs"]);
          setOtelDatabase("otel");
        }
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(keyword.trim()), 350);
    return () => clearTimeout(t);
  }, [keyword]);

  const timeBounds = useMemo(() => {
    const a = parseLocal(rangeStart);
    const b = parseLocal(rangeEnd);
    if (a == null || b == null || a >= b) return null;
    return { startMs: a, endMs: b };
  }, [rangeStart, rangeEnd]);

  const fetchLogs = useCallback(async () => {
    if (!timeBounds) {
      setRows([]);
      setTrend([]);
      setTotal(0);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const qs = new URLSearchParams({
        startIso: new Date(timeBounds.startMs).toISOString(),
        endIso: new Date(timeBounds.endMs).toISOString(),
        logTable,
        q: debouncedQ,
        type: type !== ALL ? type : "",
        provider: provider !== ALL ? provider : "",
        model: model !== ALL ? model : "",
        channel: channel !== ALL ? channel : "",
        agentName: agentName !== ALL ? agentName : "",
        error:
          errorFilter === "仅错误" ? "yes" : errorFilter === "仅非错误" ? "no" : "all",
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const r = await fetch(`/api/agent-sessions-logs-search?${qs}`);
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
      const data = JSON.parse(text);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTrend(Array.isArray(data.trend) ? data.trend : []);
      setTotal(Number(data.total) || 0);
      setLegend(typeof data.legend === "string" ? data.legend : "");
      if (data.meta && typeof data.meta === "object") {
        setMeta({
          types: Array.isArray(data.meta.types) ? data.meta.types : [],
          providers: Array.isArray(data.meta.providers) ? data.meta.providers : [],
          channels: Array.isArray(data.meta.channels) ? data.meta.channels : [],
          agents: Array.isArray(data.meta.agents) ? data.meta.agents : [],
          models: Array.isArray(data.meta.models) ? data.meta.models : [],
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTrend([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    timeBounds,
    debouncedQ,
    type,
    provider,
    model,
    channel,
    agentName,
    errorFilter,
    page,
    logTable,
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const bumpPageReset = useCallback(() => {
    setPage(1);
  }, []);

  const chartData = useMemo(() => {
    return trend.map((t) => ({
      name: formatTrendBucket(t.bucket),
      count: t.count,
    }));
  }, [trend]);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  function applyPreset(hours) {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600000);
    setRangeStart(toDatetimeLocalValue(start));
    setRangeEnd(toDatetimeLocalValue(end));
    setPage(1);
  }

  const selectCls =
    "min-w-[140px] rounded-lg border border-gray-200 bg-white py-2.5 px-3 text-sm text-gray-900 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

  const totalPages = total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);
  const safePage = total === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  const metaOpts = useMemo(
    () => ({
      types: [ALL, ...meta.types],
      providers: [ALL, ...meta.providers],
      models: [ALL, ...meta.models],
      channels: [ALL, ...meta.channels],
      agents: [ALL, ...meta.agents],
      errors: [ALL, "仅错误", "仅非错误"],
    }),
    [meta]
  );

  return (
    <div className="space-y-6">
      {legend ? (
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{legend}</p>
      ) : null}

      {err ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {err}
        </div>
      ) : null}

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">日志检索</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "最近 15 分钟", h: 0.25 },
              { label: "最近 1 小时", h: 1 },
              { label: "最近 24 小时", h: 24 },
              { label: "最近 7 天", h: 24 * 7 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.h)}
                className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-200 transition hover:bg-primary-soft hover:text-primary hover:ring-primary/25 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">日志库（otel 下表名，对应日表或主表）</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <select
                value={logTable}
                disabled={tablesLoading}
                onChange={(e) => {
                  setLogTable(e.target.value);
                  bumpPageReset();
                }}
                className="min-w-[min(100%,22rem)] rounded-lg border border-gray-200 bg-white py-2.5 px-3 font-mono text-sm text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {logTables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                    {t === "agent_sessions_logs" ? "（主表）" : "（日表）"}
                  </option>
                ))}
              </select>
              {tablesLoading ? (
                <span className="text-xs text-gray-400">加载表列表…</span>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  当前：<span className="font-mono text-gray-700 dark:text-gray-300">{otelDatabase}</span>.
                  <span className="font-mono text-primary">{logTable}</span>
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                开始
                <input
                  type="datetime-local"
                  value={rangeStart}
                  onChange={(e) => {
                    setRangeStart(e.target.value);
                    bumpPageReset();
                  }}
                  className="rounded-lg border border-gray-200 bg-white py-2.5 px-3 text-sm text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                结束
                <input
                  type="datetime-local"
                  value={rangeEnd}
                  onChange={(e) => {
                    setRangeEnd(e.target.value);
                    bumpPageReset();
                  }}
                  className="rounded-lg border border-gray-200 bg-white py-2.5 px-3 text-sm text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
            </div>
            {!timeBounds && (
              <p className="text-xs text-rose-600 dark:text-rose-400">请选择有效的时间区间（结束时间需晚于开始时间）</p>
            )}
          </div>

          <div className="lg:col-span-8">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">全文 / 关键字</p>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                placeholder="搜索 type、provider、模型、role、tool、sessionId、id、parent_id、agent_name…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">多维度过滤（当前时间范围内可选值）</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              消息类型
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  bumpPageReset();
                }}
                className={selectCls}
              >
                {metaOpts.types.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              提供商
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  bumpPageReset();
                }}
                className={selectCls}
              >
                {metaOpts.providers.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              模型
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  bumpPageReset();
                }}
                className={selectCls}
              >
                {metaOpts.models.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              通道
              <select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  bumpPageReset();
                }}
                className={selectCls}
              >
                {metaOpts.channels.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              Agent
              <select
                value={agentName}
                onChange={(e) => {
                  setAgentName(e.target.value);
                  bumpPageReset();
                }}
                className={selectCls}
              >
                {metaOpts.agents.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              是否存在错误
              <select
                value={errorFilter}
                onChange={(e) => {
                  setErrorFilter(e.target.value);
                  bumpPageReset();
                }}
                className={selectCls}
              >
                {metaOpts.errors.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">日志趋势</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">当前筛选下按小时桶（timestamp 前 13 位）聚合条数</p>
        </div>
        <div className="mt-4 h-[260px] w-full">
          {chartData.length === 0 || !timeBounds ? (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
              {loading ? "加载中…" : "暂无数据或时间范围无效"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="logFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#165DFF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#165DFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} width={40} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#374151" }}
                  formatter={(v) => [`${v} 条`, "日志量"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#165DFF"
                  strokeWidth={2}
                  fill="url(#logFill)"
                  name="日志量"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">日志列表</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">点击行查看完整字段与 log_attributes</p>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            共 {total} 条
            {loading ? " · 加载中…" : ""}
          </span>
        </div>

        {timeBounds && total > 0 && !loading ? (
          <TablePagination className="mt-4" page={safePage} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        ) : null}

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-900/50">
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">时间</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">日志级别</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">提供商</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Agent</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">通道</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">ID</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Parent ID</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">摘要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-950">
                {!timeBounds ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                      请先选择有效的时间范围
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                      加载中…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                      没有符合条件的日志，请调整时间、关键字或筛选条件
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => {
                    const ts = parseTimestampMs(row.timestamp);
                    const isErr = Number(row.message_is_error) === 1;
                    const lvl = isErr ? "ERROR" : "INFO";
                    const rid = row.id != null && String(row.id).trim() ? String(row.id) : `row-${String(row.sessionId)}-${i}`;
                    return (
                      <tr
                        key={rid}
                        onClick={() => setDetail(row)}
                        className={[
                          "cursor-pointer transition-colors duration-200 hover:bg-primary-soft/50 dark:hover:bg-primary/15",
                          i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-900/30" : "bg-white dark:bg-gray-950",
                        ].join(" ")}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                          {ts ? formatLogTime(ts) : String(row.timestamp ?? "—")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={[
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              levelBadge(lvl),
                            ].join(" ")}
                          >
                            {lvl}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-800 dark:text-gray-200">{row.provider ?? "—"}</td>
                        <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{row.agent_name ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{row.channel ?? "—"}</td>
                        <td className="max-w-[100px] truncate px-4 py-3 font-mono text-xs text-primary">{row.id ?? "—"}</td>
                        <td className="max-w-[100px] truncate px-4 py-3 font-mono text-xs text-primary">{row.parent_id ?? "—"}</td>
                        <td className="max-w-md px-4 py-3 text-gray-800 dark:text-gray-200">
                          <span className="line-clamp-2">{buildMessageLine(row)}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          每页最多 {PAGE_SIZE} 条；数据来自 Doris{" "}
          <span className="font-mono">{otelDatabase}.{logTable}</span>
        </p>
      </section>

      {detail && (
        <>
          <button
            type="button"
            aria-label="关闭详情"
            className="fixed inset-0 z-40 bg-gray-900/40 transition-opacity duration-200"
            onClick={() => setDetail(null)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-200 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">日志详情</p>
                <p className="mt-1 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {detail.id != null && String(detail.id).trim() ? String(detail.id) : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="关闭"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">时间</dt>
                  <dd className="mt-1 break-all font-mono text-gray-900 dark:text-gray-100">{String(detail.timestamp ?? "—")}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">sessionId</dt>
                  <dd className="mt-1 break-all font-mono text-gray-900 dark:text-gray-100">{String(detail.sessionId ?? "—")}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">消息类型</dt>
                  <dd className="mt-1 font-mono text-gray-900 dark:text-gray-100">
                    {detail.type ?? "—"} {detail.version ? `· ${detail.version}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">提供商 / 模型</dt>
                  <dd className="mt-1 font-mono text-gray-900 dark:text-gray-100">
                    {detail.provider ?? "—"} · {detail.model_id ?? detail.message_model ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">消息角色 / 工具</dt>
                  <dd className="mt-1 text-gray-900 dark:text-gray-100">
                    {detail.message_role ?? "—"} · {detail.message_tool_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">是否存在错误</dt>
                  <dd className="mt-1 font-mono text-gray-900 dark:text-gray-100">{String(detail.message_is_error ?? "—")}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">parent_id</dt>
                  <dd className="mt-1 break-all font-mono text-primary">{String(detail.parent_id ?? "—")}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Agent名称</dt>
                  <dd className="mt-1 text-gray-900 dark:text-gray-100">
                    {detail.agent_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">通道</dt>
                  <dd className="mt-1 text-gray-900 dark:text-gray-100">
                    {detail.channel ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">摘要</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-gray-800 dark:text-gray-200">{buildMessageLine(detail)}</dd>
                </div>
                <div>
                  <dt className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">原始数据</dt>
                  <CodeBlock text={safeJson(detail.log_attributes)} variant="dark" height="2xl">
                    {safeJson(detail.log_attributes)}
                  </CodeBlock>
                </div>
              </dl>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
