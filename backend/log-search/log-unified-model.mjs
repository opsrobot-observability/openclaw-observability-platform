/**
 * 统一日志行模型：agent_sessions_logs / audit_logs / gateway_logs 归一化供前端列表与详情。
 * 字段含义见 scripts/init-doris-schema.sql
 */

/** @param {unknown} v */
function str(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // mysql2 常把 DATETIME 解析为 Date；JSON.stringify(Date) 会产出带引号包裹的 JSON 串，前端无法解析，直方图分桶全为 0
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isNaN(ms) ? "" : v.toISOString().replace("T", " ").replace(/Z$/, "");
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * 从 variant / JSON 字符串中尝试取 trace / request id
 * @param {unknown} logAttributes
 */
export function extractTraceAndRequest(logAttributes) {
  let o = logAttributes;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return { traceId: "", requestId: "" };
    }
  }
  if (!o || typeof o !== "object") return { traceId: "", requestId: "" };
  const traceId =
    str(o.trace_id || o.traceId || o.trace_id || o["trace.id"] || "").trim() || "";
  const requestId =
    str(o.request_id || o.requestId || o.requestID || o["request.id"] || "").trim() || "";
  return { traceId, requestId };
}

/**
 * @param {string} levelGuess
 */
export function levelBadgeClass(levelGuess) {
  const x = String(levelGuess || "").toLowerCase();
  if (x === "error" || x === "fatal") return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300";
  if (x === "warn") return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  if (x === "info") return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
  if (x === "debug") return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  if (x === "trace") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

/**
 * @param {Record<string, unknown>} row agent_sessions_logs 查询行（含 agent_sessions 字段）
 */
export function normalizeAgentSessionsRow(row) {
  const la = row.log_attributes;
  const { traceId, requestId } = extractTraceAndRequest(la);
  const err = row.message_is_error === 1 || row.message_is_error === true;
  const level = err ? "error" : str(row.message_role || "info").toLowerCase() || "info";
  const summary = [
    str(row.message_role),
    str(row.message_tool_name),
    str(row.type),
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);

  return {
    _source: "agent_sessions",
    _id: str(row.message_id || row.session_id || ""),
    time: str(row.timestamp),
    level,
    subsystem: str(row.type || row.provider || "agent"),
    agentId: str(row.agent_name || ""),
    sessionId: str(row.session_id || ""),
    traceId: traceId || requestId,
    requestId,
    summary: summary || str(row.message_id),
    _raw: row,
  };
}

/**
 * @param {Record<string, unknown>} row audit_logs 行
 */
export function normalizeAuditRow(row) {
  let attrs = {};
  try {
    attrs =
      typeof row.log_attributes === "string"
        ? JSON.parse(row.log_attributes)
        : row.log_attributes && typeof row.log_attributes === "object"
          ? row.log_attributes
          : {};
  } catch {
    attrs = {};
  }
  const { traceId, requestId } = extractTraceAndRequest(attrs);
  const level = str(attrs.level || attrs.severity || "info").toLowerCase() || "info";
  const summary = str(attrs.event || attrs.message || attrs.summary || row.id || "").slice(0, 200);

  return {
    _source: "audit_logs",
    _id: str(row.id ?? attrs.id ?? ""),
    time: str(row.event_time),
    level,
    subsystem: "audit",
    agentId: str(attrs.agent || attrs.agent_name || ""),
    sessionId: str(attrs.session_id || attrs.sessionId || ""),
    traceId: traceId || requestId,
    requestId,
    summary,
    _raw: { ...row, log_attributes: attrs },
  };
}

/**
 * @param {Record<string, unknown>} row gateway_logs 行
 */
export function normalizeGatewayRow(row) {
  let attrs = {};
  try {
    attrs =
      typeof row.log_attributes === "string"
        ? JSON.parse(row.log_attributes)
        : row.log_attributes && typeof row.log_attributes === "object"
          ? row.log_attributes
          : {};
  } catch {
    attrs = {};
  }
  const { traceId, requestId } = extractTraceAndRequest(attrs);
  const level = str(row.level || attrs.level || "info").toLowerCase() || "info";
  const summary = str(attrs.message || attrs.msg || attrs.path || row.module || "").slice(0, 200);

  return {
    _source: "gateway_logs",
    _id: str(row.id ?? ""),
    time: str(row.event_time),
    level,
    subsystem: str(row.module || "gateway"),
    agentId: "",
    sessionId: str(attrs.session_id || attrs.sessionId || ""),
    traceId: traceId || requestId,
    requestId,
    summary,
    _raw: { ...row, log_attributes: attrs },
  };
}

/**
 * @param {import('./unified-logs-search.mjs').UnifiedLogRow[]} rows
 */
export function sortUnifiedByTime(rows, dir = "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.time) || 0;
    const tb = Date.parse(b.time) || 0;
    return (ta - tb) * mul;
  });
}
