/**
 * Mock: GET /api/llm-cost-detail?startDay=&endDay=
 * 对齐 backend/cost-analysis/agent-llm-cost-tables-query.mjs → queryLlmCostDetail()
 */

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mockLlmCostDetail(startDay, endDay, isSummary = false) {
  const models = [
    { model: "Gemini 3.1 Flash", provider: "google" },
    { model: "Opus 4.6", provider: "anthropic" },
    { model: "MiniMax-M2.7", provider: "minimax-cn" },
    { model: "Gemini 3.1 Pro", provider: "google" },
    { model: "GLM 5.1", provider: "zhipuai" },
  ];

  if (isSummary) {
    const rows = models.map((m, i) => {
      const total = 500_000 + Math.floor(Math.random() * 2_000_000);
      const inp = Math.floor(total * (0.55 + Math.random() * 0.15));
      const outp = total - inp;
      const io = inp + outp;
      const calls = 5000 + Math.floor(Math.random() * 15000);
      const errRate = (i === 3 ? 4.2 : Math.random() * 1).toFixed(1);

      // 7-day trend
      const trend = Array.from({ length: 7 }, () => Math.floor(Math.random() * 100));

      return {
        model: m.model,
        provider: m.provider,
        totalTokens: total,
        totalTokensFmt: total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${(total / 1e3).toFixed(1)}K`,
        inputTokens: inp,
        outputTokens: outp,
        ioStructure: `${Math.round((inp / io) * 100)}/${Math.round((outp / io) * 100)}`,
        callCount: calls,
        errorRate: errRate,
        trend: trend,
        topApps: [
          { name: "客服助手·小智", pct: 45 },
          { name: "运维巡检员", pct: 32 },
          { name: "内部知识库", pct: 18 },
        ],
        stability: {
          avgLatency: (1.0 + Math.random() * 0.5).toFixed(2),
          errorDist: [
            { code: "503 Service Overloaded", count: 8 },
            { code: "429 Rate Limit", count: 2 },
          ],
        },
        efficiency: {
          avgTokensPerSession: 400 + Math.floor(Math.random() * 200),
          effectiveOutputRate: (95 + Math.random() * 4).toFixed(1),
          estMonthlyCost: (total / 1e6 * 4).toFixed(1) + "M",
        }
      };
    });

    return { source: "mock-summary", startDay, endDay, rows };
  }

  const rows = [];
  for (let dayOff = 0; dayOff >= -6; dayOff--) {
    const d = dayStr(dayOff);
    for (const m of models) {
      const total = 50_000 + Math.floor(Math.random() * 200_000);
      const inp = Math.floor(total * (0.55 + Math.random() * 0.15));
      const outp = total - inp;
      const io = inp + outp;
      rows.push({
        model: m.model,
        statDate: d,
        provider: m.provider,
        tokens: total >= 1e6 ? `${(total / 1e6).toFixed(2)}M` : total >= 1e3 ? `${(total / 1e3).toFixed(1)}K` : String(total),
        share: `${(Math.random() * 30 + 5).toFixed(1)}%`,
        inputOut: `${Math.round((inp / io) * 1000) / 10}% / ${Math.round((outp / io) * 1000) / 10}%`,
        drill: [
          {
            segment: "输入 Token",
            tokens: inp >= 1e3 ? `${(inp / 1e3).toFixed(1)}K` : String(inp),
            pct: `${Math.round((inp / io) * 1000) / 10}%`,
          },
          {
            segment: "输出 Token",
            tokens: outp >= 1e3 ? `${(outp / 1e3).toFixed(1)}K` : String(outp),
            pct: `${Math.round((outp / io) * 1000) / 10}%`,
          },
        ],
      });
    }
  }

  return {
    source: "mock",
    startDay: startDay || "2026-03-24",
    endDay: endDay || "2026-03-30",
    legend: "Mock 数据 · 无需数据库连接",
    rows,
  };
}
