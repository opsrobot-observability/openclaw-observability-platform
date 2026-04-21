import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import LanguageSwitch from "../components/LanguageSwitch.jsx";
import DigitalEmployeePortrait from "./digital-employee/DigitalEmployeePortrait.jsx";
import CostAnalysis from "./CostAnalysis.jsx";
import CostOverview2 from "./CostOverview2.jsx";
import AgentCostDetail from "./AgentCostDetail.jsx";
import LlmCost from "./LlmCost.jsx";
import FullChainTraceability from "./FullChainTraceability.jsx";
import OpenClawInstance from "./OpenClawInstance.jsx";
import InstanceMonitoring from "./InstanceMonitoring.jsx";
import SessionAudit from "./SessionAudit.jsx";
import AuditOverview from "./AuditOverview.jsx";
import LogSearch from "./LogSearch.jsx";
import MonitorDashboard from "./monitor-dashboard/index.jsx";

const PAGE_META_KEYS = {
  panorama: { title: "page.panorama.title", subtitle: "page.panorama.subtitle" },
  "digital-employee-list": { title: "page.digitalEmployeeList.title", subtitle: "page.digitalEmployeeList.subtitle" },
  monitoring: { title: "page.monitoring.title", subtitle: "page.monitoring.subtitle" },
  alerts: { title: "page.alerts.title", subtitle: "page.alerts.subtitle" },
  audit: { title: "page.audit.title", subtitle: "page.audit.subtitle" },
  "audit-overview": { title: "page.auditOverview.title", subtitle: "page.auditOverview.subtitle" },
  "session-audit": { title: "page.sessionAudit.title", subtitle: "page.sessionAudit.subtitle" },
  traceability: { title: "page.traceability.title", subtitle: "page.traceability.subtitle" },
  inspection: { title: "page.inspection.title", subtitle: "page.inspection.subtitle" },
  "cost-overview": { title: "page.costOverview.title", subtitle: "page.costOverview.subtitle" },
  "cost-overview-2": { title: "page.costOverview2.title", subtitle: "page.costOverview2.subtitle" },
  "agent-cost-detail": { title: "page.agentCostDetail.title", subtitle: "page.agentCostDetail.subtitle" },
  "llm-cost": { title: "page.llmCost.title", subtitle: "page.llmCost.subtitle" },
  "openclaw-instance": { title: "page.openclawInstance.title", subtitle: "page.openclawInstance.subtitle" },
  "instance-monitoring": { title: "page.instanceMonitoring.title", subtitle: "page.instanceMonitoring.subtitle" },
  "monitor-dashboard": { title: "page.monitorDashboard.title", subtitle: "page.monitorDashboard.subtitle" },
};

const NAV_KEYS = [
  {
    id: "full-time-monitoring",
    labelKey: "nav.fullTimeMonitoring",
    icon: "clock",
    children: [
      { id: "monitor-dashboard", labelKey: "nav.monitorDashboard" },
      { id: "openclaw-instance", labelKey: "nav.openclawInstance" },
      // 数字员工：数据来自 /api/digital-employees/* 版本 1.0.1
      { id: "digital-employee-list", labelKey: "nav.digitalEmployeeList" },
    ],
  },
  {
    id: "security-audit",
    labelKey: "nav.riskPerception",
    icon: "audit",
    children: [
      { id: "audit-overview", labelKey: "nav.auditOverview" },
      { id: "session-audit", labelKey: "nav.sessionAudit" },
      { id: "log-search", labelKey: "nav.logSearch" },
    ],
  },
  {
    id: "cost-analysis",
    labelKey: "nav.costAnalysis",
    icon: "costAnalysis",
    children: [
      { id: "cost-overview", labelKey: "nav.costOverview" },
      { id: "cost-overview-2", labelKey: "nav.costOverview2" },
      { id: "agent-cost-detail", labelKey: "nav.agentCostDetail" },
      { id: "llm-cost", labelKey: "nav.llmCost" },
    ],
  },
];

