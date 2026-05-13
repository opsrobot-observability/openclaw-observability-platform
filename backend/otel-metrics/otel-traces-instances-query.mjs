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
const HOST_ARCH_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.host.arch'), ''), '')`;
const PROCESS_PID_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.process.pid'), ''), '')`;
const PROCESS_RUNTIME_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.process.runtime.version'), ''), '')`;
const PROCESS_OWNER_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.process.owner'), ''), '')`;
const PROCESS_START_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.process.start_time'), ''), '')`;
const DEPLOY_ENV_EXPR = `COALESCE(NULLIF(get_json_string(resource_attributes, '$.deployment.environment'), ''), '')`;
const INSTANCE_ID_EXPR = `COALESCE(NULLIF(service_instance_id, ''), CONCAT(COALESCE(service_name, ''), '@@', ${HOST_NAME_EXPR}))`;

async function queryInstanceList(conn, startIso, endIso) {
  const sql = `
SELECT
  ${INSTANCE_ID_EXPR} AS instance_id,
  COALESCE(service_name, '') AS service_name,
  MAX(${HOST_NAME_EXPR}) AS host_name,
  MAX(${HOST_IP_EXPR}) AS host_ip,
  MAX(${HOST_ARCH_EXPR}) AS host_arch,
  MAX(${PROCESS_PID_EXPR}) AS process_pid,
  MAX(${PROCESS_RUNTIME_EXPR}) AS runtime_version,
  MAX(${PROCESS_OWNER_EXPR}) AS process_owner,
  MAX(${PROCESS_START_EXPR}) AS start_time,
  MAX(${DEPLOY_ENV_EXPR}) AS deploy_env,
  COUNT(*) AS total_calls,
  COUNT(DISTINCT trace_id) AS total_traces,
  SUM(CASE WHEN status_code IN ('STATUS_CODE_OK', 'STATUS_CODE_UNSET') THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
  AVG(duration) / 1000000 AS avg_duration_ms,
  MAX(duration) / 1000000 AS max_duration_ms,
  MIN(duration) / 1000000 AS min_duration_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.5) AS p50_duration_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.9) AS p90_duration_ms,
  PERCENTILE_APPROX(duration / 1000000, 0.99) AS p99_duration_ms,
  COUNT(DISTINCT CASE WHEN get_json_string(span_attributes, '$.openclaw.channel') IS NOT NULL AND get_json_string(span_attributes, '$.openclaw.channel') != '' THEN get_json_string(span_attributes, '$.openclaw.channel') ELSE NULL END) AS channel_count,
  COUNT(DISTINCT CASE WHEN span_name = 'openclaw.model.usage' AND get_json_string(span_attributes, '$.openclaw.model') IS NOT NULL AND get_json_string(span_attributes, '$.openclaw.model') != '' THEN get_json_string(span_attributes, '$.openclaw.model') ELSE NULL END) AS model_count,
  COALESCE(SUM(CASE WHEN span_name = 'openclaw.model.usage' THEN CAST(get_json_string(span_attributes, '$.openclaw.tokens.total') AS DOUBLE) ELSE 0 END), 0) AS total_tokens,
  SUM(CASE WHEN span_name = 'openclaw.session.stuck' THEN 1 ELSE 0 END) AS stuck_count,
  SUM(CASE WHEN span_name = 'openclaw.webhook.error' THEN 1 ELSE 0 END) AS webhook_error_count,
  MAX(\`timestamp\`) AS last_active
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY ${INSTANCE_ID_EXPR}, COALESCE(service_name, '')
ORDER BY total_calls DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryInstancePrevMetrics(conn, startIso, endIso) {
  const sql = `
SELECT
  ${INSTANCE_ID_EXPR} AS instance_id,
  COUNT(*) AS prev_total_calls,
  AVG(duration) / 1000000 AS prev_avg_duration_ms
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY ${INSTANCE_ID_EXPR}
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  const map = {};
  for (const r of (Array.isArray(rows) ? rows.map(normalizeRow) : [])) {
    map[r.instance_id] = r;
  }
  return map;
}

