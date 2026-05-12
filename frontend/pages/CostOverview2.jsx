import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import SortableTableTh from "../components/SortableTableTh.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../components/TablePagination.jsx";
import CostTimeRangeFilter from "../components/CostTimeRangeFilter.jsx";
import intl from "react-intl-universal";

function pad2(n) { return String(n).padStart(2, "0"); }

function fmtDate(dStr) {
  if (!dStr) return "—";
  const d = new Date(dStr.replace(" ", "T"));
  if (isNaN(d.getTime())) return dStr;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtTokens(n) {
  const x = Math.round(Number(n) || 0);
  if (x >= 1e9) { const v = x / 1e9; return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}B`; }
  if (x >= 1e6) { const v = x / 1e6; return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`; }
  if (x >= 1e3) { const v = x / 1e3; return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}K`; }
  return String(x);
}

function fmtCost(v) {
  if (v === undefined || v === null) return "—";
  return `¥${Number(v).toFixed(4)}`;
}

const STATUS_MAP = {
  normal: { labelKey: "costOverview2.status.normal", color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50/50 dark:bg-emerald-950/20", border: "border-emerald-100 dark:border-emerald-900/30" },
  loop: { labelKey: "costOverview2.status.loop", color: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50/50 dark:bg-rose-950/20", border: "border-rose-100 dark:border-rose-900/30" },
  interruption: { labelKey: "costOverview2.status.interruption", color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50/50 dark:bg-amber-950/20", border: "border-amber-100 dark:border-amber-900/30" },
  error: { labelKey: "costOverview2.status.error", color: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50/50 dark:bg-rose-950/20", border: "border-rose-100 dark:border-rose-900/30" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.normal;
  return (
    <div className={`flex items-center gap-2 whitespace-nowrap text-xs font-medium ${cfg.text}`}>
      <span className={`h-2 w-2 rounded-full ${cfg.color} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />
      {intl.get(cfg.labelKey)}
    </div>
  );
}

