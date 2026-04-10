/**
 * 驾驶舱 — 会话模块专属查询
 * 数据源：opsRobot.agent_sessions  &  opsRobot.agent_sessions_logs
 *
 * 提供接口：GET /api/monitor-session
 *   统计维度：
 *     - 会话概览四宫格 + 风险对话列表：均为滚动近 30 天（started_at / 风险项时间落在该窗口）
 *     - 会话趋势：最近一个月（30 个日历日，含今日，Doris 按日）
 *
 * 会话概览与风险对话与溯源同源启发式风险字段；时间窗均为滚动近 30 天（与数字员工列表「最近一个月」习惯一致）。
 * 行为审计概览（/api/agent-sessions-audit-overview）中 riskSessionCount 等为自然月 + SQL 近似，与此处不完全相同。
 *
 * 会话趋势走本目录 monitor-session-trend-doris.mjs 直连 Doris，不扩展审计概览接口。
 */
import { queryAgentSessionsLogsRaw } from "../agentSessionsQuery.mjs";
import {
  agentSessionsLogsRowsToLines,
  extractSessionRisks,
} from "../../frontend/lib/sessionAudit.js";
import { monitorCachedAgentSessionsWithLogTokens } from "./monitor-doris-cache.mjs";
import { queryMonitorSessionCountTrend } from "./monitor-session-trend-doris.mjs";

/** 单会话拉日志并发上限（避免瞬时过多连接） */
const RISK_LOG_FETCH_CONCURRENCY = 6;
/** 近 30 天窗口内仅扫描「有风险」会话中 started_at 最新的若干条，控制 DB 压力 */
const MAX_RISK_SESSIONS_TO_SCAN = 200;
/** riskLimit=0 时默认返回条数 */
const DEFAULT_RISK_DIALOGUE_LIMIT = 200;

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "bigint") out[k] = Number(out[k]);
  }
  return out;
}

/** 计算最近30天起始时间（毫秒，滚动窗口） */
function startOfRolling30Days(nowMs = Date.now()) {
  return nowMs - 30 * 24 * 60 * 60 * 1000;
}

