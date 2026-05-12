import { useEffect, useMemo, useState, Fragment } from "react";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import CostTimeRangeFilter, {
  defaultRangeLastDays,
  parseLocalMs,
  rangeToDayBounds,
} from "../components/CostTimeRangeFilter.jsx";
import { downloadCsv, filenameWithTime } from "../utils/exportCsv.js";
import { sortCostRows } from "../utils/costTableSort.js";
import SortableTableTh from "../components/SortableTableTh.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../components/TablePagination.jsx";
import intl from "react-intl-universal";

function Sparkline({ data }) {
  if (!data || data.length === 0) return <div className="h-4 w-20 bg-gray-50 dark:bg-gray-900/40 rounded mx-auto" />;
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-6 items-end justify-center gap-0.5">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-t-sm bg-primary/40 transition-all duration-300 hover:bg-primary"
          style={{ height: `${Math.max((v / max) * 100, 10)}%` }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

function ProgressBar({ input, output }) {
  const total = input + output;
  if (total === 0) return (
    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
  );
  const inPct = (input / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div
        className="h-full bg-primary/80 transition-all duration-500"
        style={{ width: `${inPct}%` }}
      />
      <div
        className="h-full bg-emerald-500/80 transition-all duration-500"
        style={{ width: `${100 - inPct}%` }}
      />
    </div>
  );
}

function SuccessIndicator({ rate }) {
  const r = parseFloat(rate);
  const color = r >= 95 ? "text-emerald-500" : r >= 90 ? "text-amber-500" : "text-rose-500";
  const bg = r >= 95 ? "bg-emerald-500" : r >= 90 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="flex items-center gap-1.5 font-medium">
      <span className={`h-2 w-2 rounded-full ${bg}`} />
      <span className={color}>{rate}</span>
    </div>
  );
}

export default function AgentCostDetail({ params }) {
  const [activeDays, setActiveDays] = useState(30);
  const [customRangeStart, setCustomRangeStart] = useState("");
  const [customRangeEnd, setCustomRangeEnd] = useState("");
  const rangeObj = useMemo(() => {
    if (customRangeStart && customRangeEnd) return { start: customRangeStart, end: customRangeEnd };
    return defaultRangeLastDays(activeDays ?? 30);
  }, [activeDays, customRangeStart, customRangeEnd]);
  const rangeStart = rangeObj.start;
  const rangeEnd = rangeObj.end;

  const handlePreset = (days) => { setActiveDays(days); setCustomRangeStart(""); setCustomRangeEnd(""); };
  const handleRangeChange = (start, end) => { setCustomRangeStart(start || ""); setCustomRangeEnd(end || ""); if (start && end) setActiveDays(null); };
  const [expandedId, setExpandedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState(params?.agentName ?? "");
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const pageSize = DEFAULT_TABLE_PAGE_SIZE;

  const rangeValid = useMemo(() => {
    const s = parseLocalMs(rangeStart);
    const e = parseLocalMs(rangeEnd);
    return s != null && e != null && s <= e;
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    const bounds = rangeValid ? rangeToDayBounds(rangeStart, rangeEnd) : null;
    if (!bounds) {
      setRows([]);
      setErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const qs = new URLSearchParams({
          startDay: bounds.startDay,
          endDay: bounds.endDay,
        });
        const r = await fetch(`/api/agent-cost-list?${qs}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, rangeValid]);

  useEffect(() => {
    if (params?.agentName) setSearchQuery(params.agentName);
  }, [params]);

  const filtered = useMemo(() => {
    if (!rangeValid) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.agent.toLowerCase().includes(q) ||
      r.agentId.toLowerCase().includes(q)
    );
  }, [rows, rangeValid, searchQuery]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filtered;
    return sortCostRows(filtered, sortKey, sortOrder, "agent-list");
  }, [filtered, sortKey, sortOrder]);

  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);
  const safePage = totalRows === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  useEffect(() => { setPage(1); }, [rangeStart, rangeEnd, searchQuery]);

  function handleSort(columnKey) {
    setSortKey(prev => {
      if (prev === columnKey) {
        setSortOrder(o => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder("asc");
      return columnKey;
    });
  }

  function handleExportCsv() {
    if (!rangeValid || sortedRows.length === 0) return;
    const headers = ["Agent ID", "Agent", "Total Token", "Avg Per Call", "Calls", "Success Rate", "Anomaly Tokens"];
    const csvRows = sortedRows.map(r => [
      r.agentId, r.agent, r.totalCost, r.avgPerTask, r.callCount, r.successRate, r.anomalyTokens
    ]);
    downloadCsv(filenameWithTime("agent_cost_list"), headers, csvRows);
  }

  const toggleExpand = (id) => setExpandedId(expandedId === id ? null : id);

  return (
    <div className="space-y-4">
      <CostTimeRangeFilter activeDays={activeDays} onPreset={handlePreset} rangeStart={customRangeStart} rangeEnd={customRangeEnd} onRangeChange={handleRangeChange} />

      <section className="app-card overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 dark:border-gray-800">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={intl.get("agentCostDetail.agentIdLabel")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="app-input w-full py-2 pl-9 text-sm"
            />
          </div>
          <button
            onClick={handleExportCsv}
            disabled={!rangeValid || loading || sortedRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {intl.get("common.exportCsv")}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                <th className="w-[12%] px-2 py-3 font-semibold text-gray-600 dark:text-gray-200 text-center">{intl.get("agentCostDetail.agent")}</th>
                <SortableTableTh className="w-[10%] text-center" label={intl.get("agentCostDetail.totalToken")} columnKey="totalCost" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                <th className="w-[8%] px-2 py-3 font-semibold text-gray-600 dark:text-gray-200 text-center">{intl.get("agentCostDetail.trendTitleHeader")}</th>
                <th className="w-[12%] px-2 py-3 font-semibold text-gray-600 dark:text-gray-200 text-center">{intl.get("agentCostDetail.ioStructure")}</th>
                <SortableTableTh className="w-[10%] text-center" label={intl.get("agentCostDetail.avgToken")} columnKey="avgPerTask" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                <SortableTableTh className="w-[8%] text-center" label={intl.get("agentCostDetail.callCount")} columnKey="callCount" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                <SortableTableTh className="w-[8%] text-center" label={intl.get("agentCostDetail.successRate")} columnKey="successRate" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                <th className="w-[12%] px-2 py-3 font-semibold text-gray-600 dark:text-gray-200 text-center">{intl.get("agentCostDetail.anomalyLoss")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading && pageRows.length === 0 ? (
                <tr><td colSpan={8} className="py-20"><LoadingSpinner /></td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} className="py-20 text-center text-gray-400">{intl.get("agentCostDetail.noDataInRange")}</td></tr>
              ) : (
                pageRows.map((row) => {
                  const isExpanded = expandedId === row.agentId;
                  return (
                    <Fragment key={row.agentId}>
                      <tr
                        onClick={() => toggleExpand(row.agentId)}
                        className={`group transition-all duration-300 cursor-pointer hover:bg-primary-soft/10 dark:hover:bg-primary/5 ${isExpanded ? 'bg-primary-soft/30 dark:bg-primary/10 shadow-sm ring-1 ring-black/5 dark:ring-white/5' : ''}`}
                      >
                        <td className={`px-2 py-4 text-center transition-all ${isExpanded ? 'border-l-4 border-primary' : 'border-l-4 border-transparent'}`}>
                          <div className="flex flex-col items-center mx-auto">
                            <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                              {row.agent}
                              <svg className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </span>
                            <div className="flex items-center justify-center mt-1">
                              <span className="font-mono text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-700">{row.agentId}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-4 font-semibold text-gray-900 dark:text-gray-100 text-center tabular-nums">{row.totalCost}</td>
                        <td className="px-2 py-4 text-center">
                          <div className="flex justify-center">
                            <Sparkline data={row.trend} />
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center">
                          <div className="max-w-[120px] mx-auto">
                            <ProgressBar input={row.inputTokensRaw} output={row.outputTokensRaw} />
                          </div>
                        </td>
                        <td className="px-2 py-4 tabular-nums text-gray-600 dark:text-gray-400 text-center">{row.avgPerTask}</td>
                        <td className="px-2 py-4 tabular-nums text-gray-600 dark:text-gray-400 text-center">{row.callCount}</td>
                        <td className="px-2 py-4 text-center">
                          <div className="flex justify-center">
                            <SuccessIndicator rate={row.successRate} />
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{row.anomalyTokens}</span>
                            <span className={`text-[10px] font-bold ${row.anomalyPct > 10 ? 'text-rose-500' : 'text-gray-400'}`}>({row.anomalyPct}%)</span>
                            {row.anomalyPct > 10 && <span className="text-rose-500" title="High Anomaly Risk">⚠️</span>}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-primary-soft/20 dark:bg-primary/5 shadow-inner">
                          <td colSpan={8} className="px-6 py-6 border-l-4 border-primary">
                            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_280px] gap-6 items-stretch">
                              {/* TCO Section - Fixed Width, Bordered, Centered */}
                              <div className="border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-6 bg-white/50 dark:bg-gray-800/30 flex flex-col justify-center shadow-sm">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                  {intl.get("agentCostDetail.tcoTitle")}
                                </h3>
                                <div className="space-y-1">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-extrabold text-gray-900 dark:text-gray-100">¥{row.tco.total.toFixed(2)}</span>
                                  </div>
                                  <p className="text-xs text-gray-400 font-medium">({intl.get("agentCostDetail.estimatedCost")})</p>
                                </div>
                              </div>

                              {/* Model Routing Section - Flexible, Bordered */}
                              <div className="border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-6 bg-white/50 dark:bg-gray-800/30 flex flex-col justify-center shadow-sm">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                  {intl.get("agentCostDetail.modelRouting")}
                                </h3>
                                <div className="space-y-5">
                                  {row.modelDist.map((m, idx) => (
                                    <div key={idx} className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <span className="font-bold text-gray-800 dark:text-gray-200 min-w-[100px]">{m.name}</span>
                                          <span className="text-xs text-gray-400 tabular-nums font-medium">
                                            {(m.tokens || 0) >= 1e6 ? `${((m.tokens || 0) / 1e6).toFixed(2)}M` : `${((m.tokens || 0) / 1000).toFixed(1)}K`} tokens
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-8">
                                          <div className="flex flex-col items-end">
                                            <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">¥{(m.cost || 0).toFixed(2)}</span>
                                            <span className="text-[10px] text-gray-400 leading-none font-medium uppercase tracking-tighter">Est. Cost</span>
                                          </div>
                                          <span className="text-sm font-bold text-primary w-10 text-right">{m.pct}%</span>
                                        </div>
                                      </div>
                                      <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary/60 rounded-full transition-all duration-700" style={{ width: `${m.pct}%` }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Actions Section - 20% width equivalent, centered */}
                              <div className="flex items-center justify-center border-l border-gray-100 dark:border-gray-800 pl-6">
                                <button
                                  onClick={() => {
                                    window.dispatchEvent(new CustomEvent("openclaw-nav", {
                                      detail: {
                                        id: "cost-overview-2",
                                        params: { agents: [row.agent] }
                                      }
                                    }));
                                  }}
                                  className="group flex items-center gap-3 rounded-xl bg-primary/5 px-6 py-3 text-sm font-bold text-primary transition-all hover:bg-primary hover:text-white whitespace-nowrap"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                  {intl.get("agentCostDetail.viewSessions")}
                                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
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

        {rangeValid && totalRows > 0 && !loading && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800">
            <TablePagination
              page={safePage}
              pageSize={pageSize}
              total={totalRows}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>

      {err && (
        <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm">
          {err}
        </div>
      )}
    </div>
  );
}
