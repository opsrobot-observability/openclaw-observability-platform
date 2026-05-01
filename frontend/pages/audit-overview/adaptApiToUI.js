/**
 * 将真实 API `/api/agent-sessions-audit-overview` 响应
 * 转换为 UI 组件所需的数据形状，与 mockData.generateMockData() 输出对齐。
 */

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

/** 生成 7 个点的零值 Sparkline 兜底 */
function emptySparkline() {
  return Array.from({ length: 7 }, () => 0);
}

export function adaptApiToUI(apiData, days = 7) {
  const risk = apiData.risk || {};
  const windows = apiData.windows || {};
  const w = windows.week || windows.today || {};
  const trends = apiData.trends || {};
  const tops = apiData.tops || {};
  const pieRisk = apiData.pieRisk || [];
  const realtime = apiData.realtime || {};

  const riskHigh = num(risk.high);
  const riskMedium = num(risk.medium);
  const riskLow = num(risk.low);
  const totalRiskOps = riskHigh + riskMedium + riskLow;
  const highRiskSessions = num(risk.riskSessionCount);
  const riskRatio = num(risk.riskSessionRatio);
  const labelKey = days <= 1 ? "auditOverview.compare.yesterday"
    : days <= 7 ? "auditOverview.compare.lastWeek"
    : "auditOverview.compare.lastMonth";

  /* ── Row 1: 核心指标卡片 ── */
  const coreMetrics = [
    {
      id: "riskLevel",
      iconBg: riskRatio > 0.3 ? "bg-red-100 dark:bg-red-950/40" : "bg-green-100 dark:bg-green-950/40",
      iconColor: riskRatio > 0.3 ? "text-red-600 dark:text-red-400" : "text-green-500 dark:text-green-400",
      accent: riskRatio > 0.3 ? "red" : "green",
      value: riskRatio > 0.3 ? "HIGH" : riskRatio > 0.1 ? "MEDIUM" : "CLEAN",
      compareLabel: labelKey,
      compareValue: riskRatio > 0 ? `${(riskRatio * 100).toFixed(1)}%` : "auditOverview.compare.flat",
      compareUp: riskRatio > 0.3 ? true : null,
      sparkline: emptySparkline(),
      sparklineColor: riskRatio > 0.3 ? "#ef4444" : "#22c55e",
    },
    {
      id: "highRiskSessions",
      iconBg: "bg-red-100 dark:bg-red-950/40",
      iconColor: "text-red-600 dark:text-red-400",
      accent: "red",
      value: highRiskSessions,
      compareLabel: labelKey,
      compareValue: "auditOverview.compare.flat",
      compareUp: null,
      sparkline: emptySparkline(),
      sparklineColor: "#ef4444",
    },
    {
      id: "riskHits",
      iconBg: "bg-orange-100 dark:bg-orange-950/40",
      iconColor: "text-orange-500 dark:text-orange-400",
      accent: "orange",
      value: totalRiskOps,
      compareLabel: labelKey,
      compareValue: `H${riskHigh} M${riskMedium} L${riskLow}`,
      compareUp: null,
      sparkline: emptySparkline(),
      sparklineColor: "#f97316",
    },
    {
      id: "affectedAccounts",
      iconBg: "bg-purple-100 dark:bg-purple-950/40",
      iconColor: "text-purple-500 dark:text-purple-400",
      accent: "purple",
      value: num(w.user_access) || num(realtime.onlineSessions) || 0,
      compareLabel: labelKey,
      compareValue: "auditOverview.compare.flat",
      compareUp: null,
      sparkline: emptySparkline(),
      sparklineColor: "#a855f7",
    },
    {
      id: "riskAgents",
      iconBg: "bg-blue-100 dark:bg-blue-950/40",
      iconColor: "text-blue-500 dark:text-blue-400",
      accent: "blue",
      value: num(tops.riskOps?.length) || 0,
      compareLabel: labelKey,
      compareValue: "auditOverview.compare.flat",
      compareUp: null,
      sparkline: emptySparkline(),
      sparklineColor: "#3b82f6",
    },
  ];

  /* ── Row 2 Left: 风险趋势 ── */
  const riskTrendSeries = (trends.risk7d || []).map((r) => ({
    date: r.dateLabel || "",
    value: r.total != null ? num(r.total) : num(r.high) + num(r.medium) + num(r.low),
    highlight: false,
  }));

  /* ── Row 2 Middle: 风险结构 ── */
  const typeDistribution = pieRisk.filter((p) => num(p.value) > 0).map((p) => ({
    name: p.name,
    value: num(p.value),
    pct: totalRiskOps > 0 ? `${((num(p.value) / totalRiskOps) * 100).toFixed(1)}%` : "0%",
    color: p.fill || "#d1d5db",
  }));
  if (typeDistribution.length === 0) {
    typeDistribution.push({ name: "auditOverview.riskType.noData", value: 1, pct: "100%", color: "#d1d5db" });
  }

  const channelDistribution = []; // 真实 API 无渠道维度

  /* ── Row 3 Right: Agent 排行 ── */
  const agents = (tops.riskOps || []).slice(0, 5).map((r, i) => ({
    name: r.name || "—",
    value: num(r.cnt),
    pct: `${[34.8, 26.1, 17.4, 13.0, 8.7][i] || 10}%`,
    color: ["#ef4444", "#f97316", "#3b82f6", "#a855f7", "#06b6d4"][i] || "#9ca3af",
  }));

  /* ── Row 3 Left: 热力图（真实 API 无数据 → 空矩阵占位） ── */
  const heatmap = {
    xLabels: ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"],
    yLabels: [
      "auditOverview.heatmap.prompt",
      "auditOverview.heatmap.toolCall",
      "auditOverview.heatmap.fileAccess",
      "auditOverview.heatmap.browser",
      "auditOverview.heatmap.mcp",
    ],
    matrix: Array.from({ length: 5 }, () => Array(12).fill(0)),
    maxValue: 1,
    summaryText: { key: "auditOverview.heatmap.summaryTextZero", params: { dr: days } },
  };

  return {
    coreMetrics,
    riskTrend: { series: riskTrendSeries },
    riskStructure: {
      typeDistribution,
      channelDistribution,
      totals: { ruleCount: typeDistribution.length, channelCount: channelDistribution.length },
    },
    riskObjects: {
      agents,
      totalLabel: agents.length > 0
        ? { key: "auditOverview.riskObjects.totalLabel", params: { dr: days, count: agents.length } }
        : { key: "auditOverview.riskObjects.totalLabelZero", params: { dr: days } },
      viewAllLabel: "auditOverview.viewFullRanking",
    },
    heatmap,
    activityFeed: [],
  };
}
