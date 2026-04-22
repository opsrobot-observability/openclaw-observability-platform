import { Fragment, useEffect, useMemo, useState } from "react";
import CostTimeRangeFilter from "../components/CostTimeRangeFilter.jsx";
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
  parseTsMs,
} from "../lib/configAudit.js";
import intl from "react-intl-universal";

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
  /** 时间筛选：统一预设天数 */
  const [activeDays, setActiveDays] = useState(7);
  const [range, setRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: now.toISOString() };
  });

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
    return { startIso: range.startIso, endIso: range.endIso };
  }, [range]);

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
        setLoadError(intl.get("configChange.loadFailed", { error: err.message }));
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
  }, [sortKey, sortDir, pageSize, activeDays]);

  useEffect(() => {
    setExpandedEvent(null);
  }, [pageSafe, pageSize, sortKey, sortDir, activeDays]);

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
    if (activeDays <= 1) return trendBuckets24h(allEvents, now);
    if (activeDays <= 7) return trendBuckets7d(allEvents, now);
    return trendBuckets30d(allEvents, now);
  }, [allEvents, activeDays]);

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {loadError}
        </p>
      )}

      <CostTimeRangeFilter
        activeDays={activeDays}
        onPreset={(days) => {
          setActiveDays(days);
          const now = new Date();
          const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          setRange({ startIso: start.toISOString(), endIso: now.toISOString() });
        }}
        rangeStart={range.startIso}
        rangeEnd={range.endIso}
        onRangeChange={(start, end) => {
          setActiveDays(null);
          setRange({
            startIso: new Date(start).toISOString(),
            endIso: new Date(end).toISOString(),
          });
        }}
      />

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("configChange.title")}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {activeDays <= 1 && intl.get("configChange.last24h")}
              {activeDays === 7 && intl.get("configChange.last7d")}
              {activeDays >= 30 && intl.get("configChange.lastNd", { days: activeDays })}
              {!loading &&
                `（${intl.get("configChange.currentPage", {
                  current: allEvents.length,
                  total: totalCount,
                })}）`}
            </p>
          </div>
        </div>

        <div className="mt-4 h-32 w-full min-w-0 min-h-0">
          {loading ? (
            <LoadingSpinner message={intl.get("configChange.loadingTrend")} className="!py-4" />
          ) : (
            <ResponsiveContainer width="100%" height={128} minWidth={0}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value) => [
                    `${value} ${intl.get("configChange.changeCount")}`,
                    intl.get("configChange.changeEventName"),
                  ]}
                  labelFormatter={(label) =>
                    activeDays <= 1
                      ? intl.get("configChange.timeLabel", { label })
                      : intl.get("configChange.dateLabel", { label })
                  }
                />
                <Bar
                  dataKey="count"
                  name={intl.get("configChange.changeEventCount")}
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="min-w-0 app-card p-4 sm:p-6">

          <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-800/80 dark:text-gray-400">
                    <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("ts")}>
                      {intl.get("configChange.eventTime")}{" "}
                      {sortKey === "ts" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("source")}>
                      {intl.get("configChange.source")}{" "}
                      {sortKey === "source" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("event")}>
                      {intl.get("configChange.eventType")}{" "}
                      {sortKey === "event" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="px-3 py-3">{intl.get("configChange.configPath")}</th>
                    <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("pid")}>
                      {intl.get("configChange.pid")}{" "}
                      {sortKey === "pid" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("cwd")}>
                      {intl.get("configChange.cwd")}{" "}
                      {sortKey === "cwd" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("argv")}>
                      {intl.get("configChange.argv")}{" "}
                      {sortKey === "argv" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="px-3 py-3">{intl.get("configChange.gatewayMode")}</th>
                    <th className="px-3 py-3">{intl.get("configChange.isSuspicious")}</th>
                    <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("result")}>
                      {intl.get("configChange.writeResult")}{" "}
                      {sortKey === "result" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-0 align-middle">
                        <LoadingSpinner message={intl.get("configChange.loadingConfig")} className="!py-16" />
                      </td>
                    </tr>
                  ) : pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                        {intl.get("common.noMatch")}
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
                                {intl.get("common.copy")}
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
                                {e.suspicious?.length
                                  ? intl.get("configChange.suspiciousCount", { count: e.suspicious.length })
                                  : intl.get("common.normal")}
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
                                    <div
                                      className="flex flex-wrap gap-1"
                                      role="tablist"
                                      aria-label={intl.get("configChange.eventDetailSection")}
                                    >
                                      {[
                                        { id: "overview", label: intl.get("configChange.eventDetail") },
                                        { id: "compare", label: intl.get("configChange.changeCompare") },
                                        { id: "proc", label: intl.get("configChange.processAndCwd") },
                                        { id: "raw", label: intl.get("configChange.rawLog") },
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
                                      {intl.get("common.collapse")}
                                    </button>
                                  </div>
                                  <div className="min-h-[12rem] rounded-b-lg border border-t-0 border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
                                    {detailTab === "overview" && (
                                      <div className="space-y-2.5 text-xs" role="tabpanel">
                                        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                                          {[
                                            [intl.get("configChange.eventTime"), formatUtc(e.ts)],
                                            [intl.get("configChange.source"), e.source ?? "—"],
                                            [intl.get("configChange.eventType"), e.event ?? "—"],
                                            [intl.get("configChange.configPath"), e.configPath ?? "—"],
                                            [intl.get("configChange.pid"), String(e.pid ?? "—")],
                                            [intl.get("configChange.parentPid"), String(e.ppid ?? "—")],
                                            [intl.get("configChange.writeResult"), e.result ?? "—"],
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
                                            {intl.get("configChange.isSuspicious")}
                                          </span>
                                          <span
                                            className={[
                                              "inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[11px] font-semibold",
                                              suspiciousBadgeClasses(!!e.suspicious?.length),
                                            ].join(" ")}
                                          >
                                            {e.suspicious?.length
                                              ? intl.get("configChange.suspiciousCount", {
                                                  count: e.suspicious.length,
                                                })
                                              : intl.get("common.normal")}
                                          </span>
                                          {e.suspicious?.length ? (
                                            <span className="min-w-0 flex-1 basis-full sm:basis-auto break-all font-mono text-[11px] leading-snug text-gray-800 dark:text-gray-200 sm:pl-0">
                                              {e.suspicious.join("；")}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                              {intl.get("configChange.noSuspicious")}
                                            </span>
                                          )}
                                        </div>
                                        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                                          {[
                                            [
                                              intl.get("configChange.gatewayModeBefore"),
                                              e.gatewayModeBefore == null ? "null" : String(e.gatewayModeBefore),
                                            ],
                                            [
                                              intl.get("configChange.gatewayModeAfter"),
                                              e.gatewayModeAfter == null ? "null" : String(e.gatewayModeAfter),
                                            ],
                                            [intl.get("configChange.existsBefore"), String(e.existsBefore ?? "—")],
                                            [intl.get("configChange.hasMetaBefore"), String(e.hasMetaBefore ?? "—")],
                                            [intl.get("configChange.hasMetaAfter"), String(e.hasMetaAfter ?? "—")],
                                            [intl.get("configChange.watchMode"), String(e.watchMode ?? "—")],
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
                                              <th className="w-28 py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">
                                                {intl.get("configChange.hash")}
                                              </th>
                                              <td className="break-all font-mono text-gray-800 dark:text-gray-200">
                                                {shortHash(e.previousHash)} → {shortHash(e.nextHash)}
                                                <span className="ml-2 text-gray-600 dark:text-gray-400">
                                                  {hashChanged(e)
                                                    ? intl.get("configChange.hashChanged")
                                                    : intl.get("configChange.hashSame")}
                                                </span>
                                              </td>
                                            </tr>
                                            <tr>
                                              <th className="py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">
                                                {intl.get("configChange.bytes")}
                                              </th>
                                              <td className="tabular-nums text-gray-800 dark:text-gray-200">
                                                {e.previousBytes ?? "—"} → {e.nextBytes ?? "—"}
                                                {byteDelta(e) != null && (
                                                  <span className="ml-2">
                                                    {intl.get("configChange.byteDelta")}{" "}
                                                    {byteDelta(e) >= 0 ? "+" : ""}
                                                    {byteDelta(e)}
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                            <tr>
                                              <th className="py-2 pr-3 font-medium text-gray-600 dark:text-gray-400">
                                                {intl.get("configChange.gatewayMode")}
                                              </th>
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
                                          <p className="font-medium text-gray-600 dark:text-gray-400">
                                            {intl.get("configChange.execArgv")}
                                          </p>
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

          <TablePagination
            page={pageSafe}
            pageSize={pageSize}
            total={totalCount}
            onPageChange={setPage}
            className="mt-6"
            loading={loading}
            trailingControls={
              <>
                <span className="text-sm text-gray-600 dark:text-gray-400">{intl.get("common.perPage")}</span>
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
                <span className="text-sm text-gray-600 dark:text-gray-400">{intl.get("common.items")}</span>
              </>
            }
          />
        </section>
    </div>
  );
}
