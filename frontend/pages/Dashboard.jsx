import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import DigitalEmployeeOverview from "./DigitalEmployeeOverview.jsx";
import DigitalEmployeePortrait from "./DigitalEmployeePortrait.jsx";
import CostAnalysis from "./CostAnalysis.jsx";
import CostOverview2 from "./CostOverview2.jsx";
import AgentCostDetail from "./AgentCostDetail.jsx";
import LlmCost from "./LlmCost.jsx";
import FullChainTraceability from "./FullChainTraceability.jsx";
import ConfigChange from "./ConfigChange.jsx";
import SessionAudit from "./SessionAudit.jsx";
import AuditOverview from "./AuditOverview.jsx";

const PAGE_META = {
  panorama: { title: "数据总览", subtitle: "关键指标与订单一览 · 实时更新" },
  "digital-employee-overview": { title: "员工概览", subtitle: "数字员工规模与运行指标" },
  "digital-employee-list": { title: "数字员工画像", subtitle: "能力、指标与运行动态" },
  monitoring: { title: "基础监控", subtitle: "系统与资源监控" },
  alerts: { title: "告警事件", subtitle: "告警与事件处理" },
  audit: { title: "行为审计", subtitle: "用户与系统行为审计与合规记录" },
  "config-change": { title: "实例配置变更", subtitle: "关键配置项变更历史与合规留痕" },
  "audit-overview": {
    title: "行为审计概览",
    subtitle: "核心指标、风险统计、实时态势、趋势与排行",
  },
  "session-audit": { title: "会话链路溯源", subtitle: "OpenClaw 会话索引、模型与 Token 用量合规留痕" },
  traceability: { title: "全链路溯源", subtitle: "按会话 ID 查看链路时间轴与步骤详情" },
  inspection: { title: "定期巡检", subtitle: "巡检任务与报告" },
  "cost-overview": { title: "算力成本概览", subtitle: "总成本、日均与维度占比、趋势" },
  "cost-overview-2": { title: "会话成本明细", subtitle: "Agent、用户、Gateway、大模型多维过滤" },
  "agent-cost-detail": { title: "实例成本明细", subtitle: "总消耗、单任务均值、调用量与成功率" },
  "llm-cost": { title: "模型成本明细", subtitle: "按模型维度的 Token 与费用" },
};

const NAV = [
  {
    id: "full-time-monitoring",
    label: "全天候观测",
    icon: "clock",
    children: [
      { id: "config-change", label: "实例配置变更" },
    ],
  },
  {
    id: "security-audit",
    label: "风险感知",
    icon: "audit",
    children: [
      { id: "audit-overview", label: "行为审计概览" },
      // { id: "audit", label: "行为审计" },
      { id: "session-audit", label: "会话链路溯源" },
    ],
  },
  // { id: "inspection", label: "定期巡检", icon: "inspection" },
  {
    id: "cost-analysis",
    label: "生产力评估",
    icon: "costAnalysis",
    children: [
      { id: "cost-overview", label: "算力成本概览" },
      { id: "cost-overview-2", label: "会话成本明细" },
      { id: "agent-cost-detail", label: "实例成本明细" },
      { id: "llm-cost", label: "模型成本明细" },
    ],
  },
];

const STATS = [
  {
    title: "总营收",
    value: "¥1,284,590",
    delta: "+12.4%",
    positive: true,
    hint: "较上月",
    accent: "from-primary/10 to-blue-50 dark:from-primary/20 dark:to-gray-900",
  },
  {
    title: "订单量",
    value: "8,432",
    delta: "+5.2%",
    positive: true,
    hint: "较上月",
    accent: "from-emerald-50 to-emerald-50/50 dark:from-emerald-950/50 dark:to-gray-900",
  },
  {
    title: "活跃用户",
    value: "24,891",
    delta: "-2.1%",
    positive: false,
    hint: "较上月",
    accent: "from-amber-50 to-amber-50/30 dark:from-amber-950/40 dark:to-gray-900",
  },
  {
    title: "转化率",
    value: "3.28%",
    delta: "+0.4%",
    positive: true,
    hint: "较上月",
    accent: "from-violet-50 to-violet-50/40 dark:from-violet-950/40 dark:to-gray-900",
  },
];

