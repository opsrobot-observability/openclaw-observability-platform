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

function formatDateTimeShort(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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

async function queryTraceSummary(conn, startIso, endIso) {
  const sql = `
SELECT
  span_name,
  COUNT(*) AS total_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  MAX(duration) / 1000000 AS max_duration_ms,
  MIN(duration) / 1000000 AS min_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
GROUP BY span_name
ORDER BY total_count DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceByChannel(conn, startIso, endIso) {
  const sql = `
SELECT
  get_json_string(span_attributes, '$.openclaw.channel') AS channel,
  COUNT(*) AS total_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
  AND get_json_string(span_attributes, '$.openclaw.channel') IS NOT NULL
  AND get_json_string(span_attributes, '$.openclaw.channel') != ''
GROUP BY get_json_string(span_attributes, '$.openclaw.channel')
ORDER BY total_count DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceByModel(conn, startIso, endIso) {
  const sql = `
SELECT
  get_json_string(span_attributes, '$.openclaw.model') AS model,
  COUNT(*) AS total_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
  AND get_json_string(span_attributes, '$.openclaw.model') IS NOT NULL
  AND get_json_string(span_attributes, '$.openclaw.model') != ''
GROUP BY get_json_string(span_attributes, '$.openclaw.model')
ORDER BY total_count DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceByOutcome(conn, startIso, endIso) {
  const sql = `
SELECT
  get_json_string(span_attributes, '$.openclaw.outcome') AS outcome,
  COUNT(*) AS total_count
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
  AND get_json_string(span_attributes, '$.openclaw.outcome') IS NOT NULL
  AND get_json_string(span_attributes, '$.openclaw.outcome') != ''
GROUP BY get_json_string(span_attributes, '$.openclaw.outcome')
ORDER BY total_count DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceTrend(conn, startIso, endIso) {
  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  span_name,
  COUNT(*) AS total_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16), span_name
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceTokenUsage(conn, startIso, endIso) {
  const sql = `
SELECT
  get_json_string(span_attributes, '$.openclaw.model') AS model,
  get_json_string(span_attributes, '$.openclaw.provider') AS provider,
  SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.input') AS DOUBLE)) AS total_input_tokens,
  SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.output') AS DOUBLE)) AS total_output_tokens,
  SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.total') AS DOUBLE)) AS total_tokens,
  COUNT(*) AS call_count
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
  AND span_name = 'openclaw.model.usage'
  AND get_json_string(span_attributes, '$.openclaw.model') IS NOT NULL
  AND get_json_string(span_attributes, '$.openclaw.model') != ''
GROUP BY get_json_string(span_attributes, '$.openclaw.model'),
  get_json_string(span_attributes, '$.openclaw.provider')
ORDER BY total_tokens DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceTopSlow(conn, startIso, endIso) {
  const sql = `
SELECT
  trace_id,
  span_id,
  span_name,
  timestamp,
  duration / 1000000 AS duration_ms,
  status_code,
  get_json_string(span_attributes, '$.openclaw.channel') AS channel,
  get_json_string(span_attributes, '$.openclaw.model') AS model
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
ORDER BY duration DESC
LIMIT 20
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTraceRecentErrors(conn, startIso, endIso) {
  const sql = `
SELECT
  trace_id,
  span_id,
  span_name,
  timestamp,
  duration / 1000000 AS duration_ms,
  status_code,
  status_message,
  get_json_string(span_attributes, '$.openclaw.channel') AS channel,
  get_json_string(span_attributes, '$.openclaw.error') AS error_msg
FROM \`opsRobot\`.\`otel_traces\`
WHERE timestamp >= ?
  AND timestamp <= ?
  AND status_code = 'STATUS_CODE_ERROR'
ORDER BY timestamp DESC
LIMIT 20
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

export async function queryOtelTraceData(opts = {}) {
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime } = opts;

  const now = Date.now();
  let startMs, endMs, startIso, endIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
    startIso = formatDateTime(startMs);
    endIso = formatDateTime(endMs);
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
    startIso = formatDateTime(startMs);
    endIso = formatDateTime(endMs);
  }

  const conn = await getConnection();

  try {
    const [
      spanSummary,
      byChannel,
      byModel,
      byOutcome,
      trend,
      tokenUsage,
      topSlow,
      recentErrors,
    ] = await Promise.all([
      queryTraceSummary(conn, startIso, endIso),
      queryTraceByChannel(conn, startIso, endIso),
      queryTraceByModel(conn, startIso, endIso),
      queryTraceByOutcome(conn, startIso, endIso),
      queryTraceTrend(conn, startIso, endIso),
      queryTraceTokenUsage(conn, startIso, endIso),
      queryTraceTopSlow(conn, startIso, endIso),
      queryTraceRecentErrors(conn, startIso, endIso),
    ]);

    const totalSpans = spanSummary.reduce((a, r) => a + (Number(r.total_count) || 0), 0);
    const totalErrors = spanSummary.reduce((a, r) => a + (Number(r.error_count) || 0), 0);
    const errorRate = totalSpans > 0 ? (totalErrors / totalSpans * 100) : 0;
    const avgDuration = spanSummary.reduce((a, r) => a + (Number(r.avg_duration_ms) || 0) * (Number(r.total_count) || 0), 0) / Math.max(1, totalSpans);
    const maxDuration = Math.max(0, ...spanSummary.map(r => Number(r.max_duration_ms) || 0));

    const totalInputTokens = tokenUsage.reduce((a, r) => a + (Number(r.total_input_tokens) || 0), 0);
    const totalOutputTokens = tokenUsage.reduce((a, r) => a + (Number(r.total_output_tokens) || 0), 0);
    const totalTokens = tokenUsage.reduce((a, r) => a + (Number(r.total_tokens) || 0), 0);

    const bySpanName = spanSummary.map(r => ({
      name: r.span_name,
      value: Number(r.total_count) || 0,
      errorCount: Number(r.error_count) || 0,
      avgDurationMs: Number(r.avg_duration_ms) || 0,
      maxDurationMs: Number(r.max_duration_ms) || 0,
    }));

    const byChannelList = byChannel.map(r => ({
      name: r.channel,
      value: Number(r.total_count) || 0,
      errorCount: Number(r.error_count) || 0,
      avgDurationMs: Number(r.avg_duration_ms) || 0,
    }));

    const byModelList = byModel.map(r => ({
      name: r.model,
      value: Number(r.total_count) || 0,
      errorCount: Number(r.error_count) || 0,
      avgDurationMs: Number(r.avg_duration_ms) || 0,
    }));

    const byOutcomeList = byOutcome.map(r => ({
      name: r.outcome,
      value: Number(r.total_count) || 0,
    }));

    const tokenByModel = tokenUsage.map(r => ({
      name: r.model,
      value: Number(r.total_tokens) || 0,
      inputTokens: Number(r.total_input_tokens) || 0,
      outputTokens: Number(r.total_output_tokens) || 0,
      callCount: Number(r.call_count) || 0,
    }));

    const trendData = {};
    for (const r of trend) {
      const key = r.span_name;
      if (!trendData[key]) trendData[key] = [];
      trendData[key].push({
        time: formatDateTimeShort(r.time_bucket),
        value: Number(r.total_count) || 0,
        errorCount: Number(r.error_count) || 0,
        avgDurationMs: Number(r.avg_duration_ms) || 0,
      });
    }

    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      overview: {
        totalSpans,
        totalErrors,
        errorRate: Math.round(errorRate * 100) / 100,
        avgDurationMs: Math.round(avgDuration * 100) / 100,
        maxDurationMs: Math.round(maxDuration * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
      },
      bySpanName,
      byChannel: byChannelList,
      byModel: byModelList,
      byOutcome: byOutcomeList,
      tokenByModel,
      trends: trendData,
      topSlow: topSlow.map(r => ({
        traceId: r.trace_id,
        spanId: r.span_id,
        spanName: r.span_name,
        timestamp: r.timestamp,
        durationMs: Math.round((Number(r.duration_ms) || 0) * 100) / 100,
        statusCode: r.status_code,
        channel: r.channel,
        model: r.model,
      })),
      recentErrors: recentErrors.map(r => ({
        traceId: r.trace_id,
        spanId: r.span_id,
        spanName: r.span_name,
        timestamp: r.timestamp,
        durationMs: Math.round((Number(r.duration_ms) || 0) * 100) / 100,
        statusCode: r.status_code,
        statusMessage: r.status_message,
        channel: r.channel,
        errorMsg: r.error_msg,
      })),
    };
  } finally {
    await conn.end();
  }
}
