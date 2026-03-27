/**
 * Doris `otel.agent_sessions` 查询（供 Vite 开发中间件或独立脚本复用）
 */
import mysql from "mysql2/promise";
import { computeSessionAggregatesFromLogRows } from "../src/lib/sessionAudit.js";

export function getDorisConfig() {
  return {
    host: process.env.DORIS_HOST ?? "127.0.0.1",
    port: Number(process.env.DORIS_PORT ?? 9030),
    user: process.env.DORIS_USER ?? "root",
    password: process.env.DORIS_PASSWORD ?? "",
    database: process.env.DORIS_DATABASE ?? "otel",
  };
}

const SELECT_SQL = `
SELECT
  session_id,
  agent_name,
  log_attributes,
  session_key,
  started_at,
  updated_at,
  ended_at,
  display_name,
  system_sent,
  aborted_last_run,
  chat_type,
  channel,
  group_id,
  origin_label,
  origin_provider,
  origin_surface,
  origin_chat_type,
  origin_from,
  origin_to,
  origin_account_id,
  delivery_context_channel,
  delivery_context_to,
  delivery_context_account_id,
  last_channel,
  last_to,
  last_account_id
FROM agent_sessions
ORDER BY updated_at DESC
`;

/** Doris IN 子句分批，避免过长 */
const LOG_SESSIONS_CHUNK = 400;

/**
 * @param {unknown} conn mysql2 connection
 * @param {string[]} sessionIds
 * @returns {Promise<Map<string, object[]>>}
 */
async function fetchLogsGroupedBySession(conn, sessionIds) {
  const ids = [...new Set(sessionIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  /** @type {Map<string, object[]>} */
  const bySession = new Map();
  for (let i = 0; i < ids.length; i += LOG_SESSIONS_CHUNK) {
    const chunk = ids.slice(i, i + LOG_SESSIONS_CHUNK);
    if (chunk.length === 0) continue;
    const ph = chunk.map(() => "?").join(",");
    const sql = `SELECT * FROM agent_sessions_logs WHERE \`sessionId\` IN (${ph}) ORDER BY \`sessionId\`, \`timestamp\` ASC`;
    const [rows] = await conn.query(sql, chunk);
    for (const r of rows) {
      const sid = r.sessionId ?? r.session_id;
      if (sid == null || sid === "") continue;
      const k = String(sid);
      if (!bySession.has(k)) bySession.set(k, []);
      bySession.get(k).push(r);
    }
  }
  return bySession;
}

/**
 * @returns {Promise<object[]>}
 */
export async function queryAgentSessionsRaw() {
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 25000,
  });
  try {
    const [rows] = await conn.query(SELECT_SQL);
    return rows;
  } finally {
    await conn.end();
  }
}

/**
 * 拉取 agent_sessions，并按 agent_sessions_logs 计算总 Token、工具次数、风险分级、网络/文件/exec（与前端详情页启发式一致）。
 * @returns {Promise<object[]>}
 */
export async function queryAgentSessionsRawWithLogTokens() {
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 25000,
  });
  try {
    const [sessions] = await conn.query(SELECT_SQL);
    const sessionIds = sessions.map((s) => s.session_id).filter((s) => s != null && String(s) !== "");
    const bySession = await fetchLogsGroupedBySession(conn, sessionIds);
    return sessions.map((row) => {
      const id = row.session_id != null ? String(row.session_id) : "";
      const logs = id ? bySession.get(id) ?? [] : [];
      const agg = computeSessionAggregatesFromLogRows(logs);
      return {
        ...row,
        total_tokens_from_logs: agg.total_tokens_from_logs,
        tool_use_count: agg.tool_use_count,
        risk_high: agg.risk_high,
        risk_medium: agg.risk_medium,
        risk_low: agg.risk_low,
        network_access_count: agg.network_access_count,
        file_op_count: agg.file_op_count,
        exec_count: agg.exec_count,
      };
    });
  } finally {
    await conn.end();
  }
}

const LOGS_BY_SESSION_SQL = `
SELECT *
FROM agent_sessions_logs
WHERE \`sessionId\` = ?
ORDER BY \`timestamp\` ASC
`;

/**
 * 某会话在 `agent_sessions_logs` 中的全部行（时间序）。
 * @param {string} sessionId
 * @returns {Promise<object[]>}
 */
export async function queryAgentSessionsLogsRaw(sessionId) {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return [];
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 25000,
  });
  try {
    const [rows] = await conn.query(LOGS_BY_SESSION_SQL, [sid]);
    return rows;
  } finally {
    await conn.end();
  }
}

