/**
 * Mock: GET /api/agent-sessions-audit-overview
 * 对齐 backend/security-audit/audit-dashboard-query.mjs → queryAuditDashboardMetrics()
 */

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function mockAuditOverview(days = 7) {
  const now = Date.now();
  const todayStart = startOfDay();
  const weekStart = todayStart - 6 * 86400000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const factor = days / 7;
  const summary = {
    session_total: Math.floor(312 * factor),
    active_sessions: Math.floor(85 * factor),
    user_access: Math.floor(34 * factor),
    device_connections: Math.floor(22 * factor),
  };

  const windows = {
    today: { session_total: 42, active_sessions: 18, user_access: 12, device_connections: 8 },
    week: { session_total: 312, active_sessions: 85, user_access: 34, device_connections: 22 },
    month: { session_total: 1247, active_sessions: 156, user_access: 67, device_connections: 45 },
  };

  const risk = {
    high: 23,
    medium: 67,
    low: 145,
    riskSessionCount: 48,
    sessionsInMonth: 1247,
    riskSessionRatio: 48 / 1247,
  };

  const realtime = {
    onlineSessions: 5,
    abnormalDisconnectSessions: 2,
  };

  // 会话趋势（7 日，与 audit-dashboard-query trends 一致）
  const sessionsTrend = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayStr(-i);
    sessionsTrend.push({
      dateLabel: day.slice(5),
      day,
      sessions: 30 + Math.floor(Math.random() * 30),
    });
  }
  // 风险趋势
  const riskTrend = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayStr(-i);
    const h = Math.floor(Math.random() * 8);
    const m = Math.floor(Math.random() * 15);
    const l = Math.floor(Math.random() * 30);
    riskTrend.push({
      dateLabel: day.slice(5),
      day,
      high: h,
      medium: m,
      low: l,
      total: h + m + l,
    });
  }

  const tops = {
    users: [
      { name: "zhangsan@corp.example", cnt: 156 },
      { name: "bot-runner@infra", cnt: 98 },
      { name: "api-key-***7abf", cnt: 72 },
      { name: "hr-admin@corp.example", cnt: 45 },
      { name: "compliance@corp.example", cnt: 33 },
    ],
    devices: [
      { name: "web / ", cnt: 234 },
      { name: "internal / ", cnt: 178 },
      { name: "api / ", cnt: 120 },
      { name: "feishu / feishu-app", cnt: 89 },
      { name: "dingtalk / dd-bot", cnt: 45 },
    ],
    riskOps: [
      { name: "exec", cnt: 34 },
      { name: "crm.lookup_ticket", cnt: 22 },
      { name: "warehouse.run_sql", cnt: 18 },
      { name: "退出码·1", cnt: 12 },
      { name: "工具结果·错误", cnt: 8 },
      { name: "助手停止·max_tokens", cnt: 5 },
    ],
  };

  const pieRisk = [
    { name: "高风险操作", value: 23, fill: "#ef4444" },
    { name: "中风险操作", value: 67, fill: "#f59e0b" },
    { name: "低风险操作", value: 145, fill: "#0ea5e9" },
  ];

  return {
    generatedAt: now,
    bounds: { todayStart, weekStart, monthStart },
    summary,
    windows,
    risk,
    realtime,
    trends: { sessions7d: sessionsTrend, risk7d: riskTrend },
    tops,
    pieRisk,
    legend: {
      windows: "Mock 数据 · 无需数据库连接",
      realtime: "Mock 数据 · 无需数据库连接",
      topRiskOps: "Mock 数据 · 无需数据库连接",
    },
  };
}
