/**
 * 大屏监控 — 会话模块专属查询
 * 数据源：opsRobot.agent_sessions  &  opsRobot.agent_sessions_logs
 *
 * 提供接口：GET /api/monitor-session
 *   统计维度：
 *     - 会话概览 / 风险会话列表：最近30天（滚动窗口）
 *     - 会话趋势：最近 14 天
 *
 * 与行为审计概览页（/api/agent-sessions-audit-overview）数据口径一致
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";
import { queryAgentSessionsRawWithLogTokens } from "../agentSessionsQuery.mjs";
import { queryAuditDashboardMetrics } from "../security-audit/audit-dashboard-query.mjs";

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
 * 风险会话列表（近30天，按时间倒序）
 * 数据口径完全对齐"会话链路溯源"页面（/api/agent-sessions 同源）：
 *   - 仅统计 risk>0 的会话（高/中/低危）
 *   - 只排除 started_at=0（1970纪元异常数据）和 30天窗口外的会话
 *   - 风险等级：risk_high>0 => 高危 / risk_medium>0 => 中危 / risk_low>0 => 低危 / 否则 => 健康
 */
async function queryRiskSessions(_conn, monthStart, nowMs, limit) {
  const rows = await queryAgentSessionsRawWithLogTokens();
  const list = Array.isArray(rows) ? rows.map((r) => normalizeRow(r)) : [];

  const filtered = list
    .filter((r) => {
      const startedAt = Number(r.started_at) || 0;
      const high = Number(r.risk_high) || 0;
      const medium = Number(r.risk_medium) || 0;
      const low = Number(r.risk_low) || 0;
      // 排除 started_at=0（1970纪元异常）、30天窗口外，以及非风险会话
      return startedAt > 0 && startedAt >= monthStart && startedAt < nowMs && (high > 0 || medium > 0 || low > 0);
    })
    .map((r) => {
      const high = Number(r.risk_high) || 0;
      const medium = Number(r.risk_medium) || 0;
      const low = Number(r.risk_low) || 0;
      const riskLevel =
        high > 0 ? "高危" : medium > 0 ? "中危" : low > 0 ? "低危" : "健康";
      const accountName =
        (r.origin_account_id && String(r.origin_account_id)) ||
        (r.last_account_id && String(r.last_account_id)) ||
        (r.delivery_context_account_id &&
          String(r.delivery_context_account_id)) ||
        "未知用户";
      return {
        sessionId: r.session_id ? String(r.session_id) : "",
        agentName: r.agent_name ? String(r.agent_name) : accountName,
        accountName,
        channel: r.channel ? String(r.channel) : "",
        riskLevel,
        startedAt: Number(r.started_at) || 0,
        displayTime: formatMsToDisplay(r.started_at),
        riskHigh: high,
        riskMedium: medium,
        riskLow: low,
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt);

  const total = filtered.length;
  const items = limit > 0 ? filtered.slice(0, limit) : filtered;
  const summary = filtered.reduce(
    (acc, session) => {
      if (session.riskLevel === "高危") acc.high += 1;
      else if (session.riskLevel === "中危") acc.medium += 1;
      else if (session.riskLevel === "低危") acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
  return { items, total, summary };
}

/** 会话趋势 — 直接复用行为审计概览趋势数据（同一口径） */
async function querySessionTrendFromAudit() {
  const audit = await queryAuditDashboardMetrics();
  const trend = Array.isArray(audit?.trends?.sessions7d) ? audit.trends.sessions7d : [];
  return trend.map((r) => ({
    day: String(r.day || ""),
    label: String(r.day || "").slice(5, 10),
    value: Number(r.sessions) || 0,
  }));
}

export async function queryMonitorSessionOverview() {
  const now = Date.now();
  const monthStart = startOfRolling30Days(now);
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });
  let overview;
  try {
    const riskSessionsData = await queryRiskSessions(conn, monthStart, now, 0);
    overview = {
      sessionTotal: riskSessionsData.total,
      highRiskSessions: riskSessionsData.summary.high,
      mediumRiskSessions: riskSessionsData.summary.medium,
      lowRiskSessions: riskSessionsData.summary.low,
    };
  } finally {
    await conn.end();
  }
  return {
    generatedAt: new Date(now).toISOString(),
    period: {
      monthStart: new Date(monthStart).toISOString(),
    },
    overview,
  };
}

export async function queryMonitorSessionRiskSessions(opts = {}) {
  const riskLimit = Number(opts.riskLimit) || 0;
  const now = Date.now();
  const monthStart = startOfRolling30Days(now);
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });
  try {
    const riskSessionsData = await queryRiskSessions(conn, monthStart, now, riskLimit);
    return {
      generatedAt: new Date(now).toISOString(),
      period: {
        monthStart: new Date(monthStart).toISOString(),
      },
      riskSessions: riskSessionsData.items,
      riskSessionsTotal: riskSessionsData.total,
    };
  } finally {
    await conn.end();
  }
}

export async function queryMonitorSessionTrend(opts = {}) {
  const trendDays = 7;
  const now = Date.now();
  const trendStart = now - trendDays * 24 * 60 * 60 * 1000;
  const sessionTrend = await querySessionTrendFromAudit();
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
  const trendDays = Number(opts.trendDays) || 14;
  const riskLimit = Number(opts.riskLimit) || 0;

  const now = Date.now();
  const monthStart = startOfRolling30Days(now);
  const trendStart = now - trendDays * 24 * 60 * 60 * 1000;
  const [overviewData, riskData, trendData] = await Promise.all([
    queryMonitorSessionOverview(),
    queryMonitorSessionRiskSessions({ riskLimit }),
    queryMonitorSessionTrend({ trendDays }),
  ]);

  return {
    generatedAt: new Date(now).toISOString(),
    period: {
      monthStart: new Date(monthStart).toISOString(),
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
