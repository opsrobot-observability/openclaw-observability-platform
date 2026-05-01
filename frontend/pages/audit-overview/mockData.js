/**
 * 行为审计概览 — Mock 数据层
 *
 * 所有数据从 `mock/data/agent-sessions.mjs` 的 7 条会话聚合得来，
 * 再通过 scale() 按天数缩放，保证与会话链路溯源列表数据一致。
 *
 * 基准（7 天）聚合值：
 *   会话总数 7  高风险会话 4  风险操作总数 24 (H6/M6/L12)
 *   风险 Agent 4  风险影响账号 4  异常中断 1
 *   渠道: web×2, internal×2, api×1, feishu×1, event-bus×1
 */

function scale(val, days) {
  const factor = (days ?? 7) / 7;
  return Math.max(1, Math.round((val ?? 0) * factor));
}

function sparklineForDays(days) {
  const len = Math.min(days, 30);
  const pts = [];
  for (let i = 0; i < len; i++) {
    pts.push(Math.floor(Math.random() * 20 + 5));
  }
  if (pts.length <= 7) return pts;
  const step = pts.length / 7;
  return Array.from({ length: 7 }, (_, i) => pts[Math.floor(i * step)]);
}

function trendSeriesForDays(days) {
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push({
      date: `${mm}-${dd}`,
      value: scale(12 + Math.floor(Math.random() * 20), days),
      highlight: i === Math.floor(days / 2),
    });
  }
  return out;
}

/* ────── 基准值（7 天，与 agent-sessions.mjs 15 条会话聚合一致） ────── */
const BASE = {
  totalSessions: 15,
  highRiskSessions: 7,        // risk_high > 0 的会话数 (含 匠眼/运维×2/数据分析/合规审查官×2/供应链协同)
  riskHigh: 11,               // 高风险操作总数 (6+1+1+3)
  riskMedium: 17,             // 中风险操作总数 (6+1+3+2+1+4)
  riskLow: 18,                // 低风险操作总数 (12+2+1+1+2)
  totalRiskOps: 46,           // 11+17+18
  riskAgents: 5,              // 运维巡检员, 数据分析员, 合规审查官, 供应链协同, 匠眼
  affectedAccounts: 7,        // 含 deploy-bot, ci-bot, auditor 等
  abortedSessions: 2,         // 合规审查官, 客服助手·小智 (投诉升级)
  riskSessionRatio: "46.7%", // 7/15
};

/* ────── 按风险数排序的 Agent（与 agent-sessions.mjs 一致） ────── */
const AGENTS_BY_RISK = [
  { name: "合规审查官", riskHigh: 2, riskTotal: 8, model: "deepseek-r1" },
  { name: "供应链协同", riskHigh: 2, riskTotal: 3, model: "claude-3-opus" },
  { name: "运维巡检员", riskHigh: 1, riskTotal: 4, model: "claude-3-5-sonnet" },
  { name: "数据分析员", riskHigh: 1, riskTotal: 4, model: "gpt-4o" },
];

