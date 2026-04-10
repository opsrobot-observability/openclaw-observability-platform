import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import intl from "react-intl-universal";
import CostTimeRangeFilter from "../../components/CostTimeRangeFilter.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../components/TablePagination.jsx";
import { dedupeEmployeesBySessionKey, rowSessionKey } from "../../lib/digitalEmployeeRows.js";

/** 版本 1.0.1 */
function fmtPct(x) {
  if (x == null || Number.isNaN(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(1)}%`;
}

/** 版本 1.0.1 */
function fmtUsd(x) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  return `$${Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 版本 1.0.1 */
function fmtDurationMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  const n = Number(ms);
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60000) return `${(n / 1000).toFixed(1)} s`;
  return `${(n / 60000).toFixed(1)} min`;
}

/** 版本 1.0.1 */
function fmtTime(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return "—";
  try {
    return new Date(Number(ms)).toLocaleString("zh-CN");
  } catch {
    return "—";
  }
}

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

/** 与「数字员工概览」O1 健康分档色点一致 */
const O1_HEALTH_TIER_COLORS = { green: "#10b981", yellow: "#f59e0b", red: "#f43f5e" };

const RUN_OVERVIEW_TOKEN_PIE_COLORS = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#6366f1", "#14b8a6", "#eab308", "#94a3b8"];

/** 与概览在线口径一致：最近 15 分钟内有会话更新视为在线 */
function isEmployeeOnlineFromLastUpdated(lastUpdatedAt) {
  const u = Number(lastUpdatedAt) || 0;
  if (!u) return false;
  return Date.now() - u <= ONLINE_WINDOW_MS;
}

const HEALTH_ORDER = { green: 0, yellow: 1, red: 2, unknown: 3 };

/** 列表「安全风险评分」着色：分数越高风险越大 */
function riskScoreClass(score) {
  if (score == null || !Number.isFinite(Number(score))) return "text-gray-600 dark:text-gray-300";
  const n = Number(score);
  if (n >= 70) return "font-semibold text-rose-600 dark:text-rose-300";
  if (n >= 45) return "text-amber-600 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-400";
}

function numOrNull(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

function sortEmployees(list, sortKey, sortDir) {
  const desc = sortDir === "desc";
  const tieName = (a, b) => a.agentName.localeCompare(b.agentName, "zh-CN");

  /** 数值列：降序为大值在前，升序为小值在前 */
  const cmpNum = (va, vb, a, b) => {
    if (va == null && vb == null) return tieName(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va !== vb) return desc ? vb - va : va - vb;
    return tieName(a, b);
  };

  return [...list].sort((a, b) => {
    if (sortKey === "name") {
      const c = tieName(a, b);
      if (c !== 0) return desc ? -c : c;
      const ka = rowSessionKey(a);
      const kb = rowSessionKey(b);
      const kc = ka.localeCompare(kb, "zh-CN");
      return desc ? -kc : kc;
    }
    if (sortKey === "health") {
      const va = HEALTH_ORDER[a.healthOverall] ?? 99;
      const vb = HEALTH_ORDER[b.healthOverall] ?? 99;
      return cmpNum(va, vb, a, b);
    }
    if (sortKey === "success") {
      return cmpNum(numOrNull(a.successRate), numOrNull(b.successRate), a, b);
    }
    if (sortKey === "cost") {
      return cmpNum(numOrNull(a.totalCostUsd), numOrNull(b.totalCostUsd), a, b);
    }
    if (sortKey === "p95") {
      return cmpNum(numOrNull(a.p95DurationMs), numOrNull(b.p95DurationMs), a, b);
    }
    if (sortKey === "tokens") {
      return cmpNum(numOrNull(a.totalTokens), numOrNull(b.totalTokens), a, b);
    }
    if (sortKey === "security") {
      return cmpNum(numOrNull(a.securityRiskScore), numOrNull(b.securityRiskScore), a, b);
    }
    if (sortKey === "composite") {
      return cmpNum(numOrNull(a.compositeScore), numOrNull(b.compositeScore), a, b);
    }
    if (sortKey === "unitCost") {
      return cmpNum(numOrNull(a.costPerSuccessfulUsd), numOrNull(b.costPerSuccessfulUsd), a, b);
    }
    return 0;
  });
}

function riskBucket(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "unknown";
  if (n >= 70) return "high";
  if (n >= 45) return "medium";
  return "low";
}

function drillNav(targetId, storageEntries) {
  try {
    for (const [k, v] of storageEntries) {
      sessionStorage.setItem(k, v);
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("openclaw-nav", { detail: { id: targetId } }));
}

const TAB_IDS = [
  { id: "runtimeOverview", labelKey: "digitalEmployee.portrait.tab.runtimeOverview" },
  { id: "userPortrait", labelKey: "digitalEmployee.portrait.tab.userPortrait" },
  { id: "sessionExecution", labelKey: "digitalEmployee.portrait.tab.sessionExecution" },
  { id: "toolExecution", labelKey: "digitalEmployee.portrait.tab.toolExecution" },
  { id: "skillSituation", labelKey: "digitalEmployee.portrait.tab.skillSituation" },
  { id: "cost", labelKey: "digitalEmployee.portrait.tab.cost" },
  { id: "securityRisk", labelKey: "digitalEmployee.portrait.tab.securityRisk" },
];

/**
 * 数字员工：列表 KPI + 明细 + Tab（对接 /api/digital-employees/profile）
 * 版本 1.0.1
 */
export default function DigitalEmployeePortrait() {
  const [queryMode, setQueryMode] = useState(() => ({ type: "days", days: 7 }));
  const [overview, setOverview] = useState(null);
  const [overviewErr, setOverviewErr] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [listSearch, setListSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const [detailAgent, setDetailAgent] = useState(null);
  /** 左侧列表唯一选中键（当前口径优先 agent_name） */
  const [selectedSessionKey, setSelectedSessionKey] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileErr, setProfileErr] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("runtimeOverview");
  /** 页面级 Tab：运行概览（聚合 O1）| 运行详情（双栏画像） */
  const [pageTab, setPageTab] = useState("runOverview");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("digital-employee:focusAgent");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.sessionKey != null && String(p.sessionKey).trim()) {
        setSelectedSessionKey(String(p.sessionKey).trim());
      }
      if (p.agentName) {
        setDetailAgent(String(p.agentName));
        setPageTab("overview");
      }
      if (p.hours != null && Number.isFinite(Number(p.hours))) {
        setQueryMode({ type: "hours", hours: Number(p.hours) });
      } else if (p.days != null && Number.isFinite(Number(p.days))) {
        setQueryMode({ type: "days", days: Number(p.days) });
      }
      sessionStorage.removeItem("digital-employee:focusAgent");
    } catch {
      /* ignore */
    }
  }, []);

  const overviewUrl = useMemo(
    () =>
      queryMode.type === "hours"
        ? `/api/digital-employees/overview?hours=${queryMode.hours}`
        : `/api/digital-employees/overview?days=${queryMode.days}`,
    [queryMode],
  );

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    fetch(overviewUrl)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setOverview(d);
          setOverviewErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setOverview(null);
          setOverviewErr(e.message || String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overviewUrl]);

  const profileUrl = useMemo(() => {
    if (!detailAgent) return null;
    const enc = encodeURIComponent(detailAgent);
    const base =
      queryMode.type === "hours"
        ? `/api/digital-employees/profile?agentName=${enc}&hours=${queryMode.hours}`
        : `/api/digital-employees/profile?agentName=${enc}&days=${queryMode.days}`;
    if (selectedSessionKey) return `${base}&sessionKey=${encodeURIComponent(selectedSessionKey)}`;
    return base;
  }, [detailAgent, queryMode, selectedSessionKey]);

  useEffect(() => {
    if (!profileUrl) {
      setProfile(null);
      setProfileErr(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    fetch(profileUrl)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setProfile(d);
          setProfileErr(null);
          setActiveTab("runtimeOverview");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setProfile(null);
          setProfileErr(e.message || String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileUrl]);

  // 列表：接口 `o3_employees` 为明细行；按 agent_name 去重，避免同一员工多行
  const employees = useMemo(
    () => dedupeEmployeesBySessionKey(overview?.o3_employees ?? overview?.agents ?? []),
    [overview],
  );
  const filteredList = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return employees.filter((a) => {
      if (channelFilter && !(a.channels ?? []).some((c) => c?.name === channelFilter)) return false;
      if (riskFilter && riskBucket(a.securityRiskScore) !== riskFilter) return false;
      if (providerFilter && String(a.dominantModelProvider ?? "") !== providerFilter) return false;
      if (!q) return true;
      const hay = [
        a.agentName,
        rowSessionKey(a),
        a.displayLabel,
        a.tagsDisplay,
        a.dominantModelProvider,
        a.dominantModelName,
        a.models?.[0]?.name,
        a.channels?.map((c) => c.name).join(" "),
        a.chatTypeTop,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [employees, listSearch, channelFilter, riskFilter, providerFilter]);

  const sortedList = useMemo(() => sortEmployees(filteredList, sortKey, sortDir), [filteredList, sortKey, sortDir]);
  const totalPages = sortedList.length === 0 ? 0 : Math.ceil(sortedList.length / pageSize);
  const pageSafe = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const pagedList = useMemo(() => {
    if (sortedList.length === 0) return [];
    const start = (pageSafe - 1) * pageSize;
    return sortedList.slice(start, start + pageSize);
  }, [sortedList, pageSafe, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [listSearch, channelFilter, riskFilter, providerFilter, sortKey, sortDir, pageSize]);

  const openDetail = useCallback((row) => {
    const name = String(row?.agentName ?? row?.employeeKey ?? row?.displayLabel ?? "").trim();
    const sk = rowSessionKey(row);
    if (!name) return;
    setProfile(null);
    setProfileErr(null);
    setDetailAgent(name);
    setSelectedSessionKey(sk || null);
    setPageTab("overview");
  }, []);

  useEffect(() => {
    if (pageTab !== "overview") return;
    if (overviewLoading || overviewErr) return;
    if (sortedList.length === 0) {
      if (detailAgent != null || selectedSessionKey != null) {
        setDetailAgent(null);
        setSelectedSessionKey(null);
        setProfile(null);
        setProfileErr(null);
      }
      return;
    }

    const rowByKey = selectedSessionKey
      ? sortedList.find((r) => rowSessionKey(r) === selectedSessionKey)
      : null;
    if (rowByKey) {
      const n = String(rowByKey.agentName || "").trim();
      if (n && n !== detailAgent) setDetailAgent(n);
      return;
    }

    const rowByAgent =
      detailAgent != null
        ? sortedList.find((r) => String(r.agentName || "") === String(detailAgent))
        : null;
    if (rowByAgent) {
      openDetail(rowByAgent);
      return;
    }

    openDetail(sortedList[0]);
  }, [pageTab, overviewLoading, overviewErr, sortedList, selectedSessionKey, detailAgent, openDetail]);

  const o1 = overview?.o1_summary;
  const agentsAggregated = useMemo(() => overview?.agentsAggregated ?? [], [overview]);

  const drillRunOverviewAgent = useCallback(
    (agentNameRaw) => {
      const n = String(agentNameRaw ?? "").trim();
      if (!n) return;
      const row =
        sortedList.find((r) => String(r.agentName ?? "").trim() === n) ??
        employees.find((r) => String(r.agentName ?? "").trim() === n);
      if (row) openDetail(row);
    },
    [sortedList, employees, openDetail],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-8">
      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label={intl.get("digitalEmployee.portrait.pageTab.ariaLabel")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={pageTab === "runOverview"}
            onClick={() => setPageTab("runOverview")}
            className={[
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              pageTab === "runOverview"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
            ].join(" ")}
          >
            {intl.get("digitalEmployee.portrait.pageTab.runOverview")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageTab === "overview"}
            onClick={() => setPageTab("overview")}
            className={[
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              pageTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
            ].join(" ")}
          >
            {intl.get("digitalEmployee.portrait.pageTab.overview")}
          </button>
        </nav>
      </div>

      <CostTimeRangeFilter
        activeDays={queryMode.type === "days" ? queryMode.days : 7}
        onPreset={(d) => setQueryMode({ type: "days", days: d })}
      />
      {queryMode.type === "hours" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {intl.get("digitalEmployee.portrait.window.hours", { hours: queryMode.hours })}
        </p>
      )}

      {pageTab === "runOverview" && (
        <PortraitPageRunOverview
          overviewLoading={overviewLoading}
          overviewErr={overviewErr}
          overview={overview}
          onDrillAgentName={drillRunOverviewAgent}
        />
      )}

      {pageTab === "overview" && (
      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(300px,24rem)_minmax(0,1fr)]">
        <aside className="min-h-0">
          <div className="app-card flex h-full min-h-[420px] flex-col p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.employeeList.title")}</p>
            </div>
            {overviewLoading && (
              <div className="flex flex-1 items-center justify-center py-10">
                <LoadingSpinner />
              </div>
            )}
            {!overviewLoading && overviewErr && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400">
                {overviewErr}
              </div>
            )}
            {!overviewLoading && !overviewErr && overview && (
              <>
                {pagedList.length === 0 ? (
                  <div className="min-h-0 flex-1">
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      {intl.get("digitalEmployee.portrait.list.noMatch")}
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {pagedList.map((a, idx) => {
                      const rk = rowSessionKey(a);
                      const isActive = Boolean(selectedSessionKey && rk && selectedSessionKey === rk);
                      const modelName = a.dominantModelName ?? a.models?.[0]?.name ?? "—";
                      const online = isEmployeeOnlineFromLastUpdated(a.lastUpdatedAt);
                      return (
                        <button
                          key={rk || `row-${a.agentName}-${idx}`}
                          type="button"
                          onClick={() => openDetail(a)}
                          aria-pressed={isActive}
                          className={[
                            "w-full rounded-xl border px-3 py-3 text-left transition",
                            isActive
                              ? "border-primary/30 bg-primary-soft/70 ring-1 ring-primary/20"
                              : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800/60",
                          ].join(" ")}
                        >
                          <div className="min-w-0 w-full">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{a.agentName}</p>
                              <span
                                className={[
                                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                                  online
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-300",
                                ].join(" ")}
                              >
                                {online ? intl.get("digitalEmployee.portrait.status.online") : intl.get("digitalEmployee.portrait.status.offline")}
                              </span>
                            </div>
                          </div>
                          {rk ? (
                            <p className="mt-2 max-h-[4.5rem] overflow-y-auto font-mono text-[10px] leading-snug text-gray-600 break-all dark:text-gray-400">
                              {rk}
                            </p>
                          ) : (
                            <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">{intl.get("digitalEmployee.portrait.list.noSessionKey")}</p>
                          )}
                          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {(a.chatTypeTop ?? "—") + " · " + (a.channels?.[0]?.name ?? "—")}
                          </p>
                          <p className="mt-1 line-clamp-2 break-all font-mono text-[11px] text-gray-500 dark:text-gray-400">{modelName}</p>
                          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                            {intl.get("digitalEmployee.portrait.list.tokenCost", { tokens: (a.totalTokens ?? 0).toLocaleString(), cost: o1?.hasCostData ? fmtUsd(a.totalCostUsd) : "—" })}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                <TablePagination
                  page={pageSafe}
                  pageSize={pageSize}
                  total={sortedList.length}
                  onPageChange={setPage}
                  className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800"
                  trailingControls={
                    <label className="ml-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                      <span className="shrink-0">{intl.get("common.perPage")}</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="app-input min-w-[4.5rem] px-2 py-1.5"
                      >
                        {[10, 20, 50, 100].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0">{intl.get("common.items")}</span>
                    </label>
                  }
                />
              </>
            )}
          </div>
        </aside>

      <section className="min-h-0">
        {!detailAgent && (
          <div className="app-card flex min-h-[420px] items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{intl.get("digitalEmployee.portrait.empty.selectOneSession")}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.empty.sessionKeyRule")}</p>
            </div>
          </div>
        )}
        {detailAgent && (
          <div className="space-y-4">
            {profileLoading && (
              <div className="flex justify-center py-16">
                <LoadingSpinner />
              </div>
            )}
            {profileErr && <div className="app-card p-4 text-sm text-rose-600 dark:text-rose-400">{profileErr}</div>}

            {!profileLoading && !profileErr && profile && (
              <div className="space-y-4">
                <div className="app-card p-0">
                  <div className="flex flex-wrap gap-1 border-b border-gray-200 px-4 dark:border-gray-700" role="tablist" aria-label={intl.get("digitalEmployee.portrait.tab.ariaLabel")}>
                    {TAB_IDS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={[
                          "-mb-px rounded-t-md border px-3 py-2 text-sm font-medium transition",
                          activeTab === t.id
                            ? "border-gray-200 border-b-white bg-white text-primary dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-primary"
                            : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800",
                        ].join(" ")}
                      >
                        {intl.get(t.labelKey)}
                      </button>
                    ))}
                  </div>
                  <div className="p-4">
                    {activeTab === "runtimeOverview" && <TabRuntimeOverview profile={profile} />}
                    {activeTab === "userPortrait" && (profile.tabs?.userPortrait || profile.tabs?.channelAccess) && (
                      <TabUserChannelSection
                        userPortrait={profile.tabs?.userPortrait}
                        channelAccess={profile.tabs?.channelAccess}
                      />
                    )}
                    {activeTab === "sessionExecution" && profile.tabs?.sessionExecution && (
                      <TabSessionExecution data={profile.tabs.sessionExecution} sessionsPreview={profile.sessionsPreview ?? []} />
                    )}
                    {activeTab === "toolExecution" && profile.tabs?.toolExecution && <TabToolExecution data={profile.tabs.toolExecution} />}
                    {activeTab === "skillSituation" && profile.tabs?.skillSituation && <TabSkillSituation data={profile.tabs.skillSituation} />}
                    {activeTab === "cost" && profile.tabs?.cost && <TabCost data={profile.tabs.cost} />}
                    {activeTab === "securityRisk" &&
                      (profile.tabs?.securityRisk ? (
                        <TabSecurityRisk data={profile.tabs.securityRisk} />
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.tabEmpty")}</p>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      </div>
      )}
    </div>
  );
}

function runOverviewRiskLevelLabel(code) {
  if (code === "P0" || code === "P1" || code === "P2") {
    return intl.get(`digitalEmployee.portrait.runOverview.riskLevel.${code}`);
  }
  if (code === "—" || code == null || code === "") return intl.get("digitalEmployee.portrait.runOverview.riskLevel.emDash");
  return String(code);
}

function healthOverallLabelForList(h) {
  if (h === "green") return intl.get("digitalEmployee.overview.health.green");
  if (h === "yellow") return intl.get("digitalEmployee.overview.health.yellow");
  if (h === "red") return intl.get("digitalEmployee.overview.health.red");
  return intl.get("digitalEmployee.overview.health.unknown");
}

/** 页面 Tab「运行概览」：指标卡 + 会话/Token 饼图 + 趋势折线 + 风险表（数据来自 overview.runOverview） */
function PortraitPageRunOverview({ overviewLoading, overviewErr, overview, onDrillAgentName }) {
  const ro = overview?.runOverview;
  const m = ro?.metrics;

  if (overviewLoading) {
    return (
      <div className="app-card flex min-h-[320px] items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }
  if (overviewErr) {
    return (
      <div className="app-card rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400">
        {overviewErr}
      </div>
    );
  }
  if (!overview) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
    );
  }
  if (!m) {
    return (
      <div className="app-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        {intl.get("digitalEmployee.portrait.runOverview.dataMissing")}
      </div>
    );
  }

  const sessionPieData = (ro.sessionPie ?? []).map((x, i) => ({
    name: x.name === "__other__" ? intl.get("digitalEmployee.portrait.runOverview.pieOther") : x.name,
    value: x.value,
    drillAgentName: x.name !== "__other__" && x.name != null && String(x.name).trim() ? String(x.name) : null,
    color: RUN_OVERVIEW_TOKEN_PIE_COLORS[i % RUN_OVERVIEW_TOKEN_PIE_COLORS.length],
  }));

  const tokenPieData = (ro.tokenPie ?? []).map((x, i) => ({
    name: x.name === "__other__" ? intl.get("digitalEmployee.portrait.runOverview.pieOther") : x.name,
    value: x.value,
    drillAgentName: x.name !== "__other__" && x.name != null && String(x.name).trim() ? String(x.name) : null,
    color: RUN_OVERVIEW_TOKEN_PIE_COLORS[i % RUN_OVERVIEW_TOKEN_PIE_COLORS.length],
  }));

  const trendTick = (d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d);

  return (
    <div className="space-y-6">
      <section className="app-card space-y-4 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.sectionMetrics")}</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runOverview.metricEmployeeTotal")}
            value={m.employeeTotal ?? "—"}
            titleVariant="plain"
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runOverview.metricTodayTasks")}
            value={m.todayTotalTasks != null ? Number(m.todayTotalTasks).toLocaleString("zh-CN") : "—"}
            titleVariant="plain"
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runOverview.metricTodaySessions")}
            value={m.todayTotalSessions != null ? Number(m.todayTotalSessions).toLocaleString("zh-CN") : "—"}
            titleVariant="plain"
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runOverview.metricAvgTaskSuccess")}
            value={fmtPct(m.avgTaskSuccessRate)}
            titleVariant="plain"
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runOverview.metricAvgResponse")}
            value={fmtDurationMs(m.avgResponseDurationMs)}
            titleVariant="plain"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.sectionSessionPie")}</h3>
          <div className="mt-2 h-[260px]">
            {sessionPieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sessionPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    onClick={(item) => {
                      const p = item?.payload ?? item;
                      const d = p?.drillAgentName;
                      if (d) onDrillAgentName?.(d);
                    }}
                    cursor="pointer"
                  >
                    {sessionPieData.map((e, i) => (
                      <Cell key={`sess-${e.name}-${i}`} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => (v != null ? Number(v).toLocaleString() : "—")} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.sectionTokenPie")}</h3>
          <div className="mt-2 h-[260px]">
            {tokenPieData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tokenPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    onClick={(item) => {
                      const p = item?.payload ?? item;
                      const d = p?.drillAgentName;
                      if (d) onDrillAgentName?.(d);
                    }}
                    cursor="pointer"
                  >
                    {tokenPieData.map((e, i) => (
                      <Cell key={`tok-${e.name}-${i}`} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtTokenInt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.chartOnlineTrend")}</h3>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.runOverview.chartOnlineTrendHint")}</p>
          <div className="mt-2 h-52">
            {(ro.activeAgentTrendDaily ?? []).length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ro.activeAgentTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={trendTick} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip labelFormatter={(d) => intl.get("digitalEmployee.overview.chart.dateLabel", { date: d })} />
                  <Line type="monotone" dataKey="activeAgents" stroke="#2f6fed" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} name={intl.get("digitalEmployee.portrait.runOverview.metricOnline")} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.chartSessionTrend")}</h3>
          <div className="mt-2 h-52">
            {(ro.sessionTrendDaily ?? []).length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ro.sessionTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={trendTick} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip labelFormatter={(d) => intl.get("digitalEmployee.overview.chart.dateLabel", { date: d })} />
                  <Line type="monotone" dataKey="sessions" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} name={intl.get("digitalEmployee.overview.chart.sessionCount")} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.chartResponseRateTrend")}</h3>
          <div className="mt-2 h-52">
            {(ro.responseRateTrendDaily ?? []).length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ro.responseRateTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={trendTick} />
                  <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                  <Tooltip formatter={(v) => (v == null ? "—" : fmtPct(v))} labelFormatter={(d) => intl.get("digitalEmployee.overview.chart.dateLabel", { date: d })} />
                  <Line type="monotone" dataKey="rate" stroke="#a855f7" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="app-card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.chartTokenTrend")}</h3>
          <div className="mt-2 h-52">
            {(ro.tokenTrendDaily ?? []).length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.pageList.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ro.tokenTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={trendTick} />
                  <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`)} />
                  <Tooltip formatter={(v) => fmtTokenInt(v)} labelFormatter={(d) => intl.get("digitalEmployee.overview.chart.dateLabel", { date: d })} />
                  <Line type="monotone" dataKey="tokens" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.runOverview.tableRiskTitle")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 dark:bg-gray-800/80 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-semibold">{intl.get("digitalEmployee.portrait.runOverview.colAgentName")}</th>
                  <th className="px-4 py-2 font-semibold">{intl.get("digitalEmployee.portrait.runOverview.colRiskSessions")}</th>
                  <th className="px-4 py-2 font-semibold">{intl.get("digitalEmployee.portrait.runOverview.colMaxRisk")}</th>
                  <th className="px-4 py-2 font-semibold">{intl.get("digitalEmployee.portrait.runOverview.colLastRiskAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {(ro.topByRisk ?? []).map((r) => (
                  <tr
                    key={r.employeeKey ?? r.agentName}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    onClick={() => onDrillAgentName?.(r.agentName)}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.agentName}</td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">{r.riskSessionCount ?? 0}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{runOverviewRiskLevelLabel(r.maxRiskLevel)}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{r.lastRiskAt != null ? fmtTime(r.lastRiskAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const RISK_DAILY_COLORS = ["#fb7185", "#6366f1"];

function securityRiskLevelLabel(level) {
  if (level === "high") return intl.get("digitalEmployee.portrait.securityRisk.level.high");
  if (level === "medium") return intl.get("digitalEmployee.portrait.securityRisk.level.medium");
  if (level === "low") return intl.get("digitalEmployee.portrait.securityRisk.level.low");
  return String(level ?? "—");
}

function securityRiskTypeLabel(typeKey) {
  const k = `digitalEmployee.portrait.securityRisk.type.${typeKey}`;
  const t = intl.get(k);
  return t && t !== k ? t : String(typeKey ?? "—");
}

function securityRiskDispositionLabel(d) {
  const k = `digitalEmployee.portrait.securityRisk.disp.${d}`;
  const t = intl.get(k);
  return t && t !== k ? t : String(d ?? "—");
}

function securityRiskAuditCategoryLabel(cat) {
  const k = `digitalEmployee.portrait.securityRisk.cat.${cat}`;
  const t = intl.get(k);
  return t && t !== k ? t : String(cat ?? "—");
}

function securityRiskAuditResultLabel(res) {
  const k = `digitalEmployee.portrait.securityRisk.result.${res}`;
  const t = intl.get(k);
  return t && t !== k ? t : String(res ?? "—");
}

function trend7dLabel(trend) {
  if (trend === "up") return intl.get("digitalEmployee.portrait.securityRisk.trendUp");
  if (trend === "down") return intl.get("digitalEmployee.portrait.securityRisk.trendDown");
  return intl.get("digitalEmployee.portrait.securityRisk.trendFlat");
}

function boolLabel(v) {
  if (v === true) return intl.get("digitalEmployee.portrait.securityRisk.boolYes");
  if (v === false) return intl.get("digitalEmployee.portrait.securityRisk.boolNo");
  return "—";
}

/** 安全与风险：概览、行为记录、敏感审计、策略边界 */
function TabSecurityRisk({ data }) {
  const ov = data?.overview ?? {};
  const comp = ov.compliance ?? {};
  const riskDaily = Array.isArray(data?.riskDaily) ? data.riskDaily : [];
  const records = Array.isArray(data?.riskRecords) ? data.riskRecords : [];
  const audit = Array.isArray(data?.sensitiveAudit) ? data.sensitiveAudit : [];
  const policy = data?.policy ?? {};

  const [levelFilter, setLevelFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dispFilter, setDispFilter] = useState("all");
  const [rangePreset, setRangePreset] = useState("all");

  const rangeStartMs = useMemo(() => {
    const now = Date.now();
    if (rangePreset === "24h") return now - 24 * 3600 * 1000;
    if (rangePreset === "7d") return now - 7 * 24 * 3600 * 1000;
    if (rangePreset === "30d") return now - 30 * 24 * 3600 * 1000;
    return null;
  }, [rangePreset]);

  const typeOptions = useMemo(() => {
    const s = new Set();
    for (const r of records) {
      if (r?.typeKey) s.add(String(r.typeKey));
    }
    return [...s].sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (levelFilter !== "all" && r.level !== levelFilter) return false;
      if (typeFilter !== "all" && String(r.typeKey) !== typeFilter) return false;
      if (dispFilter !== "all" && String(r.disposition) !== dispFilter) return false;
      if (rangeStartMs != null && (Number(r.ts) || 0) < rangeStartMs) return false;
      return true;
    });
  }, [records, levelFilter, typeFilter, dispFilter, rangeStartMs]);

  const trend = ov.trend7d;
  const trendText = trend7dLabel(trend);

  const policyExecRows = [
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.execSecurity"), value: policy.execSecurity ?? "—" },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.execAsk"), value: policy.execAsk ?? "—" },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.elevatedAllowFrom"), value: policy.elevatedAllowFrom ?? "—" },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.sandboxMode"), value: policy.sandboxMode ?? "—" },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.subagentsMaxConcurrent"), value: policy.subagentsMaxConcurrent ?? "—" },
  ];
  const policyFsRows = [
    {
      label: intl.get("digitalEmployee.portrait.securityRisk.label.fsWorkspaceOnly"),
      value: boolLabel(policy.fsWorkspaceOnly),
    },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.workspaceDefault"), value: policy.workspaceDefault ?? "—" },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.openclawPath"), value: policy.openclawPath ?? "—" },
  ];
  const gatewayRows = [
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.gatewayDenyCommandsCount"), value: policy.gatewayDenyCommandsCount ?? "—" },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.gatewayAuthMode"), value: policy.gatewayAuthMode ?? "—" },
    {
      label: intl.get("digitalEmployee.portrait.securityRisk.label.gatewayDenyCommandsList"),
      value:
        Array.isArray(policy.gatewayDenyCommandsList) && policy.gatewayDenyCommandsList.length > 0
          ? policy.gatewayDenyCommandsList.join(" · ")
          : "—",
    },
    { label: intl.get("digitalEmployee.portrait.securityRisk.label.channelGroupPolicy"), value: policy.channelGroupPolicy ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.dataHint")}</p>

      <section>
        <h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.securityRisk.sectionOverview")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.securityRisk.cardRiskSessionTotal")}
            value={ov.riskSessionTotal != null ? ov.riskSessionTotal : "—"}
            hint={intl.get("digitalEmployee.portrait.securityRisk.cardRiskSessionTotalHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.securityRisk.cardTodayRisk")}
            value={ov.todayRiskSessionCount != null ? ov.todayRiskSessionCount : "—"}
            hint={intl.get("digitalEmployee.portrait.securityRisk.cardTodayRiskHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.securityRisk.cardTrend7d")}
            value={trendText}
            hint={intl.get("digitalEmployee.portrait.securityRisk.cardTrend7dHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.securityRisk.cardP0")}
            value={ov.p0Count != null ? ov.p0Count : "—"}
            hint={intl.get("digitalEmployee.portrait.securityRisk.cardP0Hint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.securityRisk.cardP1")}
            value={ov.p1Count != null ? ov.p1Count : "—"}
            hint={intl.get("digitalEmployee.portrait.securityRisk.cardP1Hint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.securityRisk.cardP2p3")}
            value={ov.p2p3Count != null ? ov.p2p3Count : "—"}
            hint={intl.get("digitalEmployee.portrait.securityRisk.cardP2p3Hint")}
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.securityRisk.chartRiskTrendTitle")}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.chartRiskTrendDesc")}</p>
            </div>
            <div className="h-[220px] w-full px-2 py-4 sm:px-4">
              {riskDaily.length === 0 ? (
                <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                  {intl.get("digitalEmployee.portrait.securityRisk.chartEmpty")}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={riskDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={40} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                      formatter={(v, name) => [v, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="riskSessions"
                      stroke={RISK_DAILY_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      name={intl.get("digitalEmployee.portrait.securityRisk.seriesRiskSessions")}
                    />
                    <Line
                      type="monotone"
                      dataKey="riskEvents"
                      stroke={RISK_DAILY_COLORS[1]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      name={intl.get("digitalEmployee.portrait.securityRisk.seriesRiskEvents")}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/55 dark:ring-white/[0.05]">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.securityRisk.sectionCompliance")}</h4>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.unauthorizedOps")}</dt>
                <dd className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{comp.unauthorizedOps ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.sensitiveCommandBlocks")}</dt>
                <dd className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{comp.sensitiveCommandBlocks ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.highRiskUnapproved")}</dt>
                <dd className="tabular-nums font-medium text-gray-900 dark:text-gray-100">
                  {comp.highRiskUnapproved != null ? comp.highRiskUnapproved : intl.get("digitalEmployee.portrait.securityRisk.unavailable")}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.securityRisk.sectionRecords")}
        </h3>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.securityRisk.filterLevel")}</span>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="app-input min-w-[7rem] px-2 py-1.5">
              <option value="all">{intl.get("digitalEmployee.portrait.securityRisk.filterAll")}</option>
              <option value="high">{intl.get("digitalEmployee.portrait.securityRisk.level.high")}</option>
              <option value="medium">{intl.get("digitalEmployee.portrait.securityRisk.level.medium")}</option>
              <option value="low">{intl.get("digitalEmployee.portrait.securityRisk.level.low")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.securityRisk.filterType")}</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="app-input min-w-[9rem] px-2 py-1.5">
              <option value="all">{intl.get("digitalEmployee.portrait.securityRisk.filterAll")}</option>
              {typeOptions.map((tk) => (
                <option key={tk} value={tk}>
                  {securityRiskTypeLabel(tk)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.securityRisk.filterDisposition")}</span>
            <select value={dispFilter} onChange={(e) => setDispFilter(e.target.value)} className="app-input min-w-[7rem] px-2 py-1.5">
              <option value="all">{intl.get("digitalEmployee.portrait.securityRisk.filterAll")}</option>
              <option value="pending">{securityRiskDispositionLabel("pending")}</option>
              <option value="blocked">{securityRiskDispositionLabel("blocked")}</option>
              <option value="allowed">{securityRiskDispositionLabel("allowed")}</option>
              <option value="ignored">{securityRiskDispositionLabel("ignored")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.securityRisk.filterRange")}</span>
            <select value={rangePreset} onChange={(e) => setRangePreset(e.target.value)} className="app-input min-w-[7rem] px-2 py-1.5">
              <option value="all">{intl.get("digitalEmployee.portrait.securityRisk.rangeAll")}</option>
              <option value="24h">{intl.get("digitalEmployee.portrait.securityRisk.range24h")}</option>
              <option value="7d">{intl.get("digitalEmployee.portrait.securityRisk.range7d")}</option>
              <option value="30d">{intl.get("digitalEmployee.portrait.securityRisk.range30d")}</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white/90 shadow-sm dark:border-gray-800 dark:bg-gray-900/40">
          {filteredRecords.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.recordsEmpty")}</p>
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colTime")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colLevel")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colType")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colSessionId")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colTaskId")}</th>
                  <th className="min-w-[12rem] px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">
                    {intl.get("digitalEmployee.portrait.securityRisk.colDescription")}
                  </th>
                  <th className="min-w-[8rem] px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colRule")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colDisposition")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.colSource")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredRecords.map((row, idx) => {
                  const sid = row.sessionId != null && String(row.sessionId).trim() ? String(row.sessionId).trim() : "";
                  return (
                    <tr key={`rr-${sid}-${idx}`} className="bg-white dark:bg-gray-900/40">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600 dark:text-gray-300">{fmtTime(row.ts)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={[
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                            row.level === "high"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                              : row.level === "medium"
                                ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
                          ].join(" ")}
                        >
                          {securityRiskLevelLabel(row.level)}
                        </span>
                      </td>
                      <td className="max-w-[10rem] px-3 py-2 text-gray-800 dark:text-gray-200">{securityRiskTypeLabel(row.typeKey)}</td>
                      <td className="max-w-[min(100vw,14rem)] px-3 py-2">
                        {sid ? (
                          <button
                            type="button"
                            className="break-all font-mono text-[11px] text-primary underline decoration-primary/40 hover:decoration-primary"
                            onClick={() => drillNav("session-audit", [["openclaw-session-audit-query", sid]])}
                          >
                            {sid.length > 24 ? `${sid.slice(0, 24)}…` : sid}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600 dark:text-gray-300">{row.taskId ?? "—"}</td>
                      <td className="max-w-[min(100vw,24rem)] px-3 py-2 text-gray-700 dark:text-gray-200">{row.description ?? "—"}</td>
                      <td className="max-w-[14rem] px-3 py-2 text-gray-600 dark:text-gray-300">{row.rulePolicy ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-200">{securityRiskDispositionLabel(row.disposition)}</td>
                      <td className="max-w-[10rem] px-3 py-2 text-gray-600 dark:text-gray-300">{row.source ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.securityRisk.sectionAudit")}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditHint")}</p>
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white/90 shadow-sm dark:border-gray-800 dark:bg-gray-900/40">
          {audit.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditEmpty")}</p>
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColTime")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColCategory")}</th>
                  <th className="min-w-[12rem] px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColContent")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColIp")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColConfirm")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColApproval")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColResult")}</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.auditColSession")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {audit.map((row, idx) => {
                  const sid = row.sessionId != null && String(row.sessionId).trim() ? String(row.sessionId).trim() : "";
                  return (
                    <tr key={`sa-${sid}-${idx}`} className="bg-white dark:bg-gray-900/40">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600 dark:text-gray-300">{fmtTime(row.ts)}</td>
                      <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{securityRiskAuditCategoryLabel(row.category)}</td>
                      <td className="max-w-[min(100vw,28rem)] px-3 py-2 break-words text-gray-700 dark:text-gray-200">{row.content ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{row.sourceIp ?? "—"}</td>
                      <td className="px-3 py-2">{boolLabel(row.needsConfirmation)}</td>
                      <td className="px-3 py-2">{row.approvalPassed == null ? "—" : boolLabel(row.approvalPassed)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{securityRiskAuditResultLabel(row.result)}</td>
                      <td className="max-w-[14rem] px-3 py-2">
                        {sid ? (
                          <button
                            type="button"
                            className="break-all font-mono text-[11px] text-primary underline"
                            onClick={() => drillNav("session-audit", [["openclaw-session-audit-query", sid]])}
                          >
                            {sid.length > 22 ? `${sid.slice(0, 22)}…` : sid}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.securityRisk.sectionPolicy")}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.securityRisk.policyHint")}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {intl.get("digitalEmployee.portrait.securityRisk.policyExecTitle")}
            </h4>
            <InfoList rows={policyExecRows} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {intl.get("digitalEmployee.portrait.securityRisk.policyFsTitle")}
            </h4>
            <InfoList rows={policyFsRows} />
          </div>
          <div className="lg:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {intl.get("digitalEmployee.portrait.securityRisk.policyGatewayTitle")}
            </h4>
            <InfoList rows={gatewayRows} />
          </div>
        </div>
      </section>
    </div>
  );
}

function metricValue(rows, key) {
  return rows?.find((r) => r.key === key)?.value ?? "—";
}

function fmtTokenInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Math.round(Number(n)).toLocaleString("zh-CN");
}

function CoreMetricCard({ title, value, hint, tone = "default", children, wrapClassName = "", titleVariant = "default" }) {
  const toneClass = "border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900/60";
  const titleClass =
    titleVariant === "plain"
      ? "text-xs font-medium text-gray-500 dark:text-gray-400"
      : "text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
  return (
    <div
      className={["rounded-2xl border p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]", toneClass, wrapClassName].filter(Boolean).join(" ")}
    >
      <p className={titleClass}>{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p> : null}
      {children}
    </div>
  );
}

function InfoList({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white/90 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/55 dark:ring-white/[0.05]">
      <table className="min-w-full text-left text-xs">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.label}>
              <th className="whitespace-nowrap bg-gray-50/80 px-3 py-2.5 font-semibold text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                {r.label}
              </th>
              <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">{r.value ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOOL_EXEC_TREND_COLORS = ["#6366f1", "#fb7185"];
const TOOL_PIE_COLORS = ["#34d399", "#fb7185"];

function toolOutcomePieLabel(name) {
  if (name === "success") return intl.get("digitalEmployee.portrait.toolExecution.pieSuccess");
  if (name === "error") return intl.get("digitalEmployee.portrait.toolExecution.pieError");
  return String(name ?? "—");
}

/** 工具执行：调用量、耗时、按日趋势、结果占比、工具 Top、错误会话 */
function TabToolExecution({ data }) {
  const ch = data.charts || {};
  const daily = Array.isArray(ch.toolTrendDaily) ? ch.toolTrendDaily : [];
  const pie = Array.isArray(ch.toolOutcomePie) ? ch.toolOutcomePie : [];
  const top = Array.isArray(ch.toolTop15) ? ch.toolTop15 : [];
  const errSess = Array.isArray(ch.toolErrorSessions) ? ch.toolErrorSessions : [];
  const total = ch.toolUseCount;
  const distinct = ch.distinctToolCount;
  const errRate = ch.toolErrorRatePct;
  const avgPerSess = ch.toolCallsPerSession;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.toolExecution.cardTotalCalls")}
          value={total != null && Number(total) > 0 ? total : "—"}
          hint={intl.get("digitalEmployee.portrait.toolExecution.cardTotalCallsHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.toolExecution.cardDistinctTools")}
          value={distinct != null ? distinct : "—"}
          hint={intl.get("digitalEmployee.portrait.toolExecution.cardDistinctToolsHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.toolExecution.cardAvgPerSession")}
          value={avgPerSess != null ? avgPerSess : "—"}
          hint={intl.get("digitalEmployee.portrait.toolExecution.cardAvgPerSessionHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.toolExecution.cardAvgDuration")}
          value={fmtDurationMs(ch.avgToolDurationMs)}
          hint={intl.get("digitalEmployee.portrait.toolExecution.cardAvgDurationHint", {
            n: ch.toolDurationSampleCount != null ? String(ch.toolDurationSampleCount) : "0",
          })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("digitalEmployee.portrait.toolExecution.chartTrendTitle")}
            </h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {intl.get("digitalEmployee.portrait.toolExecution.chartTrendDesc")}
            </p>
          </div>
          <div className="h-[280px] w-full px-2 py-4 sm:px-4">
            {daily.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                {intl.get("digitalEmployee.portrait.toolExecution.chartEmpty")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                  <Tooltip
                    formatter={(v, name) => [v, name]}
                    labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="toolCalls"
                    fill={TOOL_EXEC_TREND_COLORS[0]}
                    name={intl.get("digitalEmployee.portrait.toolExecution.seriesToolCalls")}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="toolErrors"
                    fill={TOOL_EXEC_TREND_COLORS[1]}
                    name={intl.get("digitalEmployee.portrait.toolExecution.seriesToolErrors")}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("digitalEmployee.portrait.toolExecution.pieTitle")}
            </h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.pieDesc")}</p>
          </div>
          <div className="flex h-[280px] items-center justify-center px-2 py-4">
            {pie.length === 0 ? (
              <p className="text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.pieEmpty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${toolOutcomePieLabel(name)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {pie.map((entry, index) => (
                      <Cell key={`tool-pie-${entry.name}-${index}`} fill={TOOL_PIE_COLORS[index % TOOL_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, _n, p) => [v, toolOutcomePieLabel(p?.payload?.name)]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.toolExecution.tableTopTitle")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.tableTopDesc")}</p>
          </div>
          <div className="overflow-x-auto">
            {top.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.tableEmpty")}</p>
            ) : (
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.colName")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.colCount")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.colShare")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {top.map((row, idx) => (
                    <tr key={`tt-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                      <td className="px-4 py-2 tabular-nums text-gray-500">{idx + 1}</td>
                      <td className="max-w-[min(100vw,20rem)] px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{row.name ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{row.count ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {row.sharePct != null ? `${row.sharePct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.toolExecution.errorSessionTitle")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.errorSessionDesc")}</p>
          </div>
          <div className="overflow-x-auto">
            {errSess.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.errorSessionEmpty")}</p>
            ) : (
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.colSessionId")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.colErrCount")}</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.toolExecution.colDetail")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {errSess.map((row, idx) => {
                    const sid = row.sessionId != null && String(row.sessionId).trim() ? String(row.sessionId).trim() : "";
                    return (
                      <tr key={`te-${sid || idx}`} className="bg-white dark:bg-gray-900/40">
                        <td className="px-4 py-2">
                          {sid ? (
                            <button
                              type="button"
                              className="font-mono text-[11px] text-primary underline decoration-primary/40 hover:decoration-primary"
                              onClick={() =>
                                drillNav("session-audit", [["openclaw-session-audit-query", sid]])
                              }
                            >
                              {sid.length > 28 ? `${sid.slice(0, 28)}…` : sid}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.count ?? "—"}</td>
                        <td className="max-w-[min(100vw,14rem)] px-4 py-2 text-gray-600 dark:text-gray-300">{row.detail ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <InfoList
        rows={[
          {
            label: intl.get("digitalEmployee.portrait.toolExecution.infoErrorRate"),
            value: errRate != null ? `${errRate}%` : "—",
          },
          {
            label: intl.get("digitalEmployee.portrait.toolExecution.infoToolErrors"),
            value: ch.toolErrorCount != null ? String(ch.toolErrorCount) : "—",
          },
          {
            label: intl.get("digitalEmployee.portrait.toolExecution.infoSampleNote"),
            value: intl.get("digitalEmployee.portrait.toolExecution.infoSampleValue", {
              n: ch.toolDurationSampleCount != null ? String(ch.toolDurationSampleCount) : "0",
            }),
          },
        ]}
      />
    </div>
  );
}

const SKILL_TREND_COLORS = ["#0ea5e9", "#a78bfa"];
const SKILL_MIX_PIE_COLORS = ["#6366f1", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c", "#94a3b8", "#64748b"];

function skillMixPieLabel(name) {
  if (name === "__other__") return intl.get("digitalEmployee.portrait.skillSituation.pieOther");
  return String(name ?? "—");
}

/** 技能情况：结构 Top、按日趋势、技能组合饼图 */
function TabSkillSituation({ data }) {
  const ch = data.charts || {};
  const daily = Array.isArray(ch.skillTrendDaily) ? ch.skillTrendDaily : [];
  const pie = Array.isArray(ch.skillMixPie) ? ch.skillMixPie : [];
  const top = Array.isArray(ch.skillTop15) ? ch.skillTop15 : [];
  const total = ch.skillMentionTotal;
  const distinct = ch.distinctSkillCount;
  const avgPer = ch.avgSkillMentionsPerSession;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.skillSituation.cardMentions")}
          value={total != null && Number(total) > 0 ? total : "—"}
          hint={intl.get("digitalEmployee.portrait.skillSituation.cardMentionsHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.skillSituation.cardDistinct")}
          value={distinct != null ? distinct : "—"}
          hint={intl.get("digitalEmployee.portrait.skillSituation.cardDistinctHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.skillSituation.cardAvgPerSession")}
          value={avgPer != null ? avgPer : "—"}
          hint={intl.get("digitalEmployee.portrait.skillSituation.cardAvgPerSessionHint")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("digitalEmployee.portrait.skillSituation.chartTrendTitle")}
            </h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {intl.get("digitalEmployee.portrait.skillSituation.chartTrendDesc")}
            </p>
          </div>
          <div className="h-[280px] w-full px-2 py-4 sm:px-4">
            {daily.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                {intl.get("digitalEmployee.portrait.skillSituation.chartEmpty")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                  <Tooltip
                    formatter={(v, name) => [v, name]}
                    labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="skillMentions"
                    fill={SKILL_TREND_COLORS[0]}
                    name={intl.get("digitalEmployee.portrait.skillSituation.seriesMentions")}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="sessionsWithSkill"
                    fill={SKILL_TREND_COLORS[1]}
                    name={intl.get("digitalEmployee.portrait.skillSituation.seriesSessions")}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {intl.get("digitalEmployee.portrait.skillSituation.pieTitle")}
            </h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.pieDesc")}</p>
          </div>
          <div className="flex h-[280px] items-center justify-center px-2 py-4">
            {pie.length === 0 ? (
              <p className="text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.pieEmpty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${skillMixPieLabel(name)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {pie.map((entry, index) => (
                      <Cell key={`skill-pie-${entry.name}-${index}`} fill={SKILL_MIX_PIE_COLORS[index % SKILL_MIX_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, _n, p) => [v, skillMixPieLabel(p?.payload?.name)]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.skillSituation.tableTopTitle")}</h4>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.tableTopDesc")}</p>
        </div>
        <div className="overflow-x-auto">
          {top.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.tableEmpty")}</p>
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.colSkill")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.colCount")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.skillSituation.colShare")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {top.map((row, idx) => (
                  <tr key={`sk-top-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                    <td className="px-4 py-2 tabular-nums text-gray-500">{idx + 1}</td>
                    <td className="max-w-[min(100vw,20rem)] px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{row.name ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{row.count ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {row.sharePct != null ? `${row.sharePct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const COST_PIE_COLORS = ["#6366f1", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c", "#94a3b8", "#64748b"];

function costPieLabelName(name) {
  if (name === "input") return intl.get("digitalEmployee.portrait.cost.pieSeriesInput");
  if (name === "output") return intl.get("digitalEmployee.portrait.cost.pieSeriesOutput");
  if (name === "__other__") return intl.get("digitalEmployee.portrait.cost.pieOther");
  if (name === "__unknown__") return intl.get("digitalEmployee.portrait.cost.modelUnknown");
  return String(name ?? "—");
}

/** @param {string} name @param {"user"|"channel"} kind */
function costTokenDimLabel(name, kind) {
  if (name === "__unknown__") {
    return kind === "user"
      ? intl.get("digitalEmployee.portrait.cost.userUnknown")
      : intl.get("digitalEmployee.portrait.cost.channelUnknown");
  }
  return String(name ?? "—");
}

function fmtTokenShareOfTotal(value, totalTok) {
  const v = Number(value);
  const t = Number(totalTok);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return "—";
  return `${((v / t) * 100).toFixed(1)}%`;
}

function sessionExecStatusPieLabel(name) {
  if (name === "success") return intl.get("digitalEmployee.portrait.sessionExecution.pieSuccess");
  if (name === "failed") return intl.get("digitalEmployee.portrait.sessionExecution.pieFailed");
  return String(name ?? "—");
}

function sessionExecUserPieSliceLabel(name) {
  if (name === "__other__") return intl.get("digitalEmployee.portrait.cost.pieOther");
  return costTokenDimLabel(name, "user");
}

function sessionExecChannelPieSliceLabel(name) {
  if (name === "__other__") return intl.get("digitalEmployee.portrait.cost.pieOther");
  return costTokenDimLabel(name, "channel");
}

const USER_PORTRAIT_PIE_COLORS = ["#8b5cf6", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c", "#94a3b8", "#64748b"];
/** 用户会话按日堆叠柱（含「其他」） */
const USER_SESSION_STACK_COLORS = [...USER_PORTRAIT_PIE_COLORS, "#78716c"];
/** 渠道会话按日堆叠柱（与用户侧配色区分） */
const CHANNEL_SESSION_STACK_COLORS = [
  "#0ea5e9",
  "#14b8a6",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#64748b",
  "#78716c",
];

/** 用户与渠道：按日趋势、双饼图并排、Top15 子 Tab（无顶部四指标卡） */
function TabUserChannelSection({ userPortrait, channelAccess }) {
  const hasUser = Boolean(userPortrait);
  const hasCh = Boolean(channelAccess);
  const [topSubTab, setTopSubTab] = useState("user");

  const userCh = userPortrait?.charts || {};
  const userPie = Array.isArray(userCh.userSessionPie) ? userCh.userSessionPie : [];
  const userTop = Array.isArray(userCh.userTop15) ? userCh.userTop15 : [];
  const userTrendDaily = Array.isArray(userCh.userSessionTrendDaily) ? userCh.userSessionTrendDaily : [];
  const userTrendSeries = Array.isArray(userCh.userSessionTrendSeries) ? userCh.userSessionTrendSeries : [];
  const distinctUserKeys = userCh.distinctUserKeys;
  const distinctChannelKeys = channelAccess?.charts?.distinctChannelKeys;

  const ch = channelAccess?.charts || {};
  const chPie = Array.isArray(ch.channelSessionPie) ? ch.channelSessionPie : [];
  const chTop = Array.isArray(ch.channelTop15) ? ch.channelTop15 : [];
  const chSessionTrendDaily = Array.isArray(ch.channelSessionTrendDaily) ? ch.channelSessionTrendDaily : [];
  const chSessionTrendSeries = Array.isArray(ch.channelSessionTrendSeries) ? ch.channelSessionTrendSeries : [];

  const pieGridCols = hasUser && hasCh ? "lg:grid-cols-2" : "";

  const userTableBlock = (
    <>
      {userTop.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.userPortrait.tableEmpty")}</p>
      ) : (
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
              <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.userPortrait.colUser")}</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.userPortrait.colSessions")}
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.userPortrait.colSessionShare")}
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.userPortrait.colTokens")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {userTop.map((row, idx) => (
              <tr key={`up-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                <td className="px-4 py-2 tabular-nums text-gray-500">{idx + 1}</td>
                <td className="max-w-[min(100vw,18rem)] px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{row.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{row.sessionCount ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                  {row.sessionSharePct != null ? `${row.sessionSharePct}%` : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{row.tokens != null ? row.tokens.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );

  const channelTableBlock = (
    <>
      {chTop.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.channelAccess.tableEmpty")}</p>
      ) : (
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
              <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.channelAccess.colChannel")}</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.channelAccess.colSessions")}
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.channelAccess.colSessionShare")}
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.channelAccess.colTokens")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {chTop.map((row, idx) => (
              <tr key={`ca-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                <td className="px-4 py-2 tabular-nums text-gray-500">{idx + 1}</td>
                <td className="max-w-[min(100vw,18rem)] px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{row.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{row.sessionCount ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                  {row.sessionSharePct != null ? `${row.sessionSharePct}%` : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{row.tokens != null ? row.tokens.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {(hasUser || hasCh) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {hasUser ? (
            <CoreMetricCard
              title={intl.get("digitalEmployee.portrait.userPortrait.metricUserCount")}
              value={distinctUserKeys != null ? distinctUserKeys : "—"}
              hint={intl.get("digitalEmployee.portrait.userPortrait.metricUserCountHint")}
              titleVariant="plain"
            />
          ) : null}
          {hasCh ? (
            <CoreMetricCard
              title={intl.get("digitalEmployee.portrait.channelAccess.metricChannelCount")}
              value={distinctChannelKeys != null ? distinctChannelKeys : "—"}
              hint={intl.get("digitalEmployee.portrait.channelAccess.metricChannelCountHint")}
              titleVariant="plain"
            />
          ) : null}
        </div>
      )}

      {(hasUser || hasCh) && (
        <div className={`grid gap-4 ${hasUser && hasCh ? "lg:grid-cols-2" : ""}`}>
          {hasUser && (
            <div className="app-card min-w-0 overflow-hidden p-0">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {intl.get("digitalEmployee.portrait.userPortrait.chartUserSessionTrendTitle")}
                </h4>
              </div>
              <div className="h-[280px] w-full px-2 py-4 sm:px-4">
                {userTrendDaily.length === 0 || userTrendSeries.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                    {intl.get("digitalEmployee.portrait.userPortrait.chartUserSessionTrendEmpty")}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                      <Tooltip
                        formatter={(v, name) => [v, name]}
                        labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {userTrendSeries.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          stackId="userSess"
                          fill={USER_SESSION_STACK_COLORS[i % USER_SESSION_STACK_COLORS.length]}
                          name={sessionExecUserPieSliceLabel(s.name)}
                          radius={[0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
          {hasCh && (
            <div className="app-card min-w-0 overflow-hidden p-0">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {intl.get("digitalEmployee.portrait.channelAccess.chartChannelSessionTrendTitle")}
                </h4>
              </div>
              <div className="h-[280px] w-full px-2 py-4 sm:px-4">
                {chSessionTrendDaily.length === 0 || chSessionTrendSeries.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                    {intl.get("digitalEmployee.portrait.channelAccess.chartChannelSessionTrendEmpty")}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chSessionTrendDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                      <Tooltip
                        formatter={(v, name) => [v, name]}
                        labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {chSessionTrendSeries.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          stackId="chSess"
                          fill={CHANNEL_SESSION_STACK_COLORS[i % CHANNEL_SESSION_STACK_COLORS.length]}
                          name={sessionExecChannelPieSliceLabel(s.name)}
                          radius={[0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(hasUser || hasCh) && (
        <div className={`grid gap-4 ${pieGridCols}`}>
          {hasUser && (
            <div className="app-card overflow-hidden p-0">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {intl.get("digitalEmployee.portrait.userPortrait.pieTitle")}
                </h4>
              </div>
              <div className="flex h-[300px] items-center justify-center px-2 py-4">
                {userPie.length === 0 ? (
                  <p className="text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.userPortrait.pieEmpty")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={userPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={108}
                        label={({ name, percent }) =>
                          `${sessionExecUserPieSliceLabel(name)} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {userPie.map((entry, index) => (
                          <Cell
                            key={`up-pie-${entry.name}-${index}`}
                            fill={USER_PORTRAIT_PIE_COLORS[index % USER_PORTRAIT_PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, _n, p) => [v, sessionExecUserPieSliceLabel(p?.payload?.name)]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
          {hasCh && (
            <div className="app-card overflow-hidden p-0">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {intl.get("digitalEmployee.portrait.channelAccess.pieTitle")}
                </h4>
              </div>
              <div className="flex h-[300px] items-center justify-center px-2 py-4">
                {chPie.length === 0 ? (
                  <p className="text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.channelAccess.pieEmpty")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={108}
                        label={({ name, percent }) =>
                          `${sessionExecChannelPieSliceLabel(name)} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {chPie.map((entry, index) => (
                          <Cell
                            key={`ch-pie-${entry.name}-${index}`}
                            fill={USER_PORTRAIT_PIE_COLORS[index % USER_PORTRAIT_PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, _n, p) => [v, sessionExecChannelPieSliceLabel(p?.payload?.name)]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {hasUser && hasCh ? (
        <div className="app-card overflow-hidden p-0">
          <div
            className="flex flex-wrap gap-1 border-b border-gray-200 px-2 dark:border-gray-700"
            role="tablist"
            aria-label={intl.get("digitalEmployee.portrait.userChannel.topTabAria")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={topSubTab === "user"}
              onClick={() => setTopSubTab("user")}
              className={[
                "-mb-px rounded-t-md border px-3 py-2 text-sm font-medium transition",
                topSubTab === "user"
                  ? "border-gray-200 border-b-white bg-white text-primary dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-primary"
                  : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800",
              ].join(" ")}
            >
              {intl.get("digitalEmployee.portrait.userPortrait.tableTitle")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={topSubTab === "channel"}
              onClick={() => setTopSubTab("channel")}
              className={[
                "-mb-px rounded-t-md border px-3 py-2 text-sm font-medium transition",
                topSubTab === "channel"
                  ? "border-gray-200 border-b-white bg-white text-primary dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-primary"
                  : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800",
              ].join(" ")}
            >
              {intl.get("digitalEmployee.portrait.channelAccess.tableTitle")}
            </button>
          </div>
          <div className="overflow-x-auto">{topSubTab === "user" ? userTableBlock : channelTableBlock}</div>
        </div>
      ) : hasUser ? (
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.userPortrait.tableTitle")}</h4>
          </div>
          <div className="overflow-x-auto">{userTableBlock}</div>
        </div>
      ) : hasCh ? (
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.channelAccess.tableTitle")}</h4>
          </div>
          <div className="overflow-x-auto">{channelTableBlock}</div>
        </div>
      ) : null}
    </div>
  );
}

const RUNTIME_TASK_OK = "#34d399";
const RUNTIME_TASK_ABORT = "#fb7185";
const RUNTIME_RISK_ABORT = "#f97316";
const RUNTIME_RISK_TOOL = "#7c3aed";

function localTodayDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function splitAgentTags(tagsDisplay) {
  if (tagsDisplay == null || tagsDisplay === "") return [];
  return String(tagsDisplay)
    .split(/[、,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function mergeRiskTrendData(abortedTrend, toolTrend) {
  const m = new Map();
  for (const r of abortedTrend) {
    if (!r?.day) continue;
    m.set(r.day, { day: r.day, aborted: Number(r.aborted) || 0, toolErrors: 0 });
  }
  for (const r of toolTrend) {
    if (!r?.day) continue;
    const row = m.get(r.day) || { day: r.day, aborted: 0, toolErrors: 0 };
    row.toolErrors = Number(r.toolErrors) || 0;
    m.set(r.day, row);
  }
  return [...m.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

function collectRecentAnomalies(qualityDetails, limit = 8) {
  const qd = qualityDetails ?? {};
  /** @type {{ kind: string; sessionId?: unknown; sessionKey?: unknown; updatedAt?: unknown; detail?: unknown; count?: unknown }[]} */
  const rows = [];
  for (const r of qd.abortedRows ?? []) rows.push({ ...r, kind: "abort" });
  for (const r of qd.toolErrorRows ?? []) rows.push({ ...r, kind: "tool" });
  for (const r of qd.execErrorRows ?? []) rows.push({ ...r, kind: "exec" });
  rows.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  return rows.slice(0, limit);
}

/** 运行概要：基础信息、核心指标、趋势、行为快照（数据来自 profile 既有聚合） */
function TabRuntimeOverview({ profile }) {
  const agent = profile?.agent ?? {};
  const header = profile?.header ?? {};
  const basic = profile?.basic ?? {};
  const te = profile?.tabs?.taskExecution?.charts ?? {};
  const se = profile?.tabs?.sessionExecution?.charts ?? {};
  const cost = profile?.tabs?.cost?.charts ?? {};
  const qual = profile?.tabs?.quality?.charts ?? {};
  const toolEx = profile?.tabs?.toolExecution?.charts ?? {};
  const userTab = profile?.tabs?.userPortrait?.charts ?? {};

  const taskDaily = Array.isArray(te.sessionExecutionDaily) ? te.sessionExecutionDaily : [];
  const tokenTrend = Array.isArray(cost.tokenTrendDaily) ? cost.tokenTrendDaily : [];
  const abortedTrend = Array.isArray(qual.abortedTrend) ? qual.abortedTrend : [];
  const toolTrend = Array.isArray(toolEx.toolTrendDaily) ? toolEx.toolTrendDaily : [];
  const riskTrendData = mergeRiskTrendData(abortedTrend, toolTrend);

  const todayKey = localTodayDayKey();
  const todayRow = taskDaily.find((r) => r && r.day === todayKey);
  const todaySessions = todayRow?.sessions != null ? todayRow.sessions : null;

  const tokTodayRow = tokenTrend.find((r) => r && r.day === todayKey);
  const todayTokenSum =
    tokTodayRow != null ? Math.round((Number(tokTodayRow.input) || 0) + (Number(tokTodayRow.output) || 0)) : null;

  const toolUse = Number(te.toolUseCount);
  const toolErr = Number(te.toolErrorCount);
  const taskSuccessPct =
    Number.isFinite(toolUse) && toolUse > 0
      ? Math.round(((Math.max(0, toolUse - Math.max(0, toolErr))) / toolUse) * 1000) / 10
      : null;

  const sessionsPrev = Array.isArray(profile?.sessionsPreview) ? profile.sessionsPreview : [];
  const riskSessionCount = sessionsPrev.filter((s) => {
    const h = Number(s.riskHigh) || 0;
    const m = Number(s.riskMedium) || 0;
    const l = Number(s.riskLow) || 0;
    return h + m + l > 0;
  }).length;

  const abortedN = Number(te.abortedSessions) || Number(agent.abortedCount) || 0;
  const execErr = Number(te.execCommandErrorCount) || 0;
  const anomalyCount = abortedN + (Number.isFinite(toolErr) ? toolErr : 0) + execErr;

  const skillTop5 = (Array.isArray(te.skillTop10) ? te.skillTop10 : []).slice(0, 5);
  const callersTop5 = (Array.isArray(userTab.userTop15) ? userTab.userTop15 : []).slice(0, 5);
  const recentAnomalies = collectRecentAnomalies(profile?.qualityDetails, 8);
  const recentSessions = sessionsPrev.slice(0, 8);

  const agentId = String(agent.employeeKey ?? header.sessionKey ?? "").trim() || "—";
  const tags = splitAgentTags(agent.tagsDisplay);
  const avgRunMs = se.avgSessionDurationMs ?? te.avgRuntimeMs;

  return (
    <div className="space-y-6">
      <section className="app-card p-4 sm:p-5">
        <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.runtimeOverview.sectionAgent")}
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentName")}
            </dt>
            <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{agent.agentName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentId")}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-800 dark:text-gray-200">{agentId}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentWorkspace")}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-800 dark:text-gray-200">
              {header.workspaceDir ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentStatus")}
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {header.online
                ? intl.get("digitalEmployee.portrait.status.online")
                : intl.get("digitalEmployee.portrait.status.offline")}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentTags")}
            </dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <span className="text-sm text-gray-400">—</span>
              ) : (
                tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary dark:border-primary/40 dark:bg-primary/10"
                  >
                    {t}
                  </span>
                ))
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentModel")}
            </dt>
            <dd className="mt-1 break-all text-sm text-gray-900 dark:text-gray-100">{basic.dominantModel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {intl.get("digitalEmployee.portrait.runtimeOverview.agentRuntime")}
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{fmtDurationMs(avgRunMs)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.runtimeOverview.sectionHealth")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricTaskTotal")}
            value={Number.isFinite(toolUse) ? toolUse : "—"}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricTaskTotalHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricTaskSuccess")}
            value={taskSuccessPct != null ? `${taskSuccessPct}%` : "—"}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricTaskSuccessHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricSessionsTotal")}
            value={agent.sessionCount != null ? agent.sessionCount : "—"}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricSessionsTotalHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricSessionsToday")}
            value={todaySessions != null ? todaySessions : "—"}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricSessionsTodayHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricTokensTotal")}
            value={fmtTokenInt(cost.totalTokens)}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricTokensTotalHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricTokensToday")}
            value={todayTokenSum != null ? fmtTokenInt(todayTokenSum) : "—"}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricTokensTodayHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricAnomaly")}
            value={anomalyCount}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricAnomalyHint")}
          />
          <CoreMetricCard
            title={intl.get("digitalEmployee.portrait.runtimeOverview.metricRiskSessions")}
            value={riskSessionCount}
            hint={intl.get("digitalEmployee.portrait.runtimeOverview.metricRiskSessionsHint")}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.runtimeOverview.sectionTrends")}
        </h3>
        <div className="grid gap-4 lg:grid-cols-1">
          <div className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.chartTaskTrend")}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.runtimeOverview.chartTaskTrendDesc")}
              </p>
            </div>
            <div className="h-[240px] w-full px-2 py-4 sm:px-4">
              {taskDaily.length === 0 ? (
                <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                  {intl.get("digitalEmployee.portrait.runtimeOverview.chartEmpty")}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={40} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="success"
                      stackId="sess"
                      fill={RUNTIME_TASK_OK}
                      name={intl.get("digitalEmployee.portrait.runtimeOverview.seriesSuccess")}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="aborted"
                      stackId="sess"
                      fill={RUNTIME_TASK_ABORT}
                      name={intl.get("digitalEmployee.portrait.runtimeOverview.seriesAborted")}
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.chartTokenTrend")}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.runtimeOverview.chartTokenTrendDesc")}
              </p>
            </div>
            <div className="h-[240px] w-full px-2 py-4 sm:px-4">
              {tokenTrend.length === 0 ? (
                <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                  {intl.get("digitalEmployee.portrait.runtimeOverview.chartEmpty")}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tokenTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={52}
                      tickFormatter={(v) => (Number(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${v}`)}
                    />
                    <Tooltip
                      formatter={(v) => [fmtTokenInt(v), ""]}
                      labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="input"
                      stackId="tok"
                      fill="#6366f1"
                      name={intl.get("digitalEmployee.portrait.cost.pieSeriesInput")}
                    />
                    <Bar
                      dataKey="output"
                      stackId="tok"
                      fill="#22d3ee"
                      name={intl.get("digitalEmployee.portrait.cost.pieSeriesOutput")}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.chartRiskTrend")}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.runtimeOverview.chartRiskTrendDesc")}
              </p>
            </div>
            <div className="h-[240px] w-full px-2 py-4 sm:px-4">
              {riskTrendData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                  {intl.get("digitalEmployee.portrait.runtimeOverview.chartEmpty")}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                    <Tooltip labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="aborted" fill={RUNTIME_RISK_ABORT} name={intl.get("digitalEmployee.portrait.runtimeOverview.seriesAbortSessions")} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="toolErrors" fill={RUNTIME_RISK_TOOL} name={intl.get("digitalEmployee.portrait.runtimeOverview.seriesToolErrors")} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {intl.get("digitalEmployee.portrait.runtimeOverview.sectionSnapshot")}
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.snapshotSkills")}
              </h4>
            </div>
            <div className="overflow-x-auto">
              {skillTop5.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.runtimeOverview.tableEmpty")}</p>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">#</th>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colSkill")}
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colCount")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {skillTop5.map((row, idx) => (
                      <tr key={`sk-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                        <td className="px-4 py-2 tabular-nums text-gray-500">{idx + 1}</td>
                        <td className="max-w-[min(100vw,16rem)] px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{row.name ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{row.count ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="app-card overflow-hidden p-0">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.snapshotCallers")}
              </h4>
            </div>
            <div className="overflow-x-auto">
              {callersTop5.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.runtimeOverview.tableEmpty")}</p>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">#</th>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colCaller")}
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colSessions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {callersTop5.map((row, idx) => (
                      <tr key={`caller-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                        <td className="px-4 py-2 tabular-nums text-gray-500">{idx + 1}</td>
                        <td className="max-w-[min(100vw,16rem)] px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{row.name ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{row.sessionCount ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="app-card overflow-hidden p-0 lg:col-span-2">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.snapshotAnomalies")}
              </h4>
            </div>
            <div className="overflow-x-auto">
              {recentAnomalies.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.runtimeOverview.tableEmpty")}</p>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colTime")}
                      </th>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colAnomalyKind")}
                      </th>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colSession")}
                      </th>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colDetail")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {recentAnomalies.map((row, idx) => (
                      <tr key={`anom-${row.sessionId}-${idx}`} className="bg-white dark:bg-gray-900/40">
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-gray-300">
                          {fmtTime(row.updatedAt)}
                        </td>
                        <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                          {row.kind === "abort"
                            ? intl.get("digitalEmployee.portrait.runtimeOverview.kindAbort")
                            : row.kind === "tool"
                              ? intl.get("digitalEmployee.portrait.runtimeOverview.kindToolErr")
                              : intl.get("digitalEmployee.portrait.runtimeOverview.kindExecErr")}
                        </td>
                        <td className="max-w-[min(100vw,14rem)] break-all px-4 py-2 font-mono text-[11px] text-gray-700 dark:text-gray-300">
                          {row.sessionKey || row.sessionId || "—"}
                        </td>
                        <td className="max-w-[min(100vw,20rem)] px-4 py-2 text-gray-600 dark:text-gray-400">
                          {row.detail != null ? String(row.detail) : "—"}
                          {row.count != null ? ` ×${row.count}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="app-card overflow-hidden p-0 lg:col-span-2">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("digitalEmployee.portrait.runtimeOverview.snapshotSessions")}
              </h4>
            </div>
            <div className="overflow-x-auto">
              {recentSessions.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.runtimeOverview.tableEmpty")}</p>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colTime")}
                      </th>
                      <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colSession")}
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colRisk")}
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.runtimeOverview.colTokens")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {recentSessions.map((s, idx) => (
                      <tr key={`sess-${s.session_id || s.sessionKey}-${idx}`} className="bg-white dark:bg-gray-900/40">
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-gray-300">{fmtTime(s.updatedAt)}</td>
                        <td className="max-w-[min(100vw,18rem)] break-all px-4 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">
                          {s.sessionKey || s.session_id || "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                          H{(s.riskHigh ?? 0)}/M{(s.riskMedium ?? 0)}/L{(s.riskLow ?? 0)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                          {s.totalTokens != null ? fmtTokenInt(s.totalTokens) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function fmtAxisDurationMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n >= 60000) return `${(n / 60000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}s`;
  return `${Math.round(n)}`;
}

/** 会话执行 Tab 内：时间窗内会话时间线（数据来自 profile.sessionsPreview） */
function PortraitSessionTimeline({ sessionsPreview = [] }) {
  const list = Array.isArray(sessionsPreview) ? sessionsPreview : [];
  return (
    <div className="app-card p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.timeline.title")}</h3>
      <div className="mt-2 space-y-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
        <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.timeline.desc")}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.timeline.legend")}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {intl.get("digitalEmployee.portrait.timeline.legend.high")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {intl.get("digitalEmployee.portrait.timeline.legend.medium")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            {intl.get("digitalEmployee.portrait.timeline.legend.low")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {intl.get("digitalEmployee.portrait.timeline.legend.healthy")}
          </span>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="mt-4 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.sessionExecution.timelineEmpty")}</p>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {list.map((s, idx) => {
              const rh = Number(s.riskHigh) || 0;
              const rm = Number(s.riskMedium) || 0;
              const rl = Number(s.riskLow) || 0;
              const isHigh = rh > 0;
              const isMedium = !isHigh && rm > 0;
              const isLow = !isHigh && !isMedium && rl > 0;
              const dotColor = isHigh ? "bg-rose-500" : isMedium ? "bg-amber-500" : isLow ? "bg-sky-500" : "bg-emerald-500";
              const riskText = isHigh
                ? intl.get("digitalEmployee.portrait.risk.high")
                : isMedium
                  ? intl.get("digitalEmployee.portrait.risk.medium")
                  : isLow
                    ? intl.get("digitalEmployee.portrait.risk.low")
                    : intl.get("digitalEmployee.portrait.risk.healthy");
              const riskClass = isHigh
                ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800"
                : isMedium
                  ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
                  : isLow
                    ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800"
                    : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800";
              const prevTs = Number(list[idx - 1]?.updatedAt);
              const curTs = Number(s.updatedAt);
              const delta =
                idx > 0 && Number.isFinite(prevTs) && Number.isFinite(curTs)
                  ? intl.get("digitalEmployee.portrait.timeline.deltaSeconds", {
                      n: Math.max(0, (prevTs - curTs) / 1000).toFixed(1),
                    })
                  : null;
              return (
                <div key={s.session_id || s.sessionKey || idx} className="grid grid-cols-[136px_20px_1fr] gap-3">
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold text-gray-800 dark:text-gray-100">{fmtTime(s.updatedAt)}</p>
                    <p className="mt-1 text-xs text-gray-400">#{idx + 1}</p>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="absolute inset-y-0 w-px bg-gray-200 dark:bg-gray-700" />
                    <span
                      className={`relative mt-1 inline-block h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-gray-900 ${dotColor}`}
                    />
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                        {intl.get("digitalEmployee.portrait.timeline.session")}
                      </span>
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ring-1 ${riskClass}`}>{riskText}</span>
                      <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                        {intl.get("digitalEmployee.portrait.timeline.riskSummary", { high: rh, medium: rm, low: rl })}
                      </span>
                      {delta ? (
                        <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                          {delta}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 font-mono text-[12px] text-gray-500 dark:text-gray-400">{s.sessionKey || "sessionKey —"}</p>
                    <button
                      type="button"
                      onClick={() =>
                        drillNav("session-audit", [["openclaw-session-audit-query", String(s.session_id || s.sessionKey || "")]])
                      }
                      className="mt-1 text-left font-mono text-base text-gray-900 hover:text-primary hover:underline dark:text-gray-100"
                    >
                      {s.session_id || s.sessionKey || "—"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{intl.get("digitalEmployee.portrait.timeline.jumpHint")}</p>
        </>
      )}
    </div>
  );
}

function TabSessionExecution({ data, sessionsPreview = [] }) {
  const ch = data.charts || {};
  const trend = Array.isArray(ch.sessionTrend) ? ch.sessionTrend : [];
  const statusPie = Array.isArray(ch.sessionStatusPie) ? ch.sessionStatusPie : [];
  const userPie = Array.isArray(ch.userSessionPie) ? ch.userSessionPie : [];
  const channelPie = Array.isArray(ch.channelSessionPie) ? ch.channelSessionPie : [];
  const sr = ch.successRate;
  const total = ch.sessionTotal;
  const failed = ch.failedSessions;
  const avgMs = ch.avgSessionDurationMs;

  const pieBlock = (titleKey, descKey, pieData, labelFn) => (
    <div className="app-card overflow-hidden p-0">
      <div className="border-b border-gray-100 px-3 py-2.5 dark:border-gray-800 sm:px-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get(titleKey)}</h4>
        {descKey ? <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{intl.get(descKey)}</p> : null}
      </div>
      <div className="h-[240px] w-full px-1 py-3 sm:h-[260px] sm:px-2">
        {pieData.length === 0 ? (
          <p className="flex h-full items-center justify-center px-2 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.sessionExecution.pieEmpty")}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={72}
                paddingAngle={1}
                label={(props) => {
                  const { name, percent } = props;
                  const raw = labelFn(name);
                  const short = raw.length > 14 ? `${raw.slice(0, 14)}…` : raw;
                  return `${short} ${((percent ?? 0) * 100).toFixed(0)}%`;
                }}
              >
                {pieData.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COST_PIE_COLORS[i % COST_PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v} labelFormatter={(n) => labelFn(n)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.sessionExecution.cardTotal")}
          value={total != null ? total : "—"}
          hint={intl.get("digitalEmployee.portrait.sessionExecution.cardTotalHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.sessionExecution.cardSuccessRate")}
          value={sr == null || !Number.isFinite(Number(sr)) ? "—" : fmtPct(Number(sr))}
          hint={intl.get("digitalEmployee.portrait.sessionExecution.cardSuccessRateHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.sessionExecution.cardFailed")}
          value={failed != null ? failed : "—"}
          hint={intl.get("digitalEmployee.portrait.sessionExecution.cardFailedHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.sessionExecution.cardAvgDuration")}
          value={fmtDurationMs(avgMs)}
          hint={intl.get("digitalEmployee.portrait.sessionExecution.cardAvgDurationHint")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.sessionExecution.chartSessionTrendTitle")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.sessionExecution.chartSessionTrendDesc")}</p>
          </div>
          <div className="h-[300px] w-full px-2 py-4 sm:px-4">
            {trend.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.sessionExecution.trendEmpty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                  <Tooltip
                    formatter={(value) => [value, intl.get("digitalEmployee.portrait.sessionExecution.seriesSessions")]}
                    labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sessions" fill="#6366f1" name={intl.get("digitalEmployee.portrait.sessionExecution.seriesSessions")} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.sessionExecution.chartDurationTrendTitle")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.sessionExecution.chartDurationTrendDesc")}</p>
          </div>
          <div className="h-[300px] w-full px-2 py-4 sm:px-4">
            {trend.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.sessionExecution.trendEmpty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={fmtAxisDurationMs} />
                  <Tooltip
                    formatter={(value) => [fmtDurationMs(value), intl.get("digitalEmployee.portrait.sessionExecution.seriesAvgDuration")]}
                    labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="avgDurationMs"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    name={intl.get("digitalEmployee.portrait.sessionExecution.seriesAvgDuration")}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {pieBlock(
          "digitalEmployee.portrait.sessionExecution.pieStatusTitle",
          "digitalEmployee.portrait.sessionExecution.pieStatusDesc",
          statusPie,
          sessionExecStatusPieLabel,
        )}
        {pieBlock(
          "digitalEmployee.portrait.sessionExecution.pieUserTitle",
          "digitalEmployee.portrait.sessionExecution.pieUserDesc",
          userPie,
          sessionExecUserPieSliceLabel,
        )}
        {pieBlock(
          "digitalEmployee.portrait.sessionExecution.pieChannelTitle",
          "digitalEmployee.portrait.sessionExecution.pieChannelDesc",
          channelPie,
          sessionExecChannelPieSliceLabel,
        )}
      </div>

      <PortraitSessionTimeline sessionsPreview={sessionsPreview} />
    </div>
  );
}

function TabCost({ data }) {
  const ch = data.charts || {};
  const tokenTrend = Array.isArray(ch.tokenTrendDaily) ? ch.tokenTrendDaily : [];
  const ioPie = Array.isArray(ch.inputOutputPie) ? ch.inputOutputPie : [];
  const modelPie = Array.isArray(ch.modelTokenPie) ? ch.modelTokenPie : [];
  const topSessions = Array.isArray(ch.sessionTokenTop10) ? ch.sessionTokenTop10 : [];
  const userTokenTop = Array.isArray(ch.userTokenTop10) ? ch.userTokenTop10 : [];
  const channelTokenTop = Array.isArray(ch.channelTokenTop10) ? ch.channelTokenTop10 : [];
  const totalTok = ch.totalTokens;
  const dailyTok = ch.dailyTokensAvg;
  const avgPerSess = ch.avgTokensPerSession;
  const maxPerSess = ch.maxTokensPerSession;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.cardTotalTokens")}
          value={fmtTokenInt(totalTok)}
          hint={intl.get("digitalEmployee.portrait.cost.cardTotalTokensHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.cardDailyTokens")}
          value={fmtTokenInt(dailyTok)}
          hint={intl.get("digitalEmployee.portrait.cost.cardDailyTokensHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.cardAvgTokensPerSession")}
          value={fmtTokenInt(avgPerSess)}
          hint={intl.get("digitalEmployee.portrait.cost.cardAvgTokensPerSessionHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.cardMaxTokensPerSession")}
          value={fmtTokenInt(maxPerSess)}
          hint={intl.get("digitalEmployee.portrait.cost.cardMaxTokensPerSessionHint")}
        />
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.cost.chartDailyTokenTrend")}</h4>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartDailyTokenTrendDesc")}</p>
        </div>
        <div className="h-[320px] w-full px-2 py-4 sm:px-4">
          {tokenTrend.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartEmpty")}</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-gray-700" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(d) => (typeof d === "string" && d.length >= 10 ? d.slice(5) : d)}
                />
                <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={(v) => (Number(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${v}`)} />
                <Tooltip
                  formatter={(v) => [fmtTokenInt(v), ""]}
                  labelFormatter={(d) => intl.get("digitalEmployee.portrait.cost.tooltipDay", { day: d })}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="input"
                  stackId="tok"
                  fill="#6366f1"
                  name={intl.get("digitalEmployee.portrait.cost.pieSeriesInput")}
                />
                <Bar
                  dataKey="output"
                  stackId="tok"
                  fill="#22d3ee"
                  name={intl.get("digitalEmployee.portrait.cost.pieSeriesOutput")}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.cost.chartIoPie")}</h4>
          </div>
          <div className="h-[280px] w-full px-2 py-4">
            {ioPie.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartEmpty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ioPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                    label={({ name, percent }) => `${costPieLabelName(name)} ${(percent * 100).toFixed(0)}%`}
                  >
                    {ioPie.map((_, i) => (
                      <Cell key={`io-${i}`} fill={COST_PIE_COLORS[i % COST_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtTokenInt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.cost.chartModelPie")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartModelPieDesc")}</p>
          </div>
          <div className="h-[280px] w-full px-2 py-4">
            {modelPie.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartEmpty")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modelPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={1}
                    label={(props) => {
                      const { name, percent } = props;
                      const raw = costPieLabelName(name);
                      const short = raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
                      return `${short} ${((percent ?? 0) * 100).toFixed(0)}%`;
                    }}
                  >
                    {modelPie.map((_, i) => (
                      <Cell key={`m-${i}`} fill={COST_PIE_COLORS[i % COST_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtTokenInt(v)} labelFormatter={(n) => costPieLabelName(n)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.cost.userTokenTitle")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.userTokenDesc")}</p>
          </div>
          <div className="overflow-x-auto">
            {userTokenTop.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartEmpty")}</p>
            ) : (
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colUser")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colTokens")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colShare")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {userTokenTop.map((row, idx) => (
                    <tr key={`ut-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                      <td className="px-4 py-2.5 tabular-nums text-gray-500">{idx + 1}</td>
                      <td className="max-w-[min(100vw,24rem)] px-4 py-2.5 text-[11px] text-gray-800 dark:text-gray-200">{costTokenDimLabel(row.name, "user")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{fmtTokenInt(row.value)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{fmtTokenShareOfTotal(row.value, totalTok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="app-card overflow-hidden p-0">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.cost.channelTokenTitle")}</h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.channelTokenDesc")}</p>
          </div>
          <div className="overflow-x-auto">
            {channelTokenTop.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.cost.chartEmpty")}</p>
            ) : (
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.basic.channel")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colTokens")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colShare")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {channelTokenTop.map((row, idx) => (
                    <tr key={`ct-${row.name}-${idx}`} className="bg-white dark:bg-gray-900/40">
                      <td className="px-4 py-2.5 tabular-nums text-gray-500">{idx + 1}</td>
                      <td className="max-w-[min(100vw,24rem)] px-4 py-2.5 font-mono text-[11px] text-gray-800 dark:text-gray-200">{costTokenDimLabel(row.name, "channel")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{fmtTokenInt(row.value)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{fmtTokenShareOfTotal(row.value, totalTok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.cost.sessionTop10Title")}</h4>
        </div>
        <div className="overflow-x-auto">
          {topSessions.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">{intl.get("digitalEmployee.portrait.cost.sessionTop10Empty")}</p>
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">#</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colSession")}</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colTokens")}</th>
                  <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">{intl.get("digitalEmployee.portrait.cost.colUpdated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {topSessions.map((row, idx) => {
                  const sid = row.sessionId || row.sessionKey || "";
                  return (
                    <tr key={`${sid}-${idx}`} className="bg-white dark:bg-gray-900/40">
                      <td className="px-4 py-2.5 tabular-nums text-gray-500">{idx + 1}</td>
                      <td className="max-w-[min(100vw,28rem)] px-4 py-2.5 font-mono text-[11px] text-gray-800 dark:text-gray-200">
                        <button
                          type="button"
                          onClick={() =>
                            drillNav("session-audit", [["openclaw-session-audit-query", String(sid)]])
                          }
                          className="break-all text-left text-primary hover:underline"
                        >
                          {sid || "—"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{fmtTokenInt(row.totalTokens)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-600 dark:text-gray-300">{fmtTime(row.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
