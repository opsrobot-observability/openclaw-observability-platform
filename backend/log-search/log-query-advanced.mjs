/**
 * 条件检索扩展：SPL 管道剥离、字段:值 / 字段.keyword、数值范围 [a TO b]，
 * 与 log-query-text 全文 DNF 组合为 AND。
 */
import { pushAgentFieldFilter } from "./agent-field-filter.mjs";
import { pushTextPredicateForColumn } from "./log-query-text.mjs";

/** 与 ALL_COLUMN_DEF.key 一致，小写别名 */
const FIELD_ALIASES = new Map([
  ["requestid", "requestId"],
  ["request_id", "requestId"],
  ["session_id", "session"],
  ["trace_id", "trace"],
  ["agent_name", "agent"],
  ["agentname", "agent"],
  ["message_role", "messageRole"],
  ["tool_name", "toolName"],
  ["toolname", "toolName"],
  ["message_id", "messageId"],
  ["parent_id", "messageParentId"],
  ["message_parent_id", "messageParentId"],
  ["usage_input", "usageInput"],
  ["usage_output", "usageOutput"],
  ["exit_code", "messageDetailsExitCode"],
  ["thinking_level", "thinkingLevel"],
  ["row_id", "rowId"],
  ["module", "module"],
]);

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function mapQueryFieldName(raw) {
  const s = String(raw || "").trim();
  const base = s.replace(/\.keyword$/i, "").trim();
  if (!base) return null;
  const low = base.toLowerCase();
  if (FIELD_ALIASES.has(low)) return FIELD_ALIASES.get(low);
  /** @type {Set<string>} */
  const known = new Set([
    "time",
    "level",
    "source",
    "sqlId",
    "type",
    "messageRole",
    "toolName",
    "provider",
    "model",
    "channel",
    "version",
    "messageParentId",
    "messageId",
    "messageToolCallId",
    "thinkingLevel",
    "messageDetailsCwd",
    "messageIsError",
    "messageDetailsStatus",
    "messageDetailsExitCode",
    "messageApi",
    "messageStopReason",
    "usageInput",
    "usageOutput",
    "usageCacheRead",
    "usageCacheWrite",
    "usageTotalTokens",
    "subsystem",
    "module",
    "agent",
    "session",
    "trace",
    "requestId",
    "rowId",
    "summary",
    "logAttributes",
  ]);
  if (known.has(base)) return base;
  return null;
}

/** @param {string} name */
function isKeywordField(name) {
  return /\.keyword$/i.test(String(name));
}

/**
 * @param {string} q
 * @returns {{ q: string; splStripped: string | null }}
 */
export function stripSplPipeline(q) {
  const s = String(q ?? "");
  const i = s.indexOf("|");
  if (i < 0) return { q: s, splStripped: null };
  const tail = s.slice(i).trim();
  return { q: s.slice(0, i).trim(), splStripped: tail || null };
}

/**
 * 双引号占位，避免字段语法与全文短语冲突
 * @param {string} s
 */
function maskQuotes(s) {
  const chunks = [];
  const out = s.replace(/"([^"]*)"/g, (_, inner) => {
    const idx = chunks.length;
    chunks.push(inner);
    return `§Q${idx}§`;
  });
  return { masked: out, chunks };
}

function unmask(s, chunks) {
  return s.replace(/§Q(\d+)§/g, (_, d) => {
    const inner = chunks[Number(d)];
    return inner === undefined ? _ : `"${inner}"`;
  });
}

/** @typedef {{ kind: "range"; fieldKey: string; lo: number; hi: number } | { kind: "pair"; fieldKey: string; value: string; exact: boolean }} ExtractedClause */

const NUM_RANGE_KEYS = new Set([
  "thinkingLevel",
  "messageDetailsExitCode",
  "usageInput",
  "usageOutput",
  "usageCacheRead",
  "usageCacheWrite",
  "usageTotalTokens",
  "sqlId",
]);

/**
 * @param {string} qMasked
 * @param {string[]} quoteChunks
 * @returns {{ remainder: string; clauses: ExtractedClause[] }}
 */
function extractClausesFromMasked(qMasked, quoteChunks) {
  let s = qMasked;
  /** @type {ExtractedClause[]} */
  const clauses = [];

  const rangeRe =
    /\b([\w.]+)\s*:\s*\[\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+TO\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*\]/gi;
  s = s.replace(rangeRe, (full, rawName, a, b) => {
    const base = String(rawName).replace(/\.keyword$/i, "").trim();
    const key = mapQueryFieldName(base);
    const lo = Number(a);
    const hi = Number(b);
    if (key && NUM_RANGE_KEYS.has(key) && Number.isFinite(lo) && Number.isFinite(hi)) {
      clauses.push({ kind: "range", fieldKey: key, lo, hi });
      return " ";
    }
    return full;
  });

  const pairRe = /\b([\w.]+)\s*:\s*(§Q\d+§|\S+)/g;
  s = s.replace(pairRe, (full, rawName, valTok) => {
    const exactField = isKeywordField(rawName);
    const base = String(rawName).replace(/\.keyword$/i, "").trim();
    const key = mapQueryFieldName(base);
    if (!key) return full;
    let value = "";
    const qm = /^§Q(\d+)§$/.exec(valTok);
    if (qm) value = quoteChunks[Number(qm[1])] ?? "";
    else value = valTok;
    const exact = exactField || /^§Q\d+§$/.test(valTok);
    clauses.push({ kind: "pair", fieldKey: key, value, exact });
    return " ";
  });

  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^\s*(AND|OR)\s+/i, "").replace(/\s+(AND|OR)\s*$/i, "").trim();
  const remainder = unmask(s, quoteChunks);
  return { remainder, clauses };
}