const STATS_KEYS = [
  {
    titleKey: "dashboard.totalRevenue",
    value: "¥1,284,590",
    delta: "+12.4%",
    positive: true,
    hintKey: "dashboard.vsLastMonth",
    accent: "from-primary/10 to-blue-50 dark:from-primary/20 dark:to-gray-900",
  },
  {
    titleKey: "dashboard.orderCount",
    value: "8,432",
    delta: "+5.2%",
    positive: true,
    hintKey: "dashboard.vsLastMonth",
    accent: "from-emerald-50 to-emerald-50/50 dark:from-emerald-950/50 dark:to-gray-900",
  },
  {
    titleKey: "dashboard.activeUsers",
    value: "24,891",
    delta: "-2.1%",
    positive: false,
    hintKey: "dashboard.vsLastMonth",
    accent: "from-amber-50 to-amber-50/30 dark:from-amber-950/40 dark:to-gray-900",
  },
  {
    titleKey: "dashboard.conversionRate",
    value: "3.28%",
    delta: "+0.4%",
    positive: true,
    hintKey: "dashboard.vsLastMonth",
    accent: "from-violet-50 to-violet-50/40 dark:from-violet-950/40 dark:to-gray-900",
  },
];

const ROWS = [
  {
    id: "ORD-9821",
    nameKey: "enterprise_collab_annual",
    name_zh: "企业协作套件 · 年度",
    name_en: "Enterprise Collab Suite · Annual",
    regionKey: "dashboard.regionEast",
    statusKey: "dashboard.statusDone",
    amount: "¥48,000",
    date: "2025-03-18",
  },
  {
    id: "ORD-9820",
    nameKey: "data_report_module",
    name_zh: "数据报表模块",
    name_en: "Data Report Module",
    regionKey: "dashboard.regionNorth",
    statusKey: "dashboard.statusProcessing",
    amount: "¥12,600",
    date: "2025-03-17",
  },
  {
    id: "ORD-9819",
    nameKey: "api_gateway_expand",
    name_zh: "API 网关扩容",
    name_en: "API Gateway Expansion",
    regionKey: "dashboard.regionSouth",
    statusKey: "dashboard.statusPending",
    amount: "¥8,200",
    date: "2025-03-16",
  },
  {
    id: "ORD-9818",
    nameKey: "security_audit_service",
    name_zh: "安全审计服务",
    name_en: "Security Audit Service",
    regionKey: "dashboard.regionSouthwest",
    statusKey: "dashboard.statusDone",
    amount: "¥22,400",
    date: "2025-03-15",
  },
];

