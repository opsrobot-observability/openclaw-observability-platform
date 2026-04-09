/**
 * Mock: GET /api/monitor-dashboard
 */
import { mockAuditOverview } from "./audit-overview.mjs";
import { mockOtelOverview } from "./otel-overview.mjs";

export function mockMonitorDashboard() {
  const otel = mockOtelOverview({ hours: 24 });
  const audit = mockAuditOverview(7);
  const todayW = audit.windows.today;
  const sum = audit.trends.sessions7d.reduce((a, x) => a + (Number(x.sessions) || 0), 0);

  const dailyToken = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const v = 1200000 + Math.floor(Math.random() * 400000);
    dailyToken.push({
      day,
      dateLabel: day.slice(5),
      value: v,
      valueMillions: v / 1e6,
    });
  }

  const byType = otel.tokenAnalytics.byType;
  let input = 0;
  let output = 0;
  for (const { name, value } of byType) {
    if (name === "input" || name === "prompt") input += value;
    else if (name === "output") output += value;
  }
  const t = input + output || 1;
  const ioDonut = [
    { value: Math.round((input / t) * 1000) / 10, name: `Input Token ${((input / t) * 100).toFixed(1)}%` },
    { value: Math.round((output / t) * 1000) / 10, name: `Output Token ${((output / t) * 100).toFixed(1)}%` },
  ];

  const byModel = [...otel.tokenAnalytics.byModel].sort((a, b) => b.value - a.value);
  const totalM = byModel.reduce((a, x) => a + x.value, 0) || 1;
  const modelDonut = byModel.slice(0, 4).map((x) => ({
    value: Math.round(((x.value / totalM) * 100) * 10) / 10,
    name: `${x.name} ${((x.value / totalM) * 100).toFixed(1)}%`,
  }));

  const ch = otel.tokenAnalytics.byChannel.slice(0, 10);
  const maxCh = Math.max(...ch.map((c) => c.value), 1);
  const topAgentsBar = {
    categories: ch.map((c) => String(c.name).slice(0, 16)).reverse(),
    values: ch.map((c) => Math.round((c.value / maxCh) * 100)).reverse(),
  };

  const digitalEmployees = otel.instances.map((r) => ({
    id: r.id,
    name: r.hostName || r.name,
    status: r.status,
    active: r.status === "在线",
    sessions: String(r.sessionTotal),
    token: r.tokenConsumption,
  }));

  return {
    generatedAt: new Date().toISOString(),
    params: { otelHours: 24, trendDays: 14 },
    legend: {
      riskCounts: "Mock 数据",
      otelKpis: "Mock 数据",
    },
    centerKpis: {
      agentTotal: otel.instances.length,
      userTotal: todayW.user_access,
      terminalCount: todayW.device_connections,
      tokenDisplay: "2.48M",
      tokenRaw: otel.overview.totalTokens,
    },
    sessionOverview: {
      todaySessionTotal: todayW.session_total,
      riskHigh: audit.risk.high,
      riskMedium: audit.risk.medium,
      riskLow: audit.risk.low,
    },
    charts: {
      dailyToken,
      ioDonut,
      modelDonut,
      topAgentsBar,
      sessionTrend: audit.trends.sessions7d.map((x) => ({
        dateLabel: x.dateLabel,
        day: x.day,
        sessions: x.sessions,
      })),
      sessionTrendTotal: sum,
    },
    digitalEmployees,
    otel,
    audit,
  };
}