async function queryInstancePeakCalls(conn, startIso, endIso) {
  const sql = `
SELECT
  ${INSTANCE_ID_EXPR} AS instance_id,
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS minute_bucket,
  COUNT(*) AS minute_calls
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
GROUP BY ${INSTANCE_ID_EXPR}, SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16)
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  const peakMap = {};
  for (const r of (Array.isArray(rows) ? rows.map(normalizeRow) : [])) {
    const id = r.instance_id;
    if (!peakMap[id] || r.minute_calls > peakMap[id]) {
      peakMap[id] = r.minute_calls;
    }
  }
  return peakMap;
}

async function queryClusterPrevTotalCalls(conn, startIso, endIso) {
  const sql = `
SELECT COUNT(*) AS prev_total_calls
FROM \`opsRobot\`.\`otel_traces\`
WHERE \`timestamp\` >= ? AND \`timestamp\` <= ?
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  const r = Array.isArray(rows) ? rows[0] : null;
  return r ? Number(r.prev_total_calls) || 0 : 0;
}

export async function queryOtelTracesInstances(opts = {}) {
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
      queryInstanceList(conn, startIso, endIso),
      queryInstancePrevMetrics(conn, prevStartIso, prevEndIso),
      queryInstancePeakCalls(conn, startIso, endIso),
      queryClusterPrevTotalCalls(conn, prevStartIso, prevEndIso),
    ]);

    const unwrap = (r, fallback) => r.status === "fulfilled" ? r.value : fallback;
    const instanceRows = unwrap(results[0], []);
    const prevMetricsMap = unwrap(results[1], {});
    const peakMap = unwrap(results[2], {});
    const prevClusterTotalCalls = unwrap(results[3], 0);

    const totalCalls = instanceRows.reduce((a, r) => a + (Number(r.total_calls) || 0), 0);
    const totalSuccess = instanceRows.reduce((a, r) => a + (Number(r.success_count) || 0), 0);
    const totalError = instanceRows.reduce((a, r) => a + (Number(r.error_count) || 0), 0);
    const avgDuration = instanceRows.length > 0
      ? instanceRows.reduce((a, r) => a + (Number(r.avg_duration_ms) || 0), 0) / instanceRows.length
      : 0;

    const timeRangeHours = (endMs - startMs) / (1000 * 60 * 60);
    const totalCallsChangeRate = prevClusterTotalCalls > 0
      ? Math.round(((totalCalls - prevClusterTotalCalls) / prevClusterTotalCalls * 100) * 100) / 100
      : 0;

    const instances = instanceRows.map(r => {
      const total = Number(r.total_calls) || 0;
      const success = Number(r.success_count) || 0;
      const errors = Number(r.error_count) || 0;
      const stuck = Number(r.stuck_count) || 0;
      const webhookErrors = Number(r.webhook_error_count) || 0;
      const avgDur = Number(r.avg_duration_ms) || 0;
      const maxDur = Number(r.max_duration_ms) || 0;
      const minDur = Number(r.min_duration_ms) || 0;
      const p50Dur = Number(r.p50_duration_ms) || 0;
      const p90Dur = Number(r.p90_duration_ms) || 0;
      const p99Dur = Number(r.p99_duration_ms) || 0;
      const tokens = Number(r.total_tokens) || 0;
      const traces = Number(r.total_traces) || 0;
      const channels = Number(r.channel_count) || 0;
      const models = Number(r.model_count) || 0;
      const peak = peakMap[r.instance_id] || 0;
      const dailyAvg = timeRangeHours > 0 ? Math.round(total / timeRangeHours) : 0;

      const successRate = total > 0 ? Math.round((success / total * 100) * 100) / 100 : 100;
      const errorRate = total > 0 ? Math.round((errors / total * 100) * 100) / 100 : 0;
      const callPercentage = totalCalls > 0 ? Math.round((total / totalCalls * 100) * 100) / 100 : 0;
      const avgTokenPerCall = (total > 0 && tokens > 0) ? Math.round(tokens / total) : 0;

      const prev = prevMetricsMap[r.instance_id] || {};
      const prevAvgDur = Number(prev.prev_avg_duration_ms) || 0;
      const durationChangeRate = prevAvgDur > 0 ? Math.round(((avgDur - prevAvgDur) / prevAvgDur * 100) * 100) / 100 : 0;

      let status = "normal";
      if (errors > 0 || stuck > 0) status = "warning";
      if (errors > 0 && errorRate > 5) status = "error";

      return {
        instanceId: r.instance_id,
        serviceName: r.service_name,
        hostName: r.host_name,
        hostIp: r.host_ip,
        hostArch: r.host_arch,
        processPid: r.process_pid,
        runtimeVersion: r.runtime_version,
        processOwner: r.process_owner,
        startTime: r.start_time,
        deployEnv: r.deploy_env,
        lastActive: r.last_active,
        status,
        totalCalls: total,
        totalTraces: traces,
        dailyAvgCalls: dailyAvg,
        peakCalls: peak,
        callPercentage,
        successCount: success,
        errorCount: errors,
        successRate,
        errorRate,
        stuckCount: stuck,
        webhookErrorCount: webhookErrors,
        avgDurationMs: Math.round(avgDur * 100) / 100,
        p50DurationMs: Math.round(p50Dur * 100) / 100,
        p90DurationMs: Math.round(p90Dur * 100) / 100,
        p99DurationMs: Math.round(p99Dur * 100) / 100,
        maxDurationMs: Math.round(maxDur * 100) / 100,
        minDurationMs: Math.round(minDur * 100) / 100,
        durationChangeRate,
        channelCount: channels,
        modelCount: models,
        totalTokens: Math.round(tokens),
        avgTokenPerCall,
      };
    });

    const onlineCount = instances.filter(i => i.status === "normal").length;
    const warningCount = instances.filter(i => i.status === "warning").length;
    const errorCount2 = instances.filter(i => i.status === "error").length;
    const offlineCount = instances.length - onlineCount - warningCount - errorCount2;
    const lowSuccessCount = instances.filter(i => i.successRate < 95).length;
    const highDurationCount = instances.filter(i => i.avgDurationMs > 10000).length;

    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      summary: {
        totalInstances: instances.length,
        onlineCount,
        warningCount,
        errorCount: errorCount2,
        offlineCount,
        totalCalls,
        totalCallsChangeRate,
        totalSuccess,
        totalError,
        avgSuccessRate: instances.length > 0
          ? Math.round((instances.reduce((a, i) => a + i.successRate, 0) / instances.length) * 100) / 100
          : 100,
        avgDurationMs: Math.round(avgDuration * 100) / 100,
        lowSuccessCount,
        highDurationCount,
      },
      instances,
    };
  } finally {
    await conn.end();
  }
}
