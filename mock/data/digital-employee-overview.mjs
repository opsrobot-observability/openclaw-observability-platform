/**
 * Mock: GET /api/digital-employees/overview
 * 对齐后端 buildDigitalEmployeeOverview 输出结构
 */

const MOCK_EMPLOYEES = [
  {
    agentName: "main",
    employeeKey: "main",
    sessionKey: "session-main-001",
    sessionKeys: ["session-main-001", "session-main-002", "session-main-003"],
    displayLabel: "webchat-kefu",
    sessionCount: 178,
    totalTokens: 1824000,
    abortedCount: 8,
    successCount: 170,
    successRate: 0.9551,
    totalCostUsd: 5.712,
    securityRiskScore: 31.2,
    riskHighTotal: 0,
    riskMediumTotal: 4,
    riskLowTotal: 16,
    avgSkillCount: 7.2,
    p95DurationMs: 6800,
    totalToolUse: 920,
    chatTypeTop: "direct",
    dominantModelProvider: "openai",
    dominantModelName: "gpt-4o-mini",
    tagsDisplay: "客服、线上",
    healthOverall: "green",
    dimensions: { capability: "green", quality: "green", cost: "green", efficacy: "green", security: "green" },
    channels: [{ name: "webchat", count: 138 }, { name: "web", count: 40 }],
    modelProviders: [{ name: "openai", count: 178 }],
    models: [{ name: "gpt-4o-mini", count: 178 }],
  },
  {
    agentName: "mc-gateway-2dfbae07-6536-4f38-b59b-d0fe548074d5",
    employeeKey: "mc-gateway-2dfbae07-6536-4f38-b59b-d0fe548074d5",
    sessionKey: "session-gw-001",
    sessionKeys: ["session-gw-001", "session-gw-002"],
    displayLabel: "ops-runner",
    sessionCount: 132,
    totalTokens: 1548000,
    abortedCount: 14,
    successCount: 118,
    successRate: 0.8939,
    totalCostUsd: 4.866,
    securityRiskScore: 74.6,
    riskHighTotal: 6,
    riskMediumTotal: 9,
    riskLowTotal: 5,
    avgSkillCount: 4.8,
    p95DurationMs: 48200,
    totalToolUse: 1060,
    chatTypeTop: "direct",
    dominantModelProvider: "anthropic",
    dominantModelName: "claude-3-5-sonnet",
    tagsDisplay: "运维、巡检",
    healthOverall: "yellow",
    dimensions: { capability: "yellow", quality: "yellow", cost: "yellow", efficacy: "yellow", security: "red" },
    channels: [{ name: "internal", count: 132 }],
    modelProviders: [{ name: "anthropic", count: 132 }],
    models: [{ name: "claude-3-5-sonnet", count: 132 }],
  },
  {
    agentName: "data-analyst",
    employeeKey: "data-analyst",
    sessionKey: "session-data-001",
    sessionKeys: ["session-data-001", "session-data-002", "session-data-003", "session-data-004"],
    displayLabel: "nl2sql",
    sessionCount: 96,
    totalTokens: 1203000,
    abortedCount: 9,
    successCount: 87,
    successRate: 0.9062,
    totalCostUsd: 3.984,
    securityRiskScore: 58.1,
    riskHighTotal: 2,
    riskMediumTotal: 7,
    riskLowTotal: 8,
    avgSkillCount: 5.6,
    p95DurationMs: 31200,
    totalToolUse: 640,
    chatTypeTop: "direct",
    dominantModelProvider: "openai",
    dominantModelName: "gpt-4o",
    tagsDisplay: "分析、报表",
    healthOverall: "yellow",
    dimensions: { capability: "yellow", quality: "yellow", cost: "yellow", efficacy: "yellow", security: "yellow" },
    channels: [{ name: "api", count: 96 }],
    modelProviders: [{ name: "openai", count: 96 }],
    models: [{ name: "gpt-4o", count: 96 }],
  },
  {
    agentName: "hr-interviewer",
    employeeKey: "hr-interviewer",
    sessionKey: "session-hr-001",
    sessionKeys: ["session-hr-001", "session-hr-002"],
    displayLabel: "hr-interview",
    sessionCount: 84,
    totalTokens: 793000,
    abortedCount: 2,
    successCount: 82,
    successRate: 0.9762,
    totalCostUsd: 2.448,
    securityRiskScore: 27.3,
    riskHighTotal: 0,
    riskMediumTotal: 2,
    riskLowTotal: 10,
    avgSkillCount: 4.3,
    p95DurationMs: 20800,
    totalToolUse: 280,
    chatTypeTop: "direct",
    dominantModelProvider: "minimax-cn",
    dominantModelName: "MiniMax-M2.5",
    tagsDisplay: "HR、面试",
    healthOverall: "green",
    dimensions: { capability: "green", quality: "green", cost: "green", efficacy: "green", security: "green" },
    channels: [{ name: "feishu", count: 84 }],
    modelProviders: [{ name: "minimax-cn", count: 84 }],
    models: [{ name: "MiniMax-M2.5", count: 84 }],
  },
];

function dayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDays(days) {
  const n = Math.max(1, Number(days) || 7);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(dayStr(-i));
  return out;
}

function buildCostTrendByEmployee(days) {
  const dayList = buildDays(days);
  const series = MOCK_EMPLOYEES.map((e, idx) => {
    const base = e.totalCostUsd / Math.max(1, dayList.length);
    return {
      sessionKey: e.employeeKey,
      agentName: e.agentName,
      displayLabel: e.displayLabel,
      values: dayList.map((_, i) => Math.round((base * (0.82 + ((idx + i) % 4) * 0.09)) * 1e4) / 1e4),
    };
  });
  return { days: dayList, series };
}

function buildSessionRows(agents, days) {
  const list = [];
  const dayList = buildDays(days);
  let seed = 1;
  for (const a of agents) {
    const perDay = Math.max(1, Math.floor(a.sessionCount / dayList.length));
    for (let di = 0; di < dayList.length; di += 1) {
      const count = di === dayList.length - 1 ? a.sessionCount - perDay * (dayList.length - 1) : perDay;
      for (let i = 0; i < count; i += 1) {
        const ts = Date.parse(`${dayList[di]}T${String((i * 3) % 24).padStart(2, "0")}:15:00.000Z`);
        list.push({
          rowId: `${a.employeeKey}-${di}-${i}`,
          sessionId: `${a.employeeKey}-sid-${di}-${i}`,
          sessionKey: a.sessionKeys[(i + di) % a.sessionKeys.length],
          session_id: `${a.employeeKey}-sid-${di}-${i}`,
          agentName: a.agentName,
          employeeKey: a.employeeKey,
          displayLabel: a.displayLabel,
          sessionCount: 1,
          totalTokens: Math.round((a.totalTokens / a.sessionCount) * (0.9 + (seed % 4) * 0.05)),
          abortedCount: i % 19 === 0 ? 1 : 0,
          successCount: i % 19 === 0 ? 0 : 1,
          successRate: i % 19 === 0 ? 0 : 1,
          lastUpdatedAt: ts,
          channels: a.channels,
          models: a.models,
          modelProviders: a.modelProviders,
          dominantModelProvider: a.dominantModelProvider,
          dominantModelName: a.dominantModelName,
          tagsDisplay: a.tagsDisplay,
          totalToolUse: Math.max(1, Math.round(a.totalToolUse / a.sessionCount)),
          toolErrorCount: i % 17 === 0 ? 1 : 0,
          execCommandErrorCount: i % 23 === 0 ? 1 : 0,
          riskHighTotal: i % 21 === 0 ? 1 : 0,
          riskMediumTotal: i % 9 === 0 ? 1 : 0,
          totalCostUsd: Math.round((a.totalCostUsd / a.sessionCount) * 1e6) / 1e6,
          costPerSuccessfulUsd: Math.round((a.totalCostUsd / Math.max(1, a.successCount)) * 1e6) / 1e6,
          securityRiskScore: a.securityRiskScore,
          compositeScore: Math.round(((a.successRate * 100 + (100 - a.securityRiskScore)) / 2) * 10) / 10,
          avgSkillCount: a.avgSkillCount,
          p95DurationMs: a.p95DurationMs,
          chatTypeTop: a.chatTypeTop,
          healthOverall: a.healthOverall,
          dimensions: a.dimensions,
        });
        seed += 1;
      }
    }
  }
  return list;
}

