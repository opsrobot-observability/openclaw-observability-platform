import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "bigint") out[k] = Number(out[k]);
  }
  return out;
}

function formatDateTime(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

async function getConnection() {
  const cfg = getDorisConfig();
  try {
    return await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      connectTimeout: 30000,
    });
  } catch (error) {
    throw new Error(`数据库连接失败: ${error.message}`);
  }
}

const HOST_NAME_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.host.name'), ''), '')`;
const HOST_IP_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.host.ip'), ''), '')`;
const INSTANCE_ID_EXPR = `COALESCE(NULLIF(service_instance_id, ''), CONCAT(COALESCE(service_name, ''), '@@', ${HOST_NAME_EXPR}))`;
const CHANNEL_EXPR = `COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.channel'), ''), '')`;
const MODEL_EXPR = `COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.model'), ''), '')`;
const SESSION_KEY_EXPR = `COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.sessionKey'), ''), '')`;
const TOKEN_TOTAL_EXPR = `CASE WHEN span_name = 'openclaw.model.usage' THEN COALESCE(CAST(get_json_string(span_attributes, '$.openclaw.tokens.total') AS DOUBLE), 0) ELSE 0 END`;

async function querySpanList(conn, instanceId, startIso, endIso, filters = {}) {
  let whereExtra = "";
  const params = [instanceId, startIso, endIso];

  if (filters.status && filters.status.length > 0 && filters.status.length < 2) {
    if (filters.status.includes("error")) {
      whereExtra += ` AND status_code = 'STATUS_CODE_ERROR'`;
    } else if (filters.status.includes("ok")) {
      whereExtra += ` AND status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET')`;
    }
  }

  if (filters.minDuration != null) {
    whereExtra += ` AND duration / 1000000 >= ?`;
    params.push(filters.minDuration);
  }
  if (filters.maxDuration != null) {
    whereExtra += ` AND duration / 1000000 <= ?`;
    params.push(filters.maxDuration);
  }

  if (filters.spanNames && filters.spanNames.length > 0) {
    const placeholders = filters.spanNames.map(() => "?").join(",");
    whereExtra += ` AND span_name IN (${placeholders})`;
    params.push(...filters.spanNames);
  }

  if (filters.channels && filters.channels.length > 0) {
    const placeholders = filters.channels.map(() => "?").join(",");
    whereExtra += ` AND ${CHANNEL_EXPR} IN (${placeholders})`;
    params.push(...filters.channels);
  }

  if (filters.models && filters.models.length > 0) {
    const placeholders = filters.models.map(() => "?").join(",");
    whereExtra += ` AND ${MODEL_EXPR} IN (${placeholders})`;
    params.push(...filters.models);
  }

  if (filters.sessionKey) {
    whereExtra += ` AND ${SESSION_KEY_EXPR} LIKE ?`;
    params.push(`%${filters.sessionKey}%`);
  }

  if (filters.search) {
    whereExtra += ` AND (trace_id LIKE ? OR span_id LIKE ? OR span_name LIKE ? OR ${SESSION_KEY_EXPR} LIKE ?)`;
    const kw = `%${filters.search}%`;
    params.push(kw, kw, kw, kw);
  }

  const sql = `
SELECT
  trace_id,
  span_id,
  COALESCE(parent_span_id, '') AS parent_span_id,
  span_name,
  COALESCE(span_kind, '') AS span_kind,
  COALESCE(service_name, '') AS service_name,
  ${HOST_NAME_EXPR} AS host_name,
  ${HOST_IP_EXPR} AS host_ip,
  ${CHANNEL_EXPR} AS channel,
  ${MODEL_EXPR} AS model_name,
  ${SESSION_KEY_EXPR} AS session_key,
  status_code,
  COALESCE(NULLIF(status_message, ''), '') AS status_message,
  duration / 1000000 AS duration_ms,
  \`timestamp\` AS start_time,
  ${TOKEN_TOTAL_EXPR} AS tokens,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.sessionId'), ''), '') AS session_id,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.run.id'), ''), '') AS run_id,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.round.id'), ''), '') AS round_id,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.version'), ''), '') AS version,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.tokens.input'), ''), '') AS input_tokens_str,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.tokens.output'), ''), '') AS output_tokens_str,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.error'), ''), '') AS error_type,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.error'), ''), '') AS error_message,
  COALESCE(CAST(span_attributes AS VARCHAR), '') AS span_attributes_json
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
${whereExtra}
ORDER BY \`timestamp\` DESC
LIMIT 2000
`;
  const [rows] = await conn.query(sql, params);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceList(conn, instanceId, startIso, endIso, filters = {}) {
  let havingExtra = "";
  const params = [instanceId, startIso, endIso];

  if (filters.status && filters.status.length === 1) {
    if (filters.status.includes("error")) {
      havingExtra += ` HAVING error_count > 0`;
    } else if (filters.status.includes("ok")) {
      havingExtra += ` HAVING error_count = 0`;
    }
  }

  if (filters.search) {
    havingExtra += (havingExtra ? " AND" : " HAVING") + ` root_span_name LIKE ?`;
    params.push(`%${filters.search}%`);
  }

  const sql = `
SELECT
  trace_id,
  MIN(span_name) AS root_span_name,
  COUNT(*) AS span_count,
  SUM(duration) / 1000000 AS total_duration_ms,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  MIN(\`timestamp\`) AS start_time
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY trace_id
${havingExtra}
ORDER BY start_time DESC
LIMIT 500
`;
  const [rows] = await conn.query(sql, params);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceSpans(conn, traceId) {
  const sql = `
SELECT
  trace_id,
  span_id,
  COALESCE(parent_span_id, '') AS parent_span_id,
  span_name,
  COALESCE(span_kind, '') AS span_kind,
  COALESCE(service_name, '') AS service_name,
  ${HOST_NAME_EXPR} AS host_name,
  ${HOST_IP_EXPR} AS host_ip,
  ${CHANNEL_EXPR} AS channel,
  ${MODEL_EXPR} AS model_name,
  ${SESSION_KEY_EXPR} AS session_key,
  status_code,
  COALESCE(NULLIF(status_message, ''), '') AS status_message,
  duration / 1000000 AS duration_ms,
  \`timestamp\` AS start_time,
  ${TOKEN_TOTAL_EXPR} AS tokens,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.sessionId'), ''), '') AS session_id,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.run.id'), ''), '') AS run_id,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.round.id'), ''), '') AS round_id,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.version'), ''), '') AS version,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.tokens.input'), ''), '') AS input_tokens_str,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.tokens.output'), ''), '') AS output_tokens_str,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.error'), ''), '') AS error_type,
  COALESCE(NULLIF(get_json_string(span_attributes, '$.openclaw.error'), ''), '') AS error_message,
  COALESCE(CAST(span_attributes AS VARCHAR), '') AS span_attributes_json
FROM \`opsRobot\`.\`otel_traces\`
WHERE trace_id = ?
ORDER BY \`timestamp\` ASC
`;
  const [rows] = await conn.query(sql, [traceId]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryScatterData(conn, instanceId, startIso, endIso) {
  const sql = `
SELECT
  trace_id,
  MIN(span_name) AS root_span_name,
  COUNT(*) AS span_count,
  SUM(duration) / 1000000 AS total_duration_ms,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  MIN(\`timestamp\`) AS start_time,
  COALESCE(SUM(${TOKEN_TOTAL_EXPR}), 0) AS total_tokens
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY trace_id
ORDER BY start_time ASC
LIMIT 3000
`;
  const [rows] = await conn.query(sql, [instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryApdexData(conn, instanceId, startIso, endIso, threshold) {
  const t = threshold || 500;
  const sql = `
SELECT
  span_name,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN duration / 1000000 <= ? THEN 1 ELSE 0 END) AS satisfied_count,
  SUM(CASE WHEN duration / 1000000 > ? AND duration / 1000000 <= ? THEN 1 ELSE 0 END) AS tolerating_count,
  SUM(CASE WHEN duration / 1000000 > ? THEN 1 ELSE 0 END) AS frustrated_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY span_name
ORDER BY total_calls DESC
`;
  const [rows] = await conn.query(sql, [t, t, 4 * t, 4 * t, instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryApdexOverall(conn, instanceId, startIso, endIso, threshold) {
  const t = threshold || 500;
  const sql = `
SELECT
  COUNT(*) AS total_calls,
  SUM(CASE WHEN duration / 1000000 <= ? THEN 1 ELSE 0 END) AS satisfied_count,
  SUM(CASE WHEN duration / 1000000 > ? AND duration / 1000000 <= ? THEN 1 ELSE 0 END) AS tolerating_count,
  SUM(CASE WHEN duration / 1000000 > ? THEN 1 ELSE 0 END) AS frustrated_count
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
`;
  const [rows] = await conn.query(sql, [t, t, 4 * t, 4 * t, instanceId, startIso, endIso]);
  const r = Array.isArray(rows) ? rows[0] : null;
  return r ? normalizeRow(r) : { total_calls: 0, satisfied_count: 0, tolerating_count: 0, frustrated_count: 0 };
}

async function queryApdexTrend(conn, instanceId, startIso, endIso, threshold, granularityMinutes) {
  const t = threshold || 500;
  const gm = granularityMinutes || 5;
  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN duration / 1000000 <= ? THEN 1 ELSE 0 END) AS satisfied_count,
  SUM(CASE WHEN duration / 1000000 > ? AND duration / 1000000 <= ? THEN 1 ELSE 0 END) AS tolerating_count,
  SUM(CASE WHEN duration / 1000000 > ? THEN 1 ELSE 0 END) AS frustrated_count
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16)
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [t, t, 4 * t, 4 * t, instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryAggregationData(conn, instanceId, startIso, endIso, dimension) {
  let groupExpr;
  switch (dimension) {
    case "spanName":
      groupExpr = "span_name";
      break;
    case "status":
      groupExpr = "status_code";
      break;
    case "channel":
      groupExpr = CHANNEL_EXPR;
      break;
    case "model":
      groupExpr = MODEL_EXPR;
      break;
    case "durationBucket": {
      return queryDurationBucketAgg(conn, instanceId, startIso, endIso);
    }
    case "hour":
      groupExpr = "SUBSTR(CAST(`timestamp` AS VARCHAR), 12, 2)";
      break;
    case "minute":
      groupExpr = "SUBSTR(CAST(`timestamp` AS VARCHAR), 12, 5)";
      break;
    default:
      groupExpr = "span_name";
  }

  const sql = `
SELECT
  ${groupExpr} AS dim_value,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.99) AS p99_duration_ms,
  COALESCE(SUM(${TOKEN_TOTAL_EXPR}), 0) AS total_tokens
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY ${groupExpr}
ORDER BY total_calls DESC
`;
  const [rows] = await conn.query(sql, [instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryDurationBucketAgg(conn, instanceId, startIso, endIso) {
  const sql = `
SELECT
  CASE
    WHEN duration / 1000000 <= 100 THEN '<=100ms'
    WHEN duration / 1000000 <= 500 THEN '100-500ms'
    WHEN duration / 1000000 <= 1000 THEN '500ms-1s'
    WHEN duration / 1000000 <= 3000 THEN '1-3s'
    WHEN duration / 1000000 <= 5000 THEN '3-5s'
    WHEN duration / 1000000 <= 10000 THEN '5-10s'
    ELSE '>10s'
  END AS dim_value,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  COALESCE(SUM(${TOKEN_TOTAL_EXPR}), 0) AS total_tokens
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY CASE
    WHEN duration / 1000000 <= 100 THEN '<=100ms'
    WHEN duration / 1000000 <= 500 THEN '100-500ms'
    WHEN duration / 1000000 <= 1000 THEN '500ms-1s'
    WHEN duration / 1000000 <= 3000 THEN '1-3s'
    WHEN duration / 1000000 <= 5000 THEN '3-5s'
    WHEN duration / 1000000 <= 10000 THEN '5-10s'
    ELSE '>10s'
  END
ORDER BY total_calls DESC
`;
  const [rows] = await conn.query(sql, [instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryAggregationTrend(conn, instanceId, startIso, endIso, dimension) {
  let groupExpr;
  switch (dimension) {
    case "spanName":
      groupExpr = "span_name";
      break;
    case "status":
      groupExpr = "status_code";
      break;
    case "channel":
      groupExpr = CHANNEL_EXPR;
      break;
    case "model":
      groupExpr = MODEL_EXPR;
      break;
    default:
      groupExpr = "span_name";
  }

  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  ${groupExpr} AS dim_value,
  COUNT(*) AS total_calls,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16), ${groupExpr}
ORDER BY time_bucket ASC
LIMIT 2000
`;
  const [rows] = await conn.query(sql, [instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function querySpanMetrics(conn, instanceId, startIso, endIso, filters = {}) {
  let whereExtra = "";
  const params = [instanceId, startIso, endIso];

  if (filters.status && filters.status.length > 0 && filters.status.length < 2) {
    if (filters.status.includes("error")) {
      whereExtra += ` AND status_code = 'STATUS_CODE_ERROR'`;
    } else if (filters.status.includes("ok")) {
      whereExtra += ` AND status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET')`;
    }
  }

  if (filters.minDuration != null) {
    whereExtra += ` AND duration / 1000000 >= ?`;
    params.push(filters.minDuration);
  }
  if (filters.maxDuration != null) {
    whereExtra += ` AND duration / 1000000 <= ?`;
    params.push(filters.maxDuration);
  }

  if (filters.spanNames && filters.spanNames.length > 0) {
    const placeholders = filters.spanNames.map(() => "?").join(",");
    whereExtra += ` AND span_name IN (${placeholders})`;
    params.push(...filters.spanNames);
  }

  if (filters.channels && filters.channels.length > 0) {
    const placeholders = filters.channels.map(() => "?").join(",");
    whereExtra += ` AND ${CHANNEL_EXPR} IN (${placeholders})`;
    params.push(...filters.channels);
  }

  if (filters.models && filters.models.length > 0) {
    const placeholders = filters.models.map(() => "?").join(",");
    whereExtra += ` AND ${MODEL_EXPR} IN (${placeholders})`;
    params.push(...filters.models);
  }

  if (filters.sessionKey) {
    whereExtra += ` AND ${SESSION_KEY_EXPR} LIKE ?`;
    params.push(`%${filters.sessionKey}%`);
  }

  const sql = `
SELECT
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.95) AS p95_duration_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.99) AS p99_duration_ms,
  MIN(duration) / 1000000 AS min_duration_ms,
  MAX(duration) / 1000000 AS max_duration_ms,
  COUNT(DISTINCT trace_id) AS total_traces
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
${whereExtra}
`;
  const [rows] = await conn.query(sql, params);
  const r = Array.isArray(rows) ? rows[0] : null;
  return r ? normalizeRow(r) : { total_calls: 0, error_count: 0, avg_duration_ms: 0, p95_duration_ms: 0, p99_duration_ms: 0, min_duration_ms: 0, max_duration_ms: 0, total_traces: 0 };
}

async function queryTrendData(conn, instanceId, startIso, endIso) {
  const sql = `
SELECT
  DATE_FORMAT(\`timestamp\`, '%Y-%m-%d %H:%i') AS time_bucket,
  COUNT(*) AS call_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY time_bucket
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryFilterOptions(conn, instanceId, startIso, endIso) {
  const sql = `
SELECT
  span_name,
  ${CHANNEL_EXPR} AS channel,
  ${MODEL_EXPR} AS model_name,
  status_code,
  MIN(duration / 1000000) AS min_duration_ms,
  MAX(duration / 1000000) AS max_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE ${INSTANCE_ID_EXPR} = ? AND \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY span_name, ${CHANNEL_EXPR}, ${MODEL_EXPR}, status_code
`;
  const [rows] = await conn.query(sql, [instanceId, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

export async function queryInstanceDetailSpans(opts = {}) {
  const instanceId = opts.instanceId;
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime, filters } = opts;

  const now = Date.now();
  let startMs, endMs, startIso, endIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
  }
  startIso = formatDateTime(startMs);
  endIso = formatDateTime(endMs);

  const conn = await getConnection();
  try {
    const results = await Promise.allSettled([
      querySpanList(conn, instanceId, startIso, endIso, filters),
      queryFilterOptions(conn, instanceId, startIso, endIso),
      querySpanMetrics(conn, instanceId, startIso, endIso, filters),
      queryTrendData(conn, instanceId, startIso, endIso),
    ]);
    for (const r of results) {
      if (r.status === "rejected") console.error("[instance-detail] query failed:", r.reason?.message || r.reason);
    }
    const unwrap = (r, fallback) => r.status === "fulfilled" ? r.value : fallback;
    const spans = unwrap(results[0], []);
    const filterOptions = unwrap(results[1], []);
    const metricsRaw = unwrap(results[2], { total_calls: 0, error_count: 0, avg_duration_ms: 0, p95_duration_ms: 0, p99_duration_ms: 0, min_duration_ms: 0, max_duration_ms: 0, total_traces: 0 });
    const trendRaw = unwrap(results[3], []);

    const spanNameMap = {};
    const channelSet = new Set();
    const modelSet = new Set();
    let okCount = 0;
    let errorCount = 0;
    let minDur = Infinity;
    let maxDur = 0;

    for (const r of filterOptions) {
      if (r.span_name) {
        spanNameMap[r.span_name] = (spanNameMap[r.span_name] || 0) + 1;
      }
      if (r.channel) channelSet.add(r.channel);
      if (r.model_name) modelSet.add(r.model_name);
      if (r.status_code === "STATUS_CODE_ERROR") errorCount++;
      else okCount++;
      const dur = Number(r.min_duration_ms) || 0;
      if (dur < minDur) minDur = dur;
      const durMax = Number(r.max_duration_ms) || 0;
      if (durMax > maxDur) maxDur = durMax;
    }

    const totalCalls = Number(metricsRaw.total_calls) || 0;
    const errorCalls = Number(metricsRaw.error_count) || 0;
    const avgDur = Number(metricsRaw.avg_duration_ms) || 0;
    const p95Dur = Number(metricsRaw.p95_duration_ms) || 0;
    const p99Dur = Number(metricsRaw.p99_duration_ms) || 0;
    const totalTraces = Number(metricsRaw.total_traces) || 0;

    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      metrics: {
        totalCalls,
        errorCount: errorCalls,
        errorRate: totalCalls > 0 ? Math.round(errorCalls / totalCalls * 10000) / 100 : 0,
        avgDurationMs: Math.round(avgDur * 100) / 100,
        p95DurationMs: Math.round(p95Dur * 100) / 100,
        p99DurationMs: Math.round(p99Dur * 100) / 100,
        minDurationMs: Math.round((Number(metricsRaw.min_duration_ms) || 0) * 100) / 100,
        maxDurationMs: Math.round((Number(metricsRaw.max_duration_ms) || 0) * 100) / 100,
        totalTraces,
        successRate: totalCalls > 0 ? Math.round((totalCalls - errorCalls) / totalCalls * 10000) / 100 : 100,
      },
      trend: trendRaw.map(t => ({
        time: t.time_bucket,
        callCount: Number(t.call_count) || 0,
        errorCount: Number(t.error_count) || 0,
        avgDurationMs: Math.round((Number(t.avg_duration_ms) || 0) * 100) / 100,
      })),
      spans: spans.map(s => ({
        traceId: s.trace_id,
        spanId: s.span_id,
        parentSpanId: s.parent_span_id || "",
        spanName: s.span_name,
        spanKind: s.span_kind || "",
        serviceName: s.service_name || "",
        hostName: s.host_name || "",
        hostIp: s.host_ip || "",
        channel: s.channel || "",
        modelName: s.model_name || "",
        sessionKey: s.session_key || "",
        sessionId: s.session_id || "",
        runId: s.run_id || "",
        roundId: s.round_id || "",
        version: s.version || "",
        status: s.status_code === "STATUS_CODE_ERROR" ? "error" : "ok",
        statusMessage: s.status_message || "",
        errorType: s.error_type || "",
        errorMessage: s.error_message || "",
        durationMs: Math.round((Number(s.duration_ms) || 0) * 100) / 100,
        startTime: s.start_time,
        tokens: Number(s.tokens) || 0,
        inputTokens: Number(s.input_tokens_str) || 0,
        outputTokens: Number(s.output_tokens_str) || 0,
        spanAttributes: s.span_attributes_json || "",
      })),
      filterOptions: {
        spanNames: Object.entries(spanNameMap)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
        channels: [...channelSet].filter(Boolean).sort(),
        models: [...modelSet].filter(Boolean).sort(),
        statusCounts: { ok: okCount, error: errorCount },
        durationRange: { min: minDur === Infinity ? 0 : Math.round(minDur * 100) / 100, max: Math.round(maxDur * 100) / 100 },
      },
    };
  } finally {
    await conn.end();
  }
}

export async function queryInstanceDetailTraces(opts = {}) {
  const instanceId = opts.instanceId;
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime, filters, traceId } = opts;

  const now = Date.now();
  let startMs, endMs, startIso, endIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
  }
  startIso = formatDateTime(startMs);
  endIso = formatDateTime(endMs);

  const conn = await getConnection();
  try {
    if (traceId) {
      const spans = await queryTraceSpans(conn, traceId);
      return {
        generatedAt: formatDateTime(now),
        traceId,
        spans: spans.map(s => ({
          traceId: s.trace_id,
          spanId: s.span_id,
          parentSpanId: s.parent_span_id || "",
          spanName: s.span_name,
          spanKind: s.span_kind || "",
          serviceName: s.service_name || "",
          hostName: s.host_name || "",
          hostIp: s.host_ip || "",
          channel: s.channel || "",
          modelName: s.model_name || "",
          sessionKey: s.session_key || "",
          sessionId: s.session_id || "",
          runId: s.run_id || "",
          roundId: s.round_id || "",
          version: s.version || "",
          status: s.status_code === "STATUS_CODE_ERROR" ? "error" : "ok",
          statusMessage: s.status_message || "",
          errorType: s.error_type || "",
          errorMessage: s.error_message || "",
          durationMs: Math.round((Number(s.duration_ms) || 0) * 100) / 100,
          startTime: s.start_time,
          tokens: Number(s.tokens) || 0,
          inputTokens: Number(s.input_tokens_str) || 0,
          outputTokens: Number(s.output_tokens_str) || 0,
          spanAttributes: s.span_attributes_json || "",
        })),
      };
    }

    const traces = await queryTraceList(conn, instanceId, startIso, endIso, filters);
    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      traces: traces.map(t => ({
        traceId: t.trace_id,
        rootSpanName: t.root_span_name,
        spanCount: Number(t.span_count) || 0,
        totalDurationMs: Math.round((Number(t.total_duration_ms) || 0) * 100) / 100,
        errorCount: Number(t.error_count) || 0,
        status: Number(t.error_count) > 0 ? "error" : "ok",
        startTime: t.start_time,
      })),
    };
  } finally {
    await conn.end();
  }
}

export async function queryInstanceDetailScatter(opts = {}) {
  const instanceId = opts.instanceId;
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime } = opts;

  const now = Date.now();
  let startMs, endMs, startIso, endIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
  }
  startIso = formatDateTime(startMs);
  endIso = formatDateTime(endMs);

  const conn = await getConnection();
  try {
    const data = await queryScatterData(conn, instanceId, startIso, endIso);
    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      points: data.map(d => ({
        traceId: d.trace_id,
        rootSpanName: d.root_span_name,
        spanCount: Number(d.span_count) || 0,
        totalDurationMs: Math.round((Number(d.total_duration_ms) || 0) * 100) / 100,
        totalTokens: Number(d.total_tokens) || 0,
        errorCount: Number(d.error_count) || 0,
        status: Number(d.error_count) > 0 ? "error" : "ok",
        startTime: d.start_time,
      })),
    };
  } finally {
    await conn.end();
  }
}

export async function queryInstanceDetailApdex(opts = {}) {
  const instanceId = opts.instanceId;
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime, threshold } = opts;
  const t = Number(threshold) || 500;

  const now = Date.now();
  let startMs, endMs, startIso, endIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
  }
  startIso = formatDateTime(startMs);
  endIso = formatDateTime(endMs);

  const conn = await getConnection();
  try {
    const results = await Promise.allSettled([
      queryApdexOverall(conn, instanceId, startIso, endIso, t),
      queryApdexData(conn, instanceId, startIso, endIso, t),
      queryApdexTrend(conn, instanceId, startIso, endIso, t),
    ]);
    const unwrap = (r, fallback) => r.status === "fulfilled" ? r.value : fallback;
    const overall = unwrap(results[0], { total_calls: 0, satisfied_count: 0, tolerating_count: 0, frustrated_count: 0 });
    const bySpan = unwrap(results[1], []);
    const trend = unwrap(results[2], []);

    const total = Number(overall.total_calls) || 0;
    const satisfied = Number(overall.satisfied_count) || 0;
    const tolerating = Number(overall.tolerating_count) || 0;
    const frustrated = Number(overall.frustrated_count) || 0;
    const apdex = total > 0 ? (satisfied + tolerating / 2) / total : 1;

    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      threshold: t,
      overall: {
        apdex: Math.round(apdex * 100) / 100,
        totalCalls: total,
        satisfiedCount: satisfied,
        toleratingCount: tolerating,
        frustratedCount: frustrated,
        satisfiedRate: total > 0 ? Math.round(satisfied / total * 10000) / 100 : 100,
        toleratingRate: total > 0 ? Math.round(tolerating / total * 10000) / 100 : 0,
        frustratedRate: total > 0 ? Math.round(frustrated / total * 10000) / 100 : 0,
      },
      bySpan: bySpan.map(s => {
        const st = Number(s.total_calls) || 0;
        const sat = Number(s.satisfied_count) || 0;
        const tol = Number(s.tolerating_count) || 0;
        const frus = Number(s.frustrated_count) || 0;
        const ap = st > 0 ? (sat + tol / 2) / st : 1;
        return {
          spanName: s.span_name,
          apdex: Math.round(ap * 100) / 100,
          totalCalls: st,
          satisfiedCount: sat,
          toleratingCount: tol,
          frustratedCount: frus,
          satisfiedRate: st > 0 ? Math.round(sat / st * 10000) / 100 : 100,
          toleratingRate: st > 0 ? Math.round(tol / st * 10000) / 100 : 0,
          frustratedRate: st > 0 ? Math.round(frus / st * 10000) / 100 : 0,
          avgDurationMs: Math.round((Number(s.avg_duration_ms) || 0) * 100) / 100,
        };
      }),
      trend: trend.map(t => {
        const st = Number(t.total_calls) || 0;
        const sat = Number(t.satisfied_count) || 0;
        const tol = Number(t.tolerating_count) || 0;
        const ap = st > 0 ? (sat + tol / 2) / st : 1;
        return {
          time: (t.time_bucket || "").substring(11, 16) || t.time_bucket,
          apdex: Math.round(ap * 100) / 100,
          totalCalls: st,
          satisfiedRate: st > 0 ? Math.round(sat / st * 10000) / 100 : 100,
          toleratingRate: st > 0 ? Math.round(tol / st * 10000) / 100 : 0,
          frustratedRate: st > 0 ? Math.round((Number(t.frustrated_count) || 0) / st * 10000) / 100 : 0,
        };
      }),
    };
  } finally {
    await conn.end();
  }
}

export async function queryInstanceDetailAggregation(opts = {}) {
  const instanceId = opts.instanceId;
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime, dimension } = opts;
  const dim = dimension || "spanName";

  const now = Date.now();
  let startMs, endMs, startIso, endIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
  }
  startIso = formatDateTime(startMs);
  endIso = formatDateTime(endMs);

  const conn = await getConnection();
  try {
    const results = await Promise.allSettled([
      queryAggregationData(conn, instanceId, startIso, endIso, dim),
      queryAggregationTrend(conn, instanceId, startIso, endIso, dim),
    ]);
    const unwrap = (r, fallback) => r.status === "fulfilled" ? r.value : fallback;
    const aggData = unwrap(results[0], []);
    const trendData = unwrap(results[1], []);

    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      dimension: dim,
      rows: aggData.map(r => {
        const total = Number(r.total_calls) || 0;
        const success = Number(r.success_count) || 0;
        const errors = Number(r.error_count) || 0;
        return {
          dimValue: r.dim_value || "",
          totalCalls: total,
          successCount: success,
          errorCount: errors,
          successRate: total > 0 ? Math.round(success / total * 10000) / 100 : 100,
          avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
          p99DurationMs: Math.round((Number(r.p99_duration_ms) || 0) * 100) / 100,
          totalTokens: Math.round(Number(r.total_tokens) || 0),
        };
      }),
      trend: trendData.map(r => ({
        time: (r.time_bucket || "").substring(11, 16) || r.time_bucket,
        dimValue: r.dim_value || "",
        totalCalls: Number(r.total_calls) || 0,
        avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
      })),
    };
  } finally {
    await conn.end();
  }
}
