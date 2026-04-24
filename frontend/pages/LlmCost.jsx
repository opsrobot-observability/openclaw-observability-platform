import { useEffect, useMemo, useState, Fragment } from "react";
import intl from "react-intl-universal";
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

function Sparkline({ data }) {
  if (!data || data.length === 0) return <div className="h-4 w-20 bg-gray-50 dark:bg-gray-900/40 rounded" />;
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-6 items-end gap-0.5">
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

function IOBar({ input, output }) {
  const total = input + output;
  if (total === 0) return <div className="h-1.5 w-24 rounded-full bg-gray-100 dark:bg-gray-800" />;
  const inPct = Math.round((input / total) * 100);
  const outPct = 100 - inPct;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full bg-primary/80" style={{ width: `${inPct}%` }} />
        <div className="h-full bg-emerald-400/80" style={{ width: `${outPct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-gray-500">{inPct}/{outPct}</span>
    </div>
  );
}

function ErrorRate({ rate }) {
  const r = parseFloat(rate);
  const isErr = r > 1.0;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${isErr ? "bg-rose-500 animate-pulse" : "bg-emerald-500"}`} />
      <span className={`font-medium ${isErr ? "text-rose-600 dark:text-rose-400" : "text-gray-700 dark:text-gray-300"}`}>{rate}%</span>
    </div>
  );
}

export default function LlmCost({ params }) {
  const [activeDays, setActiveDays] = useState(30);
  const [range, setRange] = useState(() => defaultRangeLastDays(30));
  const { start: rangeStart, end: rangeEnd } = range;
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [searchQuery, setSearchQuery] = useState(params?.modelName ?? "");
  const [expandedId, setExpandedId] = useState(null);

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
          summary: "true",
        });
        const r = await fetch(`/api/llm-cost-detail?${qs}`);
        const text = await r.text();
        if (!r.ok) {
          throw new Error(text || `HTTP ${r.status}`);
        }
        const data = JSON.parse(text);
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
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, rangeValid]);

  const filtered = useMemo(() => {
    if (!rangeValid) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => 
      r.model.toLowerCase().includes(q) || 
      (r.provider && r.provider.toLowerCase().includes(q))
    );
  }, [rows, rangeValid, searchQuery]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filtered;
    return sortCostRows(filtered, sortKey, sortOrder, "llm-summary");
  }, [filtered, sortKey, sortOrder]);

  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);
  const safePage = totalRows === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [rangeStart, rangeEnd, searchQuery]);

  function handleSort(columnKey) {
    setSortKey((prev) => {
      if (prev === columnKey) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder("desc");
      return columnKey;
    });
  }

  function handleExportCsv() {
    if (!rangeValid || sortedRows.length === 0) return;
    const headers = [
      intl.get("llmCost.model"),
      intl.get("llmCost.vendor"),
      intl.get("llmCost.tokenConsumption"),
      intl.get("llmCost.callCount"),
      intl.get("llmCost.errorRate"),
    ];
    const csvData = sortedRows.map((r) => [
      r.model,
      r.provider,
      r.totalTokens,
      r.callCount,
      r.errorRate,
    ]);
    downloadCsv(filenameWithTime("llm_cost_summary"), headers, csvData);
  }

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

      <section className="app-card overflow-hidden">
        {/* Header / Search Area */}
        <div className="border-b border-gray-100 bg-gray-50/30 p-4 dark:border-gray-800 dark:bg-gray-900/20 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={intl.get("llmCost.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="app-input w-full py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="button"
              disabled={!rangeValid || loading || sortedRows.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {intl.get("common.exportCsv")}
            </button>
          </div>
        </div>

        {err && (
          <div className="mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {err}
          </div>
        )}

        <div className="relative min-h-[300px] p-0">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-950/60">
              <LoadingSpinner />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-500 dark:text-gray-200 dark:border-gray-800 dark:bg-gray-900/30">
                  <SortableTableTh label={intl.get("llmCost.model")} columnKey="model" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="pl-6" />
                  <SortableTableTh label={intl.get("llmCost.vendor")} columnKey="provider" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label={intl.get("llmCost.tokenConsumption")} columnKey="totalTokens" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <th className="px-4 py-3 font-semibold">{intl.get("llmCost.trend")}</th>
                  <th className="px-4 py-3 font-semibold">{intl.get("llmCost.ioStructure")}</th>
                  <SortableTableTh label={intl.get("llmCost.callCount")} columnKey="callCount" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label={intl.get("llmCost.errorRate")} columnKey="errorRate" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pageRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center text-gray-500">
                      {intl.get("llmCost.noDataInRange")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const isExpanded = expandedId === row.model;
                    return (
                      <Fragment key={row.model}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : row.model)}
                          className={`group cursor-pointer transition-all hover:bg-gray-50/80 dark:hover:bg-gray-900/40 ${isExpanded ? "bg-primary-soft/50 dark:bg-primary/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]" : ""}`}
                        >
                          <td className={`py-4 pl-6 font-medium text-gray-900 dark:text-gray-100 transition-all ${isExpanded ? "border-l-4 border-primary" : "border-l-4 border-transparent"}`}>
                            <div className="flex items-center gap-2">
                              {row.model}
                              <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">{row.provider}</span>
                          </td>
                          <td className="px-4 py-4 font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">{row.totalTokensFmt}</td>
                          <td className="px-4 py-4">
                            <Sparkline data={row.trend} />
                          </td>
                          <td className="px-4 py-4">
                            <IOBar input={row.inputTokens} output={row.outputTokens} />
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                            {row.callCount?.toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <ErrorRate rate={row.errorRate} />
                          </td>
                        </tr>
                        {isExpanded && row.topApps && (
                          <tr className="bg-primary-soft/50 dark:bg-primary/10 transition-colors">
                            <td colSpan={7} className={`px-6 py-6 transition-all ${isExpanded ? "border-l-4 border-primary" : "border-l-4 border-transparent"}`}>
                               <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_1fr_1.2fr] gap-6">
                                 {/* Top Apps */}
                                 <div className="border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-5 bg-white/50 dark:bg-gray-800/30 shadow-sm">
                                   <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                     <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                                     {intl.get("llmCost.topApps")}
                                   </h3>
                                   <ul className="space-y-3">
                                     {row.topApps.map(app => (
                                       <li key={app.name} className="flex items-center justify-between text-sm">
                                         <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                           <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                           {app.name}
                                         </span>
                                         <span className="font-mono text-primary font-bold">{app.pct}%</span>
                                       </li>
                                     ))}
                                   </ul>
                                 </div>

                                 {/* Stability */}
                                 <div className="border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-5 bg-white/50 dark:bg-gray-800/30 shadow-sm">
                                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      {intl.get("llmCost.stabilityMetrics")}
                                    </h3>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                          {intl.get("llmCost.avgLatency")}
                                        </span>
                                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{row.stability?.avgLatency}s</span>
                                      </div>
                                      <div className="pt-2">
                                        <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-tight flex items-center gap-2">
                                          <span className="h-1 w-1 rounded-full bg-gray-300" />
                                          {intl.get("llmCost.errorDist")}
                                        </p>
                                        <ul className="space-y-1.5">
                                          {row.stability?.errorDist?.map(err => (
                                            <li key={err.code} className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between bg-gray-50 dark:bg-gray-900/40 px-2 py-1 rounded">
                                              <span>{err.code}</span>
                                              <span className="font-medium">{err.count}次</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                 </div>

                                 {/* Efficiency */}
                                 <div className="border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-5 bg-white/50 dark:bg-gray-800/30 shadow-sm">
                                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                      {intl.get("llmCost.efficiencyMetrics")}
                                    </h3>
                                    <div className="space-y-3 text-sm">
                                       <p className="flex justify-between items-center">
                                         <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                           <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                           {intl.get("llmCost.avgTokensPerSession")}
                                         </span>
                                         <span className="font-mono font-bold">{row.efficiency?.avgTokensPerSession}</span>
                                       </p>
                                       <p className="flex justify-between items-center">
                                         <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                           <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                           {intl.get("llmCost.effectiveOutputRate")}
                                         </span>
                                         <span className="font-mono font-bold text-emerald-500">{row.efficiency?.effectiveOutputRate}%</span>
                                       </p>
                                       <p className="flex justify-between items-center">
                                         <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                           <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                           {intl.get("llmCost.estMonthlyCost")}
                                         </span>
                                         <span className="font-mono font-bold text-primary">{row.efficiency?.estMonthlyCost}</span>
                                       </p>
                                    </div>
                                 </div>

                                 {/* Actions */}
                                 <div className="flex items-center justify-center border-l border-gray-100 dark:border-gray-800/50 pl-6">
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       window.dispatchEvent(new CustomEvent("openclaw-nav", {
                                         detail: { id: "cost-overview-2", params: { model: row.model } }
                                       }));
                                     }}
                                     className="group flex items-center gap-3 px-6 py-4 rounded-2xl bg-primary/5 text-primary text-sm font-extrabold transition-all hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98]"
                                   >
                                     <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                     </svg>
                                     {intl.get("llmCost.viewSessionDetails")}
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
        </div>

        <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          <TablePagination
            page={safePage}
            pageSize={pageSize}
            total={totalRows}
            onPageChange={setPage}
          />
        </div>
      </section>
    </div>
  );
}