/**
 * @param {string[]} where
 * @param {unknown[]} params
 * @param {string} key
 * @param {number} lo
 * @param {number} hi
 */
function pushNumericRange(where, params, key, lo, hi) {
  const col = {
    thinkingLevel: "l.`thinking_level`",
    messageDetailsExitCode: "l.`message_details_exit_code`",
    usageInput: "l.`message_usage_input`",
    usageOutput: "l.`message_usage_output`",
    usageCacheRead: "l.`message_usage_cache_read`",
    usageCacheWrite: "l.`message_usage_cache_write`",
    usageTotalTokens: "l.`message_usage_total_tokens`",
    sqlId: "l.`id`",
  }[key];
  if (!col) return;
  where.push(`(CAST(${col} AS DOUBLE) >= ? AND CAST(${col} AS DOUBLE) <= ?)`);
  params.push(lo, hi);
}

/**
 * @param {string[]} where
 * @param {unknown[]} params
 * @param {ExtractedClause} c
 * @param {string} concatBlob
 */
function applyClause(where, params, c, concatBlob) {
  if (c.kind === "range") {
    pushNumericRange(where, params, c.fieldKey, c.lo, c.hi);
    return;
  }
  if (c.kind === "pair") {
    if (c.exact) {
      pushAgentFieldFilter(where, params, c.fieldKey, c.value, concatBlob);
      return;
    }
    const colLower = phraseColumnLowerExpr(c.fieldKey);
    if (colLower) {
      const sql = pushTextPredicateForColumn(colLower, c.value, params);
      if (sql) where.push(sql);
      return;
    }
    pushAgentFieldFilter(where, params, c.fieldKey, c.value, concatBlob);
  }
}

/**
 * @param {string} fieldKey
 * @returns {string | null}
 */
function phraseColumnLowerExpr(fieldKey) {
  // Doris/StarRocks：lower() 对 Nullable(String) 可能报 RUNTIME_ERROR，统一用 IFNULL 归一成普通 String
  switch (fieldKey) {
    case "agent":
      return "LOWER(TRIM(IFNULL(s.`agent_name`, '')))";
    case "session":
      return "LOWER(TRIM(IFNULL(l.`session_id`, '')))";
    case "type":
      return "LOWER(TRIM(IFNULL(l.`type`, '')))";
    case "provider":
      return "LOWER(TRIM(IFNULL(l.`provider`, '')))";
    case "model":
      return "LOWER(IFNULL(COALESCE(NULLIF(TRIM(l.`model_id`), ''), NULLIF(TRIM(l.`message_model`), ''), ''), ''))";
    case "channel":
      return "LOWER(TRIM(IFNULL(s.`channel`, '')))";
    case "messageRole":
      return "LOWER(TRIM(IFNULL(l.`message_role`, '')))";
    case "toolName":
      return "LOWER(TRIM(IFNULL(l.`message_tool_name`, '')))";
    case "summary":
      return null;
    case "subsystem":
      return "LOWER(IFNULL(CONCAT(TRIM(IFNULL(l.`type`, '')), ' ', TRIM(IFNULL(l.`provider`, ''))), ''))";
    case "trace":
      return "LOWER(IFNULL(CONCAT(COALESCE(GET_JSON_STRING(CAST(l.`log_attributes` AS STRING), '$.trace_id'), COALESCE(GET_JSON_STRING(CAST(l.`log_attributes` AS STRING), '$.traceId'), '')), ''))";
    case "requestId":
      return "LOWER(IFNULL(CONCAT(COALESCE(GET_JSON_STRING(CAST(l.`log_attributes` AS STRING), '$.request_id'), COALESCE(GET_JSON_STRING(CAST(l.`log_attributes` AS STRING), '$.requestId'), '')), ''))";
    default:
      return null;
  }
}

/**
 * 预处理 q：剥离 SPL、抽出字段/范围条件，返回供全文解析的 remainder 与待 AND 的 clauses。
 * @param {string} q
 */
export function preprocessAgentSearchQuery(q) {
  const { q: noPipe, splStripped } = stripSplPipeline(q);
  const { masked, chunks } = maskQuotes(noPipe);
  const { remainder, clauses } = extractClausesFromMasked(masked, chunks);
  return { remainder, clauses, splStripped };
}

/**
 * @param {string[]} where
 * @param {unknown[]} params
 * @param {ExtractedClause[]} clauses
 * @param {string} concatBlob
 */
export function applyExtractedClauses(where, params, clauses, concatBlob) {
  for (const c of clauses) {
    applyClause(where, params, c, concatBlob);
  }
}
