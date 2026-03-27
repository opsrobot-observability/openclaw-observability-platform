/**
 * 日志查询：Doris `otel` 下 `agent_sessions_logs` 主表或日表（如 `agent_sessions_logs_20260324`），左连 `agent_sessions`
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

const MAX_LIMIT = 500;
const MAX_OFFSET = 5000;

/** 仅允许 otel 内日志表名，防注入 */
export function sanitizeLogTableName(name) {
  const d = String(name ?? "").trim();
  if (!d) return "agent_sessions_logs";
  if (!/^agent_sessions_logs[a-zA-Z0-9_]*$/.test(d)) return "agent_sessions_logs";
  return d;
}

function sortLogTableNames(names) {
  const arr = [...new Set(names.map((x) => String(x).trim()).filter(Boolean))];
  const rest = arr.filter((n) => n !== "agent_sessions_logs").sort((a, b) => b.localeCompare(a));
  return arr.includes("agent_sessions_logs") ? ["agent_sessions_logs", ...rest] : rest.sort((a, b) => b.localeCompare(a));
}

/**
 * 列出 `information_schema` 中当前库下名称以 `agent_sessions_logs` 开头的表（主表 + 日表）
 * @returns {Promise<{ database: string; tables: string[] }>}
 */
export async function listOtelAgentSessionsLogTables() {
  const cfg = getDorisConfig();
  const db = String(cfg.database ?? "otel");
  const conn = await mysql.createConnection({
    ...cfg,
    connectTimeout: 15000,
  });
  try {
    const [rows] = await conn.query(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'agent_sessions_logs%'
       ORDER BY TABLE_NAME DESC`,
      [db]
    );
    const raw = Array.isArray(rows) ? rows.map((r) => String(r.t ?? "").trim()).filter(Boolean) : [];
    const tables = sortLogTableNames(raw.length ? raw : ["agent_sessions_logs"]);
    return { database: db, tables };
  } catch {
    return { database: db, tables: ["agent_sessions_logs"] };
  } finally {
    await conn.end();
  }
}

/** @param {Record<string, unknown>} row */
function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === "bigint") out[k] = Number(v);
  }
  return out;
}

/**
 * @param {{
 *   startIso: string;
 *   endIso: string;
 *   q?: string;
 *   type?: string;
 *   provider?: string;
 *   model?: string;
 *   channel?: string;
 *   agentName?: string;
 *   error?: "all" | "yes" | "no";
 *   limit?: number;
 *   offset?: number;
 *   logTable?: string;
 * }} p
 */
export async function queryAgentSessionsLogsSearch(p) {
  const cfg = getDorisConfig();
  const dbName = String(cfg.database ?? "otel");
  const logTable = sanitizeLogTableName(p.logTable);

  const startIso = String(p.startIso ?? "").trim();
  const endIso = String(p.endIso ?? "").trim();
  if (!startIso || !endIso) throw new Error("missing startIso or endIso");
  if (startIso > endIso) throw new Error("startIso must be <= endIso");

  const limit = Math.min(Math.max(Number(p.limit) || 100, 1), MAX_LIMIT);
  const offset = Math.min(Math.max(Number(p.offset) || 0, 0), MAX_OFFSET);

  const q = String(p.q ?? "").trim();
  const typeF = String(p.type ?? "").trim();
  const providerF = String(p.provider ?? "").trim();
  const modelF = String(p.model ?? "").trim();
  const channelF = String(p.channel ?? "").trim();
  const agentF = String(p.agentName ?? "").trim();
  const error = p.error === "yes" || p.error === "no" ? p.error : "all";

  const params = [startIso, endIso];
  const where = [
    "LENGTH(l.`timestamp`) >= 10",
    "l.`timestamp` >= ?",
    "l.`timestamp` <= ?",
  ];

  if (typeF && typeF !== "全部") {
    where.push("l.`type` = ?");
    params.push(typeF);
  }
  if (providerF && providerF !== "全部") {
    where.push("l.`provider` = ?");
    params.push(providerF);
  }
  if (modelF && modelF !== "全部") {
    where.push(
      "COALESCE(NULLIF(TRIM(l.`model_id`), ''), NULLIF(TRIM(l.`message_model`), ''), '') = ?"
    );
    params.push(modelF);
  }
  if (channelF && channelF !== "全部") {
    where.push("s.`channel` = ?");
    params.push(channelF);
  }
  if (agentF && agentF !== "全部") {
    where.push("COALESCE(NULLIF(TRIM(s.`agent_name`), ''), '') = ?");
    params.push(agentF);
  }
  if (error === "yes") {
    where.push("l.`message_is_error` = 1");
  } else if (error === "no") {
    where.push("(l.`message_is_error` IS NULL OR l.`message_is_error` = 0)");
  }

  if (q) {
    where.push(`(
      LOCATE(
        ?,
        LOWER(CONCAT_WS(' ',
          COALESCE(l.\`type\`,''),
          COALESCE(l.\`provider\`,''),
          COALESCE(l.\`model_id\`,''),
          COALESCE(l.\`message_model\`,''),
          COALESCE(l.\`message_role\`,''),
          COALESCE(l.\`message_tool_name\`,''),
          COALESCE(l.\`sessionId\`,''),
          COALESCE(l.\`id\`,''),
          COALESCE(l.\`parent_id\`,''),
          COALESCE(s.\`agent_name\`,'')
        ))
      ) > 0
    )`);
    params.push(q.toLowerCase());
  }

  const whereSql = where.join(" AND ");

  const baseFrom = `
FROM \`${logTable.replace(/`/g, "")}\` l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE ${whereSql}
`;

  const conn = await mysql.createConnection({
    ...cfg,
    connectTimeout: 30000,
  });

  try {
    const countSql = `SELECT COUNT(*) AS c ${baseFrom}`;
    const [[countRow]] = await conn.query(countSql, params);
    const total = Number(countRow?.c) || 0;

    const listSql = `
SELECT
  l.\`id\`,
  l.\`sessionId\`,
  l.\`timestamp\`,
  l.\`type\`,
  l.\`version\`,
  l.\`provider\`,
  l.\`model_id\`,
  l.\`message_model\`,
  l.\`message_role\`,
  l.\`message_tool_name\`,
  l.\`message_is_error\`,
  l.\`parent_id\`,
  l.\`log_attributes\`,
  s.\`agent_name\`,
  s.\`channel\`
${baseFrom}
ORDER BY l.\`timestamp\` DESC
LIMIT ? OFFSET ?
`;
    const listParams = [...params, limit, offset];
    const [rawRows] = await conn.query(listSql, listParams);
    const rows = Array.isArray(rawRows) ? rawRows.map((r) => normalizeRow(r)) : [];

    const trendSql = `
SELECT SUBSTR(l.\`timestamp\`, 1, 13) AS bucket, COUNT(*) AS cnt
${baseFrom}
GROUP BY SUBSTR(l.\`timestamp\`, 1, 13)
ORDER BY bucket
`;
    const [trendRows] = await conn.query(trendSql, params);
    const trendRaw = Array.isArray(trendRows) ? trendRows.map((r) => normalizeRow(r)) : [];

    /** @type {string[]} */
    const types = [];
    const providers = [];
    const channels = [];
    const agents = [];
    const models = [];

    const [distinctTypes] = await conn.query(
      `SELECT DISTINCT l.\`type\` AS v ${baseFrom} AND l.\`type\` IS NOT NULL AND TRIM(l.\`type\`) <> '' ORDER BY v LIMIT 200`,
      params
    );
    const [distinctProv] = await conn.query(
      `SELECT DISTINCT l.\`provider\` AS v ${baseFrom} AND l.\`provider\` IS NOT NULL AND TRIM(l.\`provider\`) <> '' ORDER BY v LIMIT 200`,
      params
    );
    const [distinctCh] = await conn.query(
      `SELECT DISTINCT s.\`channel\` AS v ${baseFrom} AND s.\`channel\` IS NOT NULL AND TRIM(s.\`channel\`) <> '' ORDER BY v LIMIT 200`,
      params
    );
    const [distinctAg] = await conn.query(
      `SELECT DISTINCT s.\`agent_name\` AS v ${baseFrom} AND s.\`agent_name\` IS NOT NULL AND TRIM(s.\`agent_name\`) <> '' ORDER BY v LIMIT 200`,
      params
    );
    const [distinctModels] = await conn.query(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(l.\`model_id\`), ''), NULLIF(TRIM(l.\`message_model\`), ''), '') AS v
      ${baseFrom}
      AND LENGTH(TRIM(COALESCE(NULLIF(TRIM(l.\`model_id\`), ''), NULLIF(TRIM(l.\`message_model\`), ''), ''))) > 0
      ORDER BY v LIMIT 200`,
      params
    );

    for (const r of Array.isArray(distinctTypes) ? distinctTypes : []) {
      if (r?.v != null && String(r.v).trim()) types.push(String(r.v));
    }
    for (const r of Array.isArray(distinctProv) ? distinctProv : []) {
      if (r?.v != null && String(r.v).trim()) providers.push(String(r.v));
    }
    for (const r of Array.isArray(distinctCh) ? distinctCh : []) {
      if (r?.v != null && String(r.v).trim()) channels.push(String(r.v));
    }
    for (const r of Array.isArray(distinctAg) ? distinctAg : []) {
      if (r?.v != null && String(r.v).trim()) agents.push(String(r.v));
    }
    for (const r of Array.isArray(distinctModels) ? distinctModels : []) {
      if (r?.v != null && String(r.v).trim()) models.push(String(r.v));
    }

    return {
      source: `${dbName}.${logTable} + ${dbName}.agent_sessions`,
      database: dbName,
      logTable,
      legend:
        `当前日志库表：\`${dbName}\`.\`${logTable}\`（主表或按日分表）。按 timestamp 字符串区间筛选；关键字在多列拼接结果中 LOCATE；左连 agent_sessions 取 channel、agent_name。`,
      total,
      limit,
      offset,
      trend: trendRaw.map((r) => ({
        bucket: String(r.bucket ?? ""),
        count: Number(r.cnt) || 0,
      })),
      meta: {
        types,
        providers,
        channels,
        agents,
        models,
      },
      rows,
    };
  } finally {
    await conn.end();
  }
}