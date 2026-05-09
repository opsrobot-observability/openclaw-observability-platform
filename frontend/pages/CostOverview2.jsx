import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import SortableTableTh from "../components/SortableTableTh.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../components/TablePagination.jsx";
import CostTimeRangeFilter from "../components/CostTimeRangeFilter.jsx";
import intl from "react-intl-universal";

function pad2(n) { return String(n).padStart(2, "0"); }

function toDatetimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtTokens(n) {
  const x = Math.round(Number(n) || 0);
  if (x >= 1e9) { const v = x / 1e9; return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}B`; }
  if (x >= 1e6) { const v = x / 1e6; return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`; }
  if (x >= 1e3) { const v = x / 1e3; return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}K`; }
  return String(x);
}

function fmtCost(v) {
  if (!v) return "—";
  return `¥${Number(v).toFixed(4)}`;
}

function MultiSelectFilter({ label, options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const displayLabel = () => {
    if (!value || value.length === 0) return placeholder || intl.get("costOverview2.selectLabel", { label });
    if (value.length === 1) return options.find((o) => o.value === value[0])?.label || value[0];
    return intl.get("costOverview2.selectedCount", { count: value.length, label });
  };

  const toggle = (v) => {
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(next);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
          value && value.length > 0
            ? "border-primary bg-primary-soft text-primary dark:bg-primary/20"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600",
        ].join(" ")}
      >
        <span>{label}：{displayLabel()}</span>
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="p-2">
            <input
              type="text"
              placeholder={intl.get("costOverview2.searchLabel", { label })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="app-input w-full px-2 py-1 text-xs"
            />
          </div>
          <div className="max-h-52 overflow-y-auto border-t border-gray-100 p-1 dark:border-gray-700">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full rounded-md px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {intl.get("common.all")}
            </button>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={[
                  "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition",
                  value.includes(o.value)
                    ? "bg-primary-soft/60 text-primary dark:bg-primary/20"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800",
                ].join(" ")}
              >
                <span className={[
                  "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                  value.includes(o.value)
                    ? "border-primary bg-primary text-white"
                    : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800",
                ].join(" ")}
                >
                  {value.includes(o.value) && (
                    <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-gray-400">{intl.get("costOverview2.noMatchItem")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CostOverview2({ params } = {}) {
  const [filters, setFilters] = useState({
    timePreset: 7,
    timeStart: "",
    timeEnd: "",
    rangeStart: "",
    rangeEnd: "",
    agents: [],
    users: [],
    gateways: [],
    models: [],
  });

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("totalTokens");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Option lists (populated from API)
  const [agentOptions, setAgentOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [gatewayOptions, setGatewayOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);

  const pageSize = DEFAULT_TABLE_PAGE_SIZE;

  // Compute effective time bounds
  const effectiveTimeBounds = useMemo(() => {
    const now = new Date();
    if (filters.rangeStart && filters.rangeEnd) {
      const s = new Date(filters.rangeStart);
      const e = new Date(filters.rangeEnd);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        return { startDay: s.toISOString().slice(0, 10), endDay: e.toISOString().slice(0, 10) };
      }
    }
    const days = Number(filters.timePreset ?? 7);
    const endDay = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - days * 86400000);
    const startDay = start.toISOString().slice(0, 10);
    return { startDay, endDay };
  }, [filters.timePreset, filters.rangeStart, filters.rangeEnd]);

  // Load filter options
  useEffect(() => {
    if (!effectiveTimeBounds) return;
    const { startDay, endDay } = effectiveTimeBounds;
    const qs = new URLSearchParams({ startDay, endDay, limit: "50" });
    fetch(`/api/session-cost-options?${qs}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setAgentOptions((data.agents || []).map((v) => ({ value: v, label: v })));
        setUserOptions((data.users || []).map((v) => ({ value: v, label: v })));
        setGatewayOptions((data.gateways || []).map((v) => ({ value: v, label: v })));
        setModelOptions((data.models || []).map((v) => ({ value: v, label: v })));
      })
      .catch(() => { });
  }, [effectiveTimeBounds]);

  // Load data
  const load = useCallback(async () => {
    if (!effectiveTimeBounds) return;
    const { startDay, endDay } = effectiveTimeBounds;
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({
        startDay,
        endDay,
        page: String(page),
        pageSize: String(pageSize),
        sortKey,
        sortOrder,
      });
      if (filters.agents.length) qs.set("agents", filters.agents.join(","));
      if (filters.users.length) qs.set("users", filters.users.join(","));
      if (filters.gateways.length) qs.set("gateways", filters.gateways.join(","));
      if (filters.models.length) qs.set("models", filters.models.join(","));

      const r = await fetch(`/api/session-cost-detail?${qs}`);
      const text = await r.text();
      if (!r.ok) {
        let msg = text;
        try { const j = JSON.parse(text); if (j?.error) msg = j.error; } catch { }
        throw new Error(msg || `HTTP ${r.status}`);
      }
      const j = JSON.parse(text);
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setTotal(Number(j.total) || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [effectiveTimeBounds, page, sortKey, sortOrder, filters.agents, filters.users, filters.gateways, filters.models, pageSize]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filters.timePreset, filters.rangeStart, filters.rangeEnd, filters.agents, filters.users, filters.gateways, filters.models]);

  useEffect(() => {
    if (!params) return;
    setFilters((f) => {
      const next = { ...f, agents: [], users: [], gateways: [], models: [] };
      if (params.agents?.length) next.agents = params.agents;
      if (params.model) next.models = [params.model];
      return next;
    });
  }, [params]);

  const handleSort = (key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortOrder((o) => o === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortOrder("desc");
      return key;
    });
  };

  const handlePreset = (p) => {
    const days = p?.days ?? 7;
    setFilters((f) => ({ ...f, timePreset: days, rangeStart: "", rangeEnd: "" }));
  };
  const handleRangeChange = (start, end) =>
    setFilters((f) => ({
      ...f,
      rangeStart: start || "",
      rangeEnd: end || "",
      timePreset: start && end ? null : f.timePreset ?? 7,
    }));

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = total === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  const handleMultiChange = (key) => (values) => {
    setFilters((f) => ({ ...f, [key]: values }));
  };

  return (
    <div className="space-y-4">
      {err ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {err}
        </div>
      ) : null}

      <CostTimeRangeFilter
        activeDays={filters.timePreset}
        onPreset={handlePreset}
        rangeStart={filters.rangeStart}
        rangeEnd={filters.rangeEnd}
        onRangeChange={handleRangeChange}
      />

      {/* 表格 */}
      <div className="app-card overflow-hidden">
        {/* 表头：标题 + 筛选同一行 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("costOverview2.title")}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Agent"
              options={agentOptions}
              value={filters.agents}
              onChange={handleMultiChange("agents")}
              placeholder={intl.get("costOverview2.allAgent")}
            />
            <MultiSelectFilter
              label={intl.get("costOverview2.user")}
              options={userOptions}
              value={filters.users}
              onChange={handleMultiChange("users")}
              placeholder={intl.get("costOverview2.allUser")}
            />
            <MultiSelectFilter
              label="Gateway"
              options={gatewayOptions}
              value={filters.gateways}
              onChange={handleMultiChange("gateways")}
              placeholder={intl.get("costOverview2.allGateway")}
            />
            <MultiSelectFilter
              label={intl.get("costOverview2.model")}
              options={modelOptions}
              value={filters.models}
              onChange={handleMultiChange("models")}
              placeholder={intl.get("costOverview2.allModel")}
            />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingSpinner message={intl.get("costOverview2.loadingSession")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-900/50">
                    <SortableTableTh label={intl.get("costOverview2.sessionId")} columnKey="session_id" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[160px]" />
                    <SortableTableTh label={intl.get("costOverview2.agent")} columnKey="agentName" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[120px]" />
                    <SortableTableTh label={intl.get("costOverview2.user")} columnKey="userName" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[100px]" />
                    <SortableTableTh label={intl.get("costOverview2.gateway")} columnKey="gateway" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[100px]" />
                    <SortableTableTh label={intl.get("costOverview2.model")} columnKey="model" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[120px]" />
                    <SortableTableTh label={intl.get("costOverview2.totalToken")} columnKey="totalTokens" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[90px] text-right" numeric />
                    <SortableTableTh label={intl.get("costOverview2.inputToken")} columnKey="inputTokens" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[90px] text-right" numeric />
                    <SortableTableTh label={intl.get("costOverview2.outputToken")} columnKey="outputTokens" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[90px] text-right" numeric />
                    <SortableTableTh label={intl.get("costOverview2.cost")} columnKey="costYuan" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[90px] text-right" numeric />
                    <SortableTableTh label={intl.get("costOverview2.createTime")} columnKey="createTime" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="w-[150px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {!effectiveTimeBounds ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                        {intl.get("common.selectTimeRange")}
                      </td>
                    </tr>
                  ) : rows.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        {intl.get("costOverview2.noSessionData")}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <tr
                        key={row.session_id}
                        className={[
                          "transition-colors hover:bg-primary-soft/30 dark:hover:bg-primary/10",
                          i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/30" : "",
                        ].join(" ")}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-primary">{row.session_id}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-200">{row.agentName || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{row.userName || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{row.gateway || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{row.model || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{fmtTokens(row.totalTokens)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-primary dark:text-blue-300">{fmtTokens(row.inputTokens)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fmtTokens(row.outputTokens)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{fmtCost(row.costYuan)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{row.createTime || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-6">
                <TablePagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
