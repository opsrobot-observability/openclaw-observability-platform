function pad2(v) {
  return String(v).padStart(2, "0");
}

function fmtDay(ts) {
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTokenCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function buildDailyTokens(trendDays) {
  const n = Math.min(30, Math.max(7, Number(trendDays) || 14));
  const now = Date.now();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const t = now - i * 24 * 60 * 60 * 1000;
    const wave = Math.sin((n - i) / 2.1) * 140_000;
    const total = Math.max(120_000, Math.round(320_000 + wave + (n - i) * 9_500));
    out.push({ day: fmtDay(t), total });
  }
  return out;
}

const BASE_INSTANCES = [
  { id: "emp-main", name: "main", sessions: 7, tokenRaw: 55_200_000, status: "在线" },
  { id: "emp-gateway", name: "mc-gateway-a2fb...", sessions: 1, tokenRaw: 56_800, status: "离线" },
  { id: "emp-sec", name: "安全审计员", sessions: 4, tokenRaw: 2_860_000, status: "在线" },
  { id: "emp-ops", name: "运维巡检员", sessions: 3, tokenRaw: 1_470_000, status: "在线" },
  { id: "emp-data", name: "数据分析员", sessions: 5, tokenRaw: 5_210_000, status: "离线" },
  { id: "emp-hr", name: "招聘筛选助手", sessions: 2, tokenRaw: 920_000, status: "在线" },
  { id: "emp-fin", name: "财务对账助手", sessions: 6, tokenRaw: 4_080_000, status: "在线" },
  { id: "emp-cs", name: "客服助手-小云", sessions: 8, tokenRaw: 6_500_000, status: "在线" },
];

function buildInstanceList() {
  return BASE_INSTANCES.map((x) => ({
    id: x.id,
    name: x.name,
    status: x.status,
    sessions: x.sessions,
    tokenRaw: x.tokenRaw,
    token: formatTokenCount(x.tokenRaw),
  }));
}

function buildTopInstances(topLimit) {
  const n = Math.min(20, Math.max(1, Number(topLimit) || 10));
  return [...BASE_INSTANCES]
    .sort((a, b) => b.tokenRaw - a.tokenRaw)
    .slice(0, n)
    .map((x) => ({ name: x.name, value: x.tokenRaw }));
}

export function mockMonitorDashboard({ trendDays = 14, topLimit = 10 } = {}) {
  const dailyTokens = buildDailyTokens(trendDays);
  const monthTokenTotal = dailyTokens.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      totalInstances: 8,
      totalChannels: 6,
      activeSessions: 11,
      stuckSessions: 1,
      tokenTotalRaw: monthTokenTotal,
      tokenTotal: formatTokenCount(monthTokenTotal),
      todayCostRaw: 128.47,
      todayCost: "$128.47",
      messageProcessed: 1893,
      cacheHitRate: 44,
      agentTotal: 8,
      onlineEmployeeCount: 6,
      userTotal: 1,
      sourceTerminals: 2,
    },
    dailyTokens,
    instanceList: buildInstanceList(),
    tokenDistribution: {
      byModel: [
        { name: "deepseek-r1", value: 23_600_000 },
        { name: "delivery-mirror", value: 19_200_000 },
        { name: "MiniMax-M2.5", value: 8_700_000 },
        { name: "MiniMax-M2.7", value: 4_300_000 },
      ],
      byType: [
        { name: "input", value: 31_500_000 },
        { name: "output", value: 24_300_000 },
      ],
    },
    topInstances: buildTopInstances(topLimit),
  };
}
