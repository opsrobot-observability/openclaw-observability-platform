/**
 * Mock: GET /api/agent-cost-list?startDay=&endDay=
 * 对齐 backend/cost-analysis/agent-llm-cost-tables-query.mjs → queryAgentCostList()
 */

export function mockAgentCostList(startDay, endDay) {
  const rows = [
    {
      agentId: "agt-ai-kpi-loop-park-ops",
      agent: "乐园运营助手",
      totalCost: "3.11B",
      totalTokensRaw: 3110000000,
      inputTokensRaw: 1540000000,
      outputTokensRaw: 1570000000,
      avgPerTask: "62.2K",
      callCount: 50000,
      successRate: "99.8%",
      anomalyTokens: "3.08B",
      anomalyPct: 99.0,
      tco: {
        total: 9330.00,
        modelBill: 9330.00,
      },
      modelDist: [
        { name: "Claude 3.7 Sonnet", tokens: 3090000000, pct: 99.4, cost: 9270.00 },
        { name: "GLM 5.1", tokens: 20000000, pct: 0.6, cost: 60.00 },
      ],
      trend: [42, 39, 44, 46, 51, 58, 3110],
      drill: [
        { segment: "输入 Token", tokens: "1.54B", pct: "49.5%" },
        { segment: "输出 Token", tokens: "1.57B", pct: "50.5%" },
      ],
    },
    {
      agentId: "agt-a1b2c3d4e5f6",
      agent: "客服助手·小智",
      totalCost: "2.80M",
      totalTokensRaw: 2800000,
      inputTokensRaw: 1820000,
      outputTokensRaw: 980000,
      avgPerTask: "4.7K",
      callCount: 596,
      successRate: "97.3%",
      anomalyTokens: "35K",
      anomalyPct: 1.2,
      tco: {
        total: 140.00,
        modelBill: 140.00,
      },
      modelDist: [
        { name: "Gemini 3.1 Pro", tokens: 2240000, pct: 80, cost: 112.00 },
        { name: "GLM 5.1", tokens: 560000, pct: 20, cost: 28.00 },
      ],
      trend: [20, 35, 25, 45, 30, 55, 40],
      drill: [
        { segment: "输入 Token", tokens: "1.82M", pct: "65.0%" },
        { segment: "输出 Token", tokens: "980K", pct: "35.0%" },
      ],
    },
    {
      agentId: "agt-f6e5d4c3b2a1",
      agent: "运维巡检员",
      totalCost: "1.60M",
      totalTokensRaw: 1600000,
      inputTokensRaw: 1120000,
      outputTokensRaw: 480000,
      avgPerTask: "8.0K",
      callCount: 200,
      successRate: "94.5%",
      anomalyTokens: "64K",
      anomalyPct: 4.0,
      tco: {
        total: 80.00,
        modelBill: 80.00,
      },
      modelDist: [
        { name: "Gemini 3.1 Pro", tokens: 1600000, pct: 100, cost: 80.00 },
      ],
      trend: [10, 15, 12, 18, 20, 18, 22],
      drill: [
        { segment: "输入 Token", tokens: "1.12M", pct: "70.0%" },
        { segment: "输出 Token", tokens: "480K", pct: "30.0%" },
      ],
    },
    {
      agentId: "agt-112233445566",
      agent: "数据分析员",
      totalCost: "1.20M",
      totalTokensRaw: 1200000,
      inputTokensRaw: 720000,
      outputTokensRaw: 480000,
      avgPerTask: "12.0K",
      callCount: 100,
      successRate: "91.0%",
      anomalyTokens: "140K",
      anomalyPct: 11.6,
      tco: {
        total: 60.00,
        modelBill: 60.00,
      },
      modelDist: [
        { name: "Gemini 3.1 Pro", tokens: 840000, pct: 70, cost: 42.00 },
        { name: "GLM 5.1", tokens: 360000, pct: 30, cost: 18.00 },
      ],
      trend: [5, 8, 12, 7, 10, 15, 12],
      drill: [
        { segment: "输入 Token", tokens: "720K", pct: "60.0%" },
        { segment: "输出 Token", tokens: "480K", pct: "40.0%" },
      ],
    },
    {
      agentId: "agt-aabbccddeeff",
      agent: "HR 面试助手",
      totalCost: "900K",
      totalTokensRaw: 900000,
      inputTokensRaw: 540000,
      outputTokensRaw: 360000,
      avgPerTask: "6.0K",
      callCount: 150,
      successRate: "99.3%",
      anomalyTokens: "4.5K",
      anomalyPct: 0.5,
      tco: {
        total: 45.00,
        modelBill: 45.00,
      },
      modelDist: [
        { name: "MiniMax-M2.7", tokens: 900000, pct: 100, cost: 45.00 },
      ],
      trend: [12, 14, 13, 15, 14, 16, 15],
      drill: [
        { segment: "输入 Token", tokens: "540K", pct: "60.0%" },
        { segment: "输出 Token", tokens: "360K", pct: "40.0%" },
      ],
    },
    {
      agentId: "agt-001122334455",
      agent: "合规审查官",
      totalCost: "520K",
      totalTokensRaw: 520000,
      inputTokensRaw: 364000,
      outputTokensRaw: 156000,
      avgPerTask: "10.4K",
      callCount: 50,
      successRate: "100.0%",
      anomalyTokens: "0",
      anomalyPct: 0,
      tco: {
        total: 26.00,
        modelBill: 26.00,
      },
      modelDist: [
        { name: "Opus 4.6", tokens: 520000, pct: 100, cost: 26.00 },
      ],
      trend: [8, 7, 9, 8, 10, 9, 11],
      drill: [
        { segment: "输入 Token", tokens: "364K", pct: "70.0%" },
        { segment: "输出 Token", tokens: "156K", pct: "30.0%" },
      ],
    },
  ];

  return {
    source: "mock",
    startDay: startDay || "2026-03-01",
    endDay: endDay || "2026-03-30",
    legend: "Mock 数据 · 无需数据库连接",
    rows,
  };
}
