/**
 * 数字员工概览：按设计文档 O1/O2/O3 结构从会话行聚合（无 DB 变更）。
 * 版本 1.0.1
 */

/** @param {Record<string, unknown>} r */
function pickRowNum(r, keys) {
  for (const k of keys) {
    const v = r[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/** @param {Record<string, unknown>} r */
function sessionSkillCount(r) {
  const rs =
    (Array.isArray(r.resolvedSkills) && r.resolvedSkills) ||
    (r.skillsSnapshot &&
    typeof r.skillsSnapshot === "object" &&
    Array.isArray(/** @type {Record<string, unknown>} */ (r.skillsSnapshot).resolvedSkills)
      ? /** @type {Record<string, unknown>} */ (r.skillsSnapshot).resolvedSkills
      : null) ||
    (r.skillsSnapshot &&
    typeof r.skillsSnapshot === "object" &&
    Array.isArray(/** @type {Record<string, unknown>} */ (r.skillsSnapshot).skills)
      ? /** @type {Record<string, unknown>} */ (r.skillsSnapshot).skills
      : null);
  if (Array.isArray(rs)) return rs.length;
  return 0;
}

/** @param {Record<string, unknown>} r */
function sessionEstimatedCostUsd(r) {
  return pickRowNum(r, ["estimatedCostUsd", "estimated_cost_usd"]);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dayKeyFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 统一数字员工主键：session_key 优先，其次 session_id */
function employeeKeyFromRow(r, fallback = "") {
  const sk = r.sessionKey != null && String(r.sessionKey).trim() ? String(r.sessionKey).trim() : "";
  if (sk) return sk;
  const sid =
    (r.session_id != null && String(r.session_id).trim() ? String(r.session_id).trim() : "") ||
    (r.sessionId != null && String(r.sessionId).trim() ? String(r.sessionId).trim() : "");
  return sid || fallback;
}

/** @typedef {"green"|"yellow"|"red"|"unknown"} HealthTier */

/** @param {number|null} avgSkills */
function dimCapability(avgSkills) {
  if (avgSkills == null || !Number.isFinite(avgSkills)) return "unknown";
  if (avgSkills >= 5) return "green";
  if (avgSkills >= 2) return "yellow";
  return "red";
}

/** @param {number|null} successRate 0..1 */
function dimQuality(successRate) {
  if (successRate == null || !Number.isFinite(successRate)) return "unknown";
  if (successRate >= 0.95) return "green";
  if (successRate >= 0.8) return "yellow";
  return "red";
}

/** @param {number|null} usdPerEmployeePerDay */
function dimCost(usdPerEmployeePerDay, hasCostData) {
  if (!hasCostData || usdPerEmployeePerDay == null || !Number.isFinite(usdPerEmployeePerDay)) return "unknown";
  if (usdPerEmployeePerDay < 10) return "green";
  if (usdPerEmployeePerDay <= 50) return "yellow";
  return "red";
}

/** @param {number|null} p95Ms */
function dimEfficacy(p95Ms) {
  if (p95Ms == null || !Number.isFinite(p95Ms)) return "unknown";
  if (p95Ms < 30000) return "green";
  if (p95Ms <= 60000) return "yellow";
  return "red";
}

/** @param {number} riskHigh @param {number} riskMedium */
function dimSecurity(riskHigh, riskMedium) {
  if (riskHigh >= 1) return "red";
  if (riskMedium >= 2) return "yellow";
  return "green";
}

/** @param {HealthTier[]} dims */
function overallHealthFromDims(dims) {
  const known = dims.filter((d) => d !== "unknown");
  if (known.length === 0) return "yellow";
  if (known.some((d) => d === "red")) return "red";
  if (known.some((d) => d === "yellow")) return "yellow";
  return "green";
}

/** @param {HealthTier} tier */
function tierScore(tier) {
  if (tier === "green") return 90;
  if (tier === "yellow") return 60;
  if (tier === "red") return 30;
  return 50;
}

/** @param {{capability: HealthTier, quality: HealthTier, cost: HealthTier, efficacy: HealthTier, security: HealthTier}} dims */
function compositeScoreFromDims(dims) {
  const vals = [
    tierScore(dims.capability),
    tierScore(dims.quality),
    tierScore(dims.efficacy),
    tierScore(dims.cost),
    tierScore(dims.security),
  ];
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

/**
 * 概览健康度：参考综合评分（越高越好）与安全风险评分（越高风险越大）
 * @param {number|null} compositeScore
 * @param {number|null} securityRiskScore
 * @returns {HealthTier}
 */
function healthFromCompositeAndRisk(compositeScore, securityRiskScore) {
  const c = Number(compositeScore);
  const r = Number(securityRiskScore);
  if (!Number.isFinite(c) && !Number.isFinite(r)) return "yellow";
  if (Number.isFinite(r) && r >= 75) return "red";
  if (Number.isFinite(c) && c < 55) return "red";
  if (Number.isFinite(r) && r >= 50) return "yellow";
  if (Number.isFinite(c) && c < 75) return "yellow";
  return "green";
}

/** 核心指标健康度分值映射（0-100） */
function healthTierScore(tier) {
  if (tier === "green") return 100;
  if (tier === "yellow") return 70;
  if (tier === "red") return 35;
  return 60;
}

/** 从 `provider/model` 形态模型 id 推断服务商前缀 */
function parseProviderFromModelId(modelStr) {
  if (modelStr == null || typeof modelStr !== "string") return null;
  const s = modelStr.trim();
  const i = s.indexOf("/");
  if (i <= 0) return null;
  return s.slice(0, i) || null;
}

/**
 * 统一链路风险评分（0-100，越高风险越大）：
 * 综合评分 -> 风险评分 -> 健康度
 * @param {number|null} compositeScore
 * @param {number} riskHigh
 * @param {number} riskMedium
 * @param {number} riskLow
 */
function unifiedRiskScore(compositeScore, riskHigh, riskMedium, riskLow) {
  const c = Number(compositeScore);
  const base = !Number.isFinite(c) ? 45 : c >= 80 ? 24 : c >= 60 ? 45 : c >= 40 ? 66 : 82;
  const rh = Number(riskHigh) || 0;
  const rm = Number(riskMedium) || 0;
  const rl = Number(riskLow) || 0;
  const score = base + rh * 8 + rm * 3 + rl * 1;
  return Math.min(100, Math.round(score * 10) / 10);
}

/**
 * @param {object[]} rows  mapAgentSessionRows 输出
 * @param {{ days: number, windowStartMs: number, hasHours: boolean }} ctx
 */
export function buildOverviewPayload(rows, ctx) {
  const { days, windowStartMs } = ctx;
  const allRows = Array.isArray(rows) ? rows : [];
  // O3 列表展示口径：以 session_key 优先、否则 session_id 取最新一条（避免同一系统标识多行）
  const latestRowByEmployee = new Map();
  for (const r of allRows) {
    const sk = (r.sessionKey && String(r.sessionKey).trim()) || "";
    const sid = (r.session_id && String(r.session_id).trim()) || (r.sessionId && String(r.sessionId).trim()) || "";
    const key = sk || sid || `row-${latestRowByEmployee.size}`;
    if (!latestRowByEmployee.has(key)) latestRowByEmployee.set(key, r);
    else {
      const prev = latestRowByEmployee.get(key);
      const prevU = Number(prev?.updatedAt) || 0;
      const curU = Number(r?.updatedAt) || 0;
      if (curU >= prevU) latestRowByEmployee.set(key, r);
    }
  }
  const uniqRows = [...latestRowByEmployee.values()];
  const sessionRowsList = uniqRows.map((r, i) => {
    const totalTokens = Number.isFinite(Number(r.totalTokens)) ? Number(r.totalTokens) : 0;
    const totalCostUsd = sessionEstimatedCostUsd(r);
    const successRate = r.abortedLastRun ? 0 : 1;
    const avgSkills = sessionSkillCount(r);
    const dimSec = dimSecurity(Number(r.riskHigh) || 0, Number(r.riskMedium) || 0);
    const dims = {
      capability: dimCapability(avgSkills),
      quality: dimQuality(successRate),
      cost: dimCost(totalCostUsd != null ? totalCostUsd / Math.max(1, days) : null, totalCostUsd != null),
      efficacy: dimEfficacy(Number(r.durationMs)),
      security: dimSec,
    };
    const compositeScore = compositeScoreFromDims(dims);
    const securityRiskScore = unifiedRiskScore(compositeScore, r.riskHigh, r.riskMedium, r.riskLow);
    const healthOverall = healthFromCompositeAndRisk(compositeScore, securityRiskScore);
    return {
      rowId: (r.session_id && String(r.session_id)) || (r.sessionId && String(r.sessionId)) || `row-${i}`,
      sessionId: (r.session_id && String(r.session_id)) || (r.sessionId && String(r.sessionId)) || null,
      sessionKey: r.sessionKey != null ? String(r.sessionKey) : null,
      agentName: (r.agentName && String(r.agentName).trim()) || "未命名",
      employeeKey: employeeKeyFromRow(r, `row-${i}`),
      displayLabel:
        r.originLabel != null && String(r.originLabel).trim()
          ? String(r.originLabel).trim()
          : ((r.agentName && String(r.agentName).trim()) || "未命名"),
      sessionCount: 1,
      totalTokens,
      abortedCount: r.abortedLastRun ? 1 : 0,
      successCount: r.abortedLastRun ? 0 : 1,
      successRate,
      lastUpdatedAt: Number(r.updatedAt) || null,
      channels: r.lastChannel || r.channel ? [{ name: String(r.lastChannel || r.channel), count: 1 }] : [],
      models: r.model ? [{ name: String(r.model), count: 1 }] : [],
      modelProviders: r.modelProvider || r.originProvider ? [{ name: String(r.modelProvider || r.originProvider), count: 1 }] : [],
      dominantModelProvider: r.modelProvider || r.originProvider || parseProviderFromModelId(r.model) || null,
      dominantModelName: r.model ? String(r.model) : null,
      tagsDisplay: r.label != null && String(r.label).trim() ? String(r.label).trim() : null,
      totalToolUse: Number(r.toolUseCount) || 0,
      toolErrorCount: Number(r.toolErrorCount) || 0,
      execCommandErrorCount: Number(r.execCommandErrorCount) || 0,
      riskHighTotal: Number(r.riskHigh) || 0,
      riskMediumTotal: Number(r.riskMedium) || 0,
      totalCostUsd: totalCostUsd != null ? Math.round(totalCostUsd * 1e6) / 1e6 : null,
      costPerSuccessfulUsd:
        totalCostUsd != null && !r.abortedLastRun ? Math.round(totalCostUsd * 1e6) / 1e6 : null,
      securityRiskScore,
      compositeScore,
      avgSkillCount: avgSkills,
      p95DurationMs: Number.isFinite(Number(r.durationMs)) ? Number(r.durationMs) : null,
      chatTypeTop: r.chatType ? String(r.chatType) : null,
      healthOverall,
      dimensions: dims,
    };
  });
  const agentMap = new Map();

  for (const r of allRows) {
    const key = employeeKeyFromRow(r, "未命名");
    if (!agentMap.has(key)) {
      agentMap.set(key, {
        employeeKey: key,
        sessionKey: r.sessionKey != null ? String(r.sessionKey) : null,
        sessionId:
          (r.session_id && String(r.session_id).trim()) ||
          (r.sessionId && String(r.sessionId).trim()) ||
          null,
        agentName: (r.agentName && String(r.agentName).trim()) || "未命名",
        sessionCount: 0,
        totalTokens: 0,
        abortedCount: 0,
        successCount: 0,
        lastUpdatedAt: 0,
        channels: new Map(),
        models: new Map(),
        modelProviders: new Map(),
        totalToolUse: 0,
        toolErrorCount: 0,
        execCommandErrorCount: 0,
        riskHighTotal: 0,
        riskMediumTotal: 0,
        riskLowTotal: 0,
        durationSamples: [],
        labels: new Set(),
        skillCountSum: 0,
        totalCostUsd: 0,
        costSessions: 0,
        chatTypes: new Map(),
      });
    }
    const a = agentMap.get(key);
    a.sessionCount += 1;
    const tok = Number(r.totalTokens);
    if (Number.isFinite(tok)) a.totalTokens += tok;
    if (r.abortedLastRun) a.abortedCount += 1;
    else a.successCount += 1;
    const uAt = Number(r.updatedAt);
    if (Number.isFinite(uAt) && uAt > a.lastUpdatedAt) a.lastUpdatedAt = uAt;
    const ch = r.lastChannel || r.channel;
    if (ch && String(ch).trim()) {
      const c = String(ch);
      a.channels.set(c, (a.channels.get(c) ?? 0) + 1);
    }
    if (r.model && String(r.model).trim()) {
      const m = String(r.model);
      a.models.set(m, (a.models.get(m) ?? 0) + 1);
    }
    const mpRaw = r.modelProvider ?? r.originProvider;
    if (mpRaw != null && String(mpRaw).trim()) {
      const mp = String(mpRaw).trim();
      a.modelProviders.set(mp, (a.modelProviders.get(mp) ?? 0) + 1);
    }
    const tu = Number(r.toolUseCount);
    if (Number.isFinite(tu)) a.totalToolUse += tu;
    const te = Number(r.toolErrorCount);
    if (Number.isFinite(te)) a.toolErrorCount += te;
    const ee = Number(r.execCommandErrorCount);
    if (Number.isFinite(ee)) a.execCommandErrorCount += ee;
    const rh = Number(r.riskHigh);
    if (Number.isFinite(rh)) a.riskHighTotal += rh;
    const rm = Number(r.riskMedium);
    if (Number.isFinite(rm)) a.riskMediumTotal += rm;
    const rl = Number(r.riskLow);
    if (Number.isFinite(rl)) a.riskLowTotal += rl;
    const dm = Number(r.durationMs);
    if (Number.isFinite(dm) && dm >= 0) a.durationSamples.push(dm);
    if (r.originLabel && String(r.originLabel).trim()) a.labels.add(String(r.originLabel));
    a.skillCountSum += sessionSkillCount(r);
    const cUsd = sessionEstimatedCostUsd(r);
    if (cUsd != null && cUsd > 0) {
      a.totalCostUsd += cUsd;
      a.costSessions += 1;
    }
    const ct = r.chatType;
    if (ct && String(ct).trim()) {
      const t = String(ct);
      a.chatTypes.set(t, (a.chatTypes.get(t) ?? 0) + 1);
    }
  }

  let globalCostUsd = 0;
  let globalCostRows = 0;
  const costByDay = new Map();
  const sessionsByDay = new Map();
  /** @type {Map<string, Map<string, number>>} employeeKey -> (day -> usd) */
  const costByAgentDay = new Map();
  for (const r of allRows) {
    const tMs = Number(r.endedAt) || Number(r.updatedAt);
    if (!Number.isFinite(tMs)) continue;
    const dk = dayKeyFromMs(tMs);
    if (!dk) continue;
    sessionsByDay.set(dk, (sessionsByDay.get(dk) ?? 0) + 1);
    const cUsd = sessionEstimatedCostUsd(r);
    if (cUsd == null || cUsd <= 0) continue;
    globalCostUsd += cUsd;
    globalCostRows += 1;
    costByDay.set(dk, (costByDay.get(dk) ?? 0) + cUsd);
    const agentKey = employeeKeyFromRow(r, "未命名");
    if (!costByAgentDay.has(agentKey)) costByAgentDay.set(agentKey, new Map());
    const am = costByAgentDay.get(agentKey);
    am.set(dk, (am.get(dk) ?? 0) + cUsd);
  }
  const hasCostData = globalCostRows > 0;

  const agents = [];
  for (const a of agentMap.values()) {
    const channels = [...a.channels.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count);
    const models = [...a.models.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count);
    const samples = [...a.durationSamples].sort((x, y) => x - y);
    let p95Ms = null;
    if (samples.length > 0) {
      const idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
      p95Ms = samples[idx];
    }
    const successRate = a.sessionCount > 0 ? a.successCount / a.sessionCount : null;
    const avgSkillCount = a.sessionCount > 0 ? a.skillCountSum / a.sessionCount : null;
    const usdPerEmployeePerDay =
      hasCostData && a.totalCostUsd > 0 && days > 0 ? a.totalCostUsd / days : null;
    const dims = {
      capability: dimCapability(avgSkillCount),
      quality: dimQuality(successRate),
      cost: dimCost(usdPerEmployeePerDay, hasCostData),
      efficacy: dimEfficacy(p95Ms),
      security: dimSecurity(a.riskHighTotal, a.riskMediumTotal),
    };
    const modelProvidersRanked = [...a.modelProviders.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count);
    const dominantModelName = models[0]?.name ?? null;
    let dominantModelProvider = modelProvidersRanked[0]?.name ?? null;
    if (!dominantModelProvider && dominantModelName) {
      dominantModelProvider = parseProviderFromModelId(dominantModelName);
    }

    const tagsSorted = [...a.labels].sort((x, y) => x.localeCompare(y, "zh-CN"));
    const tagsDisplay = tagsSorted.length > 0 ? tagsSorted.join("、") : null;

    const successCount = a.successCount;
    const costPerSuccessfulUsd =
      hasCostData && successCount > 0 && a.totalCostUsd > 0
        ? Math.round((a.totalCostUsd / successCount) * 1e6) / 1e6
        : null;

    const compositeScore = compositeScoreFromDims(dims);
    const securityRiskScore = unifiedRiskScore(compositeScore, a.riskHighTotal, a.riskMediumTotal, a.riskLowTotal);
    const overallHealth = healthFromCompositeAndRisk(compositeScore, securityRiskScore);

    agents.push({
      employeeKey: a.employeeKey,
      sessionKey: a.sessionKey,
      sessionId: a.sessionId,
      agentName: a.agentName,
      displayLabel: tagsSorted[0] ?? a.agentName ?? a.employeeKey,
      sessionCount: a.sessionCount,
      totalTokens: Math.round(a.totalTokens),
      abortedCount: a.abortedCount,
      successCount,
      successRate,
      lastUpdatedAt: a.lastUpdatedAt || null,
      channels,
      models,
      modelProviders: modelProvidersRanked,
      dominantModelProvider,
      dominantModelName,
      tagsDisplay,
      totalToolUse: a.totalToolUse,
      toolErrorCount: a.toolErrorCount,
      execCommandErrorCount: a.execCommandErrorCount,
      riskHighTotal: a.riskHighTotal,
      riskMediumTotal: a.riskMediumTotal,
      totalCostUsd: Math.round(a.totalCostUsd * 1e6) / 1e6,
      costPerSuccessfulUsd,
      securityRiskScore,
      avgSkillCount: avgSkillCount != null ? Math.round(avgSkillCount * 10) / 10 : null,
      p95DurationMs: p95Ms,
      chatTypeTop: [...a.chatTypes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      healthOverall: overallHealth,
      compositeScore,
      dimensions: dims,
    });
  }

  agents.sort((x, y) => y.sessionCount - x.sessionCount);

  const channelGlobal = new Map();
  for (const r of allRows) {
    const ch = r.lastChannel || r.channel;
    if (!ch || !String(ch).trim()) continue;
    const k = String(ch);
    channelGlobal.set(k, (channelGlobal.get(k) ?? 0) + 1);
  }
  const channels = [...channelGlobal.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const totalChSessions = channels.reduce((s, c) => s + c.count, 0);

  let greenE = 0;
  let yellowE = 0;
  let redE = 0;
  let healthScoreSum = 0;
  for (const ag of agents) {
    if (ag.healthOverall === "green") greenE += 1;
    else if (ag.healthOverall === "yellow") yellowE += 1;
    else redE += 1;
    healthScoreSum += healthTierScore(ag.healthOverall);
  }
  const scoredEmployees = agents.length;
  const healthScorePct =
    scoredEmployees > 0 ? Math.round((healthScoreSum / scoredEmployees) * 10) / 10 : null;

  const topChannel = channels[0];
  const topChannelPct =
    topChannel && totalChSessions > 0 ? Math.round((topChannel.count / totalChSessions) * 1000) / 1000 : null;

  const totalSessions = allRows.length;
  const successSessions = allRows.filter((r) => !r.abortedLastRun).length;
  const overallSuccessRate = totalSessions > 0 ? successSessions / totalSessions : null;
  const allDurations = allRows.map((r) => Number(r.durationMs)).filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  let overallP95Ms = null;
  if (allDurations.length > 0) {
    const idx = Math.min(allDurations.length - 1, Math.floor(allDurations.length * 0.95));
    overallP95Ms = allDurations[idx];
  }

  const distinctAgents = agents.length;
  const onlineEmployeeCount15m = agents.filter((a) => {
    const u = Number(a.lastUpdatedAt) || 0;
    return u > 0 && Date.now() - u <= 15 * 60 * 1000;
  }).length;
  const avgDailyCostUsd =
    hasCostData && distinctAgents > 0 && days > 0 ? globalCostUsd / distinctAgents / days : null;
  // 与画像页风险等级规则保持一致：风险评分 >= 70 记为高风险（红线）
  const highRiskEmployeeCount = agents.filter((a) => {
    const score = Number(a.securityRiskScore);
    return Number.isFinite(score) && score >= 70;
  }).length;

  const avgSkillGlobal =
    totalSessions > 0
      ? agents.reduce((s, a) => s + (a.avgSkillCount ?? 0) * a.sessionCount, 0) / totalSessions
      : null;
  const avgToolGlobal =
    totalSessions > 0 ? agents.reduce((s, a) => s + a.totalToolUse, 0) / totalSessions : null;

  const costTrendDaily = [...costByDay.entries()]
    .map(([day, usd]) => ({ day, usd: Math.round(usd * 1e4) / 1e4 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const sessionTrendDaily = [...sessionsByDay.entries()]
    .map(([day, sessions]) => ({ day, sessions }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const allCostDaysSet = new Set();
  for (const d of costByDay.keys()) allCostDaysSet.add(d);
  for (const m of costByAgentDay.values()) {
    for (const d of m.keys()) allCostDaysSet.add(d);
  }
  const sortedAllCostDays = [...allCostDaysSet].sort((a, b) => a.localeCompare(b));

  const agentsWithCost = agents
    .filter((a) => (a.totalCostUsd ?? 0) > 0)
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0));

  const costTrendByEmployee =
    hasCostData && sortedAllCostDays.length > 0 && agentsWithCost.length > 0
      ? {
          days: sortedAllCostDays,
          series: agentsWithCost.map((ag) => ({
            sessionKey: ag.employeeKey,
            agentName: ag.agentName,
            displayLabel: ag.displayLabel,
            values: sortedAllCostDays.map((day) =>
              Math.round((costByAgentDay.get(ag.employeeKey)?.get(day) ?? 0) * 1e4) / 1e4,
            ),
          })),
        }
      : null;

  const secGreen = agents.filter((a) => a.dimensions.security === "green").length;
  const secYellow = agents.filter((a) => a.dimensions.security === "yellow").length;
  const secRed = agents.filter((a) => a.dimensions.security === "red").length;

  const abortedRate = totalSessions > 0 ? rows.filter((r) => r.abortedLastRun).length / totalSessions : null;

  const topRisk = [...agents]
    .sort((a, b) => b.riskHighTotal - a.riskHighTotal || b.riskMediumTotal - a.riskMediumTotal)
    .slice(0, 10)
    .map((a) => ({
      sessionKey: a.sessionKey ?? a.employeeKey ?? null,
      agentName: a.agentName,
      displayLabel: a.displayLabel,
      riskHighTotal: a.riskHighTotal,
      riskMediumTotal: a.riskMediumTotal,
      healthOverall: a.healthOverall,
    }));

  const topEfficiency = [...agents]
    .map((a) => {
      const costPart = a.totalCostUsd > 0 ? a.totalCostUsd : a.totalTokens / 1e6 + 0.01;
      const score = ((a.successRate ?? 0) * a.sessionCount) / costPart;
      return { ...a, efficiencyScore: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
    .slice(0, 10)
    .map((a) => ({
      sessionKey: a.sessionKey ?? a.employeeKey ?? null,
      agentName: a.agentName,
      displayLabel: a.displayLabel,
      efficiencyScore: a.efficiencyScore,
      successRate: a.successRate,
      sessionCount: a.sessionCount,
      totalTokens: a.totalTokens,
    }));

  const o1_summary = {
    healthScorePct,
    healthBuckets: { green: greenE, yellow: yellowE, red: redE },
    channelCount: channels.length,
    topChannel: topChannel ? { name: topChannel.name, pct: topChannelPct, count: topChannel.count } : null,
    totalCostUsd: hasCostData ? Math.round(globalCostUsd * 1e4) / 1e4 : null,
    avgDailyCostUsdPerEmployee: avgDailyCostUsd != null ? Math.round(avgDailyCostUsd * 1e4) / 1e4 : null,
    costTrendDaily,
    costTrendByEmployee,
    hasCostData,
    overallSuccessRate,
    overallP95DurationMs: overallP95Ms,
    highRiskEmployeeCount,
    totalSessions,
    totalTokens: Math.round(allRows.reduce((s, r) => s + (Number.isFinite(Number(r.totalTokens)) ? Number(r.totalTokens) : 0), 0)),
    employeeTotal: distinctAgents,
    onlineEmployeeCount15m,
    sessionTrendDaily,
  };

  const o2_dimensions = {
    capability: {
      avgSkillCount: avgSkillGlobal != null ? Math.round(avgSkillGlobal * 10) / 10 : null,
      avgToolUsePerSession: avgToolGlobal != null ? Math.round(avgToolGlobal * 10) / 10 : null,
    },
    quality: {
      successRate: overallSuccessRate,
      abortedRate,
    },
    cost: {
      totalUsd: o1_summary.totalCostUsd,
      avgPerEmployeePerDayUsd: o1_summary.avgDailyCostUsdPerEmployee,
    },
    efficacy: {
      totalSessions,
      successSessions,
      p95Ms: overallP95Ms,
    },
    security: {
      greenAgents: secGreen,
      yellowAgents: secYellow,
      redAgents: secRed,
    },
  };

  const o3_employees = sessionRowsList;

  return {
    windowStartMs,
    days: ctx.days,
    windowHours: ctx.hasHours ? Math.round((Date.now() - windowStartMs) / 3600000) : null,
    o1_summary,
    o2_dimensions,
    o3_employees,
    /** 按 employeeKey(session_key/session_id) 聚合的员工行 */
    agentsAggregated: agents,
    topN: {
      highRisk: topRisk,
      highEfficiency: topEfficiency,
    },
    channels,
    agents: sessionRowsList,
    distinctAgents,
    totalSessions,
    totalTokens: o1_summary.totalTokens,
    abortedSessions: allRows.filter((r) => r.abortedLastRun).length,
  };
}
