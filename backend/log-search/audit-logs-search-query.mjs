/**
 * audit_logs 通用搜索（配置审计等同源表，字段为 event_time + log_attributes variant）
 */
import mysql from "mysql2/promise";
import { getDorisConfig, qualifyOtelTable } from "../agentSessionsQuery.mjs";
import { buildSimpleOrOfAndGroups, pushTextPredicateForColumn } from "./log-query-text.mjs";

const MAX_LIMIT = 500;
const MAX_OFFSET = 5000;

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "bigint") out[k] = Number(out[k]);
  }
  return out;
}

function toDateTimeParam(iso) {
  return String(iso ?? "")
    .replace("T", " ")
    .slice(0, 19);
}

/**
 * @param {{
 *   startIso: string;
 *   endIso: string;
 *   q?: string;
 *   sessionId?: string;
 *   traceId?: string;
 *   requestId?: string;
 *   limit?: number;
 *   offset?: number;
 *   sortKey?: string;
 *   sortDir?: string;
 * }} p
 */
export async function queryAuditLogsSearch(p) {
  const startIso = String(p.startIso ?? "").trim();
  const endIso = String(p.endIso ?? "").trim();
  if (!startIso || !endIso) throw new Error("missing startIso or endIso");

  const limit = Math.min(Math.max(Number(p.limit) || 100, 1), MAX_LIMIT);
  const offset = Math.min(Math.max(Number(p.offset) || 0, 0), MAX_OFFSET);
  const q = String(p.q ?? "").trim();
  const traceId = String(p.traceId ?? "").trim();
  const requestId = String(p.requestId ?? "").trim();
  const sessionId = String(p.sessionId ?? "").trim();

  const sortKey = String(p.sortKey ?? "time").toLowerCase();
  const sortDir = String(p.sortDir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const sortMap = {
    time: "event_time",
    timestamp: "event_time",
    level:
      "GET_JSON_STRING(CAST(log_attributes AS STRING), '$.level')",
    subsystem:
      "GET_JSON_STRING(CAST(log_attributes AS STRING), '$.source')",
  };
  const orderCol = sortMap[sortKey] || "event_time";

  const params = [toDateTimeParam(startIso), toDateTimeParam(endIso)];
  const where = ["event_time >= ?", "event_time <= ?"];

  if (q) {
    const attrLower = "LOWER(CONCAT(COALESCE(CAST(`log_attributes` AS STRING), ''), ''))";
    const { sql: qsql, params: qp } = buildSimpleOrOfAndGroups(q, (term, ps) =>
      pushTextPredicateForColumn(attrLower, term, ps)
    );
    if (qsql) {
      where.push(qsql);
      params.push(...qp);
    }
  }

  if (traceId) {
    where.push(
      `(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.trace_id') = ?
        OR GET_JSON_STRING(CAST(log_attributes AS STRING), '$.traceId') = ?)`
    );
    params.push(traceId, traceId);
  }

  if (requestId) {
    where.push(
      `(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.request_id') = ?
        OR GET_JSON_STRING(CAST(log_attributes AS STRING), '$.requestId') = ?)`
    );
    params.push(requestId, requestId);
  }

  if (sessionId) {
    where.push(
      `(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.session_id') = ?
        OR GET_JSON_STRING(CAST(log_attributes AS STRING), '$.sessionId') = ?)`
    );
    params.push(sessionId, sessionId);
  }

  const whereSql = where.join(" AND ");
  const auditTable = qualifyOtelTable("audit_logs");
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    const [[countRow]] = await conn.query(
      `SELECT COUNT(*) AS c FROM ${auditTable} WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.c) || 0;

    const listSql = `
SELECT id, event_time, log_attributes
FROM ${auditTable}
WHERE ${whereSql}
ORDER BY ${orderCol} ${sortDir}
LIMIT ? OFFSET ?
`;
    const [rawRows] = await conn.query(listSql, [...params, limit, offset]);
    const rows = Array.isArray(rawRows) ? rawRows.map((r) => normalizeRow(r)) : [];

    return { total, limit, offset, rows };
  } finally {
    await conn.end();
  }
}