/** 将毫秒时间戳格式化为 YYYY-MM-DD HH:mm:ss */
function formatMsToDisplay(ms) {
  if (!ms) return "—";
  try {
    return new Date(Number(ms)).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

/**
 * 是否在时间窗口内（按会话 started_at）
 * @param {number} windowStartMs 窗口起点（含）
 */
function isSessionInRollingWindow(r, windowStartMs, nowMs) {
  const startedAt = Number(r.started_at) || 0;
  return startedAt > 0 && startedAt >= windowStartMs && startedAt < nowMs;
}

/**
 * 会话概览用：窗口内有风险的会话数（按会话计高/中/低），与 computeSessionAggregatesFromLogRows 同源字段。
 */
function aggregateRiskSessionsFromList(list, windowStartMs, nowMs) {
  const filtered = list.filter((r) => {
    if (!isSessionInRollingWindow(r, windowStartMs, nowMs)) return false;
    const high = Number(r.risk_high) || 0;
    const medium = Number(r.risk_medium) || 0;
    const low = Number(r.risk_low) || 0;
    return high > 0 || medium > 0 || low > 0;
  });

  const summary = filtered.reduce(
    (acc, r) => {
      const high = Number(r.risk_high) || 0;
      const medium = Number(r.risk_medium) || 0;
      const low = Number(r.risk_low) || 0;
      const riskLevel =
        high > 0 ? "高危" : medium > 0 ? "中危" : low > 0 ? "低危" : "健康";
      if (riskLevel === "高危") acc.high += 1;
      else if (riskLevel === "中危") acc.medium += 1;
      else if (riskLevel === "低危") acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
  return { summary };
}

function severityToZh(sev) {
  if (sev === "high") return "高危";
  if (sev === "medium") return "中危";
  return "低危";
}

function formatRiskContent(r) {
  const title = r.title != null ? String(r.title) : "";
  const detail = r.detail != null ? String(r.detail).trim() : "";
  const d = detail.length > 320 ? `${detail.slice(0, 320)}…` : detail;
  return d ? `${title}：${d}` : title;
}

function agentNameFromSessionRow(r) {
  const accountName =
    (r.origin_account_id && String(r.origin_account_id)) ||
    (r.last_account_id && String(r.last_account_id)) ||
    (r.delivery_context_account_id &&
      String(r.delivery_context_account_id)) ||
    "未知用户";
  return r.agent_name ? String(r.agent_name) : accountName;
}

async function extractDialogueRisksForSession(r) {
  const sid = r.session_id ? String(r.session_id) : "";
  if (!sid) return [];
  const logs = await queryAgentSessionsLogsRaw(sid);
  const lines = agentSessionsLogsRowsToLines(logs);
  const risks = extractSessionRisks(lines);
  const agentName = agentNameFromSessionRow(r);
  const sessionStarted = Number(r.started_at) || 0;
  return risks.map((risk) => ({
    sessionId: sid,
    agentName,
    riskLevel: severityToZh(risk.severity),
    dialogueTimeMs: risk.tMs != null ? Number(risk.tMs) : sessionStarted,
    displayTime: formatMsToDisplay(risk.tMs != null ? risk.tMs : sessionStarted),
    content: formatRiskContent(risk),
  }));
}

async function queryRiskDialogues(windowStartMs, nowMs, limit) {
  const effectiveLimit =
    limit > 0 ? Math.min(limit, 500) : DEFAULT_RISK_DIALOGUE_LIMIT;
  const rows = await monitorCachedAgentSessionsWithLogTokens();
  const list = Array.isArray(rows) ? rows.map((r) => normalizeRow(r)) : [];
  const candidateSessions = list
    .filter((r) => {
      if (!isSessionInRollingWindow(r, windowStartMs, nowMs)) return false;
      const high = Number(r.risk_high) || 0;
      const medium = Number(r.risk_medium) || 0;
      const low = Number(r.risk_low) || 0;
      return high > 0 || medium > 0 || low > 0;
    })
    .sort((a, b) => (Number(b.started_at) || 0) - (Number(a.started_at) || 0))
    .slice(0, MAX_RISK_SESSIONS_TO_SCAN);

  const flat = [];
  for (let i = 0; i < candidateSessions.length; i += RISK_LOG_FETCH_CONCURRENCY) {
    const chunk = candidateSessions.slice(i, i + RISK_LOG_FETCH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((r) => extractDialogueRisksForSession(r)));
    for (const arr of chunkResults) flat.push(...arr);
  }
  const inRiskWindow = flat.filter((x) => {
    const t = Number(x.dialogueTimeMs) || 0;
    return t >= windowStartMs && t < nowMs;
  });
  inRiskWindow.sort((a, b) => (b.dialogueTimeMs || 0) - (a.dialogueTimeMs || 0));
  const total = inRiskWindow.length;
  const items = inRiskWindow.slice(0, effectiveLimit);
  return { items, total };
}

/** 会话趋势 — 大屏专用 Doris 查询（与审计 7 日趋势同一按日 SQL 口径） */
async function querySessionTrendSeries(calendarDays) {
  const n = Math.min(90, Math.max(1, Math.floor(Number(calendarDays) || 30)));
  return queryMonitorSessionCountTrend({ calendarDays: n });
}

export async function queryMonitorSessionOverview() {
  const now = Date.now();
  const windowStart = startOfRolling30Days(now);
  const rows = await monitorCachedAgentSessionsWithLogTokens();
  const list = Array.isArray(rows) ? rows.map((r) => normalizeRow(r)) : [];
  let sessionTotal = 0;
  for (const r of list) {
    if (isSessionInRollingWindow(r, windowStart, now)) sessionTotal += 1;
  }
  const riskSessionsData = aggregateRiskSessionsFromList(list, windowStart, now);
  const overview = {
    sessionTotal,
    highRiskSessions: riskSessionsData.summary.high,
    mediumRiskSessions: riskSessionsData.summary.medium,
    lowRiskSessions: riskSessionsData.summary.low,
  };
  return {
    generatedAt: new Date(now).toISOString(),
    period: {
      monthStart: new Date(windowStart).toISOString(),
    },
    overview,
  };
}

export async function queryMonitorSessionRiskSessions(opts = {}) {
  const riskLimit = Number(opts.riskLimit) || 0;
  const now = Date.now();
  const windowStart = startOfRolling30Days(now);
  const riskSessionsData = await queryRiskDialogues(windowStart, now, riskLimit);
  return {
    generatedAt: new Date(now).toISOString(),
    period: {
      monthStart: new Date(windowStart).toISOString(),
    },
    riskSessions: riskSessionsData.items,
    riskSessionsTotal: riskSessionsData.total,
  };
}

export async function queryMonitorSessionTrend(opts = {}) {
  const trendDays = Number(opts.trendDays) || 30;
  const now = Date.now();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const calendarWindowStart = todayStart.getTime() - (trendDays - 1) * 24 * 60 * 60 * 1000;
  const trendStart = calendarWindowStart;
  const sessionTrend = await querySessionTrendSeries(trendDays);
  const sessionTrendTotal = sessionTrend.reduce((a, r) => a + r.value, 0);
  return {
    generatedAt: new Date(now).toISOString(),
    period: {
      trendDays,
      trendStart: new Date(trendStart).toISOString(),
    },
    sessionTrend,
    sessionTrendTotal,
  };
}

/**
 * 大屏会话模块主查询入口
 * @param {{ trendDays?: number; riskLimit?: number }} opts
 */
export async function queryMonitorSession(opts = {}) {
  const trendDays = Number(opts.trendDays) || 30;
  const riskLimit = Number(opts.riskLimit) || 0;

  const now = Date.now();
  const overviewWindowStart = startOfRolling30Days(now);
  const trendStart = now - trendDays * 24 * 60 * 60 * 1000;
  const [overviewData, riskData, trendData] = await Promise.all([
    queryMonitorSessionOverview(),
    queryMonitorSessionRiskSessions({ riskLimit }),
    queryMonitorSessionTrend({ trendDays }),
  ]);

  return {
    generatedAt: new Date(now).toISOString(),
    period: {
      monthStart: new Date(overviewWindowStart).toISOString(),
      trendDays,
      trendStart: new Date(trendStart).toISOString(),
    },
    overview: overviewData.overview,
    riskSessions: riskData.riskSessions,
    riskSessionsTotal: riskData.riskSessionsTotal,
    sessionTrend: trendData.sessionTrend,
    sessionTrendTotal: trendData.sessionTrendTotal,
  };
}
