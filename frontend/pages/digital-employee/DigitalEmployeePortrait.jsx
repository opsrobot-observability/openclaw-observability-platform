import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import intl from "react-intl-universal";
import CostTimeRangeFilter from "../../components/CostTimeRangeFilter.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../../components/TablePagination.jsx";
import { dedupeEmployeesBySessionKey, rowSessionKey } from "../../utils/digitalEmployeeRows.js";

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

const HEALTH_ORDER = { green: 0, yellow: 1, red: 2, unknown: 3 };

/** 列表「安全风险评分」着色：分数越高风险越大 */
function riskScoreClass(score) {
  if (score == null || !Number.isFinite(Number(score))) return "text-gray-600 dark:text-gray-300";
  const n = Number(score);
  if (n >= 70) return "font-semibold text-rose-600 dark:text-rose-300";
  if (n >= 45) return "text-amber-600 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-400";
}

/** 与 riskScoreClass 配套的左侧强调条 */
function riskScoreAccentBorder(score) {
  if (score == null || !Number.isFinite(Number(score))) return "border-l-gray-300 dark:border-l-gray-600";
  const n = Number(score);
  if (n >= 70) return "border-l-rose-500 dark:border-l-rose-400";
  if (n >= 45) return "border-l-amber-500 dark:border-l-amber-400";
  return "border-l-emerald-500 dark:border-l-emerald-400";
}

