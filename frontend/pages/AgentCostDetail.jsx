import { useEffect, useMemo, useState } from "react";
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

export default function AgentCostDetail({ params }) {
  const [activeDays, setActiveDays] = useState(30);
  const rangeObj = useMemo(() => defaultRangeLastDays(activeDays), [activeDays]);
  const rangeStart = rangeObj.start;
  const rangeEnd = rangeObj.end;
  const [drillRow, setDrillRow] = useState(null);
  const [searchQuery, setSearchQuery] = useState(params?.agentName ?? "");
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [legend, setLegend] = useState("");
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
      setLegend("");
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
        if (!cancelled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setLegend(typeof data.legend === "string" ? data.legend : "");
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          setRows([]);
          setLegend("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, rangeValid]);

  useEffect(() => {
    if (params?.agentName) {
      setSearchQuery(params.agentName);
    }
  }, [params]);

  const filtered = useMemo(() => {
    if (!rangeValid) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
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

  useEffect(() => {
    setPage(1);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    if (totalRows === 0) {
      setPage(1);
      return;
    }
    setPage((p) => Math.min(p, totalPages));
  }, [totalRows, totalPages]);

  const drillItems = useMemo(() => {
    if (!drillRow?.drill) return [];
    return Array.isArray(drillRow.drill) ? drillRow.drill : [];
  }, [drillRow]);

  useEffect(() => {
    if (!drillRow) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDrillRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drillRow]);

  function handleSort(columnKey) {
    setSortKey((prev) => {
      if (prev === columnKey) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder("asc");
      return columnKey;
    });
  }

  function handleExportCsv() {
    if (!rangeValid || sortedRows.length === 0) return;
    const headers = [
      intl.get("agentCostDetail.timeRangeStart"),
      intl.get("agentCostDetail.timeRangeEnd"),
      "Agent ID",
      "Agent",
      intl.get("agentCostDetail.totalToken"),
      intl.get("agentCostDetail.avgPerTask"),
      intl.get("agentCostDetail.callCount"),
      intl.get("agentCostDetail.successRate"),
    ];
    const csvRows = sortedRows.map((r) => [
      rangeStart,
      rangeEnd,
      r.agentId,
      r.agent,
      r.totalCost,
      r.avgPerTask,
      r.callCount,
      r.successRate,
    ]);
    downloadCsv(filenameWithTime("agent_cost_list"), headers, csvRows);
  }

  return (
    <div className="space-y-6">
      {err ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {err}
        </div>
      ) : null}

      <CostTimeRangeFilter
        activeDays={activeDays}
        onPreset={setActiveDays}
      />

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("agentCostDetail.title")}</h2>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="relative w-full max-w-xs">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={intl.get("dashboard.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="app-input w-full py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={!rangeValid || loading || sortedRows.length === 0}
              onClick={handleExportCsv}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {intl.get("common.exportCsv")}
            </button>
          </div>
        </div>
        {loading ? <LoadingSpinner message={intl.get("agentCostDetail.loading")} /> : null}
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-900/50">
                  <SortableTableTh label="Agent ID" columnKey="agentId" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label="Agent" columnKey="agent" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label={intl.get("agentCostDetail.totalToken")} columnKey="totalCost" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label={intl.get("agentCostDetail.avgPerTask")} columnKey="avgPerTask" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label={intl.get("agentCostDetail.callCount")} columnKey="callCount" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTableTh label={intl.get("agentCostDetail.successRate")} columnKey="successRate" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                  <th className="w-24 px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("agentCostDetail.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {!rangeValid ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                      {intl.get("common.selectTimeRange")}
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                      {intl.get("agentCostDetail.loading")}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                      {intl.get("agentCostDetail.noDataInRange")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, i) => (
                    <tr
                      key={`${row.agentId}-${(safePage - 1) * pageSize + i}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrillRow(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDrillRow(row);
                        }
                      }}
                      className={[
                        "cursor-pointer transition-colors duration-200 hover:bg-primary-soft/45 dark:hover:bg-primary/15",
                        i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-900/30" : "bg-white dark:bg-gray-950",
                      ].join(" ")}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-800 dark:text-gray-200">{row.agentId}</td>
                      <td className="max-w-[12rem] px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.agent}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900 dark:text-gray-100">{row.totalCost}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{row.avgPerTask}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-gray-800 dark:text-gray-200">
                        {row.callCount.toLocaleString("zh-CN")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{row.successRate}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-xs font-medium text-primary">{intl.get("common.drillDown")}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {rangeValid && totalRows > 0 && !loading ? (
          <TablePagination
            className="mt-6"
            page={safePage}
            pageSize={pageSize}
            total={totalRows}
            onPageChange={setPage}
          />
        ) : null}
      </section>

      {drillRow && (
        <>
          <button
            type="button"
            aria-label={intl.get("agentCostDetail.closeDrill")}
            className="fixed inset-0 z-40 bg-gray-900/40 transition-opacity duration-200"
            onClick={() => setDrillRow(null)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{intl.get("agentCostDetail.drillTitle")}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{drillRow.agent}</p>
                <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">{drillRow.agentId}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {intl.get("agentCostDetail.drillInfo", {
                    totalCost: drillRow.totalCost,
                    callCount: drillRow.callCount.toLocaleString("zh-CN"),
                    successRate: drillRow.successRate,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillRow(null)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label={intl.get("common.close")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">{intl.get("agentCostDetail.drillDesc")}</p>
              <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-900/50">
                      <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">{intl.get("agentCostDetail.segment")}</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">Token</th>
                      <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">{intl.get("agentCostDetail.share")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {drillItems.map((d, idx) => (
                      <tr key={d.segment} className={idx % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-900/30" : "bg-white dark:bg-gray-950"}>
                        <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">{d.segment}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200">{d.tokens}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-400">{d.pct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