function CollapsedNavGroupFlyout({ item, childActive, activeNav, setActiveNav, setSidebarOpen }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({ top: r.top, left: r.right + 8 });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={[
          "flex w-full items-center justify-center rounded-lg py-2.5 transition-colors duration-200",
          childActive
            ? "bg-primary-soft/80 text-primary dark:bg-primary/15 dark:text-primary"
            : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
        ].join(" ")}
      >
        <Icon
          name={item.icon}
          className={`h-5 w-5 ${childActive ? "text-primary" : "text-gray-400 dark:text-gray-500"}`}
        />
      </button>
      {open && createPortal(
        <div
          className="fixed z-[200] w-44 -translate-x-2 pt-0 pl-2"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xl backdrop-blur-sm dark:border-gray-700/60 dark:bg-gray-900/95">
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5 dark:border-gray-700/60">
              <Icon
                name={item.icon}
                className={`h-4 w-4 ${childActive ? "text-primary" : "text-gray-400"}`}
              />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{intl.get(item.labelKey)}</span>
            </div>
            <div className="p-1">
              {item.children.map((child) => {
                const active = activeNav === child.id;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(child.id);
                      setSidebarOpen(false);
                    }}
                    className={[
                      "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
                      active
                        ? "bg-primary-soft font-medium text-primary dark:bg-primary/15 dark:text-primary"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                    ].join(" ")}
                  >
                    {intl.get(child.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function statusBadgeClass(statusKey) {
  switch (statusKey) {
    case "dashboard.statusDone":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20";
    case "dashboard.statusProcessing":
      return "bg-primary-soft text-primary ring-primary/15 dark:bg-primary/20 dark:text-primary dark:ring-primary/30";
    case "dashboard.statusPending":
      return "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25";
    case "dashboard.statusCancelled":
      return "bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-500/20";
    default:
      return "bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-500/20";
  }
}

export default function Dashboard() {
  const [activeNav, setActiveNavRaw] = useState(() => {
    const v = localStorage.getItem("nav-active");
    if (v === "logs") {
      localStorage.setItem("nav-active", "audit-overview");
      return "audit-overview";
    }
    if (v === "digital-employee-overview") {
      localStorage.setItem("nav-active", "digital-employee-list");
      return "digital-employee-list";
    }
    if (v === "otel-overview" || v === "config-change") {
      localStorage.setItem("nav-active", "openclaw-instance");
      return "openclaw-instance";
    }
    return v || "audit-overview";
  });
  const [navGroupOpen, setNavGroupOpenRaw] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nav-group-open")) || {
        "full-time-monitoring": true,
        "cost-analysis": true,
        "security-audit": true,
      };
    } catch {
      return { "full-time-monitoring": true, "cost-analysis": true, "security-audit": true };
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navParams, setNavParams] = useState(null);
  const [headerExtra, setHeaderExtra] = useState(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("dashboard.regionAll");
  const [status, setStatus] = useState("dashboard.statusAll");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const setActiveNav = (id, params = null) => {
    setActiveNavRaw(id);
    setNavParams(params);
    localStorage.setItem("nav-active", id);
    if (id === "log-search") setSidebarCollapsed(true);
  };
  // 数字员工概览「查看画像」等跨页跳转（CustomEvent），版本 1.0.1
  useEffect(() => {
    const onNav = (e) => {
      let id = e?.detail?.id;
      let params = e?.detail?.params ?? null;
      if (!id || typeof id !== "string") return;
      if (id === "digital-employee-overview") id = "digital-employee-list";
      if (id === "otel-overview" || id === "config-change") id = "openclaw-instance";
      setActiveNav(id, params);
      setSidebarOpen(false);
    };
    window.addEventListener("openclaw-nav", onNav);
    return () => window.removeEventListener("openclaw-nav", onNav);
  }, []);
  useEffect(() => {
    setHeaderExtra(null);
  }, [activeNav]);

  const setNavGroupOpen = (updater) => {
    setNavGroupOpenRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem("nav-group-open", JSON.stringify(next));
      return next;
    });
  };

  const regionKeys = ["dashboard.regionAll", "dashboard.regionEast", "dashboard.regionNorth", "dashboard.regionSouth", "dashboard.regionSouthwest"];
  const statusKeys = ["dashboard.statusAll", "dashboard.statusDone", "dashboard.statusProcessing", "dashboard.statusPending", "dashboard.statusCancelled"];

  const filtered = useMemo(() => {
    return ROWS.filter((row) => {
      const q = query.trim().toLowerCase();
      const matchQ =
        !q ||
        row.name_zh.toLowerCase().includes(q) ||
        row.name_en.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q);
      const matchR = region === "dashboard.regionAll" || row.regionKey === region;
      const matchS = status === "dashboard.statusAll" || row.statusKey === status;
      return matchQ && matchR && matchS;
    });
  }, [query, region, status]);

  const ordersTotalPages = Math.max(1, Math.ceil(filtered.length / ordersPageSize) || 1);

  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ordersPageSize;
    return filtered.slice(start, start + ordersPageSize);
  }, [filtered, ordersPage, ordersPageSize]);

  useEffect(() => {
    setOrdersPage(1);
  }, [query, region, status]);

  useEffect(() => {
    if (ordersPage > ordersTotalPages) setOrdersPage(ordersTotalPages);
  }, [ordersPage, ordersTotalPages]);

  const pageKeys = PAGE_META_KEYS[activeNav] ?? PAGE_META_KEYS.panorama;

  const crumbs = useMemo(() => {
    for (const item of NAV_KEYS) {
      if (item.id === activeNav) return [{ id: item.id, labelKey: item.labelKey }];
      if (item.children) {
        const child = item.children.find((c) => c.id === activeNav);
        if (child) return [{ id: child.id, labelKey: child.labelKey }];
      }
    }
    return [{ id: activeNav, labelKey: pageKeys.title }];
  }, [activeNav, pageKeys.title]);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label={intl.get("common.closeMenu")}
          className="fixed inset-0 z-40 bg-gray-900/40 transition-opacity duration-200 dark:bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex min-w-0 w-64 flex-col overflow-x-hidden border-r border-gray-200/80 bg-white shadow-card transition-transform duration-200 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none lg:relative lg:shrink-0 lg:translate-x-0",
          sidebarCollapsed ? "lg:w-16" : "",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6 dark:border-gray-800">
          <img
            src="/logo.svg"
            alt="opsRobot"
            className="h-9 w-9 rounded-lg object-contain"
          />
          {!sidebarCollapsed && (
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">opsRobot</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("common.platformName")}</p>
            </div>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto p-2">
          {NAV_KEYS.map((item) => {
            if (item.children) {
              const childActive = item.children.some((c) => c.id === activeNav);
              return (
                <div key={item.id} className="space-y-0.5">
                  {sidebarCollapsed ? (
                    <CollapsedNavGroupFlyout
                      item={item}
                      childActive={childActive}
                      activeNav={activeNav}
                      setActiveNav={setActiveNav}
                      setSidebarOpen={setSidebarOpen}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setNavGroupOpen((prev) => ({
                            ...prev,
                            [item.id]: !(prev[item.id] ?? true),
                          }))
                        }
                        className={[
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                          childActive
                            ? "text-primary"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                        ].join(" ")}
                      >
                        <Icon
                          name={item.icon}
                          className={childActive ? "h-5 w-5 text-primary" : "h-5 w-5 text-gray-400 dark:text-gray-500"}
                        />
                        <span className="flex-1 text-left">{intl.get(item.labelKey)}</span>
                        <Icon
                          name="chevron"
                          className={[
                            "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
                            (navGroupOpen[item.id] ?? true) ? "rotate-180" : "",
                          ].join(" ")}
                        />
                      </button>
                      {(navGroupOpen[item.id] ?? true) && (
                        <div className="ml-[22px] space-y-0.5 border-l border-gray-200 dark:border-gray-700">
                          {item.children.map((child) => {
                            const active = activeNav === child.id;
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => {
                                  setActiveNav(child.id);
                                  setSidebarOpen(false);
                                }}
                                className={[
                                  "flex ml-2 mr-2 rounded-md py-2 pl-[14px] pr-2 text-left text-sm transition-colors duration-200",
                                  active
                                    ? "bg-primary-soft font-medium text-primary shadow-sm dark:bg-primary/15 dark:text-primary"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                                ].join(" ")}
                              >
                                {intl.get(child.labelKey)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            }

            const active = activeNav === item.id;
            if (sidebarCollapsed) {
              return (
                <button
                  key={item.id}
                  type="button"
                  title={intl.get(item.labelKey)}
                  onClick={() => {
                    setActiveNav(item.id);
                    setSidebarOpen(false);
                  }}
                  className={[
                    "group relative flex w-full items-center justify-center rounded-lg py-2.5 transition-colors duration-200",
                    active
                      ? "bg-primary-soft text-primary shadow-sm dark:bg-primary/15 dark:text-primary"
                      : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  <Icon
                    name={item.icon}
                    className={`h-5 w-5 ${active ? "text-primary" : "text-gray-400 dark:text-gray-500"}`}
                  />
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 mx-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 lg:block hidden" />
                </button>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveNav(item.id);
                  setSidebarOpen(false);
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                  active
                    ? "bg-primary-soft text-primary shadow-sm dark:bg-primary/15 dark:text-primary"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                ].join(" ")}
              >
                <Icon name={item.icon} className={active ? "h-5 w-5 text-primary" : "h-5 w-5 text-gray-400 dark:text-gray-500"} />
                {intl.get(item.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-4 right-3 hidden lg:flex lg:items-end lg:justify-end">
          <button
            type="button"
            title={sidebarCollapsed ? intl.get("common.expandSidebar") : intl.get("common.collapseSidebar")}
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="group relative flex h-8 items-center gap-1.5 rounded-full border border-gray-200/70 bg-white/80 px-2 py-1 text-xs font-medium text-gray-500 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/30 hover:bg-white hover:text-primary hover:shadow-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-400 dark:hover:border-primary/40 dark:hover:bg-gray-900 dark:hover:text-primary dark:hover:shadow-primary/10"
          >
            <span className="flex h-5 w-5 items-center justify-center overflow-hidden">
              <span
                className={`flex h-5 w-5 items-center justify-center transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : "rotate-0"
                  }`}
              >
                <Icon name="sidebarPanel" className="h-3.5 w-3.5" />
              </span>
            </span>
            {!sidebarCollapsed && <span
              className={`overflow-hidden transition-all duration-300 w-12 opacity-100 mt-0.5`}
            >
              <span className="whitespace-nowrap">{intl.get("common.collapseSidebar")}</span>
            </span>}
          </button>
        </div>
      </aside>

      <div className={[
        "relative flex min-h-0 w-0 flex-1 flex-col transition-[padding-left] duration-200"
      ].join(" ")}>
        <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label={intl.get("common.openMenu")}
            >
              <Icon name="menu" />
            </button>
            <div className="flex flex-col">
              {headerExtra ? (
                headerExtra
              ) : (
                <nav aria-label={intl.get("common.breadcrumb")}>
                  <ol className="flex items-center gap-1.5 text-sm">
                    {crumbs.map((crumb, i) => (
                      <li key={crumb.id} className="flex items-center gap-1.5">
                        {i > 0 ? "/" : ''}
                        {i < crumbs.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setActiveNav(crumb.id)}
                            className="rounded-md px-1.5 py-1 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            {intl.get(crumb.labelKey)}
                          </button>
                        ) : (
                          <span className="font-semibold text-gray-800 dark:text-gray-100">
                            {intl.get(crumb.labelKey)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="https://github.com/opsrobot-observability/openclaw-observability-platform"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto ${activeNav === "monitor-dashboard" ? "flex flex-col" : "p-6"}`}>
          {activeNav === "openclaw-instance" ? (
            <OpenClawInstance />
          ) : activeNav === "monitor-dashboard" ? (
            <MonitorDashboard />
          ) : activeNav === "instance-monitoring" ? (
            <InstanceMonitoring />
          ) : activeNav === "cost-overview" ? (
            <CostAnalysis />
          ) : activeNav === "cost-overview-2" ? (
            <CostOverview2 />
          ) : activeNav === "agent-cost-detail" ? (
            <AgentCostDetail params={navParams} />
          ) : activeNav === "llm-cost" ? (
            <LlmCost params={navParams} />
          ) : activeNav === "digital-employee-list" ? (
            <DigitalEmployeePortrait />
          ) : activeNav === "audit-overview" ? (
            <AuditOverview />
          ) : activeNav === "session-audit" ? (
            <SessionAudit setHeaderExtra={setHeaderExtra} />
          ) : activeNav === "log-search" ? (
            <LogSearch />
          ) : activeNav === "traceability" ? (
            <FullChainTraceability setHeaderExtra={setHeaderExtra} />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {STATS_KEYS.map((s) => (
                  <article
                    key={s.titleKey}
                    className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-6 shadow-card transition duration-200 hover:shadow-card-hover dark:border-gray-800 dark:bg-gray-900 dark:shadow-none dark:hover:shadow-none"
                  >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.accent} opacity-80`} />
                    <div className="relative">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{intl.get(s.titleKey)}</p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">{s.value}</p>
                      <div className="mt-4 flex items-center gap-2 text-sm">
                        <span
                          className={[
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                            s.positive
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20"
                              : "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/20",
                          ].join(" ")}
                        >
                          {s.delta}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(s.hintKey)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </section>

              <section className="app-card p-4 mt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("dashboard.orderDetail")}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{intl.get("dashboard.orderDetailDesc")}</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-gray-500">
                        <Icon name="search" className="h-4 w-4" />
                      </span>
                      <input
                        type="search"
                        placeholder={intl.get("dashboard.searchPlaceholder")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="app-input w-full py-2.5 pl-10 pr-3 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{intl.get("dashboard.region")}</span>
                        <select
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          className="app-input min-w-[140px] px-3 py-2.5"
                        >
                          {regionKeys.map((r) => (
                            <option key={r} value={r}>
                              {intl.get(r)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{intl.get("dashboard.status")}</span>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className="app-input min-w-[140px] px-3 py-2.5"
                        >
                          {statusKeys.map((s) => (
                            <option key={s} value={s}>
                              {intl.get(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("dashboard.orderId")}</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("dashboard.product")}</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("dashboard.region")}</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("dashboard.status")}</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{intl.get("dashboard.amount")}</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("dashboard.date")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                              {intl.get("dashboard.noMatchOrders")}
                            </td>
                          </tr>
                        ) : (
                          paginatedOrders.map((row, i) => (
                            <tr
                              key={row.id}
                              className={[
                                "transition-colors duration-200 hover:bg-primary-soft/40 dark:hover:bg-primary/10",
                                i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/40" : "bg-white dark:bg-transparent",
                              ].join(" ")}
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-gray-800 dark:text-gray-200">
                                {row.id}
                              </td>
                              <td className="max-w-[220px] px-4 py-3 text-gray-800 dark:text-gray-200">
                                <span className="line-clamp-2">{intl.options.currentLocale === "zh-CN" ? row.name_zh : row.name_en}</span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{intl.get(row.regionKey)}</td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={[
                                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                    statusBadgeClass(row.statusKey),
                                  ].join(" ")}
                                >
                                  {intl.get(row.statusKey)}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                {row.amount}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{row.date}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        {intl.get("common.total", { count: filtered.length })}
                        {filtered.length > 0 && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {" "}
                            · {intl.get("common.page", { current: ordersPage, total: ordersTotalPages })}
                          </span>
                        )}
                      </span>
                      <label className="flex items-center gap-2">
                        <span className="text-gray-600 dark:text-gray-400">{intl.get("common.perPage")}</span>
                        <select
                          value={ordersPageSize}
                          onChange={(e) => {
                            setOrdersPageSize(Number(e.target.value));
                            setOrdersPage(1);
                          }}
                          className="rounded-md border border-gray-200 bg-white py-1.5 pl-2 pr-7 text-xs text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                        >
                          {[5, 10, 20].map((n) => (
                            <option key={n} value={n}>
                              {n} {intl.get("common.items")}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {filtered.length > 0 && (
                        <>
                          <button
                            type="button"
                            disabled={ordersPage <= 1}
                            onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            {intl.get("common.prevPage")}
                          </button>
                          <button
                            type="button"
                            disabled={ordersPage >= ordersTotalPages}
                            onClick={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            {intl.get("common.nextPage")}
                          </button>
                        </>
                      )}
                      <span className="text-gray-400 dark:text-gray-500 sm:ml-1">{intl.get("common.demoDataHint")}</span>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

