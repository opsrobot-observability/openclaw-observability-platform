/**
 * 审计概览仪表盘：基于 agent_sessions / agent_sessions_logs 的聚合与趋势
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

/** @param {Record<string, unknown>} row */
function normalizeAggRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === "bigint") out[k] = Number(v);
  }
  return out;
}

/** 本地日历日 0 点（与浏览器用户时区一致依赖服务端；此处用本机时区） */
function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function startOfLocalWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function startOfLocalMonth(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * @returns {{
 *   todayStart: number;
 *   todayEnd: number;
 *   weekStart: number;
 *   weekEnd: number;
 *   monthStart: number;
 *   monthEnd: number;
 *   trendStart: number;
 *   now: number;
 *   fiveMinAgo: number;
 *   day24hAgo: number;
 * }}
 */
function computeBounds() {
  const now = Date.now();
  const todayStart = startOfLocalDay();
  const weekStart = startOfLocalWeekMonday();
  const monthStart = startOfLocalMonth();
  const trendStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  return {
    todayStart,
    todayEnd: now,
    weekStart,
    weekEnd: now,
    monthStart,
    monthEnd: now,
    trendStart,
    trendEnd: now,
    now,
    fiveMinAgo: now - 5 * 60 * 1000,
    day24hAgo: now - 24 * 60 * 60 * 1000,
  };
}

const WINDOW_STATS_SQL = `
SELECT
  (SELECT COUNT(*) FROM agent_sessions WHERE started_at >= ? AND started_at < ?) AS session_total,
  (SELECT COUNT(*) FROM agent_sessions WHERE updated_at >= ? AND updated_at < ?) AS active_sessions,
  (SELECT COUNT(DISTINCT COALESCE(
    NULLIF(origin_account_id, ''),
    NULLIF(last_account_id, ''),
    NULLIF(delivery_context_account_id, '')
  )) FROM agent_sessions
   WHERE updated_at >= ? AND updated_at < ?
     AND COALESCE(
       NULLIF(origin_account_id, ''),
       NULLIF(last_account_id, ''),
       NULLIF(delivery_context_account_id, '')
     ) IS NOT NULL
     AND COALESCE(
       NULLIF(origin_account_id, ''),
       NULLIF(last_account_id, ''),
       NULLIF(delivery_context_account_id, '')
     ) != ''
  ) AS user_access,
  (SELECT COUNT(DISTINCT CONCAT(
    COALESCE(CAST(channel AS CHAR), ''),
    '|',
    COALESCE(CAST(last_to AS CHAR), '')
  )) FROM agent_sessions
   WHERE updated_at >= ? AND updated_at < ?
     AND (channel IS NOT NULL AND channel != '' OR last_to IS NOT NULL AND last_to != '')
  ) AS device_connections
`;

const RISK_TOTALS_SQL = `
SELECT
  SUM(CASE
    WHEN (\`message_is_error\` IS NOT NULL AND \`message_is_error\` != 0)
      OR (\`message_details_exit_code\` IS NOT NULL AND \`message_details_exit_code\` != 0)
    THEN 1 ELSE 0
  END) AS risk_high,
  SUM(CASE
    WHEN NOT (
      (\`message_is_error\` IS NOT NULL AND \`message_is_error\` != 0)
      OR (\`message_details_exit_code\` IS NOT NULL AND \`message_details_exit_code\` != 0)
    )
    AND LOWER(CAST(\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
    THEN 1 ELSE 0
  END) AS risk_medium,
  SUM(CASE
    WHEN NOT (
      (\`message_is_error\` IS NOT NULL AND \`message_is_error\` != 0)
      OR (\`message_details_exit_code\` IS NOT NULL AND \`message_details_exit_code\` != 0)
    )
    AND NOT (
      LOWER(CAST(\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
    )
    AND \`message_tool_name\` IS NOT NULL AND \`message_tool_name\` != ''
    THEN 1 ELSE 0
  END) AS risk_low
FROM agent_sessions_logs
`;

const RISK_SESSION_COUNT_SQL = `
SELECT COUNT(DISTINCT l.\`sessionId\`) AS cnt
FROM agent_sessions_logs l
WHERE EXISTS (
  SELECT 1 FROM agent_sessions s
  WHERE s.session_id = l.\`sessionId\`
  AND s.started_at >= ? AND s.started_at < ?
)
AND (
  (l.\`message_is_error\` IS NOT NULL AND l.\`message_is_error\` != 0)
  OR (l.\`message_details_exit_code\` IS NOT NULL AND l.\`message_details_exit_code\` != 0)
  OR LOWER(CAST(l.\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
  OR (
    l.\`message_tool_name\` IS NOT NULL AND l.\`message_tool_name\` != ''
    AND NOT (
      (l.\`message_is_error\` IS NOT NULL AND l.\`message_is_error\` != 0)
      OR (l.\`message_details_exit_code\` IS NOT NULL AND l.\`message_details_exit_code\` != 0)
    )
    AND NOT (
      LOWER(CAST(l.\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
    )
  )
)
`;

const SESSION_TOTAL_MONTH_SQL = `SELECT COUNT(*) AS c FROM agent_sessions WHERE started_at >= ? AND started_at < ?`;

const REALTIME_ONLINE_SQL = `
SELECT COUNT(*) AS c FROM agent_sessions
WHERE updated_at >= ?
  AND ended_at IS NULL
`;

const REALTIME_ABORT_SQL = `
SELECT COUNT(*) AS c FROM agent_sessions
WHERE aborted_last_run IS NOT NULL AND aborted_last_run != 0
  AND updated_at >= ?
`;

const TREND_SESSIONS_7D_SQL = `
SELECT
  DATE(FROM_UNIXTIME(FLOOR(started_at / 1000))) AS d,
  COUNT(*) AS cnt
FROM agent_sessions
WHERE started_at >= ? AND started_at <= ?
GROUP BY d
ORDER BY d
`;

const TREND_RISK_7D_SQL = `
SELECT
  SUBSTR(\`timestamp\`, 1, 10) AS d,
  SUM(CASE
    WHEN (\`message_is_error\` IS NOT NULL AND \`message_is_error\` != 0)
      OR (\`message_details_exit_code\` IS NOT NULL AND \`message_details_exit_code\` != 0)
    THEN 1 ELSE 0
  END) AS high_cnt,
  SUM(CASE
    WHEN NOT (
      (\`message_is_error\` IS NOT NULL AND \`message_is_error\` != 0)
      OR (\`message_details_exit_code\` IS NOT NULL AND \`message_details_exit_code\` != 0)
    )
    AND LOWER(CAST(\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
    THEN 1 ELSE 0
  END) AS medium_cnt,
  SUM(CASE
    WHEN NOT (
      (\`message_is_error\` IS NOT NULL AND \`message_is_error\` != 0)
      OR (\`message_details_exit_code\` IS NOT NULL AND \`message_details_exit_code\` != 0)
    )
    AND NOT (
      LOWER(CAST(\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
    )
    AND \`message_tool_name\` IS NOT NULL AND \`message_tool_name\` != ''
    THEN 1 ELSE 0
  END) AS low_cnt
FROM agent_sessions_logs
WHERE LENGTH(\`timestamp\`) >= 10 AND SUBSTR(\`timestamp\`, 1, 10) >= ? AND SUBSTR(\`timestamp\`, 1, 10) <= ?
GROUP BY d
ORDER BY d
`;

const TOP_USERS_SQL = `
SELECT
  COALESCE(
    NULLIF(origin_account_id, ''),
    NULLIF(last_account_id, ''),
    NULLIF(delivery_context_account_id, ''),
    '(未标识)'
  ) AS name,
  COUNT(*) AS cnt
FROM agent_sessions
WHERE started_at >= ? AND started_at < ?
GROUP BY COALESCE(
  NULLIF(origin_account_id, ''),
  NULLIF(last_account_id, ''),
  NULLIF(delivery_context_account_id, ''),
  '(未标识)'
)
ORDER BY cnt DESC
LIMIT 10
`;

const TOP_DEVICES_SQL = `
SELECT
  CONCAT(
    COALESCE(CAST(channel AS CHAR), ''),
    ' / ',
    COALESCE(CAST(last_to AS CHAR), '')
  ) AS name,
  COUNT(*) AS cnt
FROM agent_sessions
WHERE updated_at >= ? AND updated_at < ?
  AND (channel IS NOT NULL AND channel != '' OR last_to IS NOT NULL AND last_to != '')
GROUP BY name
ORDER BY cnt DESC
LIMIT 10
`;

/**
 * 高频风险标识 TOP：仅 `agent_sessions_logs`。
 * 含 JSON 回退：从 `log_attributes` 取 `$.message.toolName`（需 Doris 支持 GET_JSON_STRING + CAST(variant)）。
 */
const TOP_RISK_OPS_SQL_WITH_JSON = `
SELECT derived.tool_label AS name, COUNT(*) AS cnt
FROM (
  SELECT
    COALESCE(
      NULLIF(TRIM(l.\`message_tool_name\`), ''),
      NULLIF(TRIM(GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.message.toolName')), ''),
      CASE
        WHEN l.\`message_details_exit_code\` IS NOT NULL AND l.\`message_details_exit_code\` != 0
        THEN CONCAT('退出码·', CAST(l.\`message_details_exit_code\` AS CHAR))
        ELSE NULL
      END,
      CASE
        WHEN l.\`message_is_error\` IS NOT NULL AND l.\`message_is_error\` != 0
        THEN '工具结果·错误'
        ELSE NULL
      END,
      CASE
        WHEN LOWER(CAST(l.\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
        THEN CONCAT('助手停止·', CAST(l.\`message_stop_reason\` AS CHAR))
        ELSE NULL
      END,
      '(未分类)'
    ) AS tool_label
  FROM agent_sessions_logs l
  WHERE EXISTS (
    SELECT 1 FROM agent_sessions s
    WHERE s.session_id = l.\`sessionId\`
    AND s.started_at >= ? AND s.started_at < ?
  )
  AND (
    (l.\`message_is_error\` IS NOT NULL AND l.\`message_is_error\` != 0)
    OR (l.\`message_details_exit_code\` IS NOT NULL AND l.\`message_details_exit_code\` != 0)
    OR LOWER(CAST(l.\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
  )
) AS derived
GROUP BY derived.tool_label
ORDER BY cnt DESC
LIMIT 10
`;

/** 与 WITH_JSON 相同逻辑，但不读 log_attributes（兼容不支持 JSON 的环境） */
const TOP_RISK_OPS_SQL = `
SELECT derived.tool_label AS name, COUNT(*) AS cnt
FROM (
  SELECT
    COALESCE(
      NULLIF(TRIM(l.\`message_tool_name\`), ''),
      CASE
        WHEN l.\`message_details_exit_code\` IS NOT NULL AND l.\`message_details_exit_code\` != 0
        THEN CONCAT('退出码·', CAST(l.\`message_details_exit_code\` AS CHAR))
        ELSE NULL
      END,
      CASE
        WHEN l.\`message_is_error\` IS NOT NULL AND l.\`message_is_error\` != 0
        THEN '工具结果·错误'
        ELSE NULL
      END,
      CASE
        WHEN LOWER(CAST(l.\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
        THEN CONCAT('助手停止·', CAST(l.\`message_stop_reason\` AS CHAR))
        ELSE NULL
      END,
      '(未分类)'
    ) AS tool_label
  FROM agent_sessions_logs l
  WHERE EXISTS (
    SELECT 1 FROM agent_sessions s
    WHERE s.session_id = l.\`sessionId\`
    AND s.started_at >= ? AND s.started_at < ?
  )
  AND (
    (l.\`message_is_error\` IS NOT NULL AND l.\`message_is_error\` != 0)
    OR (l.\`message_details_exit_code\` IS NOT NULL AND l.\`message_details_exit_code\` != 0)
    OR LOWER(CAST(l.\`message_stop_reason\` AS CHAR)) IN ('error','max_tokens','content_filter','refusal','model_error')
  )
) AS derived
GROUP BY derived.tool_label
ORDER BY cnt DESC
LIMIT 10
`;

/**
 * 填充近 7 日（含今天）日期键，合并 SQL 结果
 * @param {string} startDayStr YYYY-MM-DD
 * @param {string} endDayStr YYYY-MM-DD
 * @param {Record<string, number>} map
 */
function fillDays7(startDayStr, endDayStr, map) {
  const out = [];
  const start = new Date(startDayStr + "T00:00:00");
  const end = new Date(endDayStr + "T00:00:00");
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, value: map[key] ?? 0 });
  }
  return out;
}

