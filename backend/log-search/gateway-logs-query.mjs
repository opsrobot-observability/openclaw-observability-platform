/**
 * gateway_logs 查询（见 scripts/init-doris-schema.sql）
 */
import mysql from "mysql2/promise";
import { getDorisConfig, qualifyOtelTable } from "../agentSessionsQuery.mjs";
import { buildSimpleOrOfAndGroups, pushTextPredicateForColumn } from "./log-query-text.mjs";
import { pushGatewayFieldFilter } from "./gateway-field-filter.mjs";

const MAX_LIMIT = 500;
const MAX_OFFSET = 5000;

/** variant CAST AS STRING 在部分 Doris/StarRocks 仍推断 Nullable；CONCAT(COALESCE(…),'') 再 lower 可避免存储层 lower(Nullable) 报错 */
const GW_ATTR_LOWER_EXPR = "LOWER(CONCAT(COALESCE(CAST(`log_attributes` AS STRING), ''), ''))";
const GW_MOD_LOWER_EXPR = "LOWER(CONCAT(COALESCE(`module`, ''), ''))";
const GW_LEVEL_LOWER_EXPR = "LOWER(CONCAT(COALESCE(TRIM(IFNULL(`level`, '')), ''), ''))";
/** 与前端 fieldFilters JSON 一致，多条件 AND */
const MAX_FIELD_FILTERS = 32;

/**
 * @param {unknown} raw
 * @returns {{ key: string; value: string; exclude: boolean }[]}
 */
function normalizeGatewayFieldFiltersInput(p) {
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
 * @param {boolean} exclude
 */
function pushGatewayFieldFilterMaybeNegated(where, params, key, value, exclude) {
  const i0 = where.length;
  pushGatewayFieldFilter(where, params, key, value);
  if (!exclude) return;
  const n = where.length - i0;
  if (n <= 0) return;
  const slice = where.splice(i0, n);
  where.push(n === 1 ? `NOT (${slice[0]})` : `NOT (${slice.join(" AND ")})`);
}

/**
 * @param {string[]} levelList
 */
function expandGatewayLevels(levelList) {
  const seen = new Set();
  for (const raw of levelList) {
    const l = String(raw ?? "").trim().toLowerCase();
    if (!l) continue;
    seen.add(l);
  }
  return Array.from(seen);
}

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
 *   levels?: string;
 *   module?: string;
 *   sessionId?: string;
 *   traceId?: string;
 *   requestId?: string;
 *   limit?: number;
 *   offset?: number;
 *   sortKey?: string;
 *   sortDir?: string;
 *   fieldFilterKey?: string;
 *   fieldFilterValue?: string;
 *   fieldFilters?: unknown;
 * }} p
 */
export async function queryGatewayLogsSearch(p) {
  const startIso = String(p.startIso ?? "").trim();
  const endIso = String(p.endIso ?? "").trim();
  if (!startIso || !endIso) throw new Error("missing startIso or endIso");

  const limit = Math.min(Math.max(Number(p.limit) || 100, 1), MAX_LIMIT);
  const offset = Math.min(Math.max(Number(p.offset) || 0, 0), MAX_OFFSET);
  const q = String(p.q ?? "").trim();
  const moduleF = String(p.module ?? "").trim();
  const levelsStr = String(p.levels ?? "").trim();
  const levelList = levelsStr
    ? levelsStr
        .split(/[, ]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const sortKey = String(p.sortKey ?? "time").toLowerCase();
  const sortDir = String(p.sortDir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const sortMap = {
    time: "event_time",
    timestamp: "event_time",
    level: "`level`",
    subsystem: "`module`",
    module: "`module`",
  };
  const orderCol = sortMap[sortKey] || "event_time";

  const params = [toDateTimeParam(startIso), toDateTimeParam(endIso)];
  const where = ["event_time >= ?", "event_time <= ?"];

  if (moduleF) {
    where.push("`module` = ?");
    params.push(moduleF);
  }

  if (levelList.length > 0) {
    const expanded = expandGatewayLevels(levelList);
    if (expanded.length > 0) {
      const ph = expanded.map(() => "?").join(",");
      where.push(`${GW_LEVEL_LOWER_EXPR} IN (${ph})`);
      params.push(...expanded);
    }
  }

  if (q) {
    const attrLower = GW_ATTR_LOWER_EXPR;
    const modLower = GW_MOD_LOWER_EXPR;
    const { sql: qsql, params: qp } = buildSimpleOrOfAndGroups(q, (term, ps) => {
      const a = pushTextPredicateForColumn(attrLower, term, ps);
      const b = pushTextPredicateForColumn(modLower, term, ps);
      if (!a || !b) return undefined;
      return `(${a} OR ${b})`;
    });
    if (qsql) {
      where.push(qsql);
      params.push(...qp);
    }
  }

  const sessionId = String(p.sessionId ?? "").trim();
  const traceId = String(p.traceId ?? "").trim();
  const requestId = String(p.requestId ?? "").trim();
  if (sessionId) {
    where.push(
      `(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.session_id') = ?
        OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.sessionId') = ?)`
    );
    params.push(sessionId, sessionId);
  }
  if (traceId) {
    where.push(
      `(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.trace_id') = ?
        OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.traceId') = ?)`
    );
    params.push(traceId, traceId);
  }
  if (requestId) {
    where.push(
      `(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.request_id') = ?
        OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.requestId') = ?)`
    );
    params.push(requestId, requestId);
  }

  const fieldFilters = normalizeGatewayFieldFiltersInput(p);
  for (const { key, value, exclude } of fieldFilters) {
    pushGatewayFieldFilterMaybeNegated(where, params, key, value, exclude);
  }

  const whereSql = where.join(" AND ");
  const gatewayTable = qualifyOtelTable("gateway_logs");
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    const [[countRow]] = await conn.query(
      `SELECT COUNT(*) AS c FROM ${gatewayTable} WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.c) || 0;

    const listSql = `
SELECT id, event_time, module, level, log_attributes
FROM ${gatewayTable}
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
