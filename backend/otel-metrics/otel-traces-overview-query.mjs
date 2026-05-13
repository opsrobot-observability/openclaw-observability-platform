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

const HOST_NAME_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.host.name'), ''), '')`;
const INSTANCE_ID_EXPR = `COALESCE(NULLIF(service_instance_id, ''), CONCAT(COALESCE(service_name, ''), '@@', ${HOST_NAME_EXPR}))`;

async function queryOverviewMetrics(conn, startIso, endIso, prevStartIso, prevEndIso) {
  const sql = `
SELECT
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  MAX(duration) / 1000000 AS max_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  const current = Array.isArray(rows) ? normalizeRow(rows[0]) : {};

  const [prevRows] = await conn.query(sql, [prevStartIso, prevEndIso]);
  const previous = Array.isArray(prevRows) ? normalizeRow(prevRows[0]) : {};

  return { current, previous };
}

async function queryOverviewTrend(conn, startIso, endIso) {
  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  MAX(duration) / 1000000 AS max_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16)
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryOverviewTrendByInstance(conn, startIso, endIso) {
  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  ${INSTANCE_ID_EXPR} AS instance_id,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16), ${INSTANCE_ID_EXPR}
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryInstanceCallAndFailure(conn, startIso, endIso) {
  const sql = `
SELECT
  ${INSTANCE_ID_EXPR} AS instance_id,
  ${HOST_NAME_EXPR} AS host_name,
  service_name,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY ${INSTANCE_ID_EXPR}, ${HOST_NAME_EXPR}, service_name
ORDER BY total_calls DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryInstanceDurationAndSuccess(conn, startIso, endIso) {
  const sql = `
SELECT
  ${INSTANCE_ID_EXPR} AS instance_id,
  ${HOST_NAME_EXPR} AS host_name,
  service_name,
  MAX(duration) / 1000000 AS max_duration_ms,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY ${INSTANCE_ID_EXPR}, ${HOST_NAME_EXPR}, service_name
ORDER BY max_duration_ms DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTopSlowSpanNames(conn, startIso, endIso, limit = 5) {
  const sql = `
SELECT
  span_name,
  MAX(duration) / 1000000 AS max_duration_ms,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY span_name
ORDER BY max_duration_ms DESC
LIMIT ?
`;
  const [rows] = await conn.query(sql, [startIso, endIso, limit]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTopSlowSpanDetails(conn, startIso, endIso) {
  const sql = `
SELECT
  a.span_name,
  a.trace_id,
  a.span_id,
  a.duration / 1000000 AS duration_ms,
  a.\`timestamp\`,
  ${INSTANCE_ID_EXPR.replace(/resource_attributes/g, "a.resource_attributes")} AS instance_id,
  get_json_string(a.span_attributes, '$.openclaw.channel') AS channel
FROM \`opsRobot\`.\`otel_traces\` a
INNER JOIN (
  SELECT span_name, MAX(duration) AS max_duration
  FROM \`opsRobot\`.\`otel_traces\`
  WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
  GROUP BY span_name
) b ON a.span_name = b.span_name AND a.duration = b.max_duration
WHERE a.\`timestamp\` >= ? AND a.\`timestamp\` <= ?
ORDER BY duration_ms DESC
LIMIT 20
`;
  const [rows] = await conn.query(sql, [startIso, endIso, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTopLowSuccessSpanNames(conn, startIso, endIso, limit = 5) {
  const sql = `
SELECT
  span_name,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  ROUND(SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS success_rate
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY span_name
HAVING COUNT(*) > 0
ORDER BY success_rate ASC
LIMIT ?
`;
  const [rows] = await conn.query(sql, [startIso, endIso, limit]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTopLowSuccessSpanDetails(conn, startIso, endIso) {
  const sql = `
SELECT
  a.span_name,
  a.trace_id,
  a.span_id,
  a.\`timestamp\`,
  ${INSTANCE_ID_EXPR.replace(/resource_attributes/g, "a.resource_attributes")} AS instance_id,
  get_json_string(a.span_attributes, '$.openclaw.channel') AS channel
FROM \`opsRobot\`.\`otel_traces\` a
INNER JOIN (
  SELECT span_name, MIN(status_code) AS worst_status
  FROM \`opsRobot\`.\`otel_traces\`
  WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
  GROUP BY span_name
  HAVING SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) > 0
) b ON a.span_name = b.span_name AND a.status_code = 'STATUS_CODE_ERROR'
WHERE a.\`timestamp\` >= ? AND a.\`timestamp\` <= ?
ORDER BY a.\`timestamp\` DESC
LIMIT 20
`;
  const [rows] = await conn.query(sql, [startIso, endIso, startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTopErrorSpanNames(conn, startIso, endIso, limit = 5) {
  const sql = `
SELECT
  span_name,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  ROUND(SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS error_rate
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY span_name
ORDER BY error_count DESC
LIMIT ?
`;
  const [rows] = await conn.query(sql, [startIso, endIso, limit]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryTopErrorSpanDetails(conn, startIso, endIso) {
  const sql = `
SELECT
  a.span_name,
  a.trace_id,
  a.span_id,
  a.\`timestamp\`,
  ${INSTANCE_ID_EXPR.replace(/resource_attributes/g, "a.resource_attributes")} AS instance_id,
  get_json_string(a.span_attributes, '$.openclaw.channel') AS channel
FROM \`opsRobot\`.\`otel_traces\` a
WHERE a.\`timestamp\` >= ? AND a.\`timestamp\` <= ?
  AND a.status_code = 'STATUS_CODE_ERROR'
ORDER BY a.\`timestamp\` DESC
LIMIT 20
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryChannelDistribution(conn, startIso, endIso) {
  const sql = `
SELECT
  CASE
    WHEN get_json_string(span_attributes, '$.openclaw.channel') IS NOT NULL
      AND get_json_string(span_attributes, '$.openclaw.channel') != ''
    THEN get_json_string(span_attributes, '$.openclaw.channel')
    ELSE '__other__'
  END AS channel,
  ${INSTANCE_ID_EXPR} AS instance_id,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY channel, ${INSTANCE_ID_EXPR}
ORDER BY total_calls DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryModelTokenRanking(conn, startIso, endIso, limit = 5) {
  const sql = `
SELECT
  get_json_string(span_attributes, '$.openclaw.model') AS model,
  COALESCE(SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.input') AS DOUBLE)), 0) AS total_input_tokens,
  COALESCE(SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.output') AS DOUBLE)), 0) AS total_output_tokens,
  COALESCE(SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.cache_read') AS DOUBLE)), 0) AS total_cache_tokens,
  COALESCE(SUM(CAST(get_json_string(span_attributes, '$.openclaw.tokens.total') AS DOUBLE)), 0) AS total_tokens,
  COUNT(*) AS call_count,
  AVG(duration) / 1000000 AS avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
  AND span_name = 'openclaw.model.usage'
  AND get_json_string(span_attributes, '$.openclaw.model') IS NOT NULL
  AND get_json_string(span_attributes, '$.openclaw.model') != ''
GROUP BY get_json_string(span_attributes, '$.openclaw.model')
ORDER BY total_tokens DESC
LIMIT ?
`;
  const [rows] = await conn.query(sql, [startIso, endIso, limit]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryDurationDistribution(conn, startIso, endIso) {
  const sql = `
SELECT
  CASE
    WHEN duration / 1000000 < 100 THEN '0~100ms'
    WHEN duration / 1000000 < 1000 THEN '100ms~1s'
    WHEN duration / 1000000 < 5000 THEN '1s~5s'
    WHEN duration / 1000000 < 10000 THEN '5s~10s'
    ELSE '>10s'
  END AS duration_bucket,
  COUNT(*) AS span_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  MAX(duration) / 1000000 AS max_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY
  CASE
    WHEN duration / 1000000 < 100 THEN '0~100ms'
    WHEN duration / 1000000 < 1000 THEN '100ms~1s'
    WHEN duration / 1000000 < 5000 THEN '1s~5s'
    WHEN duration / 1000000 < 10000 THEN '5s~10s'
    ELSE '>10s'
  END
ORDER BY duration_bucket ASC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryDurationPercentiles(conn, startIso, endIso) {
  const approxSql = `
SELECT
  PERCENTILE_APPROX(duration / 1000000, 0.5) AS p50_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.9) AS p90_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.99) AS p99_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
`;
  try {
    const [rows] = await conn.query(approxSql, [startIso, endIso]);
    return Array.isArray(rows) ? normalizeRow(rows[0]) : {};
  } catch {}

  const fallbackSql1 = `
SELECT
  PERCENTILE(duration / 1000000, 0.5) AS p50_ms,
  PERCENTILE(duration / 1000000, 0.9) AS p90_ms,
  PERCENTILE(duration / 1000000, 0.99) AS p99_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
`;
  try {
    const [rows] = await conn.query(fallbackSql1, [startIso, endIso]);
    return Array.isArray(rows) ? normalizeRow(rows[0]) : {};
  } catch {}

  const fallbackSql2 = `
SELECT
  AVG(duration) / 1000000 AS p50_ms,
  MAX(duration) / 1000000 AS p99_ms,
  MAX(duration) / 1000000 AS p90_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
`;
  try {
    const [rows] = await conn.query(fallbackSql2, [startIso, endIso]);
    return Array.isArray(rows) ? normalizeRow(rows[0]) : {};
  } catch {
    return { p50_ms: 0, p90_ms: 0, p99_ms: 0 };
  }
}

export async function queryOtelTracesOverview(opts = {}) {
  const hours = Number(opts.hours) || 1;
  const { startTime, endTime } = opts;

  const now = Date.now();
  let startMs, endMs, startIso, endIso, prevStartIso, prevEndIso;

  if (startTime && endTime) {
    startMs = new Date(startTime).getTime();
    endMs = new Date(endTime).getTime();
    startIso = formatDateTime(startMs);
    endIso = formatDateTime(endMs);
    const rangeMs = endMs - startMs;
    prevStartIso = formatDateTime(startMs - rangeMs);
    prevEndIso = formatDateTime(startMs);
  } else {
    startMs = now - hours * 60 * 60 * 1000;
    endMs = now;
    startIso = formatDateTime(startMs);
    endIso = formatDateTime(endMs);
    prevStartIso = formatDateTime(now - 2 * hours * 60 * 60 * 1000);
    prevEndIso = formatDateTime(startMs);
  }

  const conn = await getConnection();

  try {
    const results = await Promise.allSettled([
      queryOverviewMetrics(conn, startIso, endIso, prevStartIso, prevEndIso),
      queryOverviewTrend(conn, startIso, endIso),
      queryOverviewTrendByInstance(conn, startIso, endIso),
      queryInstanceCallAndFailure(conn, startIso, endIso),
      queryInstanceDurationAndSuccess(conn, startIso, endIso),
      queryTopSlowSpanNames(conn, startIso, endIso, 20),
      queryTopSlowSpanDetails(conn, startIso, endIso),
      queryTopLowSuccessSpanNames(conn, startIso, endIso, 20),
      queryTopLowSuccessSpanDetails(conn, startIso, endIso),
      queryTopErrorSpanNames(conn, startIso, endIso, 20),
      queryTopErrorSpanDetails(conn, startIso, endIso),
      queryChannelDistribution(conn, startIso, endIso),
      queryModelTokenRanking(conn, startIso, endIso, 10),
      queryDurationDistribution(conn, startIso, endIso),
      queryDurationPercentiles(conn, startIso, endIso),
    ]);

    const unwrap = (r, fallback) => r.status === "fulfilled" ? r.value : fallback;

    const metricsResult = unwrap(results[0], { current: {}, previous: {} });
    const trendData = unwrap(results[1], []);
    const trendByInstanceData = unwrap(results[2], []);
    const instanceCallFailure = unwrap(results[3], []);
    const instanceDurationSuccess = unwrap(results[4], []);
    const topSlowSpans = unwrap(results[5], []);
    const topSlowDetails = unwrap(results[6], []);
    const topLowSuccessSpans = unwrap(results[7], []);
    const topLowSuccessDetails = unwrap(results[8], []);
    const topErrorSpans = unwrap(results[9], []);
    const topErrorDetails = unwrap(results[10], []);
    const channelDist = unwrap(results[11], []);
    const modelTokenRank = unwrap(results[12], []);
    const durationDist = unwrap(results[13], []);
    const durationPercentiles = unwrap(results[14], {});

    const cur = metricsResult.current || {};
    const prev = metricsResult.previous || {};

    const totalCalls = Number(cur.total_calls) || 0;
    const prevTotalCalls = Number(prev.total_calls) || 0;
    const successCount = Number(cur.success_count) || 0;
    const prevSuccessCount = Number(prev.success_count) || 0;
    const errorCount = Number(cur.error_count) || 0;
    const avgDurationMs = Number(cur.avg_duration_ms) || 0;
    const prevAvgDurationMs = Number(prev.avg_duration_ms) || 0;
    const maxDurationMs = Number(cur.max_duration_ms) || 0;

    const successRate = totalCalls > 0 ? (successCount / totalCalls * 100) : 100;
    const prevSuccessRate = prevTotalCalls > 0 ? (prevSuccessCount / prevTotalCalls * 100) : 100;

    const calcChangeRate = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous * 100);
    };

    const totalCallsChangeRate = calcChangeRate(totalCalls, prevTotalCalls);
    const successRateChangeRate = calcChangeRate(successRate, prevSuccessRate);
    const avgDurationChangeRate = calcChangeRate(avgDurationMs, prevAvgDurationMs);

    const trend = trendData.map(r => ({
      time: formatDateTimeShort(r.time_bucket),
      totalCalls: Number(r.total_calls) || 0,
      successCount: Number(r.success_count) || 0,
      errorCount: Number(r.error_count) || 0,
      avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
      maxDurationMs: Math.round((Number(r.max_duration_ms) || 0) * 100) / 100,
      successRate: Number(r.total_calls) > 0
        ? Math.round((Number(r.success_count) / Number(r.total_calls) * 100) * 100) / 100
        : 100,
    }));

    const instances = instanceCallFailure.map(r => {
      const total = Number(r.total_calls) || 0;
      const errors = Number(r.error_count) || 0;
      return {
        instanceId: r.instance_id,
        hostName: r.host_name,
        serviceName: r.service_name,
        totalCalls: total,
        errorCount: errors,
        failureRate: total > 0 ? Math.round((errors / total * 100) * 100) / 100 : 0,
        avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
      };
    });

    const instanceDuration = instanceDurationSuccess.map(r => {
      const total = Number(r.total_calls) || 0;
      const success = Number(r.success_count) || 0;
      return {
        instanceId: r.instance_id,
        hostName: r.host_name,
        serviceName: r.service_name,
        maxDurationMs: Math.round((Number(r.max_duration_ms) || 0) * 100) / 100,
        successRate: total > 0 ? Math.round((success / total * 100) * 100) / 100 : 100,
        successCount: success,
        errorCount: total - success,
        avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
      };
    });

    const topSlow = topSlowSpans.map(r => ({
      spanName: r.span_name,
      maxDurationMs: Math.round((Number(r.max_duration_ms) || 0) * 100) / 100,
      totalCalls: Number(r.total_calls) || 0,
      errorCount: Number(r.error_count) || 0,
      avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
    }));

    const topSlowDetailMap = {};
    for (const r of topSlowDetails) {
      if (!topSlowDetailMap[r.span_name]) {
        topSlowDetailMap[r.span_name] = {
          traceId: r.trace_id,
          spanId: r.span_id,
          timestamp: r.timestamp,
          instanceId: r.instance_id,
          channel: r.channel,
        };
      }
    }

    const topLowSuccessDetailMap = {};
    for (const r of topLowSuccessDetails) {
      if (!topLowSuccessDetailMap[r.span_name]) {
        topLowSuccessDetailMap[r.span_name] = {
          traceId: r.trace_id,
          spanId: r.span_id,
          timestamp: r.timestamp,
          instanceId: r.instance_id,
          channel: r.channel,
        };
      }
    }

    const topErrorDetailMap = {};
    for (const r of topErrorDetails) {
      if (!topErrorDetailMap[r.span_name]) {
        topErrorDetailMap[r.span_name] = {
          traceId: r.trace_id,
          spanId: r.span_id,
          timestamp: r.timestamp,
          instanceId: r.instance_id,
          channel: r.channel,
        };
      }
    }

    const topLowSuccess = topLowSuccessSpans.map(r => ({
      spanName: r.span_name,
      successRate: Number(r.success_rate) || 0,
      totalCalls: Number(r.total_calls) || 0,
      successCount: Number(r.success_count) || 0,
      errorCount: Number(r.error_count) || 0,
    }));

    const topErrors = topErrorSpans.map(r => ({
      spanName: r.span_name,
      errorCount: Number(r.error_count) || 0,
      totalCalls: Number(r.total_calls) || 0,
      errorRate: Number(r.error_rate) || 0,
    }));

    const totalChannelCalls = channelDist.reduce((a, r) => a + (Number(r.total_calls) || 0), 0);
    const channels = channelDist.map(r => {
      const total = Number(r.total_calls) || 0;
      const success = Number(r.success_count) || 0;
      const errors = Number(r.error_count) || 0;
      return {
        name: r.channel,
        instanceId: r.instance_id,
        totalCalls: total,
        percentage: totalChannelCalls > 0 ? Math.round((total / totalChannelCalls * 100) * 100) / 100 : 0,
        successCount: success,
        errorCount: errors,
        successRate: total > 0 ? Math.round((success / total * 100) * 100) / 100 : 100,
        avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
      };
    });

    const modelTokens = modelTokenRank.map(r => ({
      name: r.model,
      totalTokens: Math.round(Number(r.total_tokens) || 0),
      inputTokens: Math.round(Number(r.total_input_tokens) || 0),
      outputTokens: Math.round(Number(r.total_output_tokens) || 0),
      cacheTokens: Math.round(Number(r.total_cache_tokens) || 0),
      callCount: Number(r.call_count) || 0,
      avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
    }));

    const BUCKET_ORDER = ['0~100ms', '100ms~1s', '1s~5s', '5s~10s', '>10s'];
    const bucketMap = {};
    for (const r of durationDist) {
      bucketMap[r.duration_bucket] = {
        bucket: r.duration_bucket,
        spanCount: Number(r.span_count) || 0,
        avgDurationMs: Math.round((Number(r.avg_duration_ms) || 0) * 100) / 100,
        maxDurationMs: Math.round((Number(r.max_duration_ms) || 0) * 100) / 100,
      };
    }
    const durationBuckets = BUCKET_ORDER.map(b => bucketMap[b] || { bucket: b, spanCount: 0, avgDurationMs: 0, maxDurationMs: 0 });
    const totalDistSpans = durationBuckets.reduce((a, b) => a + b.spanCount, 0);
    for (const b of durationBuckets) {
      b.percentage = totalDistSpans > 0 ? Math.round((b.spanCount / totalDistSpans * 100) * 100) / 100 : 0;
    }

    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      overview: {
        totalCalls,
        successCount,
        errorCount,
        successRate: Math.round(successRate * 100) / 100,
        avgDurationMs: Math.round(avgDurationMs * 100) / 100,
        maxDurationMs: Math.round(maxDurationMs * 100) / 100,
        totalCallsChangeRate: Math.round(totalCallsChangeRate * 100) / 100,
        successRateChangeRate: Math.round(successRateChangeRate * 100) / 100,
        avgDurationChangeRate: Math.round(avgDurationChangeRate * 100) / 100,
      },
      trend,
      trendByInstance: trendByInstanceData,
      instances,
      instanceDuration,
      topSlow,
      topSlowDetailMap,
      topLowSuccess,
      topLowSuccessDetailMap,
      topErrors,
      topErrorDetailMap,
      channels,
      modelTokens,
      durationBuckets,
      durationPercentiles: {
        p50: Math.round((Number(durationPercentiles.p50_ms) || 0) * 100) / 100,
        p90: Math.round((Number(durationPercentiles.p90_ms) || 0) * 100) / 100,
        p99: Math.round((Number(durationPercentiles.p99_ms) || 0) * 100) / 100,
      },
    };
  } finally {
    await conn.end();
  }
}
