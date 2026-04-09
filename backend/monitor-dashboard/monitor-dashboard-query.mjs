/**
 * 监控大屏数据查询模块（OTel 指标）
 * 数据源：opsRobot.otel_metrics_sum  &  opsRobot.otel_metrics_histogram
 *
 * 提供接口：GET /api/monitor-dashboard
 *   参数：trendDays（默认14）、topLimit（默认10）
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";
import { queryCostOverviewSnapshot } from "../cost-analysis/cost-overview-query.mjs";

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "bigint") out[k] = Number(out[k]);
  }
  return out;
}

function formatDt(d) {
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
  );
}

function formatTokenCount(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatCost(usd) {
  usd = Number(usd) || 0;
  if (usd >= 1) return "$" + usd.toFixed(2);
  if (usd >= 0.01) return "$" + usd.toFixed(4);
  return "$" + usd.toFixed(6);
}

async function getConnection() {
  const cfg = getDorisConfig();
  return mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    connectTimeout: 30000,
  });
}

async function queryTodayKPIs(conn, todayStartIso, nowIso) {
  const [[tokenRow]] = await conn.query(
    `SELECT COALESCE(SUM(value), 0) AS v
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.tokens'
       AND get_json_string(attributes, '$.openclaw.token') = 'total'
       AND timestamp >= ? AND timestamp <= ?`,
    [todayStartIso, nowIso]
  );

  const [[costRow]] = await conn.query(
    `SELECT COALESCE(SUM(value), 0) AS v
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.cost.usd'
       AND timestamp >= ? AND timestamp <= ?`,
    [todayStartIso, nowIso]
  );

  const [[msgRow]] = await conn.query(
    `SELECT COALESCE(SUM(value), 0) AS v
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.message.processed'
       AND timestamp >= ? AND timestamp <= ?`,
    [todayStartIso, nowIso]
  );

  const [sessionRows] = await conn.query(
    `SELECT
       get_json_string(attributes, '$.openclaw.state') AS state,
       COALESCE(SUM(value), 0) AS total
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.session.state'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY get_json_string(attributes, '$.openclaw.state')`,
    [todayStartIso, nowIso]
  );

  const [[stuckRow]] = await conn.query(
    `SELECT COALESCE(SUM(value), 0) AS v
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.session.stuck'
       AND timestamp >= ? AND timestamp <= ?`,
    [todayStartIso, nowIso]
  );

  const [[instRow]] = await conn.query(
    `SELECT COUNT(DISTINCT service_instance_id) AS v
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE service_instance_id IS NOT NULL`
  );

  const [[chanRow]] = await conn.query(
    `SELECT COUNT(DISTINCT get_json_string(attributes, '$.openclaw.channel')) AS v
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE get_json_string(attributes, '$.openclaw.channel') IS NOT NULL`
  );

  const [[cacheRow]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN get_json_string(attributes, '$.openclaw.token') = 'cache_read' THEN value ELSE 0 END), 0) AS cache_read,
       COALESCE(SUM(CASE WHEN get_json_string(attributes, '$.openclaw.token') IN ('cache_read','cache_write') THEN value ELSE 0 END), 0) AS cache_total
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.tokens'
       AND timestamp >= ? AND timestamp <= ?`,
    [todayStartIso, nowIso]
  );

  const sessionByState = {};
  for (const r of sessionRows) {
    const row = normalizeRow(r);
    if (row.state) sessionByState[row.state] = Number(row.total) || 0;
  }

  const tokenRaw = Number(normalizeRow(tokenRow).v) || 0;
  const costRaw = Number(normalizeRow(costRow).v) || 0;
  const cacheRead = Number(normalizeRow(cacheRow).cache_read) || 0;
  const cacheTotal = Number(normalizeRow(cacheRow).cache_total) || 0;

  return {
    totalInstances: Number(normalizeRow(instRow).v) || 0,
    totalChannels: Number(normalizeRow(chanRow).v) || 0,
    activeSessions: sessionByState["processing"] || 0,
    stuckSessions: Number(normalizeRow(stuckRow).v) || 0,
    tokenTotalRaw: tokenRaw,
    tokenTotal: formatTokenCount(tokenRaw),
    todayCostRaw: costRaw,
    todayCost: formatCost(costRaw),
    messageProcessed: Number(normalizeRow(msgRow).v) || 0,
    cacheHitRate: cacheTotal > 0 ? Math.round((cacheRead / cacheTotal) * 100) : 0,
  };
}

function queryDailyTokenTrendFromCostOverview(snapshot) {
  const trend = Array.isArray(snapshot?.trend14d) ? snapshot.trend14d : [];
  return trend.map((r) => ({
    day: String(r?.day || "").slice(5, 10),
    total: Number(r?.tokensRaw) || 0,
  }));
}

async function queryInstanceList(conn, h24AgoIso, nowIso) {
  const [rows] = await conn.query(
    `SELECT
       service_instance_id,
       service_name,
       get_json_string(resource_attributes, '$.host.name') AS host_name,
       MAX(timestamp) AS last_active,
       COALESCE(SUM(CASE
         WHEN metric_name = 'openclaw.session.state'
           AND get_json_string(attributes, '$.openclaw.state') = 'processing'
           THEN value ELSE 0 END), 0) AS active_sessions,
       COALESCE(SUM(CASE
         WHEN metric_name = 'openclaw.session.stuck' THEN value ELSE 0 END), 0) AS stuck_sessions,
       COALESCE(SUM(CASE
         WHEN metric_name = 'openclaw.tokens'
           AND get_json_string(attributes, '$.openclaw.token') = 'total'
           THEN value ELSE 0 END), 0) AS total_tokens
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE service_instance_id IS NOT NULL
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY service_instance_id, service_name,
       get_json_string(resource_attributes, '$.host.name')
     ORDER BY last_active DESC
     LIMIT 30`,
    [h24AgoIso, nowIso]
  );

  const now = new Date();
  return rows.map((r) => {
    const row = normalizeRow(r);
    const lastActive = row.last_active ? new Date(row.last_active) : new Date(0);
    const minutesAgo = (now - lastActive) / 60000;
    const displayName =
      row.host_name ||
      row.service_name ||
      (row.service_instance_id ? row.service_instance_id.slice(0, 12) : "unknown");
    return {
      id: row.service_instance_id || "",
      name: displayName,
      status: minutesAgo < 10 ? "在线" : "离线",
      sessions: Number(row.active_sessions) || 0,
      stuckSessions: Number(row.stuck_sessions) || 0,
      tokenRaw: Number(row.total_tokens) || 0,
      token: formatTokenCount(Number(row.total_tokens) || 0),
    };
  });
}

function queryTokenDistributionFromCostOverview(snapshot) {
  // 口径对齐「算力成本概览」：最近30天的大模型消耗占比 + 输入/输出占比
  const modelShare = Array.isArray(snapshot?.modelShare) ? snapshot.modelShare : [];
  const ioShare = Array.isArray(snapshot?.inOut?.pie) ? snapshot.inOut.pie : [];

  const byModel = modelShare.map((r) => ({
    name: String(r.name || "未知模型"),
    value: Number(r.value) || 0,
  }));

  const inputRow = ioShare.find((r) => /input|输入/i.test(String(r?.name || "")));
  const outputRow = ioShare.find((r) => /output|输出/i.test(String(r?.name || "")));
  const byType = [
    { name: "input", value: Number(inputRow?.value) || 0 },
    { name: "output", value: Number(outputRow?.value) || 0 },
  ];

  return { byModel, byType };
}

async function queryTopInstances(conn, d7AgoIso, nowIso, limit) {
  const [rows] = await conn.query(
    `SELECT
       COALESCE(
         get_json_string(resource_attributes, '$.host.name'),
         service_name,
         service_instance_id,
         'unknown'
       ) AS agent_name,
       service_instance_id,
       COALESCE(SUM(value), 0) AS total_tokens
     FROM \`opsRobot\`.\`otel_metrics_sum\`
     WHERE metric_name = 'openclaw.tokens'
       AND get_json_string(attributes, '$.openclaw.token') = 'total'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY
       get_json_string(resource_attributes, '$.host.name'),
       service_name,
       service_instance_id
     ORDER BY total_tokens DESC
     LIMIT ?`,
    [d7AgoIso, nowIso, limit]
  );
  return rows.map((r) => ({
    name: r.agent_name || r.service_instance_id || "unknown",
    value: Number(r.total_tokens) || 0,
  }));
}

/**
 * 监控大屏 OTel 主查询入口
 * @param {{ trendDays?: number; topLimit?: number }} opts
 */
export async function queryMonitorDashboard(opts = {}) {
  const trendDays = Number(opts.trendDays) || 14;
  const topLimit = Number(opts.topLimit) || 10;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayStartIso = formatDt(todayStart);
  const nowIso = formatDt(now);
  const h24AgoIso = formatDt(h24Ago);
  const d7AgoIso = formatDt(d7Ago);

  const conn = await getConnection();
  try {
    const kpis = await queryTodayKPIs(conn, todayStartIso, nowIso);
    const costOverviewSnapshot = await queryCostOverviewSnapshot({ trendDays: 30 });
    const dailyTokens = queryDailyTokenTrendFromCostOverview(costOverviewSnapshot);
    const instanceList = await queryInstanceList(conn, h24AgoIso, nowIso);
    const tokenDistribution = queryTokenDistributionFromCostOverview(costOverviewSnapshot);
    const topInstances = await queryTopInstances(conn, d7AgoIso, nowIso, topLimit);

    return {
      generatedAt: now.toISOString(),
      kpis,
      dailyTokens,
      instanceList,
      tokenDistribution,
      topInstances,
    };
  } finally {
    await conn.end();
  }
}
