/**
 * 数字员工单员工画像：在时间窗内按 agent 过滤会话行，产出设计文档 §4.4 所需结构。
 * 版本 1.0.1
 */
import { lookupModelMeta } from "./digital-employee-openclaw-hints.mjs";

/** @param {unknown} v */
function isObj(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** @param {Record<string, unknown>} r */
function pickRowNum(r, keys) {
  for (const k of keys) {
    const v = r[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
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

/** @param {Record<string, unknown>} r */
function collectSkillEntries(r) {
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
  if (!Array.isArray(rs)) return [];
  /** @type {{name: string}[]} */
  const out = [];
  for (const x of rs) {
    if (typeof x === "string" && x.trim()) {
      out.push({ name: x.trim() });
      continue;
    }
    if (x && typeof x === "object" && x.name != null) {
      out.push({
        name: String(/** @type {Record<string, unknown>} */ (x).name).trim(),
      });
    }
  }
  return out.filter((s) => Boolean(s.name));
}

/** @param {Record<string, unknown>} r */
function collectToolNames(r) {
  const spr = r.systemPromptReport;
  if (!spr || typeof spr !== "object") return [];
  const o = /** @type {Record<string, unknown>} */ (spr);
  const t = o.tools;
  if (Array.isArray(t)) {
    return t
      .map((x) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object" && x.name != null) return String(x.name).trim();
        return "";
      })
      .filter(Boolean);
  }
  if (isObj(t)) {
    const to = /** @type {Record<string, unknown>} */ (t);
    if (Array.isArray(to.entries)) {
      return to.entries
        .map((x) => (x && typeof x === "object" && x.name != null ? String(x.name).trim() : ""))
        .filter(Boolean);
    }
    return Object.keys(to).filter((k) => !["entries", "listChars", "schemaChars"].includes(k));
  }
  return [];
}

/** @param {string} tier */
function tierScore(tier) {
  if (tier === "green") return 90;
  if (tier === "yellow") return 60;
  if (tier === "red") return 30;
  return 50;
}

function clamp01(x) {
  if (!Number.isFinite(Number(x))) return 0;
  const n = Number(x);
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function scoreToTier(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "unknown";
  if (s >= 80) return "green";
  if (s >= 55) return "yellow";
  return "red";
}

function avgScore(parts) {
  const arr = parts.filter((v) => Number.isFinite(Number(v))).map((v) => Number(v));
  if (arr.length === 0) return 50;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

function parseNumFromAny(v) {
  if (v == null) return null;
  if (Number.isFinite(Number(v))) return Number(v);
  const m = String(v).match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function scoreByThresholdAsc(value, good, warn) {
  const n = parseNumFromAny(value);
  if (n == null) return 40;
  if (n >= good) return 95;
  if (n >= warn) return 70;
  return 45;
}

function scoreByThresholdDesc(value, good, warn) {
  const n = parseNumFromAny(value);
  if (n == null) return 40;
  if (n <= good) return 95;
  if (n <= warn) return 70;
  return 45;
}

function policyStrictScore(v, strictKeywords = []) {
  const s = String(v ?? "").toLowerCase();
  if (!s || s === "—") return 45;
  if (strictKeywords.some((k) => s.includes(k))) return 92;
  if (s.includes("true") || s.includes("on") || s.includes("enabled")) return 85;
  if (s.includes("false") || s.includes("off") || s.includes("disabled") || s.includes("open")) return 35;
  return 65;
}

/**
 * 事件风险：按会话归一化并平滑，避免仅因累计次数导致评分过高。
 * @param {number} riskHigh
 * @param {number} riskMedium
 * @param {number} riskLow
 * @param {number} sessionCount
 */
function normalizedEventRiskScore(riskHigh, riskMedium, riskLow, sessionCount) {
  const rh = Number(riskHigh) || 0;
  const rm = Number(riskMedium) || 0;
  const rl = Number(riskLow) || 0;
  const n = Math.max(1, Number(sessionCount) || 1);
  const perSessionSeverity = (rh * 10 + rm * 3 + rl * 0.5) / n;
  return Math.round(Math.min(100, Math.sqrt(Math.max(0, perSessionSeverity)) * 18) * 10) / 10;
}

/**
 * 事件时间线范围：与左侧选中的「数字员工」严格一致（优先 agent_name，兼容 session_key/session_id）。
 * @param {Record<string, unknown>} r mapAgentSessionRows 行
 * @param {string} scopeRaw 列表行主键：与前端 rowSessionKey 一致
 */
export function sessionRowMatchesDigitalEmployeeScope(r, scopeRaw) {
  const scope = String(scopeRaw ?? "").trim();
  if (!scope) return true;

  const rowAgentName = r.agentName != null && String(r.agentName).trim() ? String(r.agentName).trim() : "";
  const rowSk = r.sessionKey != null && String(r.sessionKey).trim() ? String(r.sessionKey).trim() : "";
  const rowSid =
    (r.session_id != null && String(r.session_id).trim()) ||
    (r.sessionId != null && String(r.sessionId).trim()) ||
    "";

  if (rowAgentName && rowAgentName === scope) return true;
  if (rowSid && rowSid === scope) return true;
  if (rowSk && rowSk === scope) return true;
  return false;
}

/**
 * @param {object} agent  o3_employees 单条
 * @param {object[]} sessionRows  已过滤到该 agent
 * @param {{ billingDays: number, hasCostData: boolean, openclawHints: object, sessionScope?: string|null, toolNamesFromLogs?: string[], avgToolDurationMs?: number|null, toolDurationSampleCount?: number, qualityMetrics?: {abortedSessionCountWindow?: number, toolErrorCountWindow?: number, execCommandErrorCount?: number}, qualityDetails?: {abortedRows?: object[], toolErrorRows?: object[], execErrorRows?: object[]} }} ctx
 */
export function buildEmployeeProfileDetail(agent, sessionRows, ctx) {
  const { billingDays, hasCostData, openclawHints: hints } = ctx;
  const sessionScope =
    ctx.sessionScope != null && String(ctx.sessionScope).trim() ? String(ctx.sessionScope).trim() : "";
  const rowsForTimeline = sessionScope
    ? sessionRows.filter((r) => sessionRowMatchesDigitalEmployeeScope(r, sessionScope))
    : sessionRows;
  const dim = agent.dimensions || {};

  const skillFreq = new Map();
  const toolFreq = new Map();
  let inputTokSum = 0;
  let outputTokSum = 0;
  let inTokN = 0;
  let outTokN = 0;

  const byDay = new Map();
  for (const r of sessionRows) {
    for (const s of collectSkillEntries(r)) {
      skillFreq.set(s.name, (skillFreq.get(s.name) ?? 0) + 1);
    }
    for (const t of collectToolNames(r)) {
      toolFreq.set(t, (toolFreq.get(t) ?? 0) + 1);
    }
    const it = pickRowNum(r, ["inputTokens", "input_tokens"]);
    const ot = pickRowNum(r, ["outputTokens", "output_tokens"]);
    if (it != null) {
      inputTokSum += it;
      inTokN += 1;
    }
    if (ot != null) {
      outputTokSum += ot;
      outTokN += 1;
    }

    const tMs = Number(r.endedAt) || Number(r.updatedAt);
    if (!Number.isFinite(tMs)) continue;
    const dk = dayKeyFromMs(tMs);
    if (!dk) continue;
    if (!byDay.has(dk)) {
      byDay.set(dk, {
        day: dk,
        sessions: 0,
        aborted: 0,
        success: 0,
        costUsd: 0,
        durationSum: 0,
        durationN: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolUseSum: 0,
        toolErrSum: 0,
        skillMentions: 0,
        sessionsWithSkill: 0,
        unknownChannelSessions: 0,
        userByKey: new Map(),
        channelByKey: new Map(),
      });
    }
    const b = byDay.get(dk);
    b.sessions += 1;
    if (r.abortedLastRun) b.aborted += 1;
    else b.success += 1;
    const c = sessionEstimatedCostUsd(r);
    if (c != null && c > 0) b.costUsd += c;
    const dm = Number(r.durationMs);
    if (Number.isFinite(dm) && dm >= 0) {
      b.durationSum += dm;
      b.durationN += 1;
    }
    if (it != null) b.inputTokens += it;
    if (ot != null) b.outputTokens += ot;
    const tUse = pickRowNum(r, ["toolUseCount", "tool_use_count"]);
    if (tUse != null && tUse >= 0) b.toolUseSum += tUse;
    const tErr = pickRowNum(r, ["toolErrorCount", "tool_error_count"]);
    if (tErr != null && tErr >= 0) b.toolErrSum += tErr;
    const skEntries = collectSkillEntries(r);
    if (skEntries.length > 0) {
      b.sessionsWithSkill += 1;
      b.skillMentions += skEntries.length;
    }
    const chForDay = r.lastChannel ?? r.channel;
    const chDayLabel = chForDay != null && String(chForDay).trim() ? String(chForDay).trim() : "";
    if (!chDayLabel) b.unknownChannelSessions += 1;
    const userLabelDay =
      r.label != null && String(r.label).trim()
        ? String(r.label).trim()
        : r.originLabel != null && String(r.originLabel).trim()
          ? String(r.originLabel).trim()
          : "";
    const uKeyDay = userLabelDay || "__unknown__";
    b.userByKey.set(uKeyDay, (b.userByKey.get(uKeyDay) ?? 0) + 1);
    const cKeyDay = chDayLabel || "__unknown__";
    b.channelByKey.set(cKeyDay, (b.channelByKey.get(cKeyDay) ?? 0) + 1);
  }

  const trendDaily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const abortedTrend = trendDaily.map((d) => ({
    day: d.day,
    aborted: d.aborted,
    success: d.success,
    rate: d.sessions > 0 ? Math.round((d.aborted / d.sessions) * 1000) / 10 : 0,
  }));
  const efficacyTrend = trendDaily.map((d) => ({
    day: d.day,
    sessions: d.sessions,
    avgDurationMs: d.durationN > 0 ? Math.round(d.durationSum / d.durationN) : null,
  }));
  const costTrend = trendDaily.map((d) => ({
    day: d.day,
    usd: Math.round(d.costUsd * 1e4) / 1e4,
  }));
  const tokenTrendDaily = trendDaily.map((d) => ({
    day: d.day,
    input: Math.round(Number(d.inputTokens) || 0),
    output: Math.round(Number(d.outputTokens) || 0),
  }));
  const toolTrendDaily = trendDaily.map((d) => ({
    day: d.day,
    toolCalls: Math.round(Number(d.toolUseSum) || 0),
    toolErrors: Math.round(Number(d.toolErrSum) || 0),
  }));
  const skillTrendDaily = trendDaily.map((d) => ({
    day: d.day,
    skillMentions: Math.round(Number(d.skillMentions) || 0),
    sessionsWithSkill: Math.round(Number(d.sessionsWithSkill) || 0),
  }));
  const channelTrendDaily = trendDaily.map((d) => {
    const sess = Math.round(Number(d.sessions) || 0);
    const unk = Math.round(Number(d.unknownChannelSessions) || 0);
    return {
      day: d.day,
      knownChannels: Math.max(0, sess - unk),
      unknownChannels: unk,
    };
  });

  const uniqueSkills = [...skillFreq.keys()].sort((a, b) => (skillFreq.get(b) ?? 0) - (skillFreq.get(a) ?? 0));
  const toolsFromLogs = Array.isArray(ctx.toolNamesFromLogs) ? ctx.toolNamesFromLogs.filter(Boolean) : [];
  for (const t of toolsFromLogs) toolFreq.set(t, Math.max(toolFreq.get(t) ?? 0, 1));
  const uniqueTools = [...toolFreq.keys()].sort((a, b) => (toolFreq.get(b) ?? 0) - (toolFreq.get(a) ?? 0));
  const skillPie = uniqueSkills.slice(0, 12).map((name) => ({
    name,
    value: skillFreq.get(name) ?? 0,
  }));
  const toolBar = uniqueTools.slice(0, 16).map((name) => ({
    name: name.length > 28 ? `${name.slice(0, 28)}…` : name,
    count: toolFreq.get(name) ?? 0,
  }));

  const topModelName = agent.models?.[0]?.name ?? null;
  const modelMeta =
    lookupModelMeta(hints.modelCatalog, topModelName) ||
    lookupModelMeta(hints.modelCatalog, topModelName?.split("/").pop());

  const workspaceDir =
    sessionRows.map((r) => (r.workspaceDir != null ? String(r.workspaceDir) : null)).find(Boolean) ||
    hints.workspaceDefault ||
    null;

  const lastMs = Number(agent.lastUpdatedAt) || 0;
  const now = Date.now();
  const minutesSince = lastMs > 0 ? Math.max(0, Math.round((now - lastMs) / 60000)) : null;
  const online = minutesSince != null && minutesSince <= 15;

  const topChannel = agent.channels?.[0]?.name ?? "—";
  const chatType = agent.chatTypeTop ?? "—";

  const dailyCostUsd =
    hasCostData && agent.totalCostUsd > 0 && billingDays > 0 ? agent.totalCostUsd / billingDays : null;

  const qm = ctx.qualityMetrics || {};

  const costPart = agent.totalCostUsd > 0 ? agent.totalCostUsd : agent.totalTokens / 1e6 + 0.01;
  const efficiencyPerCost =
    agent.sessionCount > 0 ? Math.round((((agent.successRate ?? 0) * agent.sessionCount) / costPart) * 100) / 100 : null;

  const dbInputTokens = Number(ctx?.costFromDb?.inputTokens) || 0;
  const dbOutputTokens = Number(ctx?.costFromDb?.outputTokens) || 0;
  const inputTokensFinal = dbInputTokens > 0 ? Math.round(dbInputTokens) : inTokN > 0 ? Math.round(inputTokSum) : 0;
  const outputTokensFinal = dbOutputTokens > 0 ? Math.round(dbOutputTokens) : outTokN > 0 ? Math.round(outputTokSum) : 0;
  const totalTokensFinal = inputTokensFinal + outputTokensFinal;
  const unitCostInputFinal =
    modelMeta?.unitCostInput != null && Number.isFinite(Number(modelMeta.unitCostInput))
      ? Number(modelMeta.unitCostInput)
      : null;
  const unitCostOutputFinal =
    modelMeta?.unitCostOutput != null && Number.isFinite(Number(modelMeta.unitCostOutput))
      ? Number(modelMeta.unitCostOutput)
      : null;
  const estimatedCostByFormula =
    unitCostInputFinal != null && unitCostOutputFinal != null
      ? (inputTokensFinal / 1_000_000) * unitCostInputFinal + (outputTokensFinal / 1_000_000) * unitCostOutputFinal
      : null;

  const tokenRatio =
    inputTokensFinal > 0 && outputTokensFinal >= 0
      ? Math.round((outputTokensFinal / Math.max(1, inputTokensFinal)) * 100) / 100
      : null;

  /** @type {Map<string, number>} */
  const modelTokenMap = new Map();
  /** @type {Map<string, number>} */
  const userTokenMap = new Map();
  /** @type {Map<string, number>} */
  const channelTokenMap = new Map();
  /** @type {{ sessionKey: string, sessionId: string | null, totalTokens: number, updatedAt: number | null }[]} */
  const sessionTokenList = [];
  for (const r of sessionRows) {
    const rit = pickRowNum(r, ["inputTokens", "input_tokens"]);
    const rot = pickRowNum(r, ["outputTokens", "output_tokens"]);
    const rowIn = rit != null ? rit : 0;
    const rowOut = rot != null ? rot : 0;
    const rowTot = rowIn + rowOut;
    const mn =
      r.model != null && String(r.model).trim()
        ? String(r.model).trim()
        : "__unknown__";
    if (rowTot > 0) {
      modelTokenMap.set(mn, (modelTokenMap.get(mn) ?? 0) + rowTot);

      const userLabel =
        r.label != null && String(r.label).trim()
          ? String(r.label).trim()
          : r.originLabel != null && String(r.originLabel).trim()
            ? String(r.originLabel).trim()
            : "";
      const userKey = userLabel || "__unknown__";
      userTokenMap.set(userKey, (userTokenMap.get(userKey) ?? 0) + rowTot);

      const chRaw = r.lastChannel ?? r.channel;
      const channelLabel =
        chRaw != null && String(chRaw).trim() ? String(chRaw).trim() : "";
      const channelKey = channelLabel || "__unknown__";
      channelTokenMap.set(channelKey, (channelTokenMap.get(channelKey) ?? 0) + rowTot);
    }
    const sk = r.sessionKey != null && String(r.sessionKey).trim() ? String(r.sessionKey).trim() : "";
    const sidRaw = r.session_id ?? r.sessionId;
    const sid = sidRaw != null && String(sidRaw).trim() ? String(sidRaw).trim() : "";
    sessionTokenList.push({
      sessionKey: sk,
      sessionId: sid || null,
      totalTokens: Math.round(rowTot),
      updatedAt: Number(r.updatedAt) || null,
    });
  }
  const sessionTokenTop10 = sessionTokenList
    .filter((x) => x.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);

  const COST_DIM_TOP = 10;
  const userTokenTop10 = [...userTokenMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, COST_DIM_TOP)
    .map(([name, value]) => ({ name, value: Math.round(value) }));
  const channelTokenTop10 = [...channelTokenMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, COST_DIM_TOP)
    .map(([name, value]) => ({ name, value: Math.round(value) }));

  const modelEntries = [...modelTokenMap.entries()].sort((a, b) => b[1] - a[1]);
  const MODEL_PIE_MAX = 8;
  /** @type {{ name: string, value: number }[]} */
  let modelTokenPie = [];
  if (modelEntries.length > 0) {
    const head = modelEntries.slice(0, MODEL_PIE_MAX);
    const tail = modelEntries.slice(MODEL_PIE_MAX);
    const tailSum = tail.reduce((s, [, v]) => s + v, 0);
    modelTokenPie = head.map(([name, value]) => ({ name, value: Math.round(value) }));
    if (tailSum > 0) modelTokenPie.push({ name: "__other__", value: Math.round(tailSum) });
  }

  const dailyTokensAvg =
    totalTokensFinal > 0 && billingDays > 0 ? Math.round(totalTokensFinal / billingDays) : null;
  /** 每次会话的 Token 消耗（input+output）求算术平均：Σ(单会话Token) ÷ 会话条数 */
  const perSessionTotals = sessionTokenList.map((x) => x.totalTokens);
  const sessionCountForAvg = sessionRows.length;
  const sumTokensPerSessionLoop = perSessionTotals.reduce((s, t) => s + t, 0);
  const avgTokensPerSession =
    sessionCountForAvg > 0 ? Math.round(sumTokensPerSessionLoop / sessionCountForAvg) : null;
  const maxTokensPerSession =
    perSessionTotals.length > 0 ? Math.round(Math.max(...perSessionTotals)) : null;
  const inputOutputPie =
    totalTokensFinal > 0
      ? [
          { name: "input", value: inputTokensFinal },
          { name: "output", value: outputTokensFinal },
        ]
      : [];

  const avgRuntimeMs =
    sessionRows.length > 0
      ? Math.round(
          sessionRows.reduce((s, r) => s + (Number.isFinite(Number(r.durationMs)) ? Number(r.durationMs) : 0), 0) /
            sessionRows.length,
        )
      : null;

  let successSessionCount = 0;
  let failedSessionCount = 0;
  const userSessionMap = new Map();
  const channelSessionMap = new Map();
  for (const r of sessionRows) {
    if (r.abortedLastRun) failedSessionCount += 1;
    else successSessionCount += 1;
    const userLabel =
      r.label != null && String(r.label).trim()
        ? String(r.label).trim()
        : r.originLabel != null && String(r.originLabel).trim()
          ? String(r.originLabel).trim()
          : "";
    const uKey = userLabel || "__unknown__";
    userSessionMap.set(uKey, (userSessionMap.get(uKey) ?? 0) + 1);
    const chRaw = r.lastChannel ?? r.channel;
    const chLabel = chRaw != null && String(chRaw).trim() ? String(chRaw).trim() : "";
    const cKey = chLabel || "__unknown__";
    channelSessionMap.set(cKey, (channelSessionMap.get(cKey) ?? 0) + 1);
  }

  const sessionExecTrend = trendDaily.map((d) => ({
    day: d.day,
    sessions: d.sessions,
    avgDurationMs: d.durationN > 0 ? Math.round(d.durationSum / d.durationN) : null,
  }));

  const SESSION_EXEC_PIE_MAX = 8;
  const sessionStatusPie =
    sessionRows.length > 0
      ? [
          { name: "success", value: successSessionCount },
          { name: "failed", value: failedSessionCount },
        ].filter((x) => x.value > 0)
      : [];

  const userSessionEntries = [...userSessionMap.entries()].sort((a, b) => b[1] - a[1]);
  const USER_SESSION_TREND_STACK = 8;
  const headUserEntries = userSessionEntries.slice(0, USER_SESSION_TREND_STACK);
  const headUserKeySet = new Set(headUserEntries.map(([k]) => k));
  const userSessionTrendDaily = trendDaily.map((d) => {
    const bDay = byDay.get(d.day);
    const um = bDay?.userByKey || new Map();
    /** @type {Record<string, unknown>} */
    const row = { day: d.day };
    headUserEntries.forEach(([k], i) => {
      row[`u${i}`] = um.get(k) ?? 0;
    });
    let uOther = 0;
    for (const [k, v] of um) {
      if (!headUserKeySet.has(k)) uOther += v;
    }
    row.uOther = uOther;
    return row;
  });
  /** @type {{ key: string; name: string }[]} */
  const userSessionTrendSeries = [
    ...headUserEntries.map(([name], i) => ({ key: `u${i}`, name })),
    { key: "uOther", name: "__other__" },
  ];
  /** @type {{ name: string; value: number }[]} */
  let userSessionPie = [];
  if (userSessionEntries.length > 0) {
    const head = userSessionEntries.slice(0, SESSION_EXEC_PIE_MAX);
    const tail = userSessionEntries.slice(SESSION_EXEC_PIE_MAX);
    const tailSum = tail.reduce((s, [, v]) => s + v, 0);
    userSessionPie = head.map(([name, value]) => ({ name, value }));
    if (tailSum > 0) userSessionPie.push({ name: "__other__", value: tailSum });
  }

  const channelSessionEntries = [...channelSessionMap.entries()].sort((a, b) => b[1] - a[1]);
  /** @type {{ name: string; value: number }[]} */
  let channelSessionPie = [];
  if (channelSessionEntries.length > 0) {
    const head = channelSessionEntries.slice(0, SESSION_EXEC_PIE_MAX);
    const tail = channelSessionEntries.slice(SESSION_EXEC_PIE_MAX);
    const tailSum = tail.reduce((s, [, v]) => s + v, 0);
    channelSessionPie = head.map(([name, value]) => ({ name, value }));
    if (tailSum > 0) channelSessionPie.push({ name: "__other__", value: tailSum });
  }

  const CHANNEL_TREND_STACK = 8;
  const headChannelEntries = channelSessionEntries.slice(0, CHANNEL_TREND_STACK);
  const headChannelKeySet = new Set(headChannelEntries.map(([k]) => k));
  const channelSessionTrendDaily = trendDaily.map((d) => {
    const bDay = byDay.get(d.day);
    const cm = bDay?.channelByKey || new Map();
    /** @type {Record<string, unknown>} */
    const row = { day: d.day };
    headChannelEntries.forEach(([k], i) => {
      row[`c${i}`] = cm.get(k) ?? 0;
    });
    let cOther = 0;
    for (const [k, v] of cm) {
      if (!headChannelKeySet.has(k)) cOther += v;
    }
    row.cOther = cOther;
    return row;
  });
  /** @type {{ key: string; name: string }[]} */
  const channelSessionTrendSeries = [
    ...headChannelEntries.map(([name], i) => ({ key: `c${i}`, name })),
    { key: "cOther", name: "__other__" },
  ];

  const capabilityParts = [
    modelMeta?.provider ? 95 : 45,
    scoreByThresholdAsc(modelMeta?.contextWindow, 128000, 32000),
    scoreByThresholdAsc(modelMeta?.maxTokens, 8192, 4096),
    modelMeta?.reasoning == null ? 50 : modelMeta.reasoning ? 95 : 45,
    scoreByThresholdAsc(uniqueSkills.length, 10, 3),
    scoreByThresholdAsc(uniqueTools.length, 12, 4),
    scoreByThresholdAsc(hints.subagentsMaxConcurrent, 8, 2),
    (() => {
      const s = String(hints.sandboxMode ?? "").toLowerCase();
      if (!s) return 50;
      if (s.includes("workspace") || s.includes("restricted")) return 92;
      if (s.includes("danger")) return 35;
      return 70;
    })(),
  ];
  const capabilityScore = avgScore(capabilityParts);

  const successRateNum = agent.successRate != null ? Number(agent.successRate) : null;
  const abortedCnt = Number.isFinite(Number(qm.abortedSessionCountWindow))
    ? Number(qm.abortedSessionCountWindow)
    : Number(agent.abortedCount) || 0;
  const toolErrCnt = Number.isFinite(Number(qm.toolErrorCountWindow))
    ? Number(qm.toolErrorCountWindow)
    : Number(agent.toolErrorCount) || 0;
  const toolUseCnt = Number.isFinite(Number(agent.totalToolUse)) ? Number(agent.totalToolUse) : 0;
  const toolErrorRatePct =
    toolUseCnt > 0 ? Math.round((Math.max(0, toolErrCnt) / Math.max(1, toolUseCnt)) * 1000) / 10 : null;
  const execErrCnt = Number.isFinite(Number(qm.execCommandErrorCount))
    ? Number(qm.execCommandErrorCount)
    : Number(agent.execCommandErrorCount) || 0;
  const sessionN = Math.max(1, Number(agent.sessionCount) || 1);
  const qualityParts = [
    successRateNum == null ? 50 : Math.round(clamp01(successRateNum) * 100),
    scoreByThresholdDesc(abortedCnt / sessionN, 0.03, 0.12),
    scoreByThresholdDesc(toolUseCnt > 0 ? toolErrCnt / toolUseCnt : null, 0.05, 0.2),
    scoreByThresholdDesc(execErrCnt / sessionN, 0.05, 0.2),
  ];
  const qualityScore = avgScore(qualityParts);

  const avgToolDuration = Number.isFinite(Number(ctx.avgToolDurationMs)) ? Number(ctx.avgToolDurationMs) : null;
  const efficacyParts = [
    scoreByThresholdDesc(agent.p95DurationMs, 30000, 60000),
    scoreByThresholdDesc(avgRuntimeMs, 15000, 45000),
    scoreByThresholdDesc(avgToolDuration, 2000, 8000),
    scoreByThresholdAsc(efficiencyPerCost, 12, 4),
  ];
  const efficacyScore = avgScore(efficacyParts);

  const costParts = [
    scoreByThresholdDesc(dailyCostUsd, 10, 50),
    scoreByThresholdDesc(agent.totalCostUsd, 100, 400),
    scoreByThresholdDesc(agent.totalTokens, 500000, 2000000),
    (() => {
      const tr = Number(tokenRatio);
      if (!Number.isFinite(tr)) return 50;
      if (tr >= 0.8 && tr <= 1.6) return 90;
      if (tr >= 0.5 && tr <= 2.2) return 70;
      return 45;
    })(),
  ];
  const costScore = avgScore(costParts);

  const riskEventsScore = normalizedEventRiskScore(
    Number(agent.riskHighTotal) || 0,
    Number(agent.riskMediumTotal) || 0,
    Number(agent.riskLowTotal) || 0,
    Number(agent.sessionCount) || 1,
  );

  const securityPolicyRisk = avgScore([
    100 - policyStrictScore(hints.execSecurity, ["strict", "safe", "restricted"]),
    100 - policyStrictScore(hints.execAsk, ["ask", "confirm", "approval"]),
    100 - policyStrictScore(hints.fsWorkspaceOnly, ["true", "workspace"]),
    100 - policyStrictScore(hints.channelGroupPolicy, ["restricted", "private", "closed"]),
    100 - policyStrictScore(hints.elevatedAllowFromSummary, ["none", "restricted"]),
    100 - policyStrictScore(hints.gatewayAuthMode, ["token", "jwt", "oauth", "apikey", "auth"]),
    (() => {
      const n = Number(hints.gatewayDenyCommandsCount);
      if (!Number.isFinite(n)) return 55;
      if (n >= 20) return 15;
      if (n >= 5) return 35;
      if (n >= 1) return 55;
      return 72;
    })(),
  ]);
  const securityScoreFromPolicy = Math.min(
    100,
    Math.round((securityPolicyRisk * 0.7 + riskEventsScore * 0.3) * 10) / 10,
  );
  // 与概览保持一致：优先复用概览聚合出的风险评分
  const securityScoreNum =
    agent.securityRiskScore != null && Number.isFinite(Number(agent.securityRiskScore))
      ? Number(agent.securityRiskScore)
      : securityScoreFromPolicy;
  const securityLevel = securityScoreNum >= 70 ? "高" : securityScoreNum >= 45 ? "中" : "低";
  const securityDimScore = Math.round((100 - securityScoreNum) * 10) / 10;
  const compositeScore = avgScore([capabilityScore, qualityScore, efficacyScore, costScore, securityDimScore]);

  const derivedDims = {
    capability: scoreToTier(capabilityScore),
    quality: scoreToTier(qualityScore),
    efficacy: scoreToTier(efficacyScore),
    cost: scoreToTier(costScore),
    security: scoreToTier(securityDimScore),
  };

  const riskTags = [];
  if (agent.riskHighTotal > 0) riskTags.push("高风险标记");
  if (agent.riskMediumTotal >= 2) riskTags.push("中风险聚集");
  if (hints.fsWorkspaceOnly === false) riskTags.push("fs.workspaceOnly=false");
  if (hints.channelGroupPolicy === "open") riskTags.push(`群策略:${hints.channelGroupPolicy}`);

  const l1Actions = [];
  if (dim.security === "red") l1Actions.push("安全维度标红：建议结合会话链路溯源核对工具/文件/网络行为。");
  if (dim.quality === "red" || (agent.successRate != null && agent.successRate < 0.8)) {
    l1Actions.push("质量偏低：复盘中止会话与模型/渠道稳定性。");
  }
  if (dim.efficacy === "red") l1Actions.push("效能 P95 偏高：关注长会话与工具链耗时。");
  if (dim.cost === "red" && hasCostData) l1Actions.push("成本偏高：对比 Token 结构与会话频次。");
  if (l1Actions.length === 0) l1Actions.push("整体平稳：持续观察五维趋势与 Top 风险会话即可。");

  const sessionsPreview = [...rowsForTimeline]
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
    .slice(0, 50)
    .map((r) => ({
      session_id:
        (r.session_id != null && String(r.session_id).trim())
          ? String(r.session_id).trim()
          : (r.sessionId != null && String(r.sessionId).trim())
            ? String(r.sessionId).trim()
            : null,
      sessionKey: r.sessionKey != null ? String(r.sessionKey) : "",
      label: r.label ?? null,
      updatedAt: r.updatedAt ?? null,
      abortedLastRun: Boolean(r.abortedLastRun),
      riskHigh: Number.isFinite(Number(r.riskHigh)) ? Number(r.riskHigh) : 0,
      riskMedium: Number.isFinite(Number(r.riskMedium)) ? Number(r.riskMedium) : 0,
      riskLow: Number.isFinite(Number(r.riskLow)) ? Number(r.riskLow) : 0,
      toolErrorCount: Number.isFinite(Number(r.toolErrorCount)) ? Number(r.toolErrorCount) : 0,
      execCommandErrorCount: Number.isFinite(Number(r.execCommandErrorCount)) ? Number(r.execCommandErrorCount) : 0,
      totalTokens: Number.isFinite(Number(r.totalTokens)) ? Number(r.totalTokens) : null,
      durationMs: Number.isFinite(Number(r.durationMs)) ? Number(r.durationMs) : null,
      estimatedCostUsd: sessionEstimatedCostUsd(r),
    }));
  const timelineRiskSummary = sessionsPreview.reduce(
    (acc, s) => {
      acc.high += Number(s.riskHigh) || 0;
      acc.medium += Number(s.riskMedium) || 0;
      acc.low += Number(s.riskLow) || 0;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const riskHighCountFinal = Math.max(Number(agent.riskHighTotal) || 0, Number(timelineRiskSummary.high) || 0);
  const riskMediumCountFinal = Math.max(Number(agent.riskMediumTotal) || 0, Number(timelineRiskSummary.medium) || 0);
  const riskLowCountFinal = Math.max(Number(agent.riskLowTotal) || 0, Number(timelineRiskSummary.low) || 0);

  /** 系统标识：同一 agent_name 在窗口内全部去重 session_key（按最近活跃优先） */
  const headerSessionKeys = [];
  const seenHeaderSessionKeys = new Set();
  const headerRowsSorted = [...sessionRows].sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  for (const r of headerRowsSorted) {
    const k = r.sessionKey != null && String(r.sessionKey).trim() ? String(r.sessionKey).trim() : "";
    if (!k || seenHeaderSessionKeys.has(k)) continue;
    seenHeaderSessionKeys.add(k);
    headerSessionKeys.push(k);
  }
  let headerSessionKey = null;
  if (sessionScope && seenHeaderSessionKeys.has(sessionScope)) {
    headerSessionKey = sessionScope;
  } else if (headerSessionKeys.length > 0) {
    headerSessionKey = headerSessionKeys[0];
  }

  /** 安全与风险 Tab：由会话行与质量明细派生（细粒度审计以会话/工具聚合为主） */
  const riskByDayMap = new Map();
  let riskSessionTotalForTab = 0;
  let todayRiskSessionCountForTab = 0;
  const todayDkTab = dayKeyFromMs(Date.now());
  for (const r of rowsForTimeline) {
    const rh = Number(r.riskHigh) || 0;
    const rm = Number(r.riskMedium) || 0;
    const rl = Number(r.riskLow) || 0;
    const execN = Number(r.execCommandErrorCount) || 0;
    if (rh + rm + rl <= 0 && execN <= 0) continue;
    riskSessionTotalForTab += 1;
    const tMs = Number(r.endedAt) || Number(r.updatedAt);
    const dk = Number.isFinite(tMs) ? dayKeyFromMs(tMs) : null;
    if (dk === todayDkTab) todayRiskSessionCountForTab += 1;
    if (dk) {
      if (!riskByDayMap.has(dk)) riskByDayMap.set(dk, { day: dk, riskSessions: 0, riskEvents: 0 });
      const b = riskByDayMap.get(dk);
      b.riskSessions += 1;
      b.riskEvents += rh + rm + rl + execN;
    }
  }
  const riskDailySortedTab = [...riskByDayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const last7RiskTab = riskDailySortedTab.slice(-7);
  let riskTrend7d = "flat";
  if (last7RiskTab.length >= 2) {
    const half = Math.floor(last7RiskTab.length / 2) || 1;
    const firstHalf = last7RiskTab.slice(0, half).reduce((s, x) => s + x.riskEvents, 0);
    const secondHalf = last7RiskTab.slice(half).reduce((s, x) => s + x.riskEvents, 0);
    if (secondHalf > firstHalf * 1.05) riskTrend7d = "up";
    else if (secondHalf < firstHalf * 0.95) riskTrend7d = "down";
  }

  const qdet = ctx.qualityDetails || {};
  const execErrListTab = Array.isArray(qdet.execErrorRows) ? qdet.execErrorRows : [];
  const toolErrListTab = Array.isArray(qdet.toolErrorRows) ? qdet.toolErrorRows : [];

  /** @type {object[]} */
  const riskRecordsTab = [];
  for (const r of rowsForTimeline) {
    const rh = Number(r.riskHigh) || 0;
    const rm = Number(r.riskMedium) || 0;
    const rl = Number(r.riskLow) || 0;
    const execN = Number(r.execCommandErrorCount) || 0;
    if (rh + rm + rl <= 0 && execN <= 0) continue;
    const sidRaw = r.session_id ?? r.sessionId;
    const sid = sidRaw != null && String(sidRaw).trim() ? String(sidRaw).trim() : null;
    const sk = r.sessionKey != null && String(r.sessionKey).trim() ? String(r.sessionKey).trim() : "";
    const ts = Number(r.updatedAt) || Number(r.endedAt) || null;
    let level = "low";
    let typeKey = "marker";
    if (execN > 0) {
      typeKey = "sensitive_cmd";
      level = rh > 0 ? "high" : rm > 0 ? "medium" : "medium";
    } else if (rh > 0) {
      typeKey = "external";
      level = "high";
    } else if (rm > 0) {
      typeKey = "abnormal_access";
      level = "medium";
    } else if (rl > 0) {
      typeKey = "low_marker";
      level = "low";
    }
    riskRecordsTab.push({
      ts,
      level,
      typeKey,
      sessionId: sid,
      sessionKey: sk || null,
      taskId: null,
      description: `风险事件：高 ${rh} / 中 ${rm} / 低 ${rl}${execN > 0 ? `；exec/shell 异常 ${execN}` : ""}`,
      rulePolicy: "会话风险扫描 · 工具执行策略",
      disposition: "pending",
      source: String(r.label ?? r.lastChannel ?? r.channel ?? "—"),
    });
  }
  riskRecordsTab.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));

  /** @type {object[]} */
  const sensitiveAuditTab = [];
  for (const row of execErrListTab) {
    sensitiveAuditTab.push({
      ts: Number(row.updatedAt) || null,
      category: "exec_shell",
      content: String(row.detail ?? "exec/shell 失败"),
      sourceIp: null,
      needsConfirmation: true,
      approvalPassed: null,
      result: "blocked_or_error",
      sessionId: row.sessionId ?? null,
      sessionKey: row.sessionKey ?? null,
    });
  }
  for (const row of toolErrListTab) {
    sensitiveAuditTab.push({
      ts: Number(row.updatedAt) || null,
      category: "tool_result",
      content: String(row.detail ?? "toolResult.isError"),
      sourceIp: null,
      needsConfirmation: false,
      approvalPassed: null,
      result: "error",
      sessionId: row.sessionId ?? null,
      sessionKey: row.sessionKey ?? null,
      count: row.count,
    });
  }
  sensitiveAuditTab.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));

  const securityRiskTabBundle = {
    overview: {
      riskSessionTotal: riskSessionTotalForTab,
      todayRiskSessionCount: todayRiskSessionCountForTab,
      trend7d: riskTrend7d,
      p0Count: riskHighCountFinal,
      p1Count: riskMediumCountFinal,
      p2p3Count: riskLowCountFinal,
      compliance: {
        unauthorizedOps: execErrCnt,
        sensitiveCommandBlocks: Number(hints.gatewayDenyCommandsCount) || 0,
        highRiskUnapproved: null,
      },
    },
    riskDaily: last7RiskTab,
    riskRecords: riskRecordsTab.slice(0, 500),
    sensitiveAudit: sensitiveAuditTab.slice(0, 120),
    policy: {
      execSecurity: hints.execSecurity ?? null,
      execAsk: hints.execAsk ?? null,
      fsWorkspaceOnly: hints.fsWorkspaceOnly,
      channelGroupPolicy: hints.channelGroupPolicy ?? null,
      gatewayAuthMode: hints.gatewayAuthMode ?? null,
      gatewayDenyCommandsCount: hints.gatewayDenyCommandsCount ?? null,
      gatewayDenyCommandsList: Array.isArray(hints.gatewayDenyCommandsList) ? hints.gatewayDenyCommandsList : [],
      elevatedAllowFrom: hints.elevatedAllowFromSummary ?? null,
      sandboxMode: hints.sandboxMode ?? null,
      workspaceDefault: hints.workspaceDefault ?? null,
      openclawPath: hints.openclawPath ?? null,
      subagentsMaxConcurrent: hints.subagentsMaxConcurrent ?? null,
      modelCatalogCount: Array.isArray(hints.modelCatalog) ? hints.modelCatalog.length : 0,
    },
  };

  return {
    l1: {
      headline: `${agent.agentName} 在窗口内共 ${agent.sessionCount} 次会话，综合健康 ${agent.healthOverall ?? "—"}。`,
      actions: l1Actions.slice(0, 4),
    },
    header: {
      /** 库列 `agent_sessions.session_key`；优先概览 o3，否则由本会话行按 updated_at 最近一条推导 */
      sessionKey: headerSessionKey,
      /** 同一 agent_name 在当前窗口内的全部 session_key（去重，按更新时间倒序） */
      sessionKeys: headerSessionKeys,
      chatType,
      channelTop: topChannel,
      online,
      minutesSinceLastActivity: minutesSince,
      workspaceDir,
    },
    quad: {
      successRate: agent.successRate,
      dailyCostUsd,
      p95DurationMs: agent.p95DurationMs,
      securityLevel,
      securityScore: securityScoreNum,
      compositeScore,
      hasCostData,
    },
    radarScores: {
      capability: capabilityScore,
      quality: qualityScore,
      efficacy: efficacyScore,
      cost: costScore,
      security: securityDimScore,
      composite: compositeScore,
    },
    dimensions: derivedDims,
    basic: {
      dominantModel: topModelName,
      skillCountDistinct: uniqueSkills.length,
      toolCountDistinct: uniqueTools.length,
      modelProvider: modelMeta?.provider ?? null,
    },
    tabs: {
      capability: {
        charts: {
          kpiScore: capabilityScore,
          skillTargetMax: 10,
          skillGaugeValue: uniqueSkills.length,
          toolBar,
          skillPie,
        },
        metrics: [
          { key: "kpi_score", label: "综合评分(KPI)", value: capabilityScore },
          { key: "model_provider", label: "模型供应商", value: modelMeta?.provider ?? "—" },
          { key: "model_name", label: "模型名称", value: modelMeta?.name ?? topModelName ?? "—" },
          { key: "context_window", label: "上下文窗口", value: modelMeta?.contextWindow ?? "—" },
          { key: "max_tokens", label: "最大输出", value: modelMeta?.maxTokens ?? "—" },
          { key: "reasoning", label: "推理能力", value: modelMeta?.reasoning == null ? "—" : modelMeta.reasoning ? "是" : "否" },
          { key: "skills", label: "技能清单", value: uniqueSkills.length ? uniqueSkills.join("、") : "—" },
          { key: "tools", label: "工具清单", value: uniqueTools.length ? uniqueTools.join("、") : "—" },
          { key: "subagents_max_concurrent", label: "子代理并发数", value: hints.subagentsMaxConcurrent ?? "—" },
          { key: "sandbox_mode", label: "沙箱模式", value: hints.sandboxMode ?? "—" },
        ],
      },
      quality: {
        charts: {
          kpiScore: qualityScore,
          successRate: agent.successRate,
          errorRatePct: toolErrorRatePct,
          toolUseCount: toolUseCnt,
          toolErrorCount: toolErrCnt,
          abortedTrend,
        },
        metrics: [
          { key: "kpi_score", label: "综合评分(KPI)", value: qualityScore },
          {
            key: "aborted_session_count",
            label: "异常中止会话数",
            value: Number.isFinite(Number(qm.abortedSessionCountWindow))
              ? Number(qm.abortedSessionCountWindow)
              : Number(agent.abortedCount) || 0,
          },
          {
            key: "tool_error_count",
            label: "工具调用错误次数",
            value: Number.isFinite(Number(qm.toolErrorCountWindow))
              ? Number(qm.toolErrorCountWindow)
              : Number(agent.toolErrorCount) || 0,
          },
          {
            key: "exec_command_error_count",
            label: "命令执行错误次数",
            value: Number.isFinite(Number(qm.execCommandErrorCount))
              ? Number(qm.execCommandErrorCount)
              : Number(agent.execCommandErrorCount) || 0,
          },
        ],
      },
      efficacy: {
        charts: {
          kpiScore: efficacyScore,
          sessionTotal: agent.sessionCount,
          successSessions: agent.sessionCount - agent.abortedCount,
          p95Ms: agent.p95DurationMs,
          runtimeSampleCount: sessionRows.length,
          toolDurationSampleCount: Number.isFinite(Number(ctx.toolDurationSampleCount)) ? Number(ctx.toolDurationSampleCount) : 0,
          trend: efficacyTrend,
        },
        metrics: [
          { key: "kpi_score", label: "综合评分(KPI)", value: efficacyScore },
          { key: "avg_runtime_ms", label: "平均会话耗时(ms)", value: avgRuntimeMs ?? "—" },
          {
            key: "avg_tool_duration_ms",
            label: "单次工具耗时(ms)",
            value: ctx.avgToolDurationMs ?? avgRuntimeMs ?? "—",
          },
          { key: "efficiency_per_cost", label: "单位成本产出（估）", value: efficiencyPerCost ?? "—" },
        ],
      },
      taskExecution: {
        charts: {
          successRate: agent.successRate,
          sessionTotal: agent.sessionCount,
          successSessions: Math.max(0, (Number(agent.sessionCount) || 0) - (Number(agent.abortedCount) || 0)),
          abortedSessions: Number(agent.abortedCount) || 0,
          toolUseCount: toolUseCnt,
          toolErrorCount: toolErrCnt,
          execCommandErrorCount: execErrCnt,
          p95Ms: agent.p95DurationMs,
          avgRuntimeMs,
          avgToolDurationMs: avgToolDuration,
          sessionExecutionDaily: trendDaily.map((d) => ({
            day: d.day,
            success: d.success,
            aborted: d.aborted,
            sessions: d.sessions,
          })),
          toolTop10: uniqueTools.slice(0, 10).map((name) => ({
            name: name.length > 36 ? `${name.slice(0, 36)}…` : name,
            count: toolFreq.get(name) ?? 0,
          })),
          skillTop10: uniqueSkills.slice(0, 10).map((name) => ({
            name: name.length > 36 ? `${name.slice(0, 36)}…` : name,
            count: skillFreq.get(name) ?? 0,
          })),
        },
        metrics: [],
      },
      toolExecution: (() => {
        const toolMentionSum = [...toolFreq.values()].reduce((s, v) => s + (Number(v) || 0), 0);
        const toolTop15 = uniqueTools.slice(0, 15).map((name) => {
          const c = toolFreq.get(name) ?? 0;
          return {
            name: name.length > 40 ? `${name.slice(0, 40)}…` : name,
            count: c,
            sharePct:
              toolMentionSum > 0 ? Math.round(((c / toolMentionSum) * 1000) / 10) : null,
          };
        });
        const teRows = Array.isArray(ctx.qualityDetails?.toolErrorRows) ? ctx.qualityDetails.toolErrorRows : [];
        const toolOutcomePie =
          toolUseCnt > 0
            ? [
                { name: "success", value: Math.max(0, toolUseCnt - toolErrCnt) },
                { name: "error", value: Math.max(0, toolErrCnt) },
              ].filter((x) => x.value > 0)
            : [];
        const sessionsN = sessionRows.length;
        const toolCallsPerSession =
          sessionsN > 0 ? Math.round((toolUseCnt / sessionsN) * 100) / 100 : null;
        return {
          charts: {
            toolUseCount: toolUseCnt,
            toolErrorCount: toolErrCnt,
            toolErrorRatePct,
            avgToolDurationMs: avgToolDuration,
            toolDurationSampleCount: Number.isFinite(Number(ctx.toolDurationSampleCount))
              ? Number(ctx.toolDurationSampleCount)
              : 0,
            distinctToolCount: uniqueTools.length,
            toolCallsPerSession,
            toolTrendDaily,
            toolOutcomePie,
            toolTop15,
            toolErrorSessions: teRows.slice(0, 30),
          },
          metrics: [],
        };
      })(),
      skillSituation: (() => {
        const skillMentionSum = [...skillFreq.values()].reduce((s, v) => s + (Number(v) || 0), 0);
        const sessionsWithSkillCount = sessionRows.reduce(
          (n, r) => n + (collectSkillEntries(r).length > 0 ? 1 : 0),
          0,
        );
        const skillTop15 = uniqueSkills.slice(0, 15).map((name) => {
          const c = skillFreq.get(name) ?? 0;
          return {
            name: name.length > 40 ? `${name.slice(0, 40)}…` : name,
            count: c,
            sharePct:
              skillMentionSum > 0 ? Math.round(((c / skillMentionSum) * 1000) / 10) : null,
          };
        });
        const SKILL_MIX_PIE_MAX = 8;
        const skillEntriesSorted = [...skillFreq.entries()].sort((a, b) => b[1] - a[1]);
        /** @type {{ name: string; value: number }[]} */
        let skillMixPie = [];
        if (skillEntriesSorted.length > 0) {
          const head = skillEntriesSorted.slice(0, SKILL_MIX_PIE_MAX);
          const tail = skillEntriesSorted.slice(SKILL_MIX_PIE_MAX);
          const tailSum = tail.reduce((s, [, v]) => s + v, 0);
          skillMixPie = head.map(([name, value]) => ({
            name: name.length > 22 ? `${name.slice(0, 22)}…` : name,
            value: Math.round(Number(value) || 0),
          }));
          if (tailSum > 0) skillMixPie.push({ name: "__other__", value: Math.round(tailSum) });
        }
        const sessionsN = sessionRows.length;
        const avgSkillMentionsPerSession =
          sessionsN > 0 ? Math.round((skillMentionSum / sessionsN) * 100) / 100 : null;
        const skillCoveragePct =
          sessionsN > 0
            ? Math.round((sessionsWithSkillCount / sessionsN) * 1000) / 10
            : null;
        return {
          charts: {
            skillMentionTotal: skillMentionSum,
            distinctSkillCount: uniqueSkills.length,
            sessionsWithSkillCount,
            sessionTotal: sessionsN,
            avgSkillMentionsPerSession,
            skillCoveragePct,
            skillTrendDaily,
            skillTop15,
            skillMixPie,
          },
          metrics: [],
        };
      })(),
      userPortrait: (() => {
        const totalSess = sessionRows.length;
        const unknownN = userSessionMap.get("__unknown__") ?? 0;
        const knownIdentifiedPct =
          totalSess > 0 ? Math.round(((totalSess - unknownN) / totalSess) * 1000) / 10 : null;
        const top1 = userSessionEntries[0];
        const topUserSharePct =
          top1 && totalSess > 0 ? Math.round((top1[1] / totalSess) * 1000) / 10 : null;
        let hhi = 0;
        for (const [, c] of userSessionEntries) {
          if (totalSess > 0) hhi += (c / totalSess) ** 2;
        }
        const userConcentrationHhi = Math.round(hhi * 1000) / 1000;
        const knownDistinctUsers = [...userSessionMap.keys()].filter((k) => k !== "__unknown__").length;
        const userTop15 = userSessionEntries.slice(0, 15).map(([name, sc]) => {
          const tok = Number(userTokenMap.get(name)) || 0;
          return {
            name: name.length > 44 ? `${name.slice(0, 44)}…` : name,
            sessionCount: sc,
            tokens: Math.round(tok),
            sessionSharePct:
              totalSess > 0 ? Math.round((sc / totalSess) * 1000) / 10 : null,
          };
        });
        return {
          charts: {
            sessionTotal: totalSess,
            distinctUserKeys: userSessionMap.size,
            knownDistinctUsers,
            unknownSessionCount: unknownN,
            knownIdentifiedSessionPct: knownIdentifiedPct,
            topUserSharePct,
            userConcentrationHhi,
            userSessionPie,
            userTop15,
            userSessionTrendDaily,
            userSessionTrendSeries,
          },
          metrics: [],
        };
      })(),
      channelAccess: (() => {
        const totalSess = sessionRows.length;
        const unknownCh = channelSessionMap.get("__unknown__") ?? 0;
        const knownChPct =
          totalSess > 0 ? Math.round(((totalSess - unknownCh) / totalSess) * 1000) / 10 : null;
        const top1Ch = channelSessionEntries[0];
        const topChannelSharePct =
          top1Ch && totalSess > 0 ? Math.round((top1Ch[1] / totalSess) * 1000) / 10 : null;
        let hhiCh = 0;
        for (const [, c] of channelSessionEntries) {
          if (totalSess > 0) hhiCh += (c / totalSess) ** 2;
        }
        const channelConcentrationHhi = Math.round(hhiCh * 1000) / 1000;
        const knownDistinctChannels = [...channelSessionMap.keys()].filter((k) => k !== "__unknown__").length;
        const channelTop15 = channelSessionEntries.slice(0, 15).map(([name, sc]) => {
          const tok = Number(channelTokenMap.get(name)) || 0;
          return {
            name: name.length > 44 ? `${name.slice(0, 44)}…` : name,
            sessionCount: sc,
            tokens: Math.round(tok),
            sessionSharePct:
              totalSess > 0 ? Math.round((sc / totalSess) * 1000) / 10 : null,
          };
        });
        return {
          charts: {
            sessionTotal: totalSess,
            distinctChannelKeys: channelSessionMap.size,
            knownDistinctChannels,
            unknownChannelSessions: unknownCh,
            knownChannelSessionPct: knownChPct,
            topChannelSharePct: topChannelSharePct,
            channelConcentrationHhi,
            channelSessionPie,
            channelTop15,
            channelTrendDaily,
            channelSessionTrendDaily,
            channelSessionTrendSeries,
          },
          metrics: [],
        };
      })(),
      sessionExecution: {
        charts: {
          sessionTotal: sessionRows.length,
          successRate:
            sessionRows.length > 0
              ? Math.round((successSessionCount / sessionRows.length) * 1000) / 1000
              : null,
          failedSessions: failedSessionCount,
          avgSessionDurationMs: avgRuntimeMs,
          sessionTrend: sessionExecTrend,
          sessionStatusPie,
          userSessionPie,
          channelSessionPie,
        },
        metrics: [],
      },
      cost: {
        charts: {
          kpiScore: costScore,
          dailyCostUsd,
          costTrend,
          costTrendDays: costTrend.length,
          tokenRatio,
          tokenRatioSampleCount: inputTokensFinal > 0 || outputTokensFinal > 0 ? Math.max(1, sessionRows.length) : 0,
          totalTokens: totalTokensFinal,
          dailyTokensAvg,
          avgTokensPerSession,
          maxTokensPerSession,
          tokenTrendDaily,
          inputOutputPie,
          modelTokenPie,
          userTokenTop10,
          channelTokenTop10,
          sessionTokenTop10,
        },
        metrics: [
          { key: "kpi_score", label: "综合评分(KPI)", value: costScore },
          { key: "input_tokens", label: "输入 Token（DB汇总）", value: inputTokensFinal > 0 ? inputTokensFinal : "—" },
          { key: "output_tokens", label: "输出 Token（DB汇总）", value: outputTokensFinal > 0 ? outputTokensFinal : "—" },
          { key: "total_tokens", label: "总 Token（输入+输出）", value: totalTokensFinal > 0 ? totalTokensFinal : "—" },
          { key: "model_unit_cost_input", label: "输入单价（models.json）", value: unitCostInputFinal ?? "—" },
          { key: "model_unit_cost_output", label: "输出单价（models.json）", value: unitCostOutputFinal ?? "—" },
          { key: "estimated_cost_usd", label: "成本估算（公式）", value: estimatedCostByFormula != null ? Math.round(estimatedCostByFormula * 1e6) / 1e6 : "—" },
        ],
      },
      security: {
        charts: {
          kpiScore: securityDimScore,
          securityScore: securityScoreNum,
          securityLevel,
          riskHighCount: riskHighCountFinal,
          riskMediumCount: riskMediumCountFinal,
          riskLowCount: riskLowCountFinal,
          riskTags,
        },
        metrics: [
          { key: "kpi_score", label: "综合评分(KPI)", value: securityDimScore },
          { key: "exec_security_mode", label: "exec 安全级别", value: hints.execSecurity ?? "—" },
          { key: "exec_ask_policy", label: "审批策略(ask)", value: hints.execAsk ?? "—" },
          { key: "fs_workspace_only", label: "文件仅工作区", value: hints.fsWorkspaceOnly == null ? "—" : String(hints.fsWorkspaceOnly) },
          { key: "channel_group_policy", label: "群聊策略", value: hints.channelGroupPolicy ?? "—" },
          { key: "elevated_allow_from", label: "提权工具 allowFrom", value: hints.elevatedAllowFromSummary ?? "—" },
          { key: "gateway_auth_mode", label: "网关鉴权", value: hints.gatewayAuthMode ?? "—" },
          {
            key: "gateway_deny_commands",
            label: "网关封禁策略",
            value: Array.isArray(hints.gatewayDenyCommandsList) && hints.gatewayDenyCommandsList.length
              ? hints.gatewayDenyCommandsList.join("、")
              : "—",
          },
        ],
      },
      securityRisk: securityRiskTabBundle,
    },
    qualityDetails: {
      abortedRows: Array.isArray(ctx.qualityDetails?.abortedRows) ? ctx.qualityDetails.abortedRows : [],
      toolErrorRows: Array.isArray(ctx.qualityDetails?.toolErrorRows) ? ctx.qualityDetails.toolErrorRows : [],
      execErrorRows: Array.isArray(ctx.qualityDetails?.execErrorRows) ? ctx.qualityDetails.execErrorRows : [],
    },
    /** 最近会话节点，供画像页「事件时间线」与下钻会话溯源 */
    sessionsPreview,
    timelineRiskSummary,
    openclawHintsPresent: Boolean(hints.openclawPath),
  };
}
