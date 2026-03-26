import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "../components/ThemeToggle.jsx";
import LogSearch from "./LogSearch.jsx";
import DigitalEmployeeOverview from "./DigitalEmployeeOverview.jsx";
import DigitalEmployeePortrait from "./DigitalEmployeePortrait.jsx";
import CostAnalysis from "./CostAnalysis.jsx";
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
  "config-change": { title: "配置变更", subtitle: "关键配置项变更历史与合规留痕" },
  "audit-overview": {
    title: "审计概览",
    subtitle: "核心指标、风险统计、实时态势、趋势与排行（Doris 聚合）",
  },
  "session-audit": { title: "会话审计", subtitle: "OpenClaw 会话索引、模型与 Token 用量合规留痕" },
  traceability: { title: "全链路溯源", subtitle: "按会话 ID 查看链路时间轴与步骤详情" },
  logs: { title: "日志查询", subtitle: "Doris otel.agent_sessions_logs 检索、趋势与详情" },
  inspection: { title: "定期巡检", subtitle: "巡检任务与报告" },
  "cost-overview": { title: "成本概览", subtitle: "总成本、日均与维度占比、趋势" },
  "agent-cost-detail": { title: "Agent 成本列表", subtitle: "总消耗、单任务均值、调用量与成功率" },
  "llm-cost": { title: "LLM 成本明细", subtitle: "按模型维度的 Token 与费用" },
};

const NAV = [
  // { id: "panorama", label: "全景概览", icon: "panorama" },
  // {
  //   id: "digital-employee",
  //   label: "数字员工",
  //   icon: "digitalEmployee",
  //   children: [
  //     { id: "digital-employee-overview", label: "员工概览" },
  //     { id: "digital-employee-list", label: "员工列表" },
  //   ],
  // },
  // { id: "monitoring", label: "基础监控", icon: "monitoring" },
  // { id: "alerts", label: "告警事件", icon: "alerts" },
  {
    id: "security-audit",
    label: "安全审计",
    icon: "audit",
    children: [
      { id: "audit-overview", label: "审计概览" },
      // { id: "audit", label: "行为审计" },
      { id: "config-change", label: "配置变更" },
      { id: "session-audit", label: "会话审计" },
      { id: "traceability", label: "全链路溯源" },
    ],
  },
  { id: "logs", label: "日志查询", icon: "logs" },
  // { id: "inspection", label: "定期巡检", icon: "inspection" },
  {
    id: "cost-analysis",
    label: "成本分析",
    icon: "costAnalysis",
    children: [
      { id: "cost-overview", label: "成本概览" },
      { id: "agent-cost-detail", label: "Agent成本列表" },
      { id: "llm-cost", label: "LLM成本明细" },
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
  {
    id: "ORD-9817",
    name: "客服机器人定制",
    region: "华东",
    status: "已取消",
    amount: "¥0",
    date: "2025-03-14",
  },
  {
    id: "ORD-9816",
    name: "BI 看板部署",
    region: "华北",
    status: "已完成",
    amount: "¥31,500",
    date: "2025-03-12",
  },
  {
    id: "ORD-9815",
    name: "消息推送通道",
    region: "华东",
    status: "处理中",
    amount: "¥6,800",
    date: "2025-03-11",
  },
  {
    id: "ORD-9814",
    name: "身份认证改造",
    region: "华南",
    status: "已完成",
    amount: "¥19,200",
    date: "2025-03-10",
  },
  {
    id: "ORD-9813",
    name: "日志归档策略",
    region: "西南",
    status: "待审核",
    amount: "¥3,500",
    date: "2025-03-09",
  },
];

function Icon({ name, className = "h-5 w-5" }) {
  const common = `${className} shrink-0`;
  switch (name) {
    case "menu":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      );
    case "search":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      );
    case "bell":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.082A2.02 2.02 0 0016 14.93V12a8 8 0 10-16 0v2.93a2.02 2.02 0 001.057 1.07l.01.005M14.857 17.082a23.848 23.848 0 01-5.454 1.082M14.857 17.082a23.848 23.848 0 00-5.454-1.082M9.143 17.082a23.848 23.848 0 01-5.454-1.082M9.143 17.082a23.848 23.848 0 00-5.454-1.082" />
        </svg>
      );
    case "panorama":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m0 0V9A2.25 2.25 0 0015.75 7h-1.5m-6 0V9A2.25 2.25 0 009 11.25v5.25m0 0h6" />
        </svg>
      );
    case "digitalEmployee":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      );
    case "monitoring":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a3 3 0 003-3V5.25a3 3 0 00-3-3H6.75a3 3 0 00-3 3v13.5a3 3 0 003 3z" />
        </svg>
      );
    case "alerts":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case "audit":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case "logs":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "inspection":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      );
    case "costAnalysis":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
          />
        </svg>
      );
    case "chevron":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      );
    default:
      return null;
  }
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
  const [activeNav, setActiveNav] = useState("panorama");
  const [navGroupOpen, setNavGroupOpen] = useState({
    "digital-employee": true,
    "cost-analysis": true,
    "security-audit": true,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("全部");
  const [status, setStatus] = useState("全部");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(5);

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

  return (
    <div className="flex min-h-screen">
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200/80 bg-white shadow-card transition-transform duration-200 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6 dark:border-gray-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#2563eb] text-sm font-bold text-white shadow-sm">
            O
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">OpenclawObservability</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Openclaw可观测性平台</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {NAV.map((item) => {
            if (item.children) {
              const childActive = item.children.some((c) => c.id === activeNav);
              return (
                <div key={item.id} className="space-y-1">
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
                        ? "bg-primary-soft/80 text-primary dark:bg-primary/15 dark:text-primary"
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
                    <div className="ml-2 space-y-0.5 border-l border-gray-200 pl-3 dark:border-gray-700">
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
                              "flex w-full rounded-md py-2 pl-3 pr-2 text-left text-sm transition-colors duration-200",
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
                </div>
              );
            }

            const active = activeNav === item.id;
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

        <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/60">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">需要帮助？</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">查看文档或联系管理员获取权限与数据说明。</p>
            <button
              type="button"
              className="mt-3 w-full rounded-md bg-white px-3 py-2 text-xs font-medium text-primary shadow-sm ring-1 ring-gray-200 transition hover:bg-primary-soft hover:ring-primary/20 dark:bg-gray-800 dark:ring-gray-700 dark:hover:bg-primary/20"
            >
              打开帮助中心
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col lg:ml-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-gray-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开菜单"
            >
              <Icon name="menu" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">{page.title}</h1>
              <p className="hidden text-sm text-gray-500 dark:text-gray-400 sm:block">{page.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <button
              type="button"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label="通知"
            >
              <Icon name="bell" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-950" />
            </button>
            <div className="hidden h-8 w-px bg-gray-200 dark:bg-gray-700 sm:block" />
            <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-gray-50 dark:hover:bg-gray-800/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-xs font-semibold text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-200">
                K
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Kevin</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">管理员</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {activeNav === "logs" ? (
            <LogSearch />
          ) : activeNav === "cost-overview" ? (
            <CostAnalysis />
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
            <SessionAudit />
          ) : activeNav === "traceability" ? (
            <FullChainTraceability />
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

              <section className="app-card p-4 sm:p-6">
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
