/**
 * 监控大屏数据查询模块（OTel 指标）
 * 数据源：opsRobot.otel_metrics_sum  &  opsRobot.otel_metrics_histogram
 *
 * 提供接口：GET /api/monitor-dashboard
 *   参数：trendDays（默认14）、topLimit（默认10）
 *
 * 性能：KPI 与审计/成本/数字员工并行（Promise.all）；重查询仅走本目录 monitor-doris-cache（不改其他模块）。
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";
import {
  DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS,
  dedupeEmployeesBySessionKey,
  rowSessionKey,
} from "../../frontend/lib/digitalEmployeeRows.js";
import { buildMonitorDigitalEmployeeOverview } from "./build-monitor-employee-overview.mjs";
import {
  monitorCachedAuditDashboardMetrics,
  monitorCachedCostOverviewSnapshot,
} from "./monitor-doris-cache.mjs";

/** 与数字员工概览「在线员工数」一致：近 15 分钟内有更新 */
const EMPLOYEE_ONLINE_MINUTES = 15;

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

export async function queryMonitorDashboardSourceTerminals() {
  return queryMonitorDashboardSourceTerminalsByWindow("month");
}

export async function queryMonitorDashboardSourceTerminalsByWindow(window = "month") {
  const snapshot = await monitorCachedAuditDashboardMetrics();
  const windows = snapshot?.windows || {};
  const safeWindow = ["today", "week", "month"].includes(window) ? window : "month";
  const row = windows[safeWindow] || {};
  const bounds = snapshot?.bounds || {};
  const now = Number(snapshot?.generatedAt) || Date.now();

  return {
    generatedAt: new Date(now).toISOString(),
    window: {
      key: safeWindow,
      start:
        safeWindow === "today"
          ? Number(bounds.todayStart) || null
          : safeWindow === "week"
            ? Number(bounds.weekStart) || null
            : Number(bounds.monthStart) || null,
      end: now,
    },
    sourceTerminals: Number(row.device_connections) || 0,
    userAccess: Number(row.user_access) || 0,
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

/**
 * 与 `DigitalEmployeeOverview.jsx` 中员工总表（tableRows）同源：
 * o3_employees → dedupeEmployeesBySessionKey → 按 employeeKey 合并 agentsAggregated 的健康度等字段。
 * Token 列与概览表「总 Token」列一致（合并后仍取 o3 行上的 totalTokens）。
 * @returns {{ merged: object[]; aggByEmployeeKey: Map<string, object> }}
 */
function buildMergedO3RowsForMonitor(overviewPayload) {
  const o3 = Array.isArray(overviewPayload?.o3_employees) ? overviewPayload.o3_employees : [];
  const agentsAggregated = Array.isArray(overviewPayload?.agentsAggregated) ? overviewPayload.agentsAggregated : [];
  const aggByEmployeeKey = new Map(
    agentsAggregated.map((a) => [String(a.employeeKey ?? "").trim(), a]),
  );
  const o3EmployeesDeduped = dedupeEmployeesBySessionKey(o3);
  const merged = o3EmployeesDeduped.map((r) => {
    const employeeKey = String(rowSessionKey(r) ?? "").trim();
    const agg = aggByEmployeeKey.get(employeeKey);
    if (!agg) return r;
    return {
      ...r,
      healthOverall: agg.healthOverall ?? r.healthOverall,
      securityRiskScore: agg.securityRiskScore ?? r.securityRiskScore,
      compositeScore: agg.compositeScore ?? r.compositeScore,
      successRate: agg.successRate ?? r.successRate,
      totalCostUsd: agg.totalCostUsd ?? r.totalCostUsd,
      p95DurationMs: agg.p95DurationMs ?? r.p95DurationMs,
    };
  });
  return { merged, aggByEmployeeKey };
}

/**
 * 左侧数字员工列表：与概览默认表同源、顺序一致；展示窗口内合并后的全部员工（不截断条数）；会话数为聚合 sessionCount。
 */
function queryEmployeeListFromOverview(overviewPayload) {
  const { merged, aggByEmployeeKey } = buildMergedO3RowsForMonitor(overviewPayload);
  const now = Date.now();
  const onlineMs = EMPLOYEE_ONLINE_MINUTES * 60 * 1000;
  return merged.map((row) => {
    const employeeKey = String(rowSessionKey(row) ?? "").trim();
    const agg = aggByEmployeeKey.get(employeeKey);
    const updatedAt = Number(agg?.lastUpdatedAt) || Number(row?.lastUpdatedAt) || 0;
    const online = updatedAt > 0 && now - updatedAt <= onlineMs;
    const totalTok = Number.isFinite(Number(row?.totalTokens)) ? Number(row.totalTokens) : 0;
    const name = String(row?.agentName ?? "").trim() || String(row?.displayLabel ?? "未命名").trim() || "未命名";
    return {
      id: String(row?.employeeKey || row?.sessionKey || row?.sessionId || ""),
      name,
      status: online ? "在线" : "离线",
      sessions: Number(agg?.sessionCount ?? row?.sessionCount) || 0,
      tokenRaw: totalTok,
      token: formatTokenCount(totalTok),
    };
  });
}

/**
 * Token 消耗 TopN：与左侧数字员工列表、概览员工表「总 Token」列同源（合并行 totalTokens），
 * 按 Token 降序取前 N；时间窗与 buildDigitalEmployeeOverview(DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS) 一致。
 */
function queryTopInstancesFromOverview(overviewPayload, limit) {
  const { merged } = buildMergedO3RowsForMonitor(overviewPayload);
  const n = Math.max(1, Number(limit) || 10);
  return [...merged]
    .sort((a, b) => (Number(b.totalTokens) || 0) - (Number(a.totalTokens) || 0))
    .slice(0, n)
    .map((row) => ({
      name: String(row?.agentName ?? "").trim() || String(row?.displayLabel ?? "未命名").trim() || "未命名",
      value: Number.isFinite(Number(row?.totalTokens)) ? Number(row.totalTokens) : 0,
    }));
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

  const todayStartIso = formatDt(todayStart);
  const nowIso = formatDt(now);

  /** KPI（单连接）与审计快照、成本快照、数字员工概览彼此独立，并行以降低总耗时 */
  const [kpis, sourceTerminalSnapshot, costOverviewSnapshot, employeeOverviewSnapshot] = await Promise.all([
    (async () => {
      const conn = await getConnection();
      try {
        return await queryTodayKPIs(conn, todayStartIso, nowIso);
      } finally {
        await conn.end();
      }
    })(),
    queryMonitorDashboardSourceTerminalsByWindow("month"),
    monitorCachedCostOverviewSnapshot({ trendDays: 30 }),
    buildMonitorDigitalEmployeeOverview(DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS),
  ]);

  const monthTokenTotal = Number(costOverviewSnapshot?.cards?.month?.totalTokens) || 0;
  const dailyTokens = queryDailyTokenTrendFromCostOverview(costOverviewSnapshot);
  const digitalEmployeeTotal =
    Number(employeeOverviewSnapshot?.o1_summary?.employeeTotal) ||
    (Array.isArray(employeeOverviewSnapshot?.agentsAggregated)
      ? employeeOverviewSnapshot.agentsAggregated.length
      : 0);
  /** 与数字员工概览「在线员工数」同源：o1_summary.onlineEmployeeCount15m（近一个月窗口内聚合出的员工中，lastUpdatedAt 落在近 15 分钟的数量） */
  const onlineEmployeeCount =
    Number(employeeOverviewSnapshot?.o1_summary?.onlineEmployeeCount15m) || 0;
  const instanceList = queryEmployeeListFromOverview(employeeOverviewSnapshot);
  const topInstances = queryTopInstancesFromOverview(employeeOverviewSnapshot, topLimit);
  const tokenDistribution = queryTokenDistributionFromCostOverview(costOverviewSnapshot);

  return {
    generatedAt: now.toISOString(),
    kpis: {
      ...kpis,
      agentTotal: digitalEmployeeTotal,
      onlineEmployeeCount,
      tokenTotalRaw: monthTokenTotal,
      tokenTotal: formatTokenCount(monthTokenTotal),
      userTotal: sourceTerminalSnapshot.userAccess,
      sourceTerminals: sourceTerminalSnapshot.sourceTerminals,
    },
    dailyTokens,
    instanceList,
    tokenDistribution,
    topInstances,
  };
}
