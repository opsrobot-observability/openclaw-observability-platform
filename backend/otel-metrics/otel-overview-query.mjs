/**
 * OpenTelemetry Metrics 概览页面数据查询
 * 数据源：opsRobot.otel_metrics_sum  &  opsRobot.otel_metrics_histogram
 */
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

/**
 * 仅拉取 Sum 表按分钟桶趋势（供大屏等二次聚合）
 */
export async function queryOtelSumTrendStandalone(startIso, endIso) {
  const conn = await getConnection();
  try {
    return await querySumTrend(conn, startIso, endIso);
  } finally {
    await conn.end();
  }
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

async function queryInstanceList(conn) {
  const sql = `
SELECT DISTINCT
  service_instance_id,
  service_name,
  get_json_string(resource_attributes, '$.host.name') AS host_name,
  get_json_string(resource_attributes, '$.host.arch') AS host_arch,
  get_json_string(resource_attributes, '$.process.pid') AS process_pid,
  get_json_string(resource_attributes, '$.process.owner') AS process_owner,
  get_json_string(resource_attributes, '$.process.runtime.version') AS runtime_version,
  get_json_string(resource_attributes, '$.process.runtime.description') AS runtime_description,
  get_json_string(resource_attributes, '$.process.command') AS startup_command,
  MAX(timestamp) AS last_active
FROM \`opsRobot\`.\`otel_metrics_sum\`
WHERE service_instance_id IS NOT NULL
GROUP BY service_instance_id, service_name, 
  get_json_string(resource_attributes, '$.host.name'),
  get_json_string(resource_attributes, '$.host.arch'),
  get_json_string(resource_attributes, '$.process.pid'),
  get_json_string(resource_attributes, '$.process.owner'),
  get_json_string(resource_attributes, '$.process.runtime.version'),
  get_json_string(resource_attributes, '$.process.runtime.description'),
  get_json_string(resource_attributes, '$.process.command')
ORDER BY last_active DESC
`;
  const [rows] = await conn.query(sql);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function querySumMetricsByInstance(conn, startIso, endIso) {
  const sql = `
SELECT
  service_instance_id,
  metric_name,
  get_json_string(attributes, '$.openclaw.channel') AS channel,
  get_json_string(attributes, '$.openclaw.model') AS model,
  get_json_string(attributes, '$.openclaw.provider') AS provider,
  get_json_string(attributes, '$.openclaw.token') AS token_type,
  get_json_string(attributes, '$.openclaw.state') AS state,
  get_json_string(attributes, '$.openclaw.reason') AS reason,
  get_json_string(attributes, '$.openclaw.lane') AS lane,
  SUM(value) AS total_value,
  MAX(value) AS max_value,
  COUNT(*) AS record_count
FROM \`opsRobot\`.\`otel_metrics_sum\`
WHERE timestamp >= ?
  AND timestamp <= ?
GROUP BY service_instance_id, metric_name, 
  get_json_string(attributes, '$.openclaw.channel'),
  get_json_string(attributes, '$.openclaw.model'),
  get_json_string(attributes, '$.openclaw.provider'),
  get_json_string(attributes, '$.openclaw.token'),
  get_json_string(attributes, '$.openclaw.state'),
  get_json_string(attributes, '$.openclaw.reason'),
  get_json_string(attributes, '$.openclaw.lane')
ORDER BY total_value DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryHistogramMetricsByInstance(conn, startIso, endIso) {
  const sql = `
SELECT
  service_instance_id,
  metric_name,
  get_json_string(attributes, '$.openclaw.channel') AS channel,
  get_json_string(attributes, '$.openclaw.lane') AS lane,
  SUM(\`count\`) AS total_count,
  SUM(\`sum\`) AS total_sum,
  MIN(\`min\`) AS min_value,
  MAX(\`max\`) AS max_value,
  COUNT(*) AS record_count
FROM \`opsRobot\`.\`otel_metrics_histogram\`
WHERE timestamp >= ?
  AND timestamp <= ?
GROUP BY service_instance_id, metric_name,
  get_json_string(attributes, '$.openclaw.channel'),
  get_json_string(attributes, '$.openclaw.lane')
ORDER BY total_count DESC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function querySumTrend(conn, startIso, endIso) {
  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  metric_name,
  get_json_string(attributes, '$.openclaw.channel') AS channel,
  get_json_string(attributes, '$.openclaw.model') AS model,
  get_json_string(attributes, '$.openclaw.provider') AS provider,
  get_json_string(attributes, '$.openclaw.token') AS token_type,
  get_json_string(attributes, '$.openclaw.state') AS state,
  get_json_string(attributes, '$.openclaw.reason') AS reason,
  get_json_string(attributes, '$.openclaw.lane') AS lane,
  SUM(value) AS total_value
FROM \`opsRobot\`.\`otel_metrics_sum\`
WHERE timestamp >= ?
  AND timestamp <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16), metric_name,
  get_json_string(attributes, '$.openclaw.channel'),
  get_json_string(attributes, '$.openclaw.model'),
  get_json_string(attributes, '$.openclaw.provider'),
  get_json_string(attributes, '$.openclaw.token'),
  get_json_string(attributes, '$.openclaw.state'),
  get_json_string(attributes, '$.openclaw.reason'),
  get_json_string(attributes, '$.openclaw.lane')
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function queryHistogramTrend(conn, startIso, endIso) {
  const sql = `
SELECT
  SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16) AS time_bucket,
  metric_name,
  get_json_string(attributes, '$.openclaw.channel') AS channel,
  get_json_string(attributes, '$.openclaw.lane') AS lane,
  SUM(\`count\`) AS total_count,
  SUM(\`sum\`) AS total_sum,
  MAX(\`max\`) AS max_value
FROM \`opsRobot\`.\`otel_metrics_histogram\`
WHERE timestamp >= ?
  AND timestamp <= ?
GROUP BY SUBSTR(CAST(\`timestamp\` AS VARCHAR), 1, 16), metric_name,
  get_json_string(attributes, '$.openclaw.channel'),
  get_json_string(attributes, '$.openclaw.lane')
ORDER BY time_bucket ASC
`;
  const [rows] = await conn.query(sql, [startIso, endIso]);
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

function formatTokenCount(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return count?.toLocaleString() || '0';
}

function formatCost(usd) {
  if (usd >= 1) return "$" + usd.toFixed(2);
  if (usd >= 0.01) return "$" + usd.toFixed(4);
  return "$" + (usd || 0).toFixed(6);
}

function buildSessionAnalytics(sumMetrics) {
  const sessionMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.session.state");
  
  const byState = {};
  const byReason = {};
  const byChannel = {};
  const byInstance = {};
  
  for (const r of sessionMetrics) {
    if (r.state) {
      byState[r.state] = (byState[r.state] || 0) + (Number(r.total_value) || 0);
    }
    if (r.channel) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + (Number(r.total_value) || 0);
    }
    if (r.service_instance_id) {
      byInstance[r.service_instance_id] = (byInstance[r.service_instance_id] || 0) + (Number(r.total_value) || 0);
    }
  }
  
  const stuckMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.session.stuck");
  for (const r of stuckMetrics) {
    if (r.reason) {
      byReason[r.reason] = (byReason[r.reason] || 0) + (Number(r.total_value) || 0);
    }
  }
  
  return {
    byState: Object.entries(byState).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byReason: Object.entries(byReason).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byChannel: Object.entries(byChannel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    topInstances: Object.entries(byInstance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
  };
}

function buildTokenAnalytics(sumMetrics) {
  const tokenMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.tokens");
  
  const byType = {};
  const byModel = {};
  const byChannel = {};
  const byProvider = {};
  const byInstance = {};
  
  for (const r of tokenMetrics) {
    if (r.token_type) {
      byType[r.token_type] = (byType[r.token_type] || 0) + (Number(r.total_value) || 0);
    }
    if (r.model) {
      byModel[r.model] = (byModel[r.model] || 0) + (Number(r.total_value) || 0);
    }
    if (r.channel) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + (Number(r.total_value) || 0);
    }
    if (r.provider) {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + (Number(r.total_value) || 0);
    }
    if (r.service_instance_id) {
      byInstance[r.service_instance_id] = (byInstance[r.service_instance_id] || 0) + (Number(r.total_value) || 0);
    }
  }
  
  return {
    byType: Object.entries(byType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byModel: Object.entries(byModel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byChannel: Object.entries(byChannel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byProvider: Object.entries(byProvider).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    topInstances: Object.entries(byInstance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
  };
}

function buildCostAnalytics(sumMetrics) {
  const costMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.cost.usd");
  
  const byModel = {};
  const byChannel = {};
  const byProvider = {};
  const byInstance = {};
  
  for (const r of costMetrics) {
    if (r.model) {
      byModel[r.model] = (byModel[r.model] || 0) + (Number(r.total_value) || 0);
    }
    if (r.channel) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + (Number(r.total_value) || 0);
    }
    if (r.provider) {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + (Number(r.total_value) || 0);
    }
    if (r.service_instance_id) {
      byInstance[r.service_instance_id] = (byInstance[r.service_instance_id] || 0) + (Number(r.total_value) || 0);
    }
  }
  
  return {
    byModel: Object.entries(byModel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byChannel: Object.entries(byChannel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byProvider: Object.entries(byProvider).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    topInstances: Object.entries(byInstance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
  };
}

function buildMessageAnalytics(sumMetrics, histMetrics) {
  const processedMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.message.processed");
  const queuedMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.message.queued");
  const durationMetrics = histMetrics.filter(r => r.metric_name === "openclaw.message.duration_ms");
  
  const byChannel = {};
  const byInstance = {};
  
  for (const r of processedMetrics) {
    if (r.channel) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + (Number(r.total_value) || 0);
    }
    if (r.service_instance_id) {
      byInstance[r.service_instance_id] = (byInstance[r.service_instance_id] || 0) + (Number(r.total_value) || 0);
    }
  }
  
  let totalDuration = 0;
  let totalCount = 0;
  let maxDuration = 0;
  
  for (const r of durationMetrics) {
    totalDuration += Number(r.total_sum) || 0;
    totalCount += Number(r.total_count) || 0;
    maxDuration = Math.max(maxDuration, Number(r.max_value) || 0);
  }
  
  return {
    byChannel: Object.entries(byChannel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    topInstances: Object.entries(byInstance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
    durationStats: {
      avg: totalCount > 0 ? totalDuration / totalCount : 0,
      max: maxDuration,
    },
  };
}

function buildQueueAnalytics(sumMetrics, histMetrics) {
  const enqueueMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.queue.lane.enqueue");
  const dequeueMetrics = sumMetrics.filter(r => r.metric_name === "openclaw.queue.lane.dequeue");
  const depthMetrics = histMetrics.filter(r => r.metric_name === "openclaw.queue.depth");
  const waitMetrics = histMetrics.filter(r => r.metric_name === "openclaw.queue.wait_ms");
  
  const byLane = {};
  const byChannel = {};
  const byInstance = {};
  
  for (const r of enqueueMetrics) {
    if (r.lane) {
      byLane[r.lane] = (byLane[r.lane] || 0) + (Number(r.total_value) || 0);
    }
    if (r.channel) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + (Number(r.total_value) || 0);
    }
    if (r.service_instance_id) {
      byInstance[r.service_instance_id] = (byInstance[r.service_instance_id] || 0) + (Number(r.total_value) || 0);
    }
  }
  
  let totalWait = 0;
  let totalWaitCount = 0;
  let maxWait = 0;
  let maxDepth = 0;
  
  for (const r of waitMetrics) {
    totalWait += Number(r.total_sum) || 0;
    totalWaitCount += Number(r.total_count) || 0;
    maxWait = Math.max(maxWait, Number(r.max_value) || 0);
  }
  
  for (const r of depthMetrics) {
    maxDepth = Math.max(maxDepth, Number(r.max_value) || 0);
  }
  
  return {
    byLane: Object.entries(byLane).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byChannel: Object.entries(byChannel).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    topInstances: Object.entries(byInstance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
    waitStats: {
      avg: totalWaitCount > 0 ? totalWait / totalWaitCount : 0,
      max: maxWait,
    },
    depthStats: {
      max: maxDepth,
    },
  };
}

export async function queryOtelOverviewData(opts = {}) {
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
      instances,
      sumMetrics,
      histMetrics,
      sumTrend,
      histTrend,
    ] = await Promise.all([
      queryInstanceList(conn),
      querySumMetricsByInstance(conn, startIso, endIso),
      queryHistogramMetricsByInstance(conn, startIso, endIso),
      querySumTrend(conn, startIso, endIso),
      queryHistogramTrend(conn, startIso, endIso),
    ]);
    
    const instanceMap = {};
    for (const inst of instances) {
      instanceMap[inst.service_instance_id] = {
        id: inst.service_instance_id,
        name: inst.service_name,
        hostName: inst.host_name,
        hostArch: inst.host_arch,
        processPid: inst.process_pid,
        processOwner: inst.process_owner,
        runtime: inst.runtime_description ? `${inst.runtime_description} ${inst.runtime_version || ""}`.trim() : inst.runtime_version,
        startupCommand: inst.startup_command,
        lastActive: inst.last_active,
        status: "在线",
        activeSessions: 0,
        stuckSessions: 0,
        tokenConsumption: 0,
        totalCost: 0,
        totalCostRaw: 0,
        messageProcessed: 0,
        messageQueued: 0,
        queueDepth: 0,
        sessionTotal: 0,
        inputTokens: 0,
        outputTokens: 0,
        enqueueTotal: 0,
        dequeueTotal: 0,
      };
    }
    
    for (const r of sumMetrics) {
      const inst = instanceMap[r.service_instance_id];
      if (!inst) continue;
      
      switch (r.metric_name) {
        case "openclaw.session.state":
          inst.sessionTotal += Number(r.total_value) || 0;
          if (r.state === "processing") inst.activeSessions += Number(r.total_value) || 0;
          break;
        case "openclaw.session.stuck":
          inst.stuckSessions += Number(r.total_value) || 0;
          break;
        case "openclaw.tokens":
          inst.tokenConsumption += Number(r.total_value) || 0;
          if (r.token_type === "input" || r.token_type === "prompt") inst.inputTokens += Number(r.total_value) || 0;
          if (r.token_type === "output") inst.outputTokens += Number(r.total_value) || 0;
          break;
        case "openclaw.cost.usd":
          inst.totalCostRaw += Number(r.total_value) || 0;
          break;
        case "openclaw.message.processed":
          inst.messageProcessed += Number(r.total_value) || 0;
          break;
        case "openclaw.message.queued":
          inst.messageQueued += Number(r.total_value) || 0;
          break;
        case "openclaw.queue.lane.enqueue":
          inst.enqueueTotal += Number(r.total_value) || 0;
          break;
        case "openclaw.queue.lane.dequeue":
          inst.dequeueTotal += Number(r.total_value) || 0;
          break;
      }
    }
    
    for (const r of histMetrics) {
      const inst = instanceMap[r.service_instance_id];
      if (!inst) continue;
      
      if (r.metric_name === "openclaw.queue.depth") {
        inst.queueDepth = Math.max(inst.queueDepth, Number(r.max_value) || 0);
      }
    }
    
    const instanceList = Object.values(instanceMap).map((inst) => ({
      ...inst,
      tokenConsumption: formatTokenCount(inst.tokenConsumption),
      totalCost: formatCost(inst.totalCostRaw),
      inputTokens: formatTokenCount(inst.inputTokens),
      outputTokens: formatTokenCount(inst.outputTokens),
    }));
    
    const trends = {
      session: sumTrend
        .filter(r => r.metric_name === "openclaw.session.state")
        .map(r => ({ time: formatDateTimeShort(r.time_bucket), value: r.total_value, state: r.state })),
      token: sumTrend
        .filter(r => r.metric_name === "openclaw.tokens")
        .map(r => ({ time: formatDateTimeShort(r.time_bucket), value: r.total_value, token_type: r.token_type, model: r.model })),
      cost: sumTrend
        .filter(r => r.metric_name === "openclaw.cost.usd")
        .map(r => ({ time: formatDateTimeShort(r.time_bucket), value: r.total_value, model: r.model })),
      messageProcessed: sumTrend
        .filter(r => r.metric_name === "openclaw.message.processed")
        .map(r => ({ time: formatDateTimeShort(r.time_bucket), value: r.total_value, channel: r.channel })),
      queueDepth: histTrend
        .filter(r => r.metric_name === "openclaw.queue.depth")
        .map(r => ({ time: formatDateTimeShort(r.time_bucket), value: r.max_value || 0, lane: r.lane })),
    };
    
    const histogramStats = {
      messageDuration: {
        avg: histMetrics.filter(r => r.metric_name === "openclaw.message.duration_ms").reduce((a, r) => a + (Number(r.total_sum) || 0), 0) / 
             Math.max(1, histMetrics.filter(r => r.metric_name === "openclaw.message.duration_ms").reduce((a, r) => a + (Number(r.total_count) || 0), 0)),
        max: Math.max(0, ...histMetrics.filter(r => r.metric_name === "openclaw.message.duration_ms").map(r => Number(r.max_value) || 0)),
      },
      queueWait: {
        avg: histMetrics.filter(r => r.metric_name === "openclaw.queue.wait_ms").reduce((a, r) => a + (Number(r.total_sum) || 0), 0) /
             Math.max(1, histMetrics.filter(r => r.metric_name === "openclaw.queue.wait_ms").reduce((a, r) => a + (Number(r.total_count) || 0), 0)),
        max: Math.max(0, ...histMetrics.filter(r => r.metric_name === "openclaw.queue.wait_ms").map(r => Number(r.max_value) || 0)),
      },
    };
    
    const sessionAnalytics = buildSessionAnalytics(sumMetrics);
    const tokenAnalytics = buildTokenAnalytics(sumMetrics);
    const costAnalytics = buildCostAnalytics(sumMetrics);
    const messageAnalytics = buildMessageAnalytics(sumMetrics, histMetrics);
    const queueAnalytics = buildQueueAnalytics(sumMetrics, histMetrics);
    
    return {
      generatedAt: formatDateTime(now),
      timeRange: { start: startIso, end: endIso },
      instances: instanceList,
      overview: {
        totalInstances: instanceList.length,
        onlineInstances: instanceList.filter(i => i.status === "在线").length,
        offlineInstances: instanceList.filter(i => i.status !== "在线").length,
        totalSessions: instanceList.reduce((a, i) => a + i.sessionTotal, 0),
        activeSessions: instanceList.reduce((a, i) => a + i.activeSessions, 0),
        stuckSessions: instanceList.reduce((a, i) => a + i.stuckSessions, 0),
        totalTokens: sumMetrics.filter(r => r.metric_name === "openclaw.tokens").reduce((a, r) => a + (Number(r.total_value) || 0), 0),
        totalCost: sumMetrics.filter(r => r.metric_name === "openclaw.cost.usd").reduce((a, r) => a + (Number(r.total_value) || 0), 0),
        messageProcessed: sumMetrics.filter(r => r.metric_name === "openclaw.message.processed").reduce((a, r) => a + (Number(r.total_value) || 0), 0),
        messageQueued: sumMetrics.filter(r => r.metric_name === "openclaw.message.queued").reduce((a, r) => a + (Number(r.total_value) || 0), 0),
      },
      trends,
      histogramStats,
      sessionAnalytics,
      tokenAnalytics,
      costAnalytics,
      messageAnalytics,
      queueAnalytics,
    };
  } finally {
    await conn.end();
  }
}