const ROWS = [
  {
    id: "ORD-9821",
    name: "企业协作套件 · 年度",
    region: "华东",
    status: "已完成",
    amount: "¥48,000",
    date: "2025-03-18",
  },
  {
    id: "ORD-9820",
    name: "数据报表模块",
    region: "华北",
    status: "处理中",
    amount: "¥12,600",
    date: "2025-03-17",
  },
  {
    id: "ORD-9819",
    name: "API 网关扩容",
    region: "华南",
    status: "待审核",
    amount: "¥8,200",
    date: "2025-03-16",
  },
  {
    id: "ORD-9818",
    name: "安全审计服务",
    region: "西南",
    status: "已完成",
    amount: "¥22,400",
    date: "2025-03-15",
  },
];

function CollapsedNavGroupFlyout({ item, childActive, activeNav, setActiveNav, setHeaderExtra, setSidebarOpen }) {
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
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{item.label}</span>
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
                    {child.label}
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

function statusBadgeClass(status) {
  switch (status) {
    case "已完成":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20";
    case "处理中":
      return "bg-primary-soft text-primary ring-primary/15 dark:bg-primary/20 dark:text-primary dark:ring-primary/30";
    case "待审核":
      return "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25";
    case "已取消":
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
    return v || "audit-overview";
  });
  const [navGroupOpen, setNavGroupOpenRaw] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nav-group-open")) || {
        "digital-employee": true,
        "cost-analysis": true,
        "security-audit": true,
      };
    } catch {
      return { "digital-employee": true, "cost-analysis": true, "security-audit": true };
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerExtra, setHeaderExtra] = useState(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("全部");
  const [status, setStatus] = useState("全部");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);

  const setActiveNav = (id) => {
    setActiveNavRaw(id);
    localStorage.setItem("nav-active", id);
    setHeaderExtra(null);
  };

  const setNavGroupOpen = (updater) => {
    setNavGroupOpenRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem("nav-group-open", JSON.stringify(next));
      return next;
    });
  };

  const regions = ["全部", "华东", "华北", "华南", "西南"];
  const statuses = ["全部", "已完成", "处理中", "待审核", "已取消"];

  const filtered = useMemo(() => {
    return ROWS.filter((row) => {
      const q = query.trim().toLowerCase();
      const matchQ =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q);
      const matchR = region === "全部" || row.region === region;
      const matchS = status === "全部" || row.status === status;
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

  const page = PAGE_META[activeNav] ?? PAGE_META.panorama;

  // Build breadcrumb from NAV structure
  const crumbs = useMemo(() => {
    for (const item of NAV) {
      if (item.id === activeNav) return [{ id: item.id, label: item.label }];
      if (item.children) {
        const child = item.children.find((c) => c.id === activeNav);
        if (child) return [{ id: child.id, label: child.label }];
      }
    }
    return [{ id: activeNav, label: page.title }];
  }, [activeNav, page.title]);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="关闭菜单"
          className="fixed inset-0 z-40 bg-gray-900/40 transition-opacity duration-200 dark:bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex min-w-0 w-64 flex-col overflow-x-hidden border-r border-gray-200/80 bg-white shadow-card transition-transform duration-200 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none lg:relative lg:shrink-0 lg:translate-x-0",
          sidebarCollapsed ? "lg:w-16" : "",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6 dark:border-gray-800">
          <img
            src="/logo.png"
            alt="opsRobot"
            className="h-9 w-9 rounded-lg object-contain"
          />
          {!sidebarCollapsed && (
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">opsRobot</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Openclaw可观测性平台</p>
            </div>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto p-2">
          {NAV.map((item) => {
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
                      setHeaderExtra={setHeaderExtra}
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
                        <span className="flex-1 text-left">{item.label}</span>
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
                                {child.label}
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
                  title={item.label}
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
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar collapse toggle */}
        <div className="absolute bottom-4 right-3 hidden lg:flex lg:items-end lg:justify-end">
          <button
            type="button"
            title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
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
              <span className="whitespace-nowrap">收起侧栏</span>
            </span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={[
        "relative flex min-h-0 w-0 flex-1 flex-col transition-[padding-left] duration-200"
      ].join(" ")}>
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开菜单"
            >
              <Icon name="menu" />
            </button>
            <div className="flex flex-col">
              {headerExtra ? (
                headerExtra
              ) : (
                <nav aria-label="面包屑导航">
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
                            {crumb.label}
                          </button>
                        ) : (
                          <span className="font-semibold text-gray-800 dark:text-gray-100">
                            {crumb.label}
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
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {activeNav === "cost-overview" ? (
            <CostAnalysis />
          ) : activeNav === "cost-overview-2" ? (
            <CostOverview2 />
          ) : activeNav === "agent-cost-detail" ? (
            <AgentCostDetail />
          ) : activeNav === "llm-cost" ? (
            <LlmCost />
          ) : activeNav === "digital-employee-overview" ? (
            <DigitalEmployeeOverview />
          ) : activeNav === "digital-employee-list" ? (
            <DigitalEmployeePortrait />
          ) : activeNav === "config-change" ? (
            <ConfigChange />
          ) : activeNav === "audit-overview" ? (
            <AuditOverview />
          ) : activeNav === "session-audit" ? (
            <SessionAudit setHeaderExtra={setHeaderExtra} />
          ) : activeNav === "traceability" ? (
            <FullChainTraceability setHeaderExtra={setHeaderExtra} />
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {STATS.map((s) => (
                  <article
                    key={s.title}
                    className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-6 shadow-card transition duration-200 hover:shadow-card-hover dark:border-gray-800 dark:bg-gray-900 dark:shadow-none dark:hover:shadow-none"
                  >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.accent} opacity-80`} />
                    <div className="relative">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{s.title}</p>
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
                        <span className="text-xs text-gray-500 dark:text-gray-400">{s.hint}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </section>

              <section className="app-card p-4 mt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">订单明细</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">支持按名称、单号搜索，并按区域与状态筛选</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-gray-500">
                        <Icon name="search" className="h-4 w-4" />
                      </span>
                      <input
                        type="search"
                        placeholder="搜索订单号或产品名称…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="app-input w-full py-2.5 pl-10 pr-3 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">区域</span>
                        <select
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          className="app-input min-w-[140px] px-3 py-2.5"
                        >
                          {regions.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">状态</span>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className="app-input min-w-[140px] px-3 py-2.5"
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s}>
                              {s}
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
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">订单号</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">产品 / 项目</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">区域</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">状态</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">金额</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">日期</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                              没有匹配的订单，请调整搜索或筛选条件。
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
                                <span className="line-clamp-2">{row.name}</span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{row.region}</td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={[
                                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                    statusBadgeClass(row.status),
                                  ].join(" ")}
                                >
                                  {row.status}
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
                        共 {filtered.length} 条
                        {filtered.length > 0 && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {" "}
                            · 第 {ordersPage} / {ordersTotalPages} 页
                          </span>
                        )}
                      </span>
                      <label className="flex items-center gap-2">
                        <span className="text-gray-600 dark:text-gray-400">每页</span>
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
                              {n} 条
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
                            上一页
                          </button>
                          <button
                            type="button"
                            disabled={ordersPage >= ordersTotalPages}
                            onClick={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            下一页
                          </button>
                        </>
                      )}
                      <span className="text-gray-400 dark:text-gray-500 sm:ml-1">数据为演示数据，可对接真实 API</span>
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
