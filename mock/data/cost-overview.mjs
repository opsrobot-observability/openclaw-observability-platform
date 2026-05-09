/**
 * Mock: GET /api/cost-overview
 * 对齐 backend/cost-analysis/cost-overview-query.mjs → queryCostOverviewSnapshot()
 */

const AGENT_COLORS = ["#165DFF", "#3b82f6", "#60a5fa", "#34d399", "#f59e0b", "#a855f7", "#94a3b8", "#64748b"];

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function deterministicWave(index, min, max) {
  const seed = Math.sin((index + 3) * 1.917) * 10000;
  return Math.round(min + (seed - Math.floor(seed)) * (max - min));
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

  // 卡片数据：模拟“AI 用量 KPI”导致的单日 Token 峰值和成本治理告警。
  const cards = {
    today: { totalTokens: 3_180_000_000, momPct: 486.7 },
    week: { totalTokens: 4_920_000_000, momPct: 221.4 },
    month: { totalTokens: 8_760_000_000, momPct: 96.8 },
    dailyAvg7d: {
      avgTokens: 702_857_143,
      peakDay: dayStr(0).slice(5),
      peakTokens: 3_180_000_000,
    },
  };

  // Agent 占比
  const agentShare = [
    { name: "乐园运营助手", tokens: 3_110_000_000, value: 63.2, fill: AGENT_COLORS[0] },
    { name: "客服助手·小智", tokens: 620_000_000, value: 12.6, fill: AGENT_COLORS[1] },
    { name: "内容营销助手", tokens: 430_000_000, value: 8.7, fill: AGENT_COLORS[2] },
    { name: "数据分析员", tokens: 360_000_000, value: 7.3, fill: AGENT_COLORS[3] },
    { name: "运维巡检员", tokens: 260_000_000, value: 5.3, fill: AGENT_COLORS[4] },
    { name: "其他", tokens: 140_000_000, value: 2.9, fill: AGENT_COLORS[6] },
  ];

  // 输入/输出占比
  const inOut = {
    inputTokens: 2_470_000_000,
    outputTokens: 2_450_000_000,
    inputPct: 50.2,
    outputPct: 49.8,
    pie: [
      { name: "输入 Token", value: 50.2, fill: "#2563eb" },
      { name: "输出 Token", value: 49.8, fill: "#34d399" },
    ],
  };

  // 动态趋势数据
  const trendData = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = dayStr(-i);
    const base = i === 0 ? 3_180_000_000 : deterministicWave(i, 145_000_000, 315_000_000);
    trendData.push({
      date: day.slice(5),
      day,
      tokens: Math.round((base / 1_000_000) * 1000) / 1000,
      tokensRaw: base,
    });
  }

  // 每日按 Agent 拆分
  const topAgents = ["乐园运营助手", "客服助手·小智", "内容营销助手", "数据分析员", "运维巡检员"];
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
      const raw = i === 0 && j === 0 ? 3_110_000_000 : deterministicWave(i + j * 7, 16_000_000, 120_000_000);
      row[`a${j}`] = Math.round((raw / 1_000_000) * 1000) / 1000;
    });
    row.aOther = Math.round((deterministicWave(i + 99, 8_000_000, 22_000_000) / 1_000_000) * 1000) / 1000;
    dailyByAgentRows.push(row);
  }

  // 大模型占比
  const modelShare = [
    { name: "Claude 3.7 Sonnet", tokens: 3_180_000_000, value: 64.6, fill: "#7c3aed" },
    { name: "Gemini 3.1 Pro", tokens: 720_000_000, value: 14.6, fill: "#4f46e5" },
    { name: "GLM 5.1", tokens: 560_000_000, value: 11.4, fill: "#2563eb" },
    { name: "MiniMax-M2.7", tokens: 460_000_000, value: 9.4, fill: "#3b82f6" },
  ];

  // Top10 会话消耗 (tokens 单位为 M)
  const topSessions = [
    { session_id: "sess_ai_kpi_loop_20260407", tokens: 3120, agentName: "乐园运营助手", userName: "growth-ops@corp.example" },
    { session_id: "sess_ai_kpi_batch_20260407_a", tokens: 420, agentName: "乐园运营助手", userName: "marketing-ops@corp.example" },
    { session_id: "sess_ai_kpi_batch_20260407_b", tokens: 310, agentName: "乐园运营助手", userName: "park-planner@corp.example" },
    { session_id: "sess_1122334455667788", tokens: 22.1, agentName: "数据分析员", userName: "王五" },
    { session_id: "sess_a1b2c3d4e5f67890", tokens: 12.84, agentName: "客服助手·小智", userName: "张三" },
    { session_id: "sess_f9e8d7c6b5a49382", tokens: 6.42, agentName: "运维巡检员", userName: "bot-runner@infra" },
  ];

  // 每日按模型拆分
  const modelsForTrend = ["Claude 3.7 Sonnet", "Gemini 3.1 Pro", "GLM 5.1", "MiniMax-M2.7"];
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
      const raw = i === 0 && j === 0 ? 3_180_000_000 : deterministicWave(i + j * 11, 18_000_000, 95_000_000);
      row[`m${j}`] = Math.round((raw / 1_000_000) * 1000) / 1000;
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
        tokens: 12_500,
        sessions: 140,
        percentage: 4.4,
      },
      loopLoss: {
        agentName: "乐园运营助手",
        sessions: 28,
        tokens: 3_120_000_000,
      },
      modelErrors: {
        modelName: "Claude 3.7 Sonnet",
        errorCalls: 84,
        totalCalls: 50_000,
        errorRate: 0.17,
      },
    },
    legend: "Mock 数据 · 无需数据库连接",
  };
}
