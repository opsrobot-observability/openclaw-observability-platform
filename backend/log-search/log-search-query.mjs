/**
 * 日志查询：Doris `otel` 下 `agent_sessions_logs` 主表或日表（如 `agent_sessions_logs_20260324`），左连 `agent_sessions`
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";
import { pushAgentFieldFilter } from "./agent-field-filter.mjs";
import { preprocessAgentSearchQuery, applyExtractedClauses } from "./log-query-advanced.mjs";
import { buildAgentTextWhereParts } from "./log-query-text.mjs";

const MAX_LIMIT = 500;
const MAX_OFFSET = 5000;
/** 与前端 fieldFilters JSON 一致，多条件 AND */
const MAX_FIELD_FILTERS = 32;

/**
 * @param {unknown} raw
 * @returns {{ key: string; value: string; exclude: boolean }[]}
 */
function normalizeFieldFiltersInput(p) {
  const raw = p?.fieldFilters;
  /** @type {unknown[]} */
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) arr = j;
    } catch {
      /* ignore */
    }
  }
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (item);
    const key = String(o.key ?? "").trim();
    if (!key) continue;
    const val = o.value;
    const value = val === undefined || val === null ? "" : String(val);
    const ex = o.exclude;
    const exclude = ex === true || ex === 1 || String(ex).toLowerCase() === "true";
    out.push({ key, value, exclude });
    if (out.length >= MAX_FIELD_FILTERS) break;
  }
  if (out.length > 0) return out;
  const k = String(p?.fieldFilterKey ?? "").trim();
  if (k) {
    const v = p?.fieldFilterValue === undefined || p?.fieldFilterValue === null ? "" : String(p.fieldFilterValue);
    return [{ key: k, value: v, exclude: false }];
  }
  return [];
}

/**
 * @param {string[]} where
 * @param {unknown[]} params
 * @param {string} key
 * @param {string} value
 * @param {string} concatBlob
 * @param {boolean} exclude
 */
function pushAgentFieldFilterMaybeNegated(where, params, key, value, concatBlob, exclude) {
  const i0 = where.length;
  pushAgentFieldFilter(where, params, key, value, concatBlob);
  if (!exclude) return;
  const n = where.length - i0;
  if (n <= 0) return;
  const slice = where.splice(i0, n);
  where.push(n === 1 ? `NOT (${slice[0]})` : `NOT (${slice.join(" AND ")})`);
}

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
 *   sessionId?: string;
 *   traceId?: string;
 *   requestId?: string;
 *   levels?: string;
 *   logCategory?: string;
 *   sortKey?: string;
 *   sortDir?: string;
 *   error?: "all" | "yes" | "no";
 *   limit?: number;
 *   offset?: number;
 *   logTable?: string;
 *   fieldFilterKey?: string;
 *   fieldFilterValue?: string;
 *   fieldFilters?: unknown;
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

  const sessionIdF = String(p.sessionId ?? "").trim();
  const traceIdF = String(p.traceId ?? "").trim();
  const requestIdF = String(p.requestId ?? "").trim();
  const levelsRaw = String(p.levels ?? "").trim();
  const logCategory = String(p.logCategory ?? "").trim().toLowerCase();
  const sortKeyRaw = String(p.sortKey ?? "timestamp").trim().toLowerCase();
  const sortDirRaw = String(p.sortDir ?? "desc").trim().toLowerCase();
  const orderDir = sortDirRaw === "asc" ? "ASC" : "DESC";

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
  if (sessionIdF) {
    where.push("l.`session_id` = ?");
    params.push(sessionIdF);
  }
  if (traceIdF) {
    where.push(`(
      GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.trace_id') = ?
      OR GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.traceId') = ?
    )`);
    params.push(traceIdF, traceIdF);
  }
  if (requestIdF) {
    where.push(`(
      GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.request_id') = ?
      OR GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.requestId') = ?
    )`);
    params.push(requestIdF, requestIdF);
  }

  const levels = levelsRaw
    .split(/[, ]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (levels.length > 0) {
    const hasErr = levels.some((l) => l === "error" || l === "fatal");
    const hasNonErr = levels.some((l) => ["trace", "debug", "info", "warn"].includes(l));
    if (hasErr && !hasNonErr) {
      where.push("l.`message_is_error` = 1");
    } else if (hasNonErr && !hasErr) {
      where.push("(l.`message_is_error` IS NULL OR l.`message_is_error` = 0)");
    }
  }

  if (logCategory === "skill") {
    where.push("TRIM(COALESCE(l.`message_tool_name`, '')) <> ''");
  } else if (logCategory === "channel") {
    const ch = String(p.channel ?? "").trim();
    if (ch && ch !== "全部") {
      where.push("s.`channel` = ?");
      params.push(ch);
    }
  } else if (logCategory === "gateway") {
    where.push("1=0");
  }

  if (error === "yes") {
    where.push("l.`message_is_error` = 1");
  } else if (error === "no") {
    where.push("(l.`message_is_error` IS NULL OR l.`message_is_error` = 0)");
  }

  const concatBlob = `LOWER(CONCAT_WS(' ',
          COALESCE(l.\`type\`,''),
          COALESCE(l.\`provider\`,''),
          COALESCE(l.\`model_id\`,''),
          COALESCE(l.\`message_model\`,''),
          COALESCE(l.\`message_role\`,''),
          COALESCE(l.\`message_tool_name\`,''),
          COALESCE(l.\`session_id\`,''),
          COALESCE(l.\`message_id\`,''),
          COALESCE(l.\`message_parent_id\`,''),
          COALESCE(s.\`agent_name\`,''),
          COALESCE(CAST(l.\`log_attributes\` AS STRING),'')))`;

  const fieldFilters = normalizeFieldFiltersInput(p);
  for (const { key, value, exclude } of fieldFilters) {
    pushAgentFieldFilterMaybeNegated(where, params, key, value, concatBlob, exclude);
  }

  const { remainder: textQ, clauses: queryClauses, splStripped } = preprocessAgentSearchQuery(q);
  applyExtractedClauses(where, params, queryClauses, concatBlob);
  const textOr = buildAgentTextWhereParts(textQ, concatBlob, params);
  if (textOr.length > 0) {
    where.push(`(${textOr.join(" OR ")})`);
  }

  const sortMap = {
    time: "l.`timestamp`",
    timestamp: "l.`timestamp`",
    level: "l.`message_is_error`",
    subsystem: "l.`type`",
    type: "l.`type`",
    agent: "s.`agent_name`",
    agent_name: "s.`agent_name`",
  };
  const orderByCol = sortMap[sortKeyRaw] || "l.`timestamp`";

  const whereSql = where.join(" AND ");

  const baseFrom = `
FROM \`${logTable.replace(/`/g, "")}\` l
LEFT JOIN agent_sessions s ON s.session_id = l.\`session_id\`
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
  l.\`message_id\`,
  l.\`session_id\`,
  l.\`timestamp\`,
  l.\`type\`,
  l.\`version\`,
  l.\`provider\`,
  l.\`model_id\`,
  l.\`message_model\`,
  l.\`message_role\`,
  l.\`message_tool_name\`,
  l.\`message_is_error\`,
  l.\`message_parent_id\`,
  l.\`log_attributes\`,
  s.\`agent_name\`,
  s.\`channel\`
${baseFrom}
ORDER BY ${orderByCol} ${orderDir}
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
      sortKey: sortKeyRaw,
      sortDir: sortDirRaw,
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
        ...(splStripped ? { splStripped } : {}),
      },
      rows,
    };
  } finally {
    await conn.end();
  }
}