export function mockDigitalEmployeeOverview(days = 7, _hours) {
  const d = Math.max(1, Number(days) || 7);
  const now = Date.now();
  const windowStartMs = now - d * 86400000;
  const daysList = buildDays(d);
  const agentsAggregated = MOCK_EMPLOYEES.map((a, idx) => ({
    ...a,
    lastUpdatedAt: now - (idx + 1) * 4 * 60 * 1000,
    sessionId: `${a.employeeKey}-latest`,
    costPerSuccessfulUsd: Math.round((a.totalCostUsd / Math.max(1, a.successCount)) * 1e6) / 1e6,
    compositeScore: Math.round(((a.successRate * 100 + (100 - a.securityRiskScore)) / 2) * 10) / 10,
  }));
  const o3Employees = buildSessionRows(agentsAggregated, d);
  const totalSessions = o3Employees.length;
  const totalTokens = o3Employees.reduce((s, r) => s + (Number(r.totalTokens) || 0), 0);
  const successSessions = o3Employees.reduce((s, r) => s + (Number(r.successCount) || 0), 0);
  const overallSuccessRate = totalSessions > 0 ? successSessions / totalSessions : 0;
  const channelMap = new Map();
  for (const a of agentsAggregated) {
    for (const c of a.channels || []) {
      channelMap.set(c.name, (channelMap.get(c.name) || 0) + (Number(c.count) || 0));
    }
  }
  const channels = [...channelMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const topChannel = channels[0] || { name: "—", count: 0 };
  const totalChannelCount = channels.reduce((s, c) => s + c.count, 0) || 1;
  const healthBuckets = {
    green: agentsAggregated.filter((a) => a.healthOverall === "green").length,
    yellow: agentsAggregated.filter((a) => a.healthOverall === "yellow").length,
    red: agentsAggregated.filter((a) => a.healthOverall === "red").length,
  };
  const costTrendByEmployee = buildCostTrendByEmployee(d);
  const costTrendDaily = costTrendByEmployee.days.map((day, i) => ({
    day,
    usd: Math.round(costTrendByEmployee.series.reduce((s, x) => s + (Number(x.values[i]) || 0), 0) * 1e4) / 1e4,
  }));
  const sessionTrendDaily = daysList.map((day, i) => ({
    day,
    sessions: Math.max(8, Math.round(totalSessions / d + (i % 3 - 1) * 5)),
  }));
  const highRiskEmployeeCount = agentsAggregated.filter((a) => Number(a.securityRiskScore) >= 70).length;

  return {
    source: "mock",
    days: d,
    hours: null,
    windowStartMs,
    o1_summary: {
      healthScorePct: Math.round(((healthBuckets.green * 100 + healthBuckets.yellow * 70 + healthBuckets.red * 35) / Math.max(1, agentsAggregated.length)) * 10) / 10,
      healthBuckets,
      channelCount: channels.length,
      topChannel: {
        name: topChannel.name,
        count: topChannel.count,
        pct: Math.round((topChannel.count / totalChannelCount) * 1000) / 1000,
      },
      totalCostUsd: Math.round(agentsAggregated.reduce((s, a) => s + (Number(a.totalCostUsd) || 0), 0) * 1e4) / 1e4,
      avgDailyCostUsdPerEmployee: Math.round((agentsAggregated.reduce((s, a) => s + (Number(a.totalCostUsd) || 0), 0) / Math.max(1, agentsAggregated.length) / d) * 1e4) / 1e4,
      costTrendDaily,
      costTrendByEmployee,
      hasCostData: true,
      overallSuccessRate,
      overallP95DurationMs: Math.round(agentsAggregated.reduce((s, a) => s + (Number(a.p95DurationMs) || 0), 0) / Math.max(1, agentsAggregated.length)),
      highRiskEmployeeCount,
      totalSessions,
      totalTokens,
      employeeTotal: agentsAggregated.length,
      onlineEmployeeCount15m: agentsAggregated.filter((a) => now - (Number(a.lastUpdatedAt) || 0) <= 15 * 60 * 1000).length,
      sessionTrendDaily,
    },
    o2_dimensions: {
      capability: {
        avgSkillCount: Math.round((agentsAggregated.reduce((s, a) => s + (Number(a.avgSkillCount) || 0), 0) / Math.max(1, agentsAggregated.length)) * 10) / 10,
        avgToolUsePerSession: Math.round((agentsAggregated.reduce((s, a) => s + (Number(a.totalToolUse) || 0), 0) / Math.max(1, totalSessions)) * 10) / 10,
      },
      quality: {
        successRate: overallSuccessRate,
        abortedRate: 1 - overallSuccessRate,
      },
      cost: {
        totalUsd: Math.round(agentsAggregated.reduce((s, a) => s + (Number(a.totalCostUsd) || 0), 0) * 1e4) / 1e4,
        avgPerEmployeePerDayUsd: Math.round((agentsAggregated.reduce((s, a) => s + (Number(a.totalCostUsd) || 0), 0) / Math.max(1, agentsAggregated.length) / d) * 1e4) / 1e4,
      },
      efficacy: {
        totalSessions,
        successSessions,
        p95Ms: Math.round(agentsAggregated.reduce((s, a) => s + (Number(a.p95DurationMs) || 0), 0) / Math.max(1, agentsAggregated.length)),
      },
      security: {
        greenAgents: agentsAggregated.filter((a) => a.dimensions.security === "green").length,
        yellowAgents: agentsAggregated.filter((a) => a.dimensions.security === "yellow").length,
        redAgents: agentsAggregated.filter((a) => a.dimensions.security === "red").length,
      },
    },
    o3_employees: o3Employees,
    agentsAggregated,
    topN: {
      highRisk: [...agentsAggregated]
        .sort((a, b) => (b.riskHighTotal - a.riskHighTotal) || (b.riskMediumTotal - a.riskMediumTotal))
        .slice(0, 10)
        .map((a) => ({
          sessionKey: a.employeeKey,
          agentName: a.agentName,
          displayLabel: a.displayLabel,
          riskHighTotal: a.riskHighTotal,
          riskMediumTotal: a.riskMediumTotal,
          healthOverall: a.healthOverall,
        })),
      highEfficiency: [...agentsAggregated]
        .map((a) => ({
          sessionKey: a.employeeKey,
          agentName: a.agentName,
          displayLabel: a.displayLabel,
          efficiencyScore: Math.round((((a.successRate || 0) * (a.sessionCount || 0)) / Math.max(0.01, Number(a.totalCostUsd) || 0.01)) * 100) / 100,
          successRate: a.successRate,
          sessionCount: a.sessionCount,
          totalTokens: a.totalTokens,
        }))
        .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
        .slice(0, 10),
    },
    channels,
    agents: o3Employees,
    distinctAgents: agentsAggregated.length,
    totalSessions,
    totalTokens,
    abortedSessions: totalSessions - successSessions,
  };
}