function DiagnosticPanel({ row }) {
  const inputRatio = row.totalTokens > 0 ? Math.round((row.inputTokens / row.totalTokens) * 100) : 0;
  const outputRatio = 100 - inputRatio;
  const cfg = STATUS_MAP[row.status] || STATUS_MAP.normal;

  return (
    <div className="animate-in fade-in slide-in-from-top-2 space-y-4 px-6 py-5 duration-300">
      {/* A. Anomaly Summary Banner — Full Width */}
      <div className={`flex items-center gap-3 rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-2.5`}>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${cfg.color} text-white`}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={`font-bold ${cfg.text}`}>{intl.get(cfg.labelKey)}</span>
          <span className="h-3 w-px bg-gray-300 dark:bg-gray-700" />
          <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
            <span>{intl.get("costOverview2.diagnosticPanel.stopReason")}: <b className="text-gray-900 dark:text-gray-100">{row.stopReason || "—"}</b></span>
            <span>{intl.get("costOverview2.diagnosticPanel.interactionSteps")}: <b className="text-gray-900 dark:text-gray-100">{row.stepCount}</b></span>
            <span>{intl.get("costOverview2.diagnosticPanel.duration")}: <b className="text-gray-900 dark:text-gray-100">{row.duration}s</b></span>
          </div>
        </div>
      </div>

      {/* B. Content Area: 80% Data | 20% Actions */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        {/* Left Part: Data Display (80%) */}
        <div className="flex-1 lg:w-4/5">
          <div className="grid grid-cols-3 gap-4">
            {/* Input Tokens */}
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{intl.get("costOverview2.diagnosticPanel.inputToken")}</span>
                <span className="text-xs font-bold text-blue-500">{inputRatio}%</span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{fmtTokens(row.inputTokens)}</div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${inputRatio}%` }} />
              </div>
            </div>

            {/* Output Tokens */}
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{intl.get("costOverview2.diagnosticPanel.outputToken")}</span>
                <span className="text-xs font-bold text-emerald-500">{outputRatio}%</span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{fmtTokens(row.outputTokens)}</div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${outputRatio}%` }} />
              </div>
            </div>

            {/* Estimated Cost */}
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{intl.get("costOverview2.diagnosticPanel.estimatedCost")}</span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{fmtCost(row.costYuan)}</div>
              <div className="text-[10px] text-gray-400">{intl.get("costOverview2.diagnosticPanel.pricingStrategy")}</div>
            </div>
          </div>
        </div>

        {/* Vertical Divider (Matching content height via self-stretch) */}
        <div className="hidden self-stretch w-px bg-gray-200 dark:bg-gray-800 lg:block shrink-0" />

        {/* Right Part: Actions (20%) */}
        <div className="flex flex-col items-center justify-center space-y-4 lg:w-1/5 py-2">
          <div className="flex w-full flex-col items-center gap-1.5">
             <button
                onClick={() => window.dispatchEvent(new CustomEvent("openclaw-nav", { detail: { id: "session-audit", params: { sessionId: row.session_id } } }))}
                className="group flex w-full max-w-[200px] items-center justify-between rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-white dark:bg-primary/20 dark:text-blue-400 dark:hover:bg-primary dark:hover:text-white"
             >
                <div className="flex items-center gap-2.5">
                   <svg className="h-4 w-4 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
                   <span className="truncate">{intl.get("costOverview2.diagnosticPanel.viewJson")}</span>
                </div>
                <svg className="h-3.5 w-3.5 shrink-0 transition-all group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiSelectFilter({ label, options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);

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
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
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

function SessionRow({ row, i, isExpanded, onToggle }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={[
          "group cursor-pointer transition-colors hover:bg-primary-soft/30 dark:hover:bg-primary/10",
          i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/30" : "bg-white dark:bg-gray-900",
          isExpanded ? "!bg-primary-soft/40 dark:!bg-primary/20" : "",
        ].join(" ")}
      >
        <td className={`whitespace-nowrap px-4 py-3 transition-all ${isExpanded ? "border-l-4 border-primary" : "border-l-4 border-transparent"}`}>
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center gap-2">
              <span className={`font-mono text-xs font-bold ${isExpanded ? "text-primary" : "text-gray-900 dark:text-gray-100"}`}>
                {row.session_id}
              </span>
              <svg
                className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180 text-primary" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="mt-1">
              <span className="font-mono text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-700">
                {row.agentName}
              </span>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
          {fmtDate(row.createTime)}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {row.userName}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
          {row.gateway}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
          {row.model}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
          {fmtTokens(row.totalTokens)}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-primary-soft/40 dark:bg-primary/20 border-l-4 border-primary">
             <DiagnosticPanel row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function CostOverview2({ params }) {
  const [filters, setFilters] = useState({
    timePreset: 7,
    agents: params?.agents || [],
    users: [],
    gateways: [],
    models: params?.model ? [params.model] : [],
    statuses: params?.status ? [params.status] : [],
    sessionId: "",
  });

  useEffect(() => {
    if (params) {
      setFilters(f => {
        const next = {
          ...f,
          agents: [],
          users: [],
          gateways: [],
          models: [],
          statuses: [],
          sessionId: "",
        };
        // If drill-down params are provided, they take precedence
        if (params.agents) {
          next.agents = params.agents;
        }
        if (params.model) {
          next.models = [params.model];
        }
        if (params.status) {
          next.statuses = [params.status];
        }
        return next;
      });
    }
  }, [params]);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("totalTokens");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [agentOptions, setAgentOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [gatewayOptions, setGatewayOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);

  const pageSize = DEFAULT_TABLE_PAGE_SIZE;

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
      if (filters.statuses.length) qs.set("statuses", filters.statuses.join(","));
      if (filters.sessionId) qs.set("sessionId", filters.sessionId);

      const r = await fetch(`/api/session-cost-detail?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setTotal(Number(j.total) || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [effectiveTimeBounds, page, sortKey, sortOrder, filters.agents, filters.users, filters.gateways, filters.models, filters.statuses, filters.sessionId, pageSize]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters.timePreset, filters.agents, filters.users, filters.gateways, filters.models, filters.statuses, filters.sessionId]);

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

  const handlePreset = (days) => setFilters((f) => ({ ...f, timePreset: days, rangeStart: "", rangeEnd: "" }));
  const handleRangeChange = (start, end) => setFilters((f) => ({ ...f, rangeStart: start || "", rangeEnd: end || "", timePreset: start && end ? null : f.timePreset }));
  const handleMultiChange = (key) => (values) => setFilters((f) => ({ ...f, [key]: values }));

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = total === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {err}
        </div>
      )}

      <CostTimeRangeFilter activeDays={filters.timePreset} onPreset={handlePreset} rangeStart={filters.rangeStart} rangeEnd={filters.rangeEnd} onRangeChange={handleRangeChange} />

      <div className="app-card overflow-hidden border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-6">
          <div className="relative min-w-[240px] max-w-sm">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder={intl.get("costOverview2.sessionId")}
              value={filters.sessionId}
              onChange={(e) => setFilters(f => ({ ...f, sessionId: e.target.value }))}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-3 text-xs transition-all focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter label={intl.get("costOverview2.agent")} options={agentOptions} value={filters.agents} onChange={handleMultiChange("agents")} placeholder={intl.get("costOverview2.allAgent")} />
            <MultiSelectFilter label={intl.get("costOverview2.user")} options={userOptions} value={filters.users} onChange={handleMultiChange("users")} placeholder={intl.get("costOverview2.allUser")} />
            <MultiSelectFilter label={intl.get("costOverview2.gateway")} options={gatewayOptions} value={filters.gateways} onChange={handleMultiChange("gateways")} placeholder={intl.get("costOverview2.allGateway")} />
            <MultiSelectFilter label={intl.get("costOverview2.model")} options={modelOptions} value={filters.models} onChange={handleMultiChange("models")} placeholder={intl.get("costOverview2.allModel")} />
            <MultiSelectFilter 
              label={intl.get("costOverview2.status")} 
              options={Object.keys(STATUS_MAP).map(k => ({ value: k, label: intl.get(STATUS_MAP[k].labelKey) }))} 
              value={filters.statuses} 
              onChange={handleMultiChange("statuses")} 
              placeholder={intl.get("costOverview2.allStatus")} 
            />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingSpinner message={intl.get("costOverview2.loadingSession")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50">
                    <SortableTableTh label={intl.get("costOverview2.sessionId")} columnKey="session_id" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} className="text-center" />
                    <SortableTableTh label={intl.get("costOverview2.createTime")} columnKey="createTime" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableTableTh label={intl.get("costOverview2.user")} columnKey="userName" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableTableTh label={intl.get("costOverview2.gateway")} columnKey="gateway" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableTableTh label={intl.get("costOverview2.model")} columnKey="model" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableTableTh label={intl.get("costOverview2.status")} columnKey="status" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableTableTh label={intl.get("costOverview2.totalToken")} columnKey="totalTokens" sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} numeric />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("costOverview2.noSessionData")}</td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <SessionRow
                        key={row.session_id}
                        row={row}
                        i={i}
                        isExpanded={expandedId === row.session_id}
                        onToggle={() => setExpandedId(expandedId === row.session_id ? null : row.session_id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-6">
              <TablePagination page={safePage} pageSize={pageSize} total={total} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
