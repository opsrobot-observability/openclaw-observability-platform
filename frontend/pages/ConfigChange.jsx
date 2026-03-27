import { Fragment, useEffect, useMemo, useState } from "react";
import CodeBlock from "../components/CodeBlock.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../components/TablePagination.jsx";
import {
  stableRowId,
  riskLevel,
  isGatewayModeChanged,
  byteDelta,
  shortHash,
  hashChanged,
  trendBuckets7d,
  trendBuckets24h,
  trendBuckets30d,
  trendBucketsRange,
  parseTsMs,
} from "../lib/configAudit.js";

function formatUtc(ts) {
  try {
    return new Date(ts).toLocaleString("zh-CN", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function rowBgClass(level, selected) {
  if (selected)
    return "bg-primary/5 ring-1 ring-inset ring-primary/25 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/15";
  if (level === "red")
    return "bg-red-50/90 hover:bg-red-50 dark:bg-red-950/30 dark:hover:bg-red-950/50";
  if (level === "yellow")
    return "hover:bg-amber-50/90 dark:bg-amber-950/25 dark:hover:bg-amber-950/40";
  return "bg-white hover:bg-gray-50/80 dark:bg-gray-900/40 dark:hover:bg-gray-800/60";
}

function suspiciousBadgeClasses(isSuspicious) {
  return isSuspicious
    ? "bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-500/30"
    : "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/25";
}

function toDatetimeLocalValue(ms) {
  const x = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export default function ConfigChange() {
  const [allEvents, setAllEvents] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const [sortKey, setSortKey] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const [expandedEvent, setExpandedEvent] = useState(null);
  /** 展开区 Tab：overview | compare | proc | raw */
  const [detailTab, setDetailTab] = useState("overview");
  /** 时间筛选：24h | 7d | 30d | custom */
  const [timePreset, setTimePreset] = useState("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const toggleExpandRow = (e) => {
    const id = stableRowId(e);
    if (expandedEvent && stableRowId(expandedEvent) === id) {
      setExpandedEvent(null);
    } else {
      setExpandedEvent(e);
    }
  };

  // 计算时间范围参数
  const getTimeRangeParams = useMemo(() => {
    const now = new Date();
    let startIso = "";
    let endIso = now.toISOString();

    if (timePreset === "24h") {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      startIso = start.toISOString();
    } else if (timePreset === "7d") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startIso = start.toISOString();
    } else if (timePreset === "30d") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startIso = start.toISOString();
    } else if (timePreset === "custom" && customStart && customEnd) {
      startIso = new Date(customStart).toISOString();
      endIso = new Date(customEnd).toISOString();
    }

    return { startIso, endIso };
  }, [timePreset, customStart, customEnd]);

  // 从 API 获取数据
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (getTimeRangeParams.startIso) {
      params.set("startIso", getTimeRangeParams.startIso);
    }
    if (getTimeRangeParams.endIso) {
      params.set("endIso", getTimeRangeParams.endIso);
    }
    params.set("sortKey", sortKey === "ts" ? "event_time" : sortKey);
    params.set("sortDir", sortDir);
    params.set("limit", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));

    fetch(`/api/config-audit-logs?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        // 将 event_time 映射为 ts 字段，保持与原有代码兼容
        const pageOffset = (page - 1) * pageSize;
        const events = (data.events || []).map((e, i) => ({
          ...e,
          ts: e.ts || e.event_time,
          _rowKey: `${pageOffset}_${i}`,
        }));
        setAllEvents(events);
        setTotalCount(data.total || 0);
        setLoadError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setAllEvents([]);
        setTotalCount(0);
        setLoadError(`无法加载配置变更数据: ${err.message}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getTimeRangeParams, sortKey, sortDir, page, pageSize]);

  // 数据已从 API 获取，直接使用 allEvents 作为当前页数据
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageSlice = allEvents;

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize, timePreset, customStart, customEnd]);

  useEffect(() => {
    setExpandedEvent(null);
  }, [pageSafe, pageSize, sortKey, sortDir, timePreset, customStart, customEnd]);

  useEffect(() => {
    setDetailTab("overview");
  }, [expandedEvent]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const copyText = (t) => {
    navigator.clipboard?.writeText(t).catch(() => {});
  };

  const chartData = useMemo(() => {
    const now = Date.now();
    if (timePreset === "24h") return trendBuckets24h(allEvents, now);
    if (timePreset === "7d") return trendBuckets7d(allEvents, now);
    if (timePreset === "30d") return trendBuckets30d(allEvents, now);
    if (timePreset === "custom" && customStart && customEnd) {
      const a = new Date(customStart).getTime();
      const b = new Date(customEnd).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
        return trendBucketsRange(allEvents, a, b);
      }
    }
    return trendBuckets7d(allEvents, now);
  }, [allEvents, timePreset, customStart, customEnd]);

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {loadError}
        </p>
      )}

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">配置变更事件</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {timePreset === "24h" && "近 24 小时按小时统计"}
              {timePreset === "7d" && "近 7 天按日统计"}
              {timePreset === "30d" && "近 30 天按日统计"}
              {timePreset === "custom" && "自定义区间内按日统计"}
              {!loading && `（当前页 ${allEvents.length} 条，共 ${totalCount} 条）`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="config-time-preset" className="text-gray-600 dark:text-gray-400">
              时间范围
            </label>
            <select
              id="config-time-preset"
              value={timePreset}
              onChange={(e) => {
                const v = e.target.value;
                setTimePreset(v);
                if (v === "custom") {
                  const end = Date.now();
                  const start = end - 7 * 24 * 60 * 60 * 1000;
                  setCustomStart((prev) => prev || toDatetimeLocalValue(start));
                  setCustomEnd((prev) => prev || toDatetimeLocalValue(end));
                }
              }}
              className="app-input py-1.5 px-2"
            >
              <option value="24h">最近 24 小时</option>
              <option value="7d">最近 7 天</option>
              <option value="30d">最近 1 个月</option>
              <option value="custom">自定义</option>
            </select>
            {timePreset === "custom" && (
              <>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="app-input py-1.5 px-2 font-mono text-xs"
                />
                <span className="text-gray-500 dark:text-gray-400">至</span>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="app-input py-1.5 px-2 font-mono text-xs"
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-4 h-32 w-full min-w-0">
          {loading ? (
            <LoadingSpinner message="正在加载趋势…" className="!py-4" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value) => [`${value} 次`, "变更事件"]}
                  labelFormatter={(label) =>
                    timePreset === "24h" ? `时间 ${label}` : `日期 ${label}`
                  }
                />
                <Bar dataKey="count" name="变更事件数" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="min-w-0 app-card p-4 sm:p-6">
          <TablePagination
            page={pageSafe}
            pageSize={pageSize}
            total={totalCount}
            onPageChange={setPage}
            loading={loading}
            trailingControls={
              <>
                <span className="text-sm text-gray-600 dark:text-gray-400">每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="app-input py-1.5 px-2"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-600 dark:text-gray-400">条</span>
              </>
            }
          />

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-800/80 dark:text-gray-400">
                    <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("ts")}>
                      事件时间 {sortKey === "ts" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("source")}>
                      来源 {sortKey === "source" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("event")}>
                      事件类型 {sortKey === "event" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="px-3 py-3">配置文件路径</th>
                    <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("pid")}>
                      进程 ID {sortKey === "pid" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("cwd")}>
                      工作目录 {sortKey === "cwd" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("argv")}>
                      命令行参数 {sortKey === "argv" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="px-3 py-3">网关模式</th>
                    <th className="px-3 py-3">是否可疑</th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("result")}>
                      写入结果 {sortKey === "result" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-0 align-middle">
                        <LoadingSpinner message="正在加载配置变更…" className="!py-16" />
                      </td>
                    </tr>
                  ) : pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                        无匹配记录
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((e) => {
                      const id = stableRowId(e);
                      const level = riskLevel(e);
                      const expanded = expandedEvent != null && stableRowId(expandedEvent) === id;
                      return (
                        <Fragment key={id}>
                          <tr
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            className={`cursor-pointer ${rowBgClass(level, expanded)}`}
                            onClick={() => toggleExpandRow(e)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                toggleExpandRow(e);
                              }
                            }}
                          >
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">
                              {formatUtc(e.ts)}
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                {e.source}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                                {e.event}
                              </span>
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs" title={e.configPath}>
                              {e.configPath}
                              <button
                                type="button"
                                className="ml-1 text-primary hover:underline"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  copyText(e.configPath);
                                }}
                              >
                                复制
                              </button>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{e.pid ?? "—"}</td>
                            <td
                              className="max-w-[min(14rem,22vw)] truncate px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200"
                              title={e.cwd}
                            >
                              {e.cwd ?? "—"}
                            </td>
                            <td
                              className="max-w-[min(18rem,28vw)] truncate px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200"
                              title={Array.isArray(e.argv) ? e.argv.join(" ") : ""}
                            >
                              {Array.isArray(e.argv) ? e.argv.join(" ") : "—"}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 text-xs ${isGatewayModeChanged(e) ? "font-semibold text-amber-800 dark:text-amber-200" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              {e.gatewayModeBefore ?? "null"} → {e.gatewayModeAfter ?? "null"}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={[
                                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                                  suspiciousBadgeClasses(!!e.suspicious?.length),
                                ].join(" ")}
                              >
                                {e.suspicious?.length ? `可疑 (${e.suspicious.length})` : "正常"}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                                {e.result}
                              </span>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-gray-50/90 dark:bg-gray-900/70">
                              <td colSpan={10} className="border-t border-gray-200 p-0 align-top dark:border-gray-700">
                                <div className="p-4" onClick={(ev) => ev.stopPropagation()}>
                                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 dark:border-gray-700">
                                    <div className="flex flex-wrap gap-1" role="tablist" aria-label="事件详情分区">
                                      {[
                                        { id: "overview", label: "事件详情" },
                                        { id: "compare", label: "变更对比" },
                                        { id: "proc", label: "进程与工作目录" },
                                        { id: "raw", label: "原始日志：完整 JSON" },
                                      ].map((tab) => (
                                        <button
                                          key={tab.id}
                                          type="button"
                                          role="tab"
                                          aria-selected={detailTab === tab.id}
                                          className={[
                                            "rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition",
                                            detailTab === tab.id
                                              ? "border-gray-200 bg-white text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-primary"
                                              : "border-transparent bg-transparent text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-100",
                                          ].join(" ")}
                                          onClick={() => setDetailTab(tab.id)}
                                        >
                                          {tab.label}
                                        </button>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedEvent(null)}
                                      className="app-btn-outline shrink-0 px-3 py-1.5 text-xs"
                                    >
                                      收起
                                    </button>
                                  </div>
                                  <div className="min-h-[12rem] rounded-b-lg border border-t-0 border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
                                    {detailTab === "overview" && (
                                      <div className="space-y-2.5 text-xs" role="tabpanel">
                                        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                                          {[
                                            ["事件时间", formatUtc(e.ts)],
                                            ["来源", e.source ?? "—"],
                                            ["事件类型", e.event ?? "—"],
                                            ["配置文件路径", e.configPath ?? "—"],
                                            ["进程 ID", String(e.pid ?? "—")],
                                            ["父进程 ID", String(e.ppid ?? "—")],
                                            ["写入结果", e.result ?? "—"],
                                          ].map(([k, v]) => (
                                            <div key={k} className="flex min-w-0 items-start gap-2">
                                              <span className="w-[7.5rem] shrink-0 pt-px text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400">
                                                {k}
                                              </span>
                                              <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-tight text-gray-900 dark:text-gray-100">
                                                {v}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-gray-100 bg-gray-50/90 px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900/50">
                                          <span className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                            是否可疑
                                          </span>
                                          <span
                                            className={[
                                              "inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[11px] font-semibold",
                                              suspiciousBadgeClasses(!!e.suspicious?.length),
                                            ].join(" ")}
                                          >
                                            {e.suspicious?.length ? `可疑（${e.suspicious.length}）` : "正常"}
                                          </span>
                                          {e.suspicious?.length ? (
                                            <span className="min-w-0 flex-1 basis-full sm:basis-auto break-all font-mono text-[11px] leading-snug text-gray-800 dark:text-gray-200 sm:pl-0">
                                              {e.suspicious.join("；")}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">无可疑项</span>
                                          )}
                                        </div>
                                        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                                          {[
                                            ["写入前网关模式", e.gatewayModeBefore == null ? "null" : String(e.gatewayModeBefore)],
                                            ["写入后网关模式", e.gatewayModeAfter == null ? "null" : String(e.gatewayModeAfter)],
                                            ["写入前文件存在", String(e.existsBefore ?? "—")],
                                            ["写入前含 meta", String(e.hasMetaBefore ?? "—")],
                                            ["写入后含 meta", String(e.hasMetaAfter ?? "—")],
                                            ["监视模式", String(e.watchMode ?? "—")],
                                          ].map(([k, v]) => (
                                            <div key={k} className="flex min-w-0 items-start gap-2">
                                              <span className="w-[7.5rem] shrink-0 pt-px text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400">
                                                {k}
                                              </span>
                                              <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-tight text-gray-900 dark:text-gray-100">
                                                {v}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {detailTab === "compare" && (
                                      <div role="tabpanel">
                                        <table className="w-full border-collapse text-left text-xs">
                                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            <tr>
                                              <th className="w-28 py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">哈希</th>
                                              <td className="break-all font-mono text-gray-800 dark:text-gray-200">
                                                {shortHash(e.previousHash)} → {shortHash(e.nextHash)}
                                                <span className="ml-2 text-gray-600 dark:text-gray-400">
                                                  {hashChanged(e) ? "（内容已变化）" : "（哈希相同）"}
                                                </span>
                                              </td>
                                            </tr>
                                            <tr>
                                              <th className="py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">字节</th>
                                              <td className="tabular-nums text-gray-800 dark:text-gray-200">
                                                {e.previousBytes ?? "—"} → {e.nextBytes ?? "—"}
                                                {byteDelta(e) != null && (
                                                  <span className="ml-2">
                                                    增减 {byteDelta(e) >= 0 ? "+" : ""}
                                                    {byteDelta(e)}
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                            <tr>
                                              <th className="py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">网关模式</th>
                                              <td
                                                className={
                                                  isGatewayModeChanged(e)
                                                    ? "font-semibold text-amber-800 dark:text-amber-200"
                                                    : "text-gray-800 dark:text-gray-200"
                                                }
                                              >
                                                {e.gatewayModeBefore ?? "null"} → {e.gatewayModeAfter ?? "null"}
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                    {detailTab === "proc" && (
                                      <div className="space-y-4 text-xs" role="tabpanel">
                                        <div>
                                          <p className="font-medium text-gray-600 dark:text-gray-400">cwd</p>
                                          <p className="mt-1 break-all font-mono text-gray-900 dark:text-gray-100">{e.cwd ?? "—"}</p>
                                        </div>
                                        <div>
                                          <p className="font-medium text-gray-600 dark:text-gray-400">argv</p>
                                          <p className="mt-1 break-all font-mono text-gray-900 dark:text-gray-100">
                                            {Array.isArray(e.argv) ? JSON.stringify(e.argv, null, 2) : "—"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="font-medium text-gray-600 dark:text-gray-400">execArgv（Node）</p>
                                          <p className="mt-1 break-all font-mono text-gray-900 dark:text-gray-100">
                                            {Array.isArray(e.execArgv)
                                              ? e.execArgv.length
                                                ? JSON.stringify(e.execArgv, null, 2)
                                                : "[]"
                                              : "—"}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                    {detailTab === "raw" && (
                                    <CodeBlock text={JSON.stringify(e, null, 2)} variant="auto" height="2xl" className="sm:max-h-96">
                                      {JSON.stringify(e, null, 2)}
                                    </CodeBlock>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
    </div>
  );
}