/**
 * @param {object[]} rows
 */
function rowsToDayMap(rows, keyField, valField) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const r of rows) {
    const k = r[keyField];
    if (k == null) continue;
    let ks;
    if (k instanceof Date) {
      ks = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, "0")}-${String(k.getDate()).padStart(2, "0")}`;
    } else {
      ks = String(k);
      if (ks.includes("T")) ks = ks.slice(0, 10);
      if (ks.length >= 10) ks = ks.slice(0, 10);
    }
    m[ks] = Number(r[valField]) || 0;
  }
  return m;
}

/**
 * 审计仪表盘全量指标（供 GET /api/agent-sessions-audit-overview）
 */
export async function queryAuditDashboardMetrics() {
  const b = computeBounds();
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    const [[todayW]] = await conn.query(WINDOW_STATS_SQL, [
      b.todayStart,
      b.todayEnd,
      b.todayStart,
      b.todayEnd,
      b.todayStart,
      b.todayEnd,
      b.todayStart,
      b.todayEnd,
    ]);
    const [[weekW]] = await conn.query(WINDOW_STATS_SQL, [
      b.weekStart,
      b.weekEnd,
      b.weekStart,
      b.weekEnd,
      b.weekStart,
      b.weekEnd,
      b.weekStart,
      b.weekEnd,
    ]);
    const [[monthW]] = await conn.query(WINDOW_STATS_SQL, [
      b.monthStart,
      b.monthEnd,
      b.monthStart,
      b.monthEnd,
      b.monthStart,
      b.monthEnd,
      b.monthStart,
      b.monthEnd,
    ]);

    const [[riskAgg]] = await conn.query(RISK_TOTALS_SQL);
    const [[riskSess]] = await conn.query(RISK_SESSION_COUNT_SQL, [b.monthStart, b.monthEnd]);
    const [[monthSessions]] = await conn.query(SESSION_TOTAL_MONTH_SQL, [b.monthStart, b.monthEnd]);

    const [[online]] = await conn.query(REALTIME_ONLINE_SQL, [b.fiveMinAgo]);
    const [[abort24]] = await conn.query(REALTIME_ABORT_SQL, [b.day24hAgo]);

    const [sessTrendRows] = await conn.query(TREND_SESSIONS_7D_SQL, [b.trendStart, b.trendEnd]);
    const trendStartDay = new Date(b.trendStart);
    const trendStartStr = `${trendStartDay.getFullYear()}-${String(trendStartDay.getMonth() + 1).padStart(2, "0")}-${String(trendStartDay.getDate()).padStart(2, "0")}`;
    const trendEndDay = new Date(b.now);
    const trendEndStr = `${trendEndDay.getFullYear()}-${String(trendEndDay.getMonth() + 1).padStart(2, "0")}-${String(trendEndDay.getDate()).padStart(2, "0")}`;

    const sessMap = rowsToDayMap(/** @type {any[]} */ (sessTrendRows), "d", "cnt");
    const sessions7d = fillDays7(trendStartStr, trendEndStr, sessMap).map((x) => ({
      dateLabel: x.day.slice(5),
      day: x.day,
      sessions: x.value,
    }));

    let risk7d = [];
    try {
      const [riskTrendRows] = await conn.query(TREND_RISK_7D_SQL, [trendStartStr, trendEndStr]);
      /** @type {Record<string, { h: number; m: number; l: number }>} */
      const rm = {};
      for (const r of /** @type {any[]} */ (riskTrendRows)) {
        let dk = String(r.d ?? "").slice(0, 10);
        if (dk.length < 10) continue;
        rm[dk] = {
          h: Number(r.high_cnt) || 0,
          m: Number(r.medium_cnt) || 0,
          l: Number(r.low_cnt) || 0,
        };
      }
      risk7d = fillDays7(trendStartStr, trendEndStr, {}).map((x) => {
        const v = rm[x.day] ?? { h: 0, m: 0, l: 0 };
        return {
          dateLabel: x.day.slice(5),
          day: x.day,
          high: v.h,
          medium: v.m,
          low: v.l,
          total: v.h + v.m + v.l,
        };
      });
    } catch {
      risk7d = sessions7d.map((s) => ({
        dateLabel: s.dateLabel,
        day: s.day,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      }));
    }

    const [topUsers] = await conn.query(TOP_USERS_SQL, [b.monthStart, b.monthEnd]);
    const [topDevices] = await conn.query(TOP_DEVICES_SQL, [b.monthStart, b.monthEnd]);
    /** @type {any[]} */
    let topRiskOps;
    try {
      [topRiskOps] = await conn.query(TOP_RISK_OPS_SQL_WITH_JSON, [b.monthStart, b.monthEnd]);
    } catch {
      [topRiskOps] = await conn.query(TOP_RISK_OPS_SQL, [b.monthStart, b.monthEnd]);
    }

    const risk = normalizeAggRow(riskAgg);
    const rs = Number(riskSess?.cnt ?? 0);
    const ms = Number(monthSessions?.c ?? 0);
    const riskSessionRatio = ms > 0 ? rs / ms : 0;

    const pieRisk = [
      { name: "高风险操作", value: Number(risk.risk_high) || 0, fill: "#ef4444" },
      { name: "中风险操作", value: Number(risk.risk_medium) || 0, fill: "#f59e0b" },
      { name: "低风险操作", value: Number(risk.risk_low) || 0, fill: "#0ea5e9" },
    ];

    return {
      generatedAt: b.now,
      bounds: {
        todayStart: b.todayStart,
        weekStart: b.weekStart,
        monthStart: b.monthStart,
      },
      windows: {
        today: normalizeAggRow(todayW),
        week: normalizeAggRow(weekW),
        month: normalizeAggRow(monthW),
      },
      risk: {
        high: Number(risk.risk_high) || 0,
        medium: Number(risk.risk_medium) || 0,
        low: Number(risk.risk_low) || 0,
        riskSessionCount: rs,
        sessionsInMonth: ms,
        riskSessionRatio,
      },
      realtime: {
        onlineSessions: Number(online?.c) || 0,
        abnormalDisconnectSessions: Number(abort24?.c) || 0,
      },
      trends: {
        sessions7d,
        risk7d,
      },
      tops: {
        users: Array.isArray(topUsers) ? topUsers.map((r) => normalizeAggRow(r)) : [],
        devices: Array.isArray(topDevices) ? topDevices.map((r) => normalizeAggRow(r)) : [],
        riskOps: Array.isArray(topRiskOps) ? topRiskOps.map((r) => normalizeAggRow(r)) : [],
      },
      pieRisk,
      legend: {
        windows:
          "会话总数按 started_at；活跃会话按 updated_at；用户/设备为窗口内去重。风险条数为日志行级 SQL 近似（与前端「风险感知」启发式可能不完全一致）。",
        realtime: "在线：近 5 分钟有更新且未结束(ended_at 为空或晚于当前)；异常断开：近 24 小时 aborted_last_run 非 0。",
        topRiskOps:
          "高频风险榜仅查询 agent_sessions_logs，并与本月新建会话 EXISTS 关联。标识名：message_tool_name →（若支持）log_attributes $.message.toolName → 退出码/工具错误/助手停止原因。",
      },
    };
  } finally {
    await conn.end();
  }
}