function parseTagsDisplay(tagsDisplay) {
  const raw = String(tagsDisplay ?? "")
    .split(/[、,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const filtered = raw.filter((t) => {
    // 过滤系统标识类标签，优先保留业务分类标签
    if (/^ou_[a-z0-9]+$/i.test(t)) return false;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(t)) return false;
    if (t.includes(":") && t.length > 22) return false;
    return true;
  });
  return filtered.length ? filtered : [intl.get("digitalEmployee.portrait.tag.untagged")];
}

function SessionKeyListDisplay({ values }) {
  const [expanded, setExpanded] = useState(false);
  const list = Array.isArray(values)
    ? values.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
  if (list.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  const visibleList = expanded ? list : list.slice(0, 1);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-1 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>
          {expanded
            ? intl.get("digitalEmployee.portrait.systemKey.collapse")
            : intl.get("digitalEmployee.portrait.systemKey.expand", { count: list.length })}
        </span>
      </button>
      <div className="space-y-1 rounded-lg border border-gray-100 bg-white/80 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100">
        {visibleList.map((k) => (
          <p key={k} className="break-all">
            {k}
          </p>
        ))}
      </div>
    </div>
  );
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
  { id: "capability", labelKey: "digitalEmployee.portrait.tab.capability" },
  { id: "quality", labelKey: "digitalEmployee.portrait.tab.quality" },
  { id: "efficacy", labelKey: "digitalEmployee.portrait.tab.efficacy" },
  { id: "cost", labelKey: "digitalEmployee.portrait.tab.cost" },
  { id: "security", labelKey: "digitalEmployee.portrait.tab.security" },
];

/**
 * 数字员工画像：列表 KPI + 明细 + 五维 Tab（对接 /api/digital-employees/profile）
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
  const [activeTab, setActiveTab] = useState("capability");
  const [detailModal, setDetailModal] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("digital-employee:focusAgent");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.sessionKey != null && String(p.sessionKey).trim()) {
        setSelectedSessionKey(String(p.sessionKey).trim());
      }
      if (p.agentName) setDetailAgent(String(p.agentName));
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
          setActiveTab("capability");
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
  const channelOptions = useMemo(() => {
    const set = new Set();
    for (const a of employees) {
      for (const c of a.channels ?? []) {
        if (c?.name) set.add(c.name);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [employees]);
  const providerOptions = useMemo(() => {
    const set = new Set();
    for (const a of employees) {
      const p = String(a.dominantModelProvider ?? "").trim();
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [employees]);

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
    setDetailModal(null);
    setDetailAgent(name);
    setSelectedSessionKey(sk || null);
  }, []);

  const openMetricDetail = useCallback((payload) => {
    setDetailModal(payload);
  }, []);

  useEffect(() => {
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
  }, [overviewLoading, overviewErr, sortedList, selectedSessionKey, detailAgent, openDetail]);

  const o1 = overview?.o1_summary;

  const agent = profile?.agent;
  const avatarChar = agent?.agentName?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-8">
      <CostTimeRangeFilter
        activeDays={queryMode.type === "days" ? queryMode.days : 7}
        onPreset={(d) => setQueryMode({ type: "days", days: d })}
      />
      {queryMode.type === "hours" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {intl.get("digitalEmployee.portrait.window.hours", { hours: queryMode.hours })}
        </p>
      )}

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(300px,24rem)_minmax(0,1fr)]">
        <aside className="min-h-0">
          <div className="app-card flex h-full min-h-[420px] flex-col p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.employeeList.title")}</p>
              <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                {intl.get("digitalEmployee.portrait.employeeList.desc")}
              </p>
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
                <div className="space-y-2 border-b border-gray-100 pb-3 dark:border-gray-800">
                  <input
                    id="de-profile-search"
                    type="search"
                    placeholder={intl.get("digitalEmployee.portrait.searchPlaceholder")}
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={channelFilter}
                      onChange={(e) => setChannelFilter(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">{intl.get("digitalEmployee.portrait.filter.allChannels")}</option>
                      {channelOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
                      {intl.get("digitalEmployee.portrait.filter.channelEnabled")}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={riskFilter}
                      onChange={(e) => setRiskFilter(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">{intl.get("digitalEmployee.portrait.filter.allRiskLevels")}</option>
                      <option value="high">{intl.get("digitalEmployee.portrait.filter.riskHigh")}</option>
                      <option value="medium">{intl.get("digitalEmployee.portrait.filter.riskMedium")}</option>
                      <option value="low">{intl.get("digitalEmployee.portrait.filter.riskLow")}</option>
                    </select>
                    <select
                      value={providerFilter}
                      onChange={(e) => setProviderFilter(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">{intl.get("digitalEmployee.portrait.filter.allModelProviders")}</option>
                      {providerOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="name">{intl.get("digitalEmployee.portrait.sort.name")}</option>
                      <option value="composite">{intl.get("digitalEmployee.portrait.sort.composite")}</option>
                      <option value="tokens">{intl.get("digitalEmployee.portrait.sort.tokens")}</option>
                      <option value="cost">{intl.get("digitalEmployee.portrait.sort.cost")}</option>
                      <option value="unitCost">{intl.get("digitalEmployee.portrait.sort.unitCost")}</option>
                      <option value="security">{intl.get("digitalEmployee.portrait.sort.security")}</option>
                      <option value="health">{intl.get("digitalEmployee.portrait.sort.health")}</option>
                      <option value="success">{intl.get("digitalEmployee.portrait.sort.success")}</option>
                    </select>
                    <select
                      value={sortDir}
                      onChange={(e) => setSortDir(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="asc">{intl.get("digitalEmployee.portrait.sort.asc")}</option>
                      <option value="desc">{intl.get("digitalEmployee.portrait.sort.desc")}</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {pagedList.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      {intl.get("digitalEmployee.portrait.list.noMatch")}
                    </div>
                  ) : (
                    pagedList.map((a, idx) => {
                      const rk = rowSessionKey(a);
                      const isActive = Boolean(selectedSessionKey && rk && selectedSessionKey === rk);
                      const modelName = a.dominantModelName ?? a.models?.[0]?.name ?? "—";
                      const risk =
                        a.securityRiskScore != null && Number.isFinite(Number(a.securityRiskScore))
                          ? Number(a.securityRiskScore).toFixed(1)
                          : "—";
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
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{a.agentName}</p>
                            <span className={`shrink-0 text-xs tabular-nums ${riskScoreClass(a.securityRiskScore)}`}>{risk}</span>
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
                    })
                  )}
                </div>

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
          <div className="flex flex-wrap items-center gap-3">
            <nav className="text-xs text-gray-500 dark:text-gray-400">
              <span>{intl.get("digitalEmployee.portrait.breadcrumb")}</span>
              <span className="mx-1.5">/</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{detailAgent}</span>
            </nav>
          </div>

          {profileLoading && (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          )}
          {profileErr && <div className="app-card p-4 text-sm text-rose-600 dark:text-rose-400">{profileErr}</div>}

          {!profileLoading && !profileErr && profile && agent && (
            <div className="space-y-4">
              <div className="app-card p-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary-soft/70 via-white to-sky-50/80 p-4 dark:from-primary/15 dark:via-gray-900 dark:to-sky-950/30">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#2563eb] text-xl font-bold text-white shadow-lg shadow-primary/20">
                          {avatarChar}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="min-w-0 break-words text-lg font-semibold text-gray-900 dark:text-gray-100">{agent.agentName}</h2>
                            <span className={[
                              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                              profile.header?.online
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-300",
                            ].join(" ")}>
                              {profile.header?.online ? intl.get("digitalEmployee.portrait.status.online") : intl.get("digitalEmployee.portrait.status.offline")}
                            </span>
                          </div>
                          <div className="mt-3 border-t border-gray-200/80 pt-3 dark:border-gray-600/40">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              {intl.get("digitalEmployee.portrait.systemKey")}
                            </p>
                            <SessionKeyListDisplay values={profile.header?.sessionKeys} />
                          </div>
                          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            {intl.get("digitalEmployee.portrait.lastActive")}{" "}
                            <span className="font-semibold text-sky-700 dark:text-sky-300">
                              {profile.header?.minutesSinceLastActivity != null ? intl.get("digitalEmployee.portrait.minutesAgo", { n: profile.header.minutesSinceLastActivity }) : "—"}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-slate-50/95 via-white to-sky-50/40 p-4 shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:from-gray-900/55 dark:via-gray-950/50 dark:to-sky-950/25 dark:ring-white/[0.06]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.summary.title")}</h3>
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.summary.desc")}</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.tags")}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {parseTagsDisplay(agent.tagsDisplay).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white/90 px-2.5 py-1 text-xs font-medium text-primary shadow-sm ring-1 ring-black/[0.03] dark:border-primary/35 dark:bg-gray-900/70 dark:text-primary dark:ring-white/5"
                            >
                              <svg
                                aria-hidden
                                viewBox="0 0 20 20"
                                className="h-3.5 w-3.5 shrink-0 opacity-90"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M9 3H4.5A1.5 1.5 0 003 4.5V9l6.2 6.2a1.2 1.2 0 001.7 0l4.3-4.3a1.2 1.2 0 000-1.7L9 3z"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinejoin="round"
                                />
                                <circle cx="6.2" cy="6.2" r="1.1" fill="currentColor" />
                              </svg>
                              <span>{tag}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div
                          className={[
                            "relative overflow-hidden rounded-xl border border-gray-100 bg-white/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/75",
                            "border-l-4",
                            riskScoreAccentBorder(profile.quad?.securityScore),
                          ].join(" ")}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.riskScore")}</p>
                          <p
                            className={[
                              "mt-1 text-3xl font-semibold tabular-nums tracking-tight",
                              riskScoreClass(profile.quad?.securityScore),
                            ].join(" ")}
                          >
                            {profile.quad?.securityScore ?? "—"}
                          </p>
                          <p className="mt-2 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.riskScoreHint")}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-white/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/75">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.skillCount")}</p>
                          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
                            {profile.basic?.skillCountDistinct ?? "—"}
                          </p>
                          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.skillCountHint")}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-white/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/75">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.toolCount")}</p>
                          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
                            {profile.basic?.toolCountDistinct ?? "—"}
                          </p>
                          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.summary.toolCountHint")}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white via-slate-50/40 to-sky-50/30 p-4 shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:from-gray-900/55 dark:via-gray-950/45 dark:to-sky-950/20 dark:ring-white/[0.06]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.basic.title")}</h3>
                          <span className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary dark:bg-primary/25">
                            {intl.get("digitalEmployee.portrait.basic.badge")}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.basic.desc")}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.basic.section.accessType")}</p>
                        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white/90 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/50 dark:ring-white/5">
                          <BasicInfoRow label={intl.get("digitalEmployee.portrait.basic.channel")} value={profile.header?.channelTop ?? "—"} />
                          <BasicInfoRow label={intl.get("digitalEmployee.portrait.basic.type")} value={profile.header?.chatType ?? "—"} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.basic.section.model")}</p>
                        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white/90 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/50 dark:ring-white/5">
                          <BasicInfoRow label={intl.get("digitalEmployee.portrait.basic.modelProvider")} value={profile.basic?.modelProvider ?? "—"} />
                          <BasicInfoRow label={intl.get("digitalEmployee.portrait.basic.modelName")} value={profile.basic?.dominantModel ?? "—"} emphasize />
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{intl.get("digitalEmployee.portrait.basic.section.workspace")}</p>
                        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white/90 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/50 dark:ring-white/5">
                          <BasicInfoRow label={intl.get("digitalEmployee.portrait.basic.workspaceDir")} value={profile.header?.workspaceDir ?? "—"} mono />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-card overflow-hidden p-0">
                <div className="border-b border-gray-100 bg-gradient-to-r from-primary-soft/50 via-white to-sky-50/70 px-6 py-4 dark:border-gray-800 dark:from-primary/15 dark:via-gray-900 dark:to-sky-950/25">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.radar.title")}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{intl.get("digitalEmployee.portrait.radar.desc")}</p>
                </div>
                <div className="px-4 py-5 sm:px-6">
                  <div className="mx-auto h-[360px] w-full max-w-4xl">
                    <EmployeeRadarChart dimensions={profile.dimensions ?? agent.dimensions} radarScores={profile.radarScores} />
                  </div>
                </div>
              </div>

              <div className="app-card p-0">
                <div className="mt-4 flex flex-wrap gap-1 border-b border-gray-200 px-4 dark:border-gray-700" role="tablist" aria-label={intl.get("digitalEmployee.portrait.tab.ariaLabel")}>
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
                  {activeTab === "capability" && profile.tabs?.capability && (
                    <TabCapability data={profile.tabs.capability} />
                  )}
                  {activeTab === "quality" && profile.tabs?.quality && (
                    <TabQuality
                      data={profile.tabs.quality}
                      sessionsPreview={profile.sessionsPreview ?? []}
                      qualityDetails={profile.qualityDetails}
                      onOpenDetail={openMetricDetail}
                    />
                  )}
                  {activeTab === "efficacy" && profile.tabs?.efficacy && <TabEfficacy data={profile.tabs.efficacy} />}
                  {activeTab === "cost" && profile.tabs?.cost && <TabCost data={profile.tabs.cost} />}
                  {activeTab === "security" && profile.tabs?.security && (
                    <TabSecurity
                      data={profile.tabs.security}
                      rows={profile.tabs.security?.metrics ?? []}
                    />
                  )}
                </div>
              </div>

              {profile.sessionsPreview && profile.sessionsPreview.length > 0 && (
                <div className="app-card p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.portrait.timeline.title")}</h3>
                  <div className="mt-2 space-y-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                    <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                      {intl.get("digitalEmployee.portrait.timeline.desc")}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.timeline.legend")}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />{intl.get("digitalEmployee.portrait.timeline.legend.high")}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />{intl.get("digitalEmployee.portrait.timeline.legend.medium")}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />{intl.get("digitalEmployee.portrait.timeline.legend.low")}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{intl.get("digitalEmployee.portrait.timeline.legend.healthy")}</span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {profile.sessionsPreview.map((s, idx) => {
                      const rh = Number(s.riskHigh) || 0;
                      const rm = Number(s.riskMedium) || 0;
                      const rl = Number(s.riskLow) || 0;
                      const isHigh = rh > 0;
                      const isMedium = !isHigh && rm > 0;
                      const isLow = !isHigh && !isMedium && rl > 0;
                      const dotColor = isHigh
                        ? "bg-rose-500"
                        : isMedium
                          ? "bg-amber-500"
                          : isLow
                            ? "bg-sky-500"
                            : "bg-emerald-500";
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
                      const prevTs = Number(profile.sessionsPreview[idx - 1]?.updatedAt);
                      const curTs = Number(s.updatedAt);
                      const delta = idx > 0 && Number.isFinite(prevTs) && Number.isFinite(curTs)
                        ? intl.get("digitalEmployee.portrait.timeline.deltaSeconds", { n: Math.max(0, (prevTs - curTs) / 1000).toFixed(1) })
                        : null;
                      return (
                        <div key={s.session_id || s.sessionKey} className="grid grid-cols-[136px_20px_1fr] gap-3">
                          <div className="text-right">
                            <p className="tabular-nums text-sm font-semibold text-gray-800 dark:text-gray-100">
                              {fmtTime(s.updatedAt)}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">#{idx + 1}</p>
                          </div>
                          <div className="relative flex justify-center">
                            <span className="absolute inset-y-0 w-px bg-gray-200 dark:bg-gray-700" />
                            <span className={`relative mt-1 inline-block h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-gray-900 ${dotColor}`} />
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                                {intl.get("digitalEmployee.portrait.timeline.session")}
                              </span>
                              <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ring-1 ${riskClass}`}>
                                {riskText}
                              </span>
                              <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                                {intl.get("digitalEmployee.portrait.timeline.riskSummary", { high: rh, medium: rm, low: rl })}
                              </span>
                              {delta && (
                                <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                                  {delta}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 font-mono text-[12px] text-gray-500 dark:text-gray-400">
                              {s.sessionKey || "sessionKey —"}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                drillNav("session-audit", [
                                  ["openclaw-session-audit-query", String(s.session_id || s.sessionKey || "")],
                                ])
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
                </div>
              )}

              {detailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                  <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{detailModal.title}</h4>
                      <div className="flex items-center gap-2">
                        {detailModal.rows?.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              drillNav("session-audit", [["openclaw-session-audit-query", String(detailModal.rows?.[0]?.sessionId || detailModal.rows?.[0]?.sessionKey || "")]])
                            }
                            className="rounded-md border border-primary/30 bg-primary-soft px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 dark:bg-primary/20"
                          >
                            {intl.get("digitalEmployee.portrait.quality.detail.viewFirstTrace")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setDetailModal(null)}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {intl.get("digitalEmployee.portrait.quality.detail.close")}
                        </button>
                      </div>
                    </div>
                    {detailModal.description ? (
                      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{detailModal.description}</p>
                    ) : null}
                    {detailModal.kv?.length ? (
                      <div className="mb-3 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
                        <table className="min-w-full text-left text-xs">
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {detailModal.kv.map((it, i) => (
                              <tr key={`${it.label}-${i}`}>
                                <th className="whitespace-nowrap bg-gray-50/80 px-3 py-2 font-semibold text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                                  {it.label}
                                </th>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{it.value ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {detailModal.groups?.length ? (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {detailModal.groups.map((g) => (
                          <span
                            key={g.name}
                            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700"
                          >
                            {g.name} {g.count}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {!detailModal.rows || detailModal.rows.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        {intl.get("digitalEmployee.portrait.quality.detail.empty")}
                      </p>
                    ) : (
                      <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
                        <table className="min-w-full text-left text-xs">
                          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.quality.detail.col.time")}</th>
                              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.quality.detail.col.session")}</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.quality.detail.col.count")}</th>
                              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">{intl.get("digitalEmployee.portrait.quality.detail.col.detail")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {detailModal.rows.map((r, i) => (
                              <tr key={`${r.sessionId || r.sessionKey || "r"}-${i}`}>
                                <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-200">{fmtTime(r.updatedAt)}</td>
                                <td className="px-3 py-2 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      drillNav("session-audit", [["openclaw-session-audit-query", String(r.sessionId || r.sessionKey || "")]])
                                    }
                                    className="hover:text-primary hover:underline"
                                  >
                                    {r.sessionId || r.sessionKey || "—"}
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                  {Number.isFinite(Number(r.count)) ? Number(r.count) : 1}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{r.detail || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function metricValue(rows, key) {
  return rows?.find((r) => r.key === key)?.value ?? "—";
}

function formatCostMetricWithUnit(rows, key) {
  const v = metricValue(rows, key);
  const n = numOrNull(v);
  if (key === "input_tokens" || key === "output_tokens" || key === "total_tokens") {
    return n == null ? "—" : `${Math.round(n).toLocaleString("zh-CN")} tokens`;
  }
  if (key === "model_unit_cost_input" || key === "model_unit_cost_output") {
    return n == null ? "—" : `$${n}/1M tokens`;
  }
  if (key === "estimated_cost_usd") {
    return n == null ? "—" : fmtUsd(n);
  }
  return v;
}

function CoreMetricCard({ title, value, hint, tone = "default" }) {
  const toneClass = "border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900/60";
  return (
    <div className={["rounded-2xl border p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]", toneClass].join(" ")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

function BasicInfoRow({ label, value, mono, emphasize }) {
  const v = String(value ?? "—");
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 px-3.5 py-3 last:border-b-0 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      <span
        className={[
          "min-w-0 text-sm leading-snug text-gray-900 dark:text-gray-100",
          mono
            ? "break-all font-mono text-[12px] leading-relaxed text-slate-800 dark:text-slate-200"
            : "break-words sm:max-w-[min(72%,18rem)] sm:text-right",
          emphasize && !mono ? "font-semibold text-primary dark:text-primary" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}

function EmployeeRadarChart({ dimensions, radarScores }) {
  const toScore = (v) => (v === "green" ? 90 : v === "yellow" ? 60 : v === "red" ? 30 : 50);
  const scoreOf = (name, dimFallback) => {
    const n = Number(radarScores?.[name]);
    if (Number.isFinite(n)) return n;
    return toScore(dimFallback);
  };
  const data = [
    { dim: intl.get("digitalEmployee.portrait.radar.capability"), score: scoreOf("capability", dimensions?.capability) },
    { dim: intl.get("digitalEmployee.portrait.radar.quality"), score: scoreOf("quality", dimensions?.quality) },
    { dim: intl.get("digitalEmployee.portrait.radar.efficacy"), score: scoreOf("efficacy", dimensions?.efficacy) },
    { dim: intl.get("digitalEmployee.portrait.radar.cost"), score: scoreOf("cost", dimensions?.cost) },
    { dim: intl.get("digitalEmployee.portrait.radar.security"), score: scoreOf("security", dimensions?.security) },
  ];
  const avg = data.reduce((s, d) => s + Number(d.score || 0), 0) / (data.length || 1);
  const labelColor = (score) => {
    if (score >= 80) return "#38a169";
    if (score >= 70) return "#f59e0b";
    return "#94a3b8";
  };
  const AxisTick = ({ x, y, payload }) => {
    const row = data.find((d) => d.dim === payload?.value);
    const score = Number(row?.score ?? 0);
    return (
      <g transform={`translate(${x},${y})`}>
        <text y={-4} textAnchor="middle" className="fill-current text-[12px] font-semibold" style={{ color: labelColor(score) }}>
          {payload?.value}
        </text>
        <text y={16} textAnchor="middle" className="fill-current text-[11px] font-medium" style={{ color: labelColor(score) }}>
          {score}{intl.get("digitalEmployee.common.unit.score")}
        </text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="73%">
        <defs>
          <linearGradient id="employee-radar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f7df6" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#4f7df6" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <PolarGrid gridType="polygon" radialLines stroke="#d1d5db" strokeOpacity={0.95} />
        <PolarAngleAxis dataKey="dim" tick={<AxisTick />} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="score"
          stroke="#2f6fed"
          strokeWidth={4}
          fill="url(#employee-radar-fill)"
          fillOpacity={1}
          dot={false}
          isAnimationActive
        />
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="#1e293b" fontSize="25" fontWeight="300">
          {avg.toFixed(1)}
        </text>
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
            padding: "8px 10px",
          }}
          formatter={(v) => [`${v} ${intl.get("digitalEmployee.common.unit.score")}`, intl.get("digitalEmployee.common.score")]}
        />
      </RadarChart>
    </ResponsiveContainer>
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

function policyValueToneClass(value, mode = "default") {
  const s = String(value ?? "").toLowerCase();
  if (!s || s === "—") return "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700";

  if (mode === "count") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 10) return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800";
    if (Number.isFinite(n) && n >= 1) return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800";
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800";
  }

  if (s.includes("danger") || s.includes("open") || s.includes("false") || s.includes("off") || s.includes("disabled")) {
    return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800";
  }
  if (s.includes("ask") || s.includes("approval") || s.includes("confirm") || s.includes("restricted")) {
    return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800";
  }
  return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800";
}

function PolicyValueBadge({ value, mode = "default" }) {
  return (
    <span
      className={[
        "inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        "break-all",
        policyValueToneClass(value, mode),
      ].join(" ")}
      title={String(value ?? "—")}
    >
      {String(value ?? "—")}
    </span>
  );
}

function TabCapability({ data }) {
  const rows = data.metrics || [];
  const skills = String(metricValue(rows, "skills"))
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tools = String(metricValue(rows, "tools"))
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.capability.scoreTitle")}
          value={metricValue(rows, "kpi_score")}
          hint={intl.get("digitalEmployee.portrait.capability.scoreHint")}
        />
        <CoreMetricCard title={intl.get("digitalEmployee.portrait.capability.skillCount")} value={skills.length || "—"} hint={intl.get("digitalEmployee.portrait.capability.skillCountHint")} />
        <CoreMetricCard title={intl.get("digitalEmployee.portrait.capability.toolCount")} value={tools.length || "—"} hint={intl.get("digitalEmployee.portrait.capability.toolCountHint")} />
      </div>
      <InfoList
        rows={[
          { label: intl.get("digitalEmployee.portrait.capability.modelProvider"), value: metricValue(rows, "model_provider") },
          { label: intl.get("digitalEmployee.portrait.capability.modelName"), value: metricValue(rows, "model_name") },
          { label: intl.get("digitalEmployee.portrait.capability.contextWindow"), value: metricValue(rows, "context_window") },
          { label: intl.get("digitalEmployee.portrait.capability.maxTokens"), value: metricValue(rows, "max_tokens") },
          { label: intl.get("digitalEmployee.portrait.capability.reasoning"), value: metricValue(rows, "reasoning") },
          { label: intl.get("digitalEmployee.portrait.capability.skills"), value: metricValue(rows, "skills") },
          { label: intl.get("digitalEmployee.portrait.capability.tools"), value: tools.length ? tools.join("、") : "—" },
          { label: intl.get("digitalEmployee.portrait.capability.subagents"), value: metricValue(rows, "subagents_max_concurrent") },
          { label: intl.get("digitalEmployee.portrait.capability.sandbox"), value: metricValue(rows, "sandbox_mode") },
        ]}
      />
    </div>
  );
}

function TabQuality({ data, sessionsPreview = [], qualityDetails, onOpenDetail }) {
  const rows = data.metrics || [];
  const groupsFromList = (list) => {
    const total = list.reduce((s, x) => s + (Number(x.count) || 1), 0);
    return [{ name: intl.get("digitalEmployee.portrait.quality.totalErrors"), count: total }];
  };
  const openErrorDetail = (type) => {
    const src = Array.isArray(sessionsPreview) ? sessionsPreview : [];
    const qd = qualityDetails || {};
    let list = [];
    let title = "";
    if (type === "aborted") {
      title = intl.get("digitalEmployee.portrait.quality.detail.abortedTitle");
      list = Array.isArray(qd.abortedRows)
        ? qd.abortedRows
        : src
            .filter((s) => Boolean(s.abortedLastRun))
            .map((s) => ({
              updatedAt: s.updatedAt,
              sessionId: s.session_id,
              sessionKey: s.sessionKey,
              detail: "abortedLastRun=true",
            }));
    } else if (type === "tool") {
      title = intl.get("digitalEmployee.portrait.quality.detail.toolTitle");
      list = Array.isArray(qd.toolErrorRows)
        ? qd.toolErrorRows
        : src
            .filter((s) => Number(s.toolErrorCount) > 0)
            .map((s) => ({
              updatedAt: s.updatedAt,
              sessionId: s.session_id,
              sessionKey: s.sessionKey,
              detail: `toolErrorCount=${Number(s.toolErrorCount) || 0}`,
            }));
    } else if (type === "exec") {
      title = intl.get("digitalEmployee.portrait.quality.detail.execTitle");
      list = Array.isArray(qd.execErrorRows)
        ? qd.execErrorRows
        : src
            .filter((s) => Number(s.execCommandErrorCount) > 0)
            .map((s) => ({
              updatedAt: s.updatedAt,
              sessionId: s.session_id,
              sessionKey: s.sessionKey,
              detail: `execCommandErrorCount=${Number(s.execCommandErrorCount) || 0}`,
            }));
    }
    onOpenDetail?.({
      title,
      description: intl.get("digitalEmployee.portrait.quality.detail.description"),
      rows: list.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)),
      groups: groupsFromList(list),
    });
  };
  const metricActionValue = (label, value, type) => (
    <button
      type="button"
      onClick={() => openErrorDetail(type)}
      className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800 dark:hover:bg-amber-900/40"
                            title={intl.get("digitalEmployee.portrait.quality.detail.clickToView", { label })}
    >
      {String(value ?? "—")}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.quality.scoreTitle")}
          value={metricValue(rows, "kpi_score")}
          hint={intl.get("digitalEmployee.portrait.quality.scoreHint")}
        />
        <CoreMetricCard title={intl.get("digitalEmployee.portrait.quality.successRate")} value={fmtPct(data.charts?.successRate)} hint={intl.get("digitalEmployee.portrait.quality.successHint")} />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.quality.toolErrorRate")}
          value={`${Number(data.charts?.errorRatePct ?? 0).toFixed(1)}%`}
          hint={
            data.charts?.toolUseCount > 0
              ? intl.get("digitalEmployee.portrait.quality.toolErrorHintWithData", { error: data.charts.toolErrorCount ?? 0, total: data.charts.toolUseCount })
              : intl.get("digitalEmployee.portrait.quality.toolErrorHintNoData")
          }
        />
      </div>
      <InfoList
        rows={[
          {
            label: intl.get("digitalEmployee.portrait.quality.abortedCount"),
            value: metricActionValue(intl.get("digitalEmployee.portrait.quality.abortedCount"), metricValue(rows, "aborted_session_count"), "aborted"),
          },
          {
            label: intl.get("digitalEmployee.portrait.quality.toolErrorCount"),
            value: metricActionValue(intl.get("digitalEmployee.portrait.quality.toolErrorCount"), metricValue(rows, "tool_error_count"), "tool"),
          },
          {
            label: intl.get("digitalEmployee.portrait.quality.execErrorCount"),
            value: metricActionValue(intl.get("digitalEmployee.portrait.quality.execErrorCount"), metricValue(rows, "exec_command_error_count"), "exec"),
          },
        ]}
      />
    </div>
  );
}

function TabEfficacy({ data }) {
  const rows = data.metrics || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.efficacy.scoreTitle")}
          value={metricValue(rows, "kpi_score")}
          hint={intl.get("digitalEmployee.portrait.efficacy.scoreHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.efficacy.sessionTotal")}
          value={data.charts?.sessionTotal ?? "—"}
          hint={intl.get("digitalEmployee.portrait.efficacy.sampleCount", { count: data.charts?.runtimeSampleCount ?? 0 })}
        />
        <CoreMetricCard title={intl.get("digitalEmployee.portrait.efficacy.successSessions")} value={data.charts?.successSessions ?? "—"} hint={intl.get("digitalEmployee.portrait.efficacy.successHint")} />
      </div>
      <InfoList
        rows={[
          { label: intl.get("digitalEmployee.portrait.efficacy.p95Duration"), value: fmtDurationMs(data.charts?.p95Ms) },
          { label: intl.get("digitalEmployee.portrait.efficacy.avgToolDuration"), value: fmtDurationMs(metricValue(rows, "avg_tool_duration_ms")) },
          { label: intl.get("digitalEmployee.portrait.efficacy.avgSessionDuration"), value: fmtDurationMs(metricValue(rows, "avg_runtime_ms")) },
          { label: intl.get("digitalEmployee.portrait.efficacy.efficiencyPerCost"), value: metricValue(rows, "efficiency_per_cost") },
        ]}
      />
    </div>
  );
}

function TabCost({ data }) {
  const rows = data.metrics || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.scoreTitle")}
          value={metricValue(rows, "kpi_score")}
          hint={intl.get("digitalEmployee.portrait.cost.scoreHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.dailyCost")}
          value={fmtUsd(data.charts?.dailyCostUsd)}
          hint={intl.get("digitalEmployee.portrait.cost.trendSampleDays", { days: data.charts?.costTrendDays ?? 0 })}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.cost.efficiencyRatio")}
          value={data.charts?.tokenRatio ?? "—"}
          hint={intl.get("digitalEmployee.portrait.cost.tokenRatioSample", { count: data.charts?.tokenRatioSampleCount ?? 0 })}
        />
      </div>
      <InfoList
        rows={[
          { label: intl.get("digitalEmployee.portrait.cost.inputTokens"), value: formatCostMetricWithUnit(rows, "input_tokens") },
          { label: intl.get("digitalEmployee.portrait.cost.outputTokens"), value: formatCostMetricWithUnit(rows, "output_tokens") },
          { label: intl.get("digitalEmployee.portrait.cost.totalTokens"), value: formatCostMetricWithUnit(rows, "total_tokens") },
          { label: intl.get("digitalEmployee.portrait.cost.inputUnitPrice"), value: formatCostMetricWithUnit(rows, "model_unit_cost_input") },
          { label: intl.get("digitalEmployee.portrait.cost.outputUnitPrice"), value: formatCostMetricWithUnit(rows, "model_unit_cost_output") },
          { label: intl.get("digitalEmployee.portrait.cost.estimatedCost"), value: formatCostMetricWithUnit(rows, "estimated_cost_usd") },
        ]}
      />
    </div>
  );
}

function TabSecurity({ data, rows = [] }) {
  const metricsRows = rows.length ? rows : data.metrics || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.security.scoreTitle")}
          value={metricValue(rows, "kpi_score")}
          hint={intl.get("digitalEmployee.portrait.security.scoreHint")}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.security.riskScoreTitle")}
          value={data.charts?.securityScore ?? "—"}
          hint={intl.get("digitalEmployee.portrait.security.riskScoreHint", { high: data.charts?.riskHighCount ?? 0, medium: data.charts?.riskMediumCount ?? 0, low: data.charts?.riskLowCount ?? 0 })}
        />
        <CoreMetricCard
          title={intl.get("digitalEmployee.portrait.security.riskLevelTitle")}
          value={data.charts?.securityLevel ?? "—"}
          hint={intl.get("digitalEmployee.portrait.security.riskLevelHint")}
        />
      </div>
      <InfoList
        rows={[
          { label: intl.get("digitalEmployee.portrait.security.execSecurityMode"), value: <PolicyValueBadge value={metricValue(metricsRows, "exec_security_mode")} /> },
          { label: intl.get("digitalEmployee.portrait.security.execAskPolicy"), value: <PolicyValueBadge value={metricValue(metricsRows, "exec_ask_policy")} /> },
          { label: intl.get("digitalEmployee.portrait.security.fsWorkspaceOnly"), value: <PolicyValueBadge value={metricValue(metricsRows, "fs_workspace_only")} /> },
          { label: intl.get("digitalEmployee.portrait.security.channelGroupPolicy"), value: <PolicyValueBadge value={metricValue(metricsRows, "channel_group_policy")} /> },
          { label: intl.get("digitalEmployee.portrait.security.elevatedAllowFrom"), value: <PolicyValueBadge value={metricValue(metricsRows, "elevated_allow_from")} /> },
          { label: intl.get("digitalEmployee.portrait.security.gatewayAuthMode"), value: <PolicyValueBadge value={metricValue(metricsRows, "gateway_auth_mode")} /> },
          {
            label: intl.get("digitalEmployee.portrait.security.gatewayDenyCommands"),
            value: <PolicyValueBadge value={metricValue(metricsRows, "gateway_deny_commands")} />,
          },
        ]}
      />
    </div>
  );
}