export function generateMockData(days = 7) {
  const dr = days ?? 7;
  const labelKey = dr <= 1 ? "auditOverview.compare.yesterday" : dr <= 7 ? "auditOverview.compare.lastWeek" : "auditOverview.compare.lastMonth";
  const flatKey = "auditOverview.compare.flat";
  const noRiskKey = "auditOverview.compare.noRisk";
  const zeroRisk = dr >= 90;

  if (zeroRisk) {
    const emptySpark = Array.from({ length: 7 }, () => 0);
    const emptyTrend = [];
    for (let i = dr - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      emptyTrend.push({ date: `${mm}-${dd}`, value: 0, highlight: false });
    }
    return {
      coreMetrics: [
        { id: "riskLevel", title: "风险等级", iconBg: "bg-green-100 dark:bg-green-950/40", iconColor: "text-green-500 dark:text-green-400", accent: "green", value: "CLEAN", compareLabel: labelKey, compareValue: noRiskKey, compareUp: null, sparkline: emptySpark, sparklineColor: "#22c55e" },
        { id: "highRiskSessions", title: "高风险会话", iconBg: "bg-green-100 dark:bg-green-950/40", iconColor: "text-green-500 dark:text-green-400", accent: "green", value: 0, compareLabel: labelKey, compareValue: flatKey, compareUp: null, sparkline: emptySpark, sparklineColor: "#22c55e" },
        { id: "riskHits", title: "风险命中次数", iconBg: "bg-gray-100 dark:bg-gray-800", iconColor: "text-gray-400", accent: "gray", value: 0, compareLabel: labelKey, compareValue: flatKey, compareUp: null, sparkline: emptySpark, sparklineColor: "#9ca3af" },
        { id: "affectedAccounts", title: "风险影响账号", iconBg: "bg-gray-100 dark:bg-gray-800", iconColor: "text-gray-400", accent: "gray", value: 0, compareLabel: labelKey, compareValue: flatKey, compareUp: null, sparkline: emptySpark, sparklineColor: "#9ca3af" },
        { id: "riskAgents", title: "风险 Agent", iconBg: "bg-gray-100 dark:bg-gray-800", iconColor: "text-gray-400", accent: "gray", value: 0, compareLabel: labelKey, compareValue: flatKey, compareUp: null, sparkline: emptySpark, sparklineColor: "#9ca3af" },
      ],
      riskTrend: { series: emptyTrend, summary: [] },
      riskStructure: {
        typeDistribution: [{ name: "auditOverview.riskType.noData", value: 1, pct: "100%", color: "#d1d5db" }],
        channelDistribution: [{ name: "auditOverview.riskType.noData", value: 1, pct: "100%", color: "#d1d5db" }],
        totals: { ruleCount: 0, channelCount: 0 },
      },
      riskObjects: {
        agents: [],
        totalLabel: { key: "auditOverview.riskObjects.totalLabelZero", params: { dr } },
        viewAllLabel: "auditOverview.viewFullRanking",
      },
      heatmap: {
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
        summaryText: { key: "auditOverview.heatmap.summaryTextZero", params: { dr } },
      },
      activityFeed: [],
    };
  }

  const pctUp = () => `+${Math.floor(Math.random() * 20 + 3)}%`;

  return {
    /* ─── Row 1: 核心指标卡片组 ─── */
    coreMetrics: [
      {
        id: "riskLevel",
        title: "风险等级",
        iconBg: "bg-red-100 dark:bg-red-950/40",
        iconColor: "text-red-600 dark:text-red-400",
        accent: "red",
        value: BASE.highRiskSessions >= 4 ? "HIGH" : "MEDIUM",
        compareLabel: labelKey,
        compareValue: pctUp(),
        compareUp: true,
        sparkline: sparklineForDays(dr),
        sparklineColor: "#ef4444",
      },
      {
        id: "highRiskSessions",
        title: "高风险会话",
        iconBg: "bg-red-100 dark:bg-red-950/40",
        iconColor: "text-red-600 dark:text-red-400",
        accent: "red",
        value: scale(BASE.highRiskSessions, dr),
        compareLabel: labelKey,
        compareValue: pctUp(),
        compareUp: true,
        sparkline: sparklineForDays(dr),
        sparklineColor: "#ef4444",
      },
      {
        id: "riskHits",
        title: "风险命中次数",
        iconBg: "bg-orange-100 dark:bg-orange-950/40",
        iconColor: "text-orange-500 dark:text-orange-400",
        accent: "orange",
        value: scale(BASE.totalRiskOps, dr),
        compareLabel: labelKey,
        compareValue: pctUp(),
        compareUp: true,
        sparkline: sparklineForDays(dr),
        sparklineColor: "#f97316",
      },
      {
        id: "affectedAccounts",
        title: "风险影响账号",
        iconBg: "bg-purple-100 dark:bg-purple-950/40",
        iconColor: "text-purple-500 dark:text-purple-400",
        accent: "purple",
        value: scale(BASE.affectedAccounts, dr),
        compareLabel: labelKey,
        compareValue: Math.random() > 0.4 ? pctUp() : flatKey,
        compareUp: Math.random() > 0.4 ? true : null,
        sparkline: sparklineForDays(dr),
        sparklineColor: "#a855f7",
      },
      {
        id: "riskAgents",
        title: "风险 Agent",
        iconBg: "bg-blue-100 dark:bg-blue-950/40",
        iconColor: "text-blue-500 dark:text-blue-400",
        accent: "blue",
        value: scale(BASE.riskAgents, dr),
        compareLabel: labelKey,
        compareValue: Math.random() > 0.5 ? flatKey : `+${Math.floor(Math.random() * 2 + 1)}`,
        compareUp: Math.random() > 0.5 ? null : true,
        sparkline: sparklineForDays(dr),
        sparklineColor: "#3b82f6",
      },
    ],

    /* ─── Row 2 Left: 风险趋势变化 ─── */
    riskTrend: {
      series: trendSeriesForDays(dr),
      summary: [
        { label: "高危操作", dotColor: "bg-red-500", text: `${scale(BASE.riskHigh, dr)} 次（较上期 ${Math.random() > 0.5 ? "+" : "-"}${Math.floor(Math.random() * 15 + 2)}%）` },
        { label: "中危操作", dotColor: "bg-amber-500", text: `${scale(BASE.riskMedium, dr)} 次（较上期 ${Math.random() > 0.5 ? "+" : "-"}${Math.floor(Math.random() * 10 + 2)}%）` },
        { label: "低危操作", dotColor: "bg-blue-500", text: `${scale(BASE.riskLow, dr)} 次（较上期 ${Math.random() > 0.5 ? "+" : "-"}${Math.floor(Math.random() * 8 + 2)}%）` },
      ],
    },

    /* ─── Row 2 Middle: 风险结构 ─── */
    riskStructure: {
      typeDistribution: [
        { name: "auditOverview.riskType.toolError", value: scale(8, dr), pct: "33.3%", color: "#ef4444" },
        { name: "auditOverview.riskType.sensitiveCmd", value: scale(6, dr), pct: "25.0%", color: "#f97316" },
        { name: "auditOverview.riskType.exitCode", value: scale(5, dr), pct: "20.8%", color: "#3b82f6" },
        { name: "auditOverview.riskType.network", value: scale(3, dr), pct: "12.5%", color: "#a855f7" },
        { name: "auditOverview.riskType.fileOp", value: scale(2, dr), pct: "8.3%", color: "#06b6d4" },
      ],
      channelDistribution: [
        { name: "Internal", value: scale(2, dr), pct: "28.6%", color: "#3b82f6" },
        { name: "Web", value: scale(2, dr), pct: "28.6%", color: "#f97316" },
        { name: "API", value: scale(1, dr), pct: "14.3%", color: "#a855f7" },
        { name: "Feishu", value: scale(1, dr), pct: "14.3%", color: "#06b6d4" },
        { name: "Event Bus", value: scale(1, dr), pct: "14.3%", color: "#10b981" },
      ],
      totals: { ruleCount: 12, channelCount: 5 },
    },

    /* ─── Row 3 Right: 风险对象（仅 Agent） ─── */
    riskObjects: {
      agents: AGENTS_BY_RISK.map((a, i) => ({
        name: a.name,
        value: scale(a.riskTotal, dr),
        pct: `${[33.3, 25.0, 20.8, 20.8][i] || 16.7}%`,
        color: ["#ef4444", "#f97316", "#3b82f6", "#a855f7"][i],
      })),
      totalLabel: { key: "auditOverview.riskObjects.totalLabel", params: { dr, count: scale(BASE.riskAgents, dr) } },
      viewAllLabel: "auditOverview.viewFullRanking",
    },

    /* ─── Row 3 Left: 行为热力图 ─── */
    heatmap: {
      xLabels: ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"],
      yLabels: [
        "auditOverview.heatmap.prompt",
        "auditOverview.heatmap.toolCall",
        "auditOverview.heatmap.fileAccess",
        "auditOverview.heatmap.browser",
        "auditOverview.heatmap.mcp",
      ],
      matrix: [
        [0, 0, 0, 0, 0, scale(1, dr), scale(2, dr), scale(1, dr), 0, 0, 0, 0],
        [0, 0, 0, scale(1, dr), scale(3, dr), scale(5, dr), scale(8, dr), scale(6, dr), scale(4, dr), scale(2, dr), scale(1, dr), 0],
        [0, 0, 0, 0, scale(1, dr), scale(3, dr), scale(4, dr), scale(3, dr), scale(2, dr), scale(1, dr), 0, 0],
        [0, 0, 0, 0, scale(2, dr), scale(4, dr), scale(6, dr), scale(5, dr), scale(3, dr), scale(1, dr), 0, 0],
        [0, 0, 0, scale(1, dr), scale(2, dr), scale(3, dr), scale(5, dr), scale(4, dr), scale(2, dr), scale(1, dr), 0, 0],
      ],
      maxValue: scale(8, dr),
      summaryText: { key: "auditOverview.heatmap.summaryText", params: { dr, count: scale(BASE.highRiskSessions, dr) } },
    },

    /* ─── 实时动态（与 agent-sessions.mjs 会话对齐） ─── */
    activityFeed: [
      { id: 1, time: "10:23:15", text: "合规审查官 在 compliance-review 会话中检测到 6 次工具调用含高危操作 (H2/M3/L3)", severity: "high", badge: "高", badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
      { id: 2, time: "10:18:42", text: "供应链协同 加急订单处理中检出敏感供应链操作 (H2)", severity: "high", badge: "高", badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
      { id: 3, time: "10:05:33", text: "运维巡检员 执行 exec 命令检测到非零退出码 (H1/L3)", severity: "medium", badge: "中", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
      { id: 4, time: "09:58:21", text: "数据分析员 NL2SQL 查询中部分失败重试 (H1/M2)", severity: "medium", badge: "中", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
      { id: 5, time: "09:45:10", text: "合规审查官 会话异常中止 aborted_last_run=true", severity: "high", badge: "高", badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
      { id: 6, time: "08:30:22", text: "客服助手·小智 客服工单查询工具调用完成 (M1/L2)", severity: "low", badge: "低", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
    ],
  };
}

/** 静态 Mock（向后兼容，默认 7 天） */
export const mockAuditDashboard = generateMockData(7);
