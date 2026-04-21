/**
 * Mock: GET /api/cost-overview
 * 对齐 backend/cost-analysis/cost-overview-query.mjs → queryCostOverviewSnapshot()
 */

const AGENT_COLORS = ["#165DFF", "#3b82f6", "#60a5fa", "#34d399", "#f59e0b", "#a855f7", "#94a3b8", "#64748b"];

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mockCostOverview(params = {}) {
  const { trendDays, start, end } = params;
  const now = Date.now();

  let count = 14;
  if (trendDays) {
    count = Math.min(365, Math.max(1, Number(trendDays)));
  } else if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      count = Math.min(365, Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1));
    }
  }

  const multiplier = count / 14;

  // 卡片数据
  const cards = {
    today: { totalTokens: Math.round(284350 * multiplier), momPct: 12.3 },
    week: { totalTokens: 1_823_600, momPct: -5.7 },
    month: { totalTokens: 7_462_100, momPct: 18.4 },
    dailyAvg7d: {
      avgTokens: Math.round(260514 * (1 + (Math.random() - 0.5) * 0.2)),
      peakDay: dayStr(-Math.floor(Math.random() * count)).slice(5),
      peakTokens: Math.round(412800 * (1 + (Math.random() - 0.5) * 0.2)),
    },
  };

  // Agent 占比
  const agentShare = [
    { name: "客服助手·小智", tokens: Math.round(2_800_000 * multiplier), value: 37.5, fill: AGENT_COLORS[0] },
    { name: "运维巡检员", tokens: Math.round(1_600_000 * multiplier), value: 21.4, fill: AGENT_COLORS[1] },
    { name: "数据分析员", tokens: Math.round(1_200_000 * multiplier), value: 16.1, fill: AGENT_COLORS[2] },
    { name: "HR 面试助手", tokens: Math.round(900_000 * multiplier), value: 12.1, fill: AGENT_COLORS[3] },
    { name: "合规审查官", tokens: Math.round(520_000 * multiplier), value: 7.0, fill: AGENT_COLORS[4] },
    { name: "其他", tokens: Math.round(442_100 * multiplier), value: 5.9, fill: AGENT_COLORS[6] },
  ];

  // 输入/输出占比
  const inOut = {
    inputTokens: Math.round(4_920_000 * multiplier),
    outputTokens: Math.round(2_542_100 * multiplier),
    inputPct: 65.9,
    outputPct: 34.1,
    pie: [
      { name: "输入 Token", value: 65.9, fill: "#2563eb" },
      { name: "输出 Token", value: 34.1, fill: "#34d399" },
    ],
  };

  // 动态趋势数据
  const trendData = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = dayStr(-i);
    const base = 180_000 + Math.floor(Math.random() * 200_000);
    trendData.push({
      date: day.slice(5),
      day,
      tokens: Math.round((base / 1_000_000) * 1000) / 1000,
      tokensRaw: base,
    });
  }

  // 每日按 Agent 拆分
  const topAgents = ["客服助手·小智", "运维巡检员", "数据分析员", "HR 面试助手", "合规审查官"];
  const series = topAgents.map((name, i) => ({
    dataKey: `a${i}`,
    name,
    color: AGENT_COLORS[i % AGENT_COLORS.length],
  }));
  series.push({ dataKey: "aOther", name: "其他", color: "#cbd5e1" });

  const dailyByAgentRows = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = dayStr(-i);
    const row = { date: day.slice(5) };
    topAgents.forEach((_, j) => {
      row[`a${j}`] = Math.round((30_000 + Math.random() * 60_000) / 1_000_000 * 1000) / 1000;
    });
    row.aOther = Math.round((10_000 + Math.random() * 20_000) / 1_000_000 * 1000) / 1000;
    dailyByAgentRows.push(row);
  }

  // 大模型占比
  const modelShare = [
    { name: "gpt-4o", tokens: Math.round(3_500_000 * multiplier), value: 46.9, fill: "#4f46e5" },
    { name: "claude-3-5-sonnet", tokens: Math.round(2_100_000 * multiplier), value: 28.1, fill: "#7c3aed" },
    { name: "deepseek-v3", tokens: Math.round(1_200_000 * multiplier), value: 16.1, fill: "#2563eb" },
    { name: "qwen-max", tokens: Math.round(662_100 * multiplier), value: 8.9, fill: "#3b82f6" },
  ];

  // Top10 会话消耗 (tokens 单位为 M)
  const topSessions = [
    { session_id: "sess_928374", tokens: 2.45, agentName: "运维巡检员", userName: "张三" },
    { session_id: "sess_102938", tokens: 1.82, agentName: "客服助手·小智", userName: "李四" },
    { session_id: "sess_475829", tokens: 1.56, agentName: "数据分析员", userName: "王五" },
    { session_id: "sess_564738", tokens: 1.21, agentName: "合规审查官", userName: "赵六" },
    { session_id: "sess_384756", tokens: 0.98, agentName: "HR 面试助手", userName: "钱七" },
    { session_id: "sess_293847", tokens: 0.85, agentName: "客服助手·小智", userName: "孙八" },
    { session_id: "sess_192837", tokens: 0.72, agentName: "运维巡检员", userName: "周九" },
    { session_id: "sess_019283", tokens: 0.65, agentName: "数据分析员", userName: "吴十" },
    { session_id: "sess_918273", tokens: 0.58, agentName: "HR 面试助手", userName: "郑十一" },
    { session_id: "sess_827364", tokens: 0.49, agentName: "合规审查官", userName: "王十二" },
  ];

  // 每日按模型拆分
  const modelsForTrend = ["gpt-4o", "claude-3-5-sonnet", "deepseek-v3", "qwen-max"];
  const modelSeriesData = modelsForTrend.map((name, i) => ({
    dataKey: `m${i}`,
    name,
    color: ["#4f46e5", "#7c3aed", "#2563eb", "#3b82f6"][i],
  }));

  const dailyByModelRows = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = dayStr(-i);
    const row = { date: day.slice(5) };
    modelsForTrend.forEach((_, j) => {
      row[`m${j}`] = Math.round((20_000 + Math.random() * 40_000) / 1_000_000 * 1000) / 1000;
    });
    dailyByModelRows.push(row);
  }

  return {
    source: "mock",
    generatedAt: now,
    cards,
    agentShare,
    modelShare,
    topSessions,
    inOut,
    trend14d: trendData,
    dailyByAgent: { series, rows: dailyByAgentRows },
    dailyByModel: { series: modelSeriesData, rows: dailyByModelRows },
    abnormalities: {
      gatewayLoss: {
        tokens: Math.round(12_500 * multiplier),
        sessions: Math.round(140 * multiplier),
        percentage: 4.4,
      },
      loopLoss: {
        agentName: "数据分析员",
        sessions: Math.round(140 * multiplier),
        tokens: Math.round(45_000 * multiplier),
      },
      modelErrors: {
        modelName: "gpt-4o",
        errorCalls: Math.round(120 * multiplier),
        totalCalls: Math.round(1000 * multiplier),
        errorRate: 12,
      },
    },
    legend: "Mock 数据 · 无需数据库连接",
  };
}
