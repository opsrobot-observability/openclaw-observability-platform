/**
 * Mock: GET /api/digital-employees/overview
 * 对齐后端 buildDigitalEmployeeOverview 输出结构
 */

const MOCK_EMPLOYEES = [
  {
    agentName: "main",
    employeeKey: "main",
    sessionKey: "agent:main:feishu:direct:ou_abc123",
    sessionKeys: ["agent:main:feishu:direct:ou_abc123", "agent:main:subagent:uuid-001", "agent:main:subagent:uuid-002"],
    sessionId: "65a98f95-149a-4c01-ac0c-dd03cdff4c43",
    displayLabel: "openclaw-tui",
    sessionCount: 6,
    totalTokens: 65567613,
    abortedCount: 0,
    successCount: 6,
    successRate: 1,
    totalCostUsd: 15.253384,
    costPerSuccessfulUsd: 2.542231,
    securityRiskScore: 62,
    riskHighTotal: 0,
    riskMediumTotal: 60,
    riskLowTotal: 0,
    avgSkillCount: 12,
    p95DurationMs: 1527702,
    totalToolUse: 599,
    toolErrorCount: 0,
    execCommandErrorCount: 0,
    chatTypeTop: "direct",
    dominantModelProvider: "minimax-portal",
    dominantModelName: "MiniMax-M2.7",
    tagsDisplay: "openclaw-tui、ou_abc123",
    healthOverall: "yellow",
    compositeScore: 72,
    dimensions: { capability: "green", quality: "green", cost: "green", efficacy: "red", security: "yellow" },
    channels: [{ name: "feishu", count: 5 }, { name: "webchat", count: 1 }],
    modelProviders: [{ name: "minimax-portal", count: 6 }],
    models: [{ name: "MiniMax-M2.7", count: 6 }],
    lastUpdatedAt: Date.now() - 40 * 60 * 1000, // 40分钟前
  },
  {
    agentName: "mc-gateway-2dfbae07-6536-4f38-b59b-d0fe548074d5",
    employeeKey: "mc-gateway-2dfbae07-6536-4f38-b59b-d0fe548074d5",
    sessionKey: "agent:gateway:internal:direct:ops-team",
    sessionKeys: ["agent:gateway:internal:direct:ops-team", "agent:gateway:subagent:uuid-gw-001"],
    sessionId: "gateway-sid-001",
    displayLabel: "ops-runner",
    sessionCount: 132,
    totalTokens: 1548000,
    abortedCount: 14,
    successCount: 118,
    successRate: 0.8939,
    totalCostUsd: 4.866,
    costPerSuccessfulUsd: 0.0412,
    securityRiskScore: 74.6,
    riskHighTotal: 6,
    riskMediumTotal: 9,
    riskLowTotal: 5,
    avgSkillCount: 4.8,
    p95DurationMs: 48200,
    totalToolUse: 1060,
    toolErrorCount: 12,
    execCommandErrorCount: 8,
    chatTypeTop: "direct",
    dominantModelProvider: "anthropic",
    dominantModelName: "Opus 4.6",
    tagsDisplay: "运维、巡检",
    healthOverall: "yellow",
    compositeScore: 58,
    dimensions: { capability: "yellow", quality: "yellow", cost: "yellow", efficacy: "yellow", security: "red" },
    channels: [{ name: "internal", count: 132 }],
    modelProviders: [{ name: "anthropic", count: 132 }],
    models: [{ name: "Opus 4.6", count: 132 }],
    lastUpdatedAt: Date.now() - 5 * 60 * 1000, // 5分钟前
  },
  {
    agentName: "data-analyst",
    employeeKey: "data-analyst",
    sessionKey: "agent:analyst:api:direct:data-team",
    sessionKeys: ["agent:analyst:api:direct:data-team", "agent:analyst:subagent:uuid-da-001", "agent:analyst:subagent:uuid-da-002"],
    sessionId: "analyst-sid-001",
    displayLabel: "nl2sql",
    sessionCount: 96,
    totalTokens: 1203000,
    abortedCount: 9,
    successCount: 87,
    successRate: 0.9062,
    totalCostUsd: 3.984,
    costPerSuccessfulUsd: 0.0458,
    securityRiskScore: 58.1,
    riskHighTotal: 2,
    riskMediumTotal: 7,
    riskLowTotal: 8,
    avgSkillCount: 5.6,
    p95DurationMs: 31200,
    totalToolUse: 640,
    toolErrorCount: 5,
    execCommandErrorCount: 2,
    chatTypeTop: "direct",
    dominantModelProvider: "openai",
    dominantModelName: "Gemini 3.1 Pro",
    tagsDisplay: "分析、报表",
    healthOverall: "yellow",
    compositeScore: 65,
    dimensions: { capability: "yellow", quality: "yellow", cost: "yellow", efficacy: "yellow", security: "yellow" },
    channels: [{ name: "api", count: 96 }],
    modelProviders: [{ name: "openai", count: 96 }],
    models: [{ name: "Gemini 3.1 Pro", count: 96 }],
    lastUpdatedAt: Date.now() - 12 * 60 * 1000, // 12分钟前
  },
  {
    agentName: "hr-interviewer",
    employeeKey: "hr-interviewer",
    sessionKey: "agent:hr:feishu:direct:hr-team",
    sessionKeys: ["agent:hr:feishu:direct:hr-team", "agent:hr:subagent:uuid-hr-001"],
    sessionId: "hr-sid-001",
    displayLabel: "hr-interview",
    sessionCount: 84,
    totalTokens: 793000,
    abortedCount: 2,
    successCount: 82,
    successRate: 0.9762,
    totalCostUsd: 2.448,
    costPerSuccessfulUsd: 0.0298,
    securityRiskScore: 27.3,
    riskHighTotal: 0,
    riskMediumTotal: 2,
    riskLowTotal: 10,
    avgSkillCount: 4.3,
    p95DurationMs: 20800,
    totalToolUse: 280,
    toolErrorCount: 1,
    execCommandErrorCount: 0,
    chatTypeTop: "direct",
    dominantModelProvider: "minimax-cn",
    dominantModelName: "MiniMax-M2.7",
    tagsDisplay: "HR、面试",
    healthOverall: "green",
    compositeScore: 82,
    dimensions: { capability: "green", quality: "green", cost: "green", efficacy: "green", security: "green" },
    channels: [{ name: "feishu", count: 84 }],
    modelProviders: [{ name: "minimax-cn", count: 84 }],
    models: [{ name: "MiniMax-M2.7", count: 84 }],
    lastUpdatedAt: Date.now() - 8 * 60 * 1000, // 8分钟前
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

function dayKeyFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 与后端 buildOverviewPayload 中 runOverview 结构对齐，供 Mock 使用
 * @param {object[]} agentsAggregated
 * @param {object[]} o3Employees
 * @param {string[]} daysList
 * @param {number} now
 */
function buildMockRunOverview(agentsAggregated, o3Employees, daysList, now) {
  const sessionsByDay = new Map();
  const successByDay = new Map();
  const tokensByDay = new Map();
  /** @type {Map<string, Set<string>>} */
  const activeAgentsByDay = new Map();
  const tokensTodayByAgent = new Map();
  const riskSessionCountByAgent = new Map();
  const lastRiskAtByAgent = new Map();
  /** @type {Map<string, Map<string, number>>} */
  const workspaceCountByAgent = new Map();

  const employeeKeyOf = (r) => (r.agentName && String(r.agentName).trim()) || "未命名";
  const todayKey = daysList[daysList.length - 1] || dayStr(0);
  let todaySessionsAll = 0;
  let todayTasksAll = 0;

  for (const r of o3Employees) {
    const tMs = Number(r.lastUpdatedAt) || Number(r.endedAt);
    if (!Number.isFinite(tMs)) continue;
    const dk = dayKeyFromMs(tMs);
    if (!dk) continue;
    sessionsByDay.set(dk, (sessionsByDay.get(dk) ?? 0) + 1);
    const okRun = !(Number(r.abortedCount) > 0) && !r.abortedLastRun;
    successByDay.set(dk, (successByDay.get(dk) ?? 0) + (okRun ? 1 : 0));
    const tokRow = Number(r.totalTokens);
    if (Number.isFinite(tokRow)) tokensByDay.set(dk, (tokensByDay.get(dk) ?? 0) + tokRow);
    const ek = employeeKeyOf(r);
    if (!activeAgentsByDay.has(dk)) activeAgentsByDay.set(dk, new Set());
    activeAgentsByDay.get(dk).add(ek);
    if (dk === todayKey) {
      todaySessionsAll += 1;
      todayTasksAll += Number(r.totalToolUse) || Number(r.toolUseCount) || 0;
      if (Number.isFinite(tokRow)) {
        tokensTodayByAgent.set(ek, (tokensTodayByAgent.get(ek) ?? 0) + tokRow);
      }
    }
    const rh = Number(r.riskHigh ?? r.riskHighTotal) || 0;
    const rm = Number(r.riskMedium ?? r.riskMediumTotal) || 0;
    if (rh > 0 || rm > 0) {
      riskSessionCountByAgent.set(ek, (riskSessionCountByAgent.get(ek) ?? 0) + 1);
      const prev = lastRiskAtByAgent.get(ek) ?? 0;
      if (tMs > prev) lastRiskAtByAgent.set(ek, tMs);
    }
    const gid =
      r.groupId != null && String(r.groupId).trim()
        ? String(r.groupId).trim()
        : r._doris && r._doris.group_id != null && String(r._doris.group_id).trim()
          ? String(r._doris.group_id).trim()
          : null;
    if (gid) {
      if (!workspaceCountByAgent.has(ek)) workspaceCountByAgent.set(ek, new Map());
      const wm = workspaceCountByAgent.get(ek);
      wm.set(gid, (wm.get(gid) ?? 0) + 1);
    }
  }

  const WINDOW_MS_15 = 15 * 60 * 1000;
  const offlineAgentCount = agentsAggregated.filter((a) => {
    const u = Number(a.lastUpdatedAt) || 0;
    return !u || now - u > WINDOW_MS_15;
  }).length;
  const abnormalAgentCount = agentsAggregated.filter((a) => a.healthOverall === "yellow" || a.healthOverall === "red").length;

  const greenE = agentsAggregated.filter((a) => a.healthOverall === "green").length;
  const yellowE = agentsAggregated.filter((a) => a.healthOverall === "yellow").length;
  const redE = agentsAggregated.filter((a) => a.healthOverall === "red").length;

  const totalSessions = o3Employees.length;
  const successSessions = o3Employees.filter((r) => !(Number(r.abortedCount) > 0)).length;
  const overallSuccessRate = totalSessions > 0 ? successSessions / totalSessions : null;
  const durationVals = o3Employees.map((r) => Number(r.durationMs ?? r.p95DurationMs ?? 0)).filter((n) => Number.isFinite(n) && n >= 0);
  const avgResponseDurationMs =
    durationVals.length > 0 ? Math.round((durationVals.reduce((s, v) => s + v, 0) / durationVals.length) * 10) / 10 : null;

  const trendDaysSorted =
    daysList.length > 0
      ? [...daysList].sort((a, b) => a.localeCompare(b))
      : [...new Set([...sessionsByDay.keys(), ...tokensByDay.keys(), ...activeAgentsByDay.keys()])].sort((a, b) =>
          a.localeCompare(b),
        );
  const activeAgentTrendDaily = trendDaysSorted.map((day) => ({
    day,
    activeAgents: activeAgentsByDay.get(day)?.size ?? 0,
  }));
  const sessionTrendDaily = trendDaysSorted.map((day) => ({
    day,
    sessions: sessionsByDay.get(day) ?? 0,
  }));
  const responseRateTrendDaily = trendDaysSorted.map((day) => {
    const s = sessionsByDay.get(day) ?? 0;
    const ok = successByDay.get(day) ?? 0;
    return { day, rate: s > 0 ? Math.round((ok / s) * 1e4) / 1e4 : null };
  });
  const tokenTrendDaily = trendDaysSorted.map((day) => ({
    day,
    tokens: Math.round(tokensByDay.get(day) ?? 0),
  }));

  const totalTokSumAgg = agentsAggregated.reduce((s, a) => s + (Number(a.totalTokens) || 0), 0) || 1;
  const tokenPieCandidates = [...agentsAggregated]
    .filter((a) => (Number(a.totalTokens) || 0) > 0)
    .sort((x, y) => (Number(y.totalTokens) || 0) - (Number(x.totalTokens) || 0));
  const tokenPieTop = tokenPieCandidates.slice(0, 8);
  const otherTokSum = tokenPieCandidates.slice(8).reduce((s, a) => s + (Number(a.totalTokens) || 0), 0);
  const tokenPie = [
    ...tokenPieTop.map((a) => ({
      name: a.agentName,
      value: Math.round(Number(a.totalTokens) || 0),
      pct: Math.round(((Number(a.totalTokens) || 0) / totalTokSumAgg) * 1000) / 1000,
    })),
    ...(otherTokSum > 0
      ? [{ name: "__other__", value: Math.round(otherTokSum), pct: Math.round((otherTokSum / totalTokSumAgg) * 1000) / 1000 }]
      : []),
  ];

  const totalSesSumAgg = agentsAggregated.reduce((s, a) => s + (Number(a.sessionCount) || 0), 0) || 1;
  const sessionPieCandidates = [...agentsAggregated]
    .filter((a) => (Number(a.sessionCount) || 0) > 0)
    .sort((x, y) => (Number(y.sessionCount) || 0) - (Number(x.sessionCount) || 0));
  const sessionPieTop = sessionPieCandidates.slice(0, 8);
  const otherSesSum = sessionPieCandidates.slice(8).reduce((s, a) => s + (Number(a.sessionCount) || 0), 0);
  const sessionPie = [
    ...sessionPieTop.map((a) => ({
      name: a.agentName,
      value: Math.round(Number(a.sessionCount) || 0),
      pct: Math.round(((Number(a.sessionCount) || 0) / totalSesSumAgg) * 1000) / 1000,
    })),
    ...(otherSesSum > 0
      ? [{ name: "__other__", value: Math.round(otherSesSum), pct: Math.round((otherSesSum / totalSesSumAgg) * 1000) / 1000 }]
      : []),
  ];

  const statusPie = [
    { key: "green", value: greenE },
    { key: "yellow", value: yellowE },
    { key: "red", value: redE },
  ];

  const pickWorkspaceForAgent = (ek) => {
    const m = workspaceCountByAgent.get(ek);
    if (!m || m.size === 0) return null;
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
  };

  const topByTasks = [...agentsAggregated]
    .sort((a, b) => (Number(b.totalToolUse) || 0) - (Number(a.totalToolUse) || 0))
    .slice(0, 10)
    .map((a) => ({
      employeeKey: a.employeeKey,
      agentName: a.agentName,
      displayLabel: a.displayLabel,
      taskCount: Number(a.totalToolUse) || 0,
      successRate: a.successRate,
      status: a.healthOverall,
    }));

  const topByTokens = [...agentsAggregated]
    .sort((a, b) => (Number(b.totalTokens) || 0) - (Number(a.totalTokens) || 0))
    .slice(0, 10)
    .map((a) => ({
      employeeKey: a.employeeKey,
      agentName: a.agentName,
      totalTokens: Math.round(Number(a.totalTokens) || 0),
      todayTokens: tokensTodayByAgent.get(a.employeeKey) ?? 0,
      workspace: pickWorkspaceForAgent(a.employeeKey),
    }));

  const topByRisk = [...agentsAggregated]
    .sort((a, b) => {
      const sa = (Number(a.riskHighTotal) || 0) * 1000 + (Number(a.riskMediumTotal) || 0);
      const sb = (Number(b.riskHighTotal) || 0) * 1000 + (Number(b.riskMediumTotal) || 0);
      return sb - sa;
    })
    .slice(0, 10)
    .map((a) => ({
      employeeKey: a.employeeKey,
      agentName: a.agentName,
      riskSessionCount: riskSessionCountByAgent.get(a.employeeKey) ?? 0,
      maxRiskLevel:
        (Number(a.riskHighTotal) || 0) > 0 ? "P0" : (Number(a.riskMediumTotal) || 0) > 0 ? "P1" : (Number(a.riskLowTotal) || 0) > 0 ? "P2" : "—",
      lastRiskAt: lastRiskAtByAgent.get(a.employeeKey) ?? null,
    }));

  const onlineEmployeeCount15m = agentsAggregated.filter((a) => {
    const u = Number(a.lastUpdatedAt) || 0;
    return u > 0 && now - u <= WINDOW_MS_15;
  }).length;

  return {
    metrics: {
      offlineAgentCount,
      abnormalAgentCount,
      todayTotalTasks: todayTasksAll,
      todayTotalSessions: todaySessionsAll,
      avgTaskSuccessRate: overallSuccessRate,
      avgResponseDurationMs,
      employeeTotal: agentsAggregated.length,
      onlineAgentCount: onlineEmployeeCount15m,
    },
    statusPie,
    sessionPie,
    tokenPie,
    activeAgentTrendDaily,
    sessionTrendDaily,
    responseRateTrendDaily,
    tokenTrendDaily,
    topByTasks,
    topByTokens,
    topByRisk,
  };
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
        const sessionTokens = Math.round((a.totalTokens / a.sessionCount) * (0.9 + (seed % 4) * 0.05));
        const isAborted = i % 19 === 0 ? 1 : 0;
        list.push({
          // 主键相关
          rowId: `${a.employeeKey}-${di}-${i}`,
          sessionId: `${a.employeeKey}-sid-${di}-${i}`,
          session_id: `${a.employeeKey}-sid-${di}-${i}`,
          sessionKey: a.sessionKeys[(i + di) % a.sessionKeys.length],
          // 员工标识
          agentName: a.agentName,
          employeeKey: a.employeeKey,
          displayLabel: a.displayLabel,
          // 会话统计
          sessionCount: 1,
          totalTokens: sessionTokens,
          // 成功/中止统计
          abortedCount: isAborted,
          abortedLastRun: isAborted > 0,
          successCount: isAborted ? 0 : 1,
          successRate: isAborted ? 0 : 1,
          // 时间戳
          lastUpdatedAt: ts,
          updatedAt: ts,
          endedAt: ts,
          // 渠道和模型
          channels: a.channels,
          channel: a.channels?.[0]?.name ?? null,
          lastChannel: a.channels?.[0]?.name ?? null,
          models: a.models,
          model: a.models?.[0]?.name ?? null,
          modelProviders: a.modelProviders,
          modelProvider: a.dominantModelProvider,
          dominantModelProvider: a.dominantModelProvider,
          dominantModelName: a.dominantModelName,
          // 标签
          tagsDisplay: a.tagsDisplay,
          label: a.tagsDisplay,
          originLabel: a.tagsDisplay,
          // 工具和风险
          totalToolUse: Math.max(1, Math.round(a.totalToolUse / a.sessionCount)),
          toolUseCount: Math.max(1, Math.round(a.totalToolUse / a.sessionCount)),
          toolErrorCount: i % 17 === 0 ? 1 : 0,
          execCommandErrorCount: i % 23 === 0 ? 1 : 0,
          riskHighTotal: i % 21 === 0 ? 1 : 0,
          riskHigh: i % 21 === 0 ? 1 : 0,
          riskMediumTotal: i % 9 === 0 ? 1 : 0,
          riskMedium: i % 9 === 0 ? 1 : 0,
          riskLowTotal: a.riskLowTotal || 0,
          riskLow: a.riskLowTotal || 0,
          // 成本和评分
          totalCostUsd: Math.round((a.totalCostUsd / a.sessionCount) * 1e6) / 1e6,
          costPerSuccessfulUsd: Math.round((a.totalCostUsd / Math.max(1, a.successCount)) * 1e6) / 1e6,
          securityRiskScore: a.securityRiskScore,
          compositeScore: Math.round(((a.successRate * 100 + (100 - a.securityRiskScore)) / 2) * 10) / 10,
          avgSkillCount: a.avgSkillCount,
          // 性能指标
          p95DurationMs: a.p95DurationMs,
          durationMs: Math.round(Number(a.p95DurationMs) + (seed % 9) * 400),
          chatTypeTop: a.chatTypeTop,
          chatType: a.chatTypeTop,
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
    // 补充缺失字段
    lastUpdatedAt: a.lastUpdatedAt || (now - (idx + 1) * 4 * 60 * 1000),
    sessionId: a.sessionId || `${a.employeeKey}-latest`,
    sessionKey: a.sessionKey || `${a.employeeKey}-latest-key`,
    costPerSuccessfulUsd: a.costPerSuccessfulUsd || Math.round((a.totalCostUsd / Math.max(1, a.successCount)) * 1e6) / 1e6,
    compositeScore: a.compositeScore || Math.round(((a.successRate * 100 + (100 - a.securityRiskScore)) / 2) * 10) / 10,
    // 确保工具错误字段存在
    toolErrorCount: a.toolErrorCount || 0,
    execCommandErrorCount: a.execCommandErrorCount || 0,
    // 其他必要字段
    riskLowTotal: a.riskLowTotal || 0,
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

  const runOverview = buildMockRunOverview(agentsAggregated, o3Employees, daysList, now);

  return {
    source: "mock",
    days: d,
    hours: null,
    windowStartMs,
    runOverview,
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
