/**
 * 主机监控数据查询模块
 * 数据源：opsRobot.host_metrics_sum & opsRobot.host_metrics_gauge
 *
 * 提供接口：GET /api/host-monitor
 *   参数：hours（默认1）、hostname（可选过滤）
 *
 * 功能：
 *   - CPU 使用率、负载均衡
 *   - 内存使用情况
 *   - 磁盘 I/O 与空间使用
 *   - 网络流量统计
 *   - 进程数量统计
 *   - 文件系统使用率
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "bigint") out[k] = Number(out[k]);
    if (out[k] instanceof Date || (typeof out[k] === "string" && !isNaN(Date.parse(out[k])))) {
      out[k] = new Date(out[k]);
    }
  }
  return out;
}

function formatDateTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ` +
         `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

/**
 * 查询 CPU 负载均衡（来自 gauge 表）
 */
async function queryCpuLoad(conn, startIso, endIso) {
  const [rows] = await conn.query(
    `SELECT 
        timestamp,
        metric_name,
        value,
        get_json_string(resource_attributes, '$.host.name') AS host_name,
        get_json_string(resource_attributes, '$.os.type') AS os_type,
        get_json_string(resource_attributes, '$.host.arch') AS host_arch
     FROM \`opsRobot\`.\`host_metrics_gauge\`
     WHERE metric_name IN (
         'system.cpu.load_average.1m',
         'system.cpu.load_average.5m',
         'system.cpu.load_average.15m'
       )
       AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp DESC`,
    [startIso, endIso]
  );

  const result = { loadAvg1m: null, loadAvg5m: null, loadAvg15m: null };
  
  for (const r of rows.map(normalizeRow)) {
    switch (r.metric_name) {
      case "system.cpu.load_average.1m":
        result.loadAvg1m = Number(r.value);
        break;
      case "system.cpu.load_average.5m":
        result.loadAvg5m = Number(r.value);
        break;
      case "system.cpu.load_average.15m":
        result.loadAvg15m = Number(r.value);
        break;
    }
    
    // 记录主机信息（只记录一次）
    if (!result.hostname && r.host_name) {
      result.hostname = r.host_name;
      result.osType = r.os_type;
      result.arch = r.host_arch;
    }
  }

  return result;
}

async function queryLoadAverageTrend(conn, startIso, endIso, hours, hostname) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);
  const baseSql = `SELECT
        ${bucketExpr} AS time_bucket,
        metric_name,
        MAX(value) AS max_value
     FROM \`opsRobot\`.\`host_metrics_gauge\`
     WHERE metric_name IN ('system.cpu.load_average.1m','system.cpu.load_average.5m','system.cpu.load_average.15m')
       AND timestamp >= ? AND timestamp <= ?`;
  const sql = hostname
    ? baseSql + ` AND get_json_string(resource_attributes, '$.host.name') = ? GROUP BY ${bucketExpr}, metric_name ORDER BY time_bucket`
    : baseSql + ` GROUP BY ${bucketExpr}, metric_name ORDER BY time_bucket`;
  const params = hostname ? [startIso, endIso, hostname] : [startIso, endIso];
  const [rows] = await conn.query(sql, params);

  const timeSet = new Set();
  const byTime = new Map();
  for (const r of rows.map(normalizeRow)) {
    const tb = r.time_bucket;
    if (tb == null) continue;
    timeSet.add(tb);
    const key = normTrendTimeKey(tb);
    if (!byTime.has(key)) byTime.set(key, {});
    const obj = byTime.get(key);
    const v = Number(r.max_value);
    const val = Number.isFinite(v) ? v : null;
    if (r.metric_name === "system.cpu.load_average.1m") obj.load1m = val;
    if (r.metric_name === "system.cpu.load_average.5m") obj.load5m = val;
    if (r.metric_name === "system.cpu.load_average.15m") obj.load15m = val;
  }

  const timestamps = [...timeSet].sort();
  const data = timestamps.map((t) => {
    const p = byTime.get(normTrendTimeKey(t)) || {};
    const l1 = p.load1m ?? null;
    const l5 = p.load5m ?? null;
    const l15 = p.load15m ?? null;
    return {
      load1m: l1,
      load5m: l5,
      load15m: l15,
      hasData: l1 != null || l5 != null || l15 != null,
    };
  });
  return { timestamps, data };
}

/**
 * 查询 CPU 时间分布（来自 sum 表，用于计算使用率）
 */
async function queryCpuTime(conn, startIso, endIso) {
  const [rows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.cpu') AS cpu_id,
        get_json_string(attributes, '$.state') AS cpu_state,
        SUM(value) AS total_seconds,
        COUNT(*) AS sample_count
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.cpu.time'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY 
       get_json_string(attributes, '$.cpu'),
       get_json_string(attributes, '$.state')
     ORDER BY cpu_id`,
    [startIso, endIso]
  );

  const cpuData = {};
  let totalUserTime = 0, totalSystemTime = 0, totalIdleTime = 0, totalIowaitTime = 0;
  let coreCount = 0;

  for (const r of rows.map(normalizeRow)) {
    const cpuId = r.cpu_id || "unknown";
    const state = r.cpu_state || "unknown";
    const seconds = Number(r.total_seconds) || 0;

    if (!cpuData[cpuId]) {
      cpuData[cpuId] = {};
      coreCount++;
    }
    cpuData[cpuId][state] = seconds;

    switch (state) {
      case "user": totalUserTime += seconds; break;
      case "system": totalSystemTime += seconds; break;
      case "idle": totalIdleTime += seconds; break;
      case "iowait": totalIowaitTime += seconds; break;
    }
  }

  const totalTime = totalUserTime + totalSystemTime + totalIdleTime + totalIowaitTime;
  const nonIdleTime = totalTime - totalIdleTime;

  return {
    coreCount,
    utilizationPercent: totalTime > 0 ? ((nonIdleTime / totalTime) * 100).toFixed(1) : 0,
    userPercent: totalTime > 0 ? ((totalUserTime / totalTime) * 100).toFixed(1) : 0,
    systemPercent: totalTime > 0 ? ((totalSystemTime / totalTime) * 100).toFixed(1) : 0,
    iowaitPercent: totalTime > 0 ? ((totalIowaitTime / totalTime) * 100).toFixed(1) : 0,
    idlePercent: totalTime > 0 ? ((totalIdleTime / totalTime) * 100).toFixed(1) : 0,
    coresDetail: Object.entries(cpuData).map(([id, states]) => ({
      id,
      ...states
    }))
  };
}

/**
 * 查询内存使用情况
 */
async function queryMemoryUsage(conn, startIso, endIso) {
  const [rows] = await conn.query(
    `SELECT 
        metric_name,
        metric_unit,
        value,
        get_json_string(attributes, '$.state') AS memory_state,
        MAX(timestamp) AS last_update
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.memory.usage'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY metric_name, metric_unit, value, memory_state`,
    [startIso, endIso]
  );

  let used = 0, free = 0, cached = 0, buffer = 0;

  for (const r of rows.map(normalizeRow)) {
    switch (r.memory_state) {
      case "used": used = Number(r.value); break;
      case "free": free = Number(r.value); break;
      case "cached": cached = Number(r.value); break;
      case "buffer": buffer = Number(r.value); break;
    }
  }

  const total = used + free + cached + buffer;

  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    cachedBytes: cached,
    bufferBytes: buffer,
    utilizationPercent: total > 0 ? ((used / total) * 100).toFixed(1) : 0,
    formatted: {
      total: formatBytes(total),
      used: formatBytes(used),
      free: formatBytes(free),
      cached: formatBytes(cached),
      buffer: formatBytes(buffer)
    }
  };
}

/**
 * 查询网络 I/O 统计
 */
async function queryNetworkStats(conn, startIso, endIso) {
  const [ioRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.device') AS device,
        get_json_string(attributes, '$.direction') AS direction,
        CASE WHEN MAX(value) >= MIN(value) THEN MAX(value) - MIN(value) ELSE 0 END AS total_bytes,
        MAX(timestamp) AS last_update
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.network.io'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY 
       get_json_string(attributes, '$.device'),
       get_json_string(attributes, '$.direction')
     ORDER BY device, direction`,
    [startIso, endIso]
  );

  const networks = {};
  for (const r of ioRows.map(normalizeRow)) {
    const device = r.device || "unknown";
    if (!networks[device]) {
      networks[device] = {
        device,
        receiveBytes: 0,
        transmitBytes: 0,
        receivePackets: 0,
        transmitPackets: 0,
        receiveErrors: 0,
        transmitErrors: 0,
        receiveDropped: 0,
        transmitDropped: 0,
        connections: 0
      };
    }

    if (r.direction === "receive") {
      networks[device].receiveBytes = Number(r.total_bytes);
    } else if (r.direction === "transmit") {
      networks[device].transmitBytes = Number(r.total_bytes);
    }
  }

  // 查询包数、错误数等
  const [packetRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.device') AS device,
        get_json_string(attributes, '$.direction') AS direction,
        metric_name,
        CASE WHEN MAX(value) >= MIN(value) THEN MAX(value) - MIN(value) ELSE 0 END AS total_value
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name IN ('system.network.packets', 'system.network.errors', 'system.network.dropped')
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY 
       get_json_string(attributes, '$.device'),
       get_json_string(attributes, '$.direction'),
       metric_name`,
    [startIso, endIso]
  );

  for (const r of packetRows.map(normalizeRow)) {
    const device = r.device || "unknown";
    if (!networks[device]) continue;

    const dir = r.direction === "receive" ? "receive" : "transmit";
    
    if (r.metric_name === "system.network.packets") {
      networks[device][`${dir}Packets`] = Number(r.total_value);
    } else if (r.metric_name === "system.network.errors") {
      networks[device][`${dir}Errors`] = Number(r.total_value);
    } else if (r.metric_name === "system.network.dropped") {
      networks[device][`${dir}Dropped`] = Number(r.total_value);
    }
  }

  // 查询连接数
  const [connRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.device') AS device,
        MAX(value) AS connections
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.network.connections'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY get_json_string(attributes, '$.device')`,
    [startIso, endIso]
  );

  for (const r of connRows.map(normalizeRow)) {
    const device = r.device || "unknown";
    if (networks[device]) {
      networks[device].connections = Number(r.connections);
    }
  }

  return Object.values(networks).map(n => ({
    ...n,
    receiveFormatted: formatBytes(n.receiveBytes),
    transmitFormatted: formatBytes(n.transmitBytes)
  }));
}

/**
 * 查询磁盘 I/O 和文件系统使用率
 */
async function queryDiskStats(conn, startIso, endIo, endFs) {
  // 磁盘 I/O
  const [ioRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.device') AS device,
        get_json_string(attributes, '$.direction') AS direction,
        CASE WHEN MAX(value) >= MIN(value) THEN MAX(value) - MIN(value) ELSE 0 END AS total_bytes,
        COUNT(*) AS operation_count
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.disk.io'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY 
       get_json_string(attributes, '$.device'),
       get_json_string(attributes, '$.direction')
     ORDER BY device`,
    [startIso, endIo]
  );

  const diskIoMap = {};
  for (const r of ioRows.map(normalizeRow)) {
    const device = r.device || "unknown";
    if (!diskIoMap[device]) {
      diskIoMap[device] = {
        device,
        readBytes: 0,
        writeBytes: 0,
        readOperations: 0,
        writeOperations: 0
      };
    }

    if (r.direction === "read") {
      diskIoMap[device].readBytes = Number(r.total_bytes);
      diskIoMap[device].readOperations = Number(r.operation_count);
    } else if (r.direction === "write") {
      diskIoMap[device].writeBytes = Number(r.total_bytes);
      diskIoMap[device].writeOperations = Number(r.operation_count);
    }
  }

  // 文件系统使用率
  const [fsRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.device') AS fs_device,
        get_json_string(attributes, '$.mountpoint') AS mountpoint,
        get_json_string(attributes, '$.type') AS fs_type,
        get_json_string(attributes, '$.state') AS fs_state,
        MAX(value) AS bytes,
        MAX(timestamp) AS last_update
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.filesystem.usage'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY 
       fs_device, mountpoint, fs_type, fs_state
     ORDER BY mountpoint`,
    [startIso, endFs]
  );

  const filesystems = {};
  for (const r of fsRows.map(normalizeRow)) {
    const key = `${r.fs_device}:${r.mountpoint}`;
    if (!filesystems[key]) {
      filesystems[key] = {
        device: r.fs_device,
        mountpoint: r.mountpoint,
        fsType: r.fs_type,
        usedBytes: 0,
        freeBytes: 0,
        totalBytes: 0,
        utilizationPercent: 0,
        ioReadBytes: 0,
        ioWriteBytes: 0
      };
    }

    if (r.fs_state === "used") {
      filesystems[key].usedBytes = Number(r.bytes);
    } else if (r.fs_state === "free") {
      filesystems[key].freeBytes = Number(r.bytes);
    }
  }

  // 合并磁盘IO数据和文件系统数据
  const disks = Object.values(filesystems).map(fs => {
    const total = fs.usedBytes + fs.freeBytes;
    const ioData = diskIoMap[fs.device] || {};

    return {
      ...fs,
      totalBytes: total,
      utilizationPercent: total > 0 ? ((fs.usedBytes / total) * 100).toFixed(1) : 0,
      totalFormatted: formatBytes(total),
      usedFormatted: formatBytes(fs.usedBytes),
      freeFormatted: formatBytes(fs.freeBytes),
      ioReadBytes: ioData.readBytes || 0,
      ioWriteBytes: ioData.writeBytes || 0,
      readOperations: ioData.readOperations || 0,
      writeOperations: ioData.writeOperations || 0,
      ioReadFormatted: formatBytes(ioData.readBytes || 0),
      ioWriteFormatted: formatBytes(ioData.writeBytes || 0)
    };
  });

  return disks;
}

/**
 * 查询进程统计
 */
async function queryProcessStats(conn, startIso, endIso) {
  const [rows] = await conn.query(
    `SELECT
        get_json_string(attributes, '$.status') AS process_status,
        MAX(value) AS count
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.processes.count'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY process_status`,
    [startIso, endIso]
  );

  const stats = { running: 0, sleeping: 0, stopped: 0, zombie: 0, total: 0 };

  for (const r of rows.map(normalizeRow)) {
    const count = Number(r.count) || 0;
    switch (r.process_status) {
      case "running": stats.running = count; break;
      case "sleeping": stats.sleeping = count; break;
      case "blocked": stats.stopped = count; break;
      case "zombies": stats.zombie = count; break;
    }
    stats.total += count;
  }

  return stats;
}

/**
 * 主机监控主查询入口
 * @param {{ hours?: number; hostname?: string }} opts
 */
export async function queryHostMonitor(opts = {}) {
  const parseInputDate = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    if (!str) return null;
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      const hh = Number(m[4]);
      const mm = Number(m[5]);
      const ss = Number(m[6] ?? "0");
      const dt = new Date(y, mo, d, hh, mm, ss);
      if (Number.isNaN(dt.getTime())) return null;
      return dt;
    }
    const dt = new Date(str);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  const hostnameFilter = opts.hostname || null;
  const startInput = parseInputDate(opts.startIso);
  const endInput = parseInputDate(opts.endIso);
  const now = new Date();

  let startDt = null;
  let endDt = null;
  if (startInput && endInput && endInput.getTime() > startInput.getTime()) {
    startDt = startInput;
    endDt = endInput;
  } else {
    const hours = Math.min(Math.max(Number(opts.hours) || 1, 1), 168);
    endDt = now;
    startDt = new Date(endDt.getTime() - hours * 60 * 60 * 1000);
  }

  const rangeHours = Math.min(
    168,
    Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / (60 * 60 * 1000))),
  );

  const startIso = formatDateTime(startDt);
  const endIso = formatDateTime(endDt);

  const conn = await getConnection();

  try {
    // 并行查询所有指标
    const [
      cpuLoad,
      cpuTime,
      memory,
      networkStats,
      diskStats,
      processStats,
      cpuTrendRes,
      memTrendRes,
      diskTrendRes,
      netTrendRes,
      loadTrendRes
    ] = await Promise.allSettled([
      queryCpuLoad(conn, startIso, endIso),
      queryCpuTime(conn, startIso, endIso),
      queryMemoryUsage(conn, startIso, endIso),
      queryNetworkStats(conn, startIso, endIso),
      queryDiskStats(conn, startIso, endIso, endIso),
      queryProcessStats(conn, startIso, endIso),
      queryCpuTrendData(conn, startIso, endIso, rangeHours).catch(() => ({ timestamps: [], data: [] })),
      queryMemoryTrendData(conn, startIso, endIso, rangeHours).catch(() => ({ timestamps: [], data: [] })),
      queryDiskTrendData(conn, startIso, endIso, rangeHours).catch(() => ({ timestamps: [], data: [] })),
      queryNetworkTrendData(conn, startIso, endIso, rangeHours).catch(() => ({ timestamps: [], data: [] })),
      queryLoadAverageTrend(conn, startIso, endIso, rangeHours, hostnameFilter).catch(() => ({ timestamps: [], data: [] }))
    ]);

    const cpuTrend = cpuTrendRes.status === 'fulfilled' ? cpuTrendRes.value : { timestamps: [], data: [] };
    const memTrend = memTrendRes.status === 'fulfilled' ? memTrendRes.value : { timestamps: [], data: [] };
    const diskTrend = diskTrendRes.status === 'fulfilled' ? diskTrendRes.value : { timestamps: [], data: [] };
    const netTrend = netTrendRes.status === 'fulfilled' ? netTrendRes.value : { timestamps: [], data: [] };
    const loadTrend = loadTrendRes.status === "fulfilled" ? loadTrendRes.value : { timestamps: [], data: [] };
    const trendAxis = cpuTrend.timestamps && cpuTrend.timestamps.length > 0 ? cpuTrend.timestamps : loadTrend.timestamps;
    const loadMap = new Map((loadTrend.timestamps || []).map((t, i) => [normTrendTimeKey(t), loadTrend.data?.[i]]));
    const alignedLoad = (trendAxis || []).map((ts) => {
      const p = loadMap.get(normTrendTimeKey(ts));
      if (!p) return { load1m: null, load5m: null, load15m: null, hasData: false };
      return {
        load1m: p.load1m ?? null,
        load5m: p.load5m ?? null,
        load15m: p.load15m ?? null,
        hasData: p.hasData === true || p.load1m != null || p.load5m != null || p.load15m != null,
      };
    });
    const onlineStatus = alignedLoad.map((p) => (p?.hasData ? 1 : 0));

    // 解包 Promise.allSettled 结果
    const _cpuLoad = cpuLoad.status === 'fulfilled' ? cpuLoad.value : {};
    const _cpuTime = cpuTime.status === 'fulfilled' ? cpuTime.value : {};
    const _memory = memory.status === 'fulfilled' ? memory.value : {};
    const _networkStats = networkStats.status === 'fulfilled' ? (Array.isArray(networkStats.value) ? networkStats.value : []) : [];
    const _diskStats = diskStats.status === 'fulfilled' ? (Array.isArray(diskStats.value) ? diskStats.value : []) : [];
    const _processStats = processStats.status === 'fulfilled' ? processStats.value : {};

    // 计算健康状态
    const cpuUtil = parseFloat(_cpuTime.utilizationPercent || 0);
    const memUtil = parseFloat(_memory.utilizationPercent || 0);
    const maxDiskUtil = _diskStats.length > 0 
      ? Math.max(..._diskStats.map(d => parseFloat(d.utilizationPercent || 0)))
      : 0;

    let healthStatus = "healthy";
    const alerts = [];

    if (cpuUtil > 95 || memUtil > 95 || maxDiskUtil > 95) {
      healthStatus = "critical";
      if (cpuUtil > 95) alerts.push({
        severity: "critical",
        metric: "CPU",
        message: `CPU使用率过高: ${cpuUtil}%`,
        currentValue: cpuUtil,
        threshold: 95
      });
      if (memUtil > 95) alerts.push({
        severity: "critical",
        metric: "内存",
        message: `内存使用率过高: ${memUtil}%`,
        currentValue: memUtil,
        threshold: 95
      });
      if (maxDiskUtil > 95) alerts.push({
        severity: "critical",
        metric: "磁盘",
        message: `磁盘使用率过高: ${maxDiskUtil}%`,
        currentValue: maxDiskUtil,
        threshold: 95
      });
    } else if (cpuUtil > 80 || memUtil > 85 || maxDiskUtil > 80) {
      healthStatus = "warning";
      if (cpuUtil > 80) alerts.push({
        severity: "warning",
        metric: "CPU",
        message: `CPU使用率偏高: ${cpuUtil}%`,
        currentValue: cpuUtil,
        threshold: 80
      });
      if (memUtil > 85) alerts.push({
        severity: "warning",
        metric: "内存",
        message: `内存使用率偏高: ${memUtil}%`,
        currentValue: memUtil,
        threshold: 85
      });
      if (maxDiskUtil > 80) alerts.push({
        severity: "warning",
        metric: "磁盘",
        message: `磁盘使用率偏高: ${maxDiskUtil}%`,
        currentValue: maxDiskUtil,
        threshold: 80
      });
    }

    // 构建返回数据
    return {
      generatedAt: now.toISOString(),
      dataTimestamp: endIso,
      timeRange: {
        start: startIso,
        end: endIso,
        hours: rangeHours
      },

      hostInfo: {
        name: _cpuLoad.hostname || hostnameFilter || "Unknown Host",
        osType: _cpuLoad.osType || "linux",
        arch: _cpuLoad.arch || "amd64"
      },

      summary: {
        avgCpuUtilization: _cpuTime.utilizationPercent || 0,
        avgMemoryUtilization: _memory.utilizationPercent || 0,
        maxDiskUtilization: maxDiskUtil.toFixed(1),
        loadAverage: {
          "1m": (_cpuLoad.loadAvg1m ?? _cpuTime.load?.loadAvg1m)?.toFixed?.(2) || ((_cpuLoad.loadAvg1m ?? _cpuTime.load?.loadAvg1m) || "N/A"),
          "5m": (_cpuLoad.loadAvg5m ?? _cpuTime.load?.loadAvg5m)?.toFixed?.(2) || ((_cpuLoad.loadAvg5m ?? _cpuTime.load?.loadAvg5m) || "N/A"),
          "15m": (_cpuLoad.loadAvg15m ?? _cpuTime.load?.loadAvg15m)?.toFixed?.(2) || ((_cpuLoad.loadAvg15m ?? _cpuTime.load?.loadAvg15m) || "N/A")
        },
        processCount: _processStats.total || 0,
        networkInterfaces: _networkStats.length,
        alertCount: {
          critical: alerts.filter(a => a.severity === "critical").length,
          warning: alerts.filter(a => a.severity === "warning").length
        }
      },

      cpu: {
        ..._cpuTime,
        load: _cpuLoad
      },

      memory: _memory,

      disks: _diskStats,

      networks: _networkStats,

      processes: _processStats,

      healthStatus,
      alerts,

      trends: {
        timestamps: trendAxis,
        cpuUtilization: cpuTrend.data.map(d => d.utilization),
        memoryUtilization: memTrend.data.map(d => d.utilization),
        diskMaxUtilization: diskTrend.data.map(d => d.utilization),
        network: netTrend.data,
        loadAverage: alignedLoad,
        onlineStatus
      }
    };

  } finally {
    await conn.end();
  }
}

/**
 * 主机监控总览查询（多主机聚合分析）
 * 数据源：opsRobot.host_metrics_sum & opsRobot.host_metrics_gauge
 *
 * 提供接口：GET /api/host-monitor/overview
 *   参数：hours（默认24）、topLimit（默认10）
 *
 * 功能：
 *   - 主机列表与实时状态
 *   - CPU/内存/磁盘历史趋势
 *   - 资源使用占比分布
 *   - Top N 排行榜
 */
export async function queryHostMonitorOverview(opts = {}) {
  const hours = Math.min(Math.max(Number(opts.hours) || 24, 1), 168);
  const topLimit = Math.min(Math.max(Number(opts.topLimit) || 10, 1), 50);

  const now = new Date();
  const startMs = now.getTime() - hours * 60 * 60 * 1000;
  const startDt = new Date(startMs);
  const startIso = formatDateTime(startDt);
  const endIso = formatDateTime(now);

  console.log(`[host-monitor] Querying overview: hours=${hours}, range=[${startIso}, ${endIso}]`);

  const conn = await getConnection();

  try {
    const runQuery = async (name, fn, fallback) => {
      try {
        return await fn();
      } catch (e) {
        console.error(`[host-monitor] Error in ${name}:`, e?.message || e);
        return fallback;
      }
    };

    // 分批串行，降低 Doris 内存峰值，避免并发大查询触发 MEM_ALLOC_FAILED
    const hostListRaw = await runQuery("hostList", () => queryHostList(conn, startIso, endIso), []);

    const cpuTrend = await runQuery("cpuTrend", () => queryCpuTrendData(conn, startIso, endIso, hours), { timestamps: [], data: [] });
    const memoryTrend = await runQuery("memoryTrend", () => queryMemoryTrendData(conn, startIso, endIso, hours), { timestamps: [], data: [] });
    const diskTrend = await runQuery("diskTrend", () => queryDiskTrendData(conn, startIso, endIso, hours), { timestamps: [], data: [] });
    const networkTrend = await runQuery("networkTrend", () => queryNetworkTrendData(conn, startIso, endIso, hours), { timestamps: [], data: [] });
    const diskIoTrend = await runQuery("diskIoTrend", () => queryDiskIoTrendData(conn, startIso, endIso, hours), { timestamps: [], data: [] });

    const cpuPerHostMap = await runQuery("cpuTrendPerHost", () => queryCpuTrendPerHost(conn, startIso, endIso, hours), new Map());
    const memoryPerHostMap = await runQuery("memoryTrendPerHost", () => queryMemoryTrendPerHost(conn, startIso, endIso, hours), new Map());
    const diskPerHostMap = await runQuery("diskTrendPerHost", () => queryDiskTrendPerHost(conn, startIso, endIso, hours), new Map());
    const networkPerHostMap = await runQuery("networkTrendPerHost", () => queryNetworkTrendPerHost(conn, startIso, endIso, hours), new Map());
    const diskIoPerHostMap = await runQuery("diskIoTrendPerHost", () => queryDiskIoTrendPerHost(conn, startIso, endIso, hours), new Map());

    const topCpuHosts = await runQuery("topCpu", () => queryTopHostsByMetric(conn, "cpu", startIso, endIso, topLimit), []);
    const topMemoryHosts = await runQuery("topMemory", () => queryTopHostsByMetric(conn, "memory", startIso, endIso, topLimit), []);
    const topDiskIoHosts = await runQuery("topDiskIo", () => queryTopHostsByMetric(conn, "disk_io", startIso, endIso, topLimit), []);
    const topNetworkHosts = await runQuery("topNetwork", () => queryTopHostsByMetric(conn, "network", startIso, endIso, topLimit), []);

    const isValidHostName = (hn) => {
      const s = String(hn || "").trim();
      if (!s) return false;
      const low = s.toLowerCase();
      return low !== "unknown host" && low !== "unknown" && low !== "null" && low !== "-";
    };
    const addHostFromMap = (set, mapLike) => {
      if (!mapLike || typeof mapLike.keys !== "function") return;
      for (const k of mapLike.keys()) {
        if (isValidHostName(k)) set.add(String(k).trim());
      }
    };

    const trendHostNameSet = new Set();
    addHostFromMap(trendHostNameSet, cpuPerHostMap);
    addHostFromMap(trendHostNameSet, memoryPerHostMap);
    addHostFromMap(trendHostNameSet, diskPerHostMap);
    addHostFromMap(trendHostNameSet, networkPerHostMap);
    addHostFromMap(trendHostNameSet, diskIoPerHostMap);

    const hostListValid = Array.isArray(hostListRaw) ? hostListRaw.filter((h) => isValidHostName(h?.hostname)) : [];
    let hostList = hostListValid;
    if (hostList.length === 0 && trendHostNameSet.size > 0) {
      hostList = Array.from(trendHostNameSet).map((hostname) => ({
        hostname,
        primaryIp: "-",
        networkReceiveBytes: 0,
        networkTransmitBytes: 0,
        networkReceiveDisplay: "0 B",
        networkTransmitDisplay: "0 B",
        osType: "linux",
        arch: "amd64",
        cpuUtilization: "0.0",
        loadAvg1m: "0.00",
        memoryUtilization: "0.0",
        memoryUsed: 0,
        memoryTotal: 0,
        memoryFormatted: { used: "0 B", total: "0 B" },
        cpuCores: null,
        diskTotalBytes: 0,
        diskTotalDisplay: "0 B",
        maxDiskUtilization: "0.0",
        healthStatus: "healthy",
        alertCount: 0,
        lastUpdate: now.toISOString(),
      }));
    } else if (hostList.length === 0 && Array.isArray(hostListRaw) && hostListRaw.length > 0) {
      // 若暂时拿不到有效主机名，仍保留原始列表用于总览展示，避免页面卡片全部空白
      hostList = hostListRaw;
    }

    // 计算总体统计
    const totalHosts = hostList.length;
    const healthyHosts = hostList.filter(h => h.healthStatus === 'healthy').length;
    const warningHosts = hostList.filter(h => h.healthStatus === 'warning').length;
    const criticalHosts = hostList.filter(h => h.healthStatus === 'critical').length;

    const avgCpu = hostList.reduce((sum, h) => sum + (parseFloat(h.cpuUtilization) || 0), 0) / (totalHosts || 1);
    const avgMemory = hostList.reduce((sum, h) => sum + (parseFloat(h.memoryUtilization) || 0), 0) / (totalHosts || 1);
    const maxDisk = Math.max(...hostList.map(h => parseFloat(h.maxDiskUtilization) || 0));
    const avgLoad = hostList.reduce((sum, h) => sum + (parseFloat(h.loadAvg1m) || 0), 0) / (totalHosts || 1);

    /** 与全集群 CPU 趋势同一时间轴对齐的各主机序列（有明细数据时才下发） */
    let cpuByHost = undefined;
    if (cpuPerHostMap && cpuPerHostMap.size > 0 && hostList.length > 0 && cpuTrend.timestamps?.length > 0) {
      cpuByHost = hostList.map((h) => {
        const inner = cpuPerHostMap.get(h.hostname);
        return {
          hostname: h.hostname,
          data: cpuTrend.timestamps.map((ts) => {
            const u = inner?.get(normTrendTimeKey(ts));
            // 无该时间桶上报时不填 0，便于总览区分「在线(有数据)」与「离线(无数据)」
            if (u == null || !Number.isFinite(u)) return { utilization: null };
            return { utilization: u.toFixed(1) };
          }),
        };
      });
    }

    const memoryByHost = buildUtilByHostSeries(hostList, cpuTrend.timestamps, memoryPerHostMap);
    const diskByHost = buildUtilByHostSeries(hostList, cpuTrend.timestamps, diskPerHostMap);
    const networkByHost = buildNetworkByHostSeries(hostList, cpuTrend.timestamps, networkPerHostMap);
    const diskIoByHost = buildDiskIoByHostSeries(hostList, cpuTrend.timestamps, diskIoPerHostMap);

    return {
      generatedAt: now.toISOString(),
      timeRange: { start: startIso, end: endIso, hours },

      // 总览 KPI 卡片数据
      summary: {
        totalHosts,
        healthyHosts,
        warningHosts,
        criticalHosts,
        avgCpuUtilization: avgCpu.toFixed(1),
        avgMemoryUtilization: avgMemory.toFixed(1),
        maxDiskUtilization: maxDisk.toFixed(1),
        loadAverage: {
          "1m": avgLoad.toFixed(2)
        }
      },

      // 主机列表（用于下钻）
      hostList,

      // 趋势图数据
      trends: {
        timestamps: cpuTrend.timestamps,
        cpu: cpuTrend.data,
        ...(cpuByHost ? { cpuByHost } : {}),
        memory: memoryTrend.data,
        disk: diskTrend.data,
        diskIo: diskIoTrend.data || [],
        network: networkTrend.data,
        ...(memoryByHost ? { memoryByHost } : {}),
        ...(diskByHost ? { diskByHost } : {}),
        ...(networkByHost ? { networkByHost } : {}),
        ...(diskIoByHost ? { diskIoByHost } : {}),
      },

      // Top 排行榜
      rankings: {
        cpu: topCpuHosts,
        memory: topMemoryHosts,
        diskIo: topDiskIoHosts,
        network: topNetworkHosts
      }
    };

  } finally {
    await conn.end();
  }
}

/**
 * 按主机与时间范围汇总网络收发字节（排除 lo）
 */
async function queryHostNetworkTotals(conn, startIso, endIso, hostname) {
  if (!hostname) return { rxBytes: 0, txBytes: 0 };
  try {
    const [rows] = await conn.query(
      `SELECT 
        SUM(CASE WHEN direction = 'receive' AND device != 'lo' THEN delta_bytes ELSE 0 END) AS rx_bytes,
        SUM(CASE WHEN direction = 'transmit' AND device != 'lo' THEN delta_bytes ELSE 0 END) AS tx_bytes
       FROM (
         SELECT
           get_json_string(attributes, '$.device') AS device,
           get_json_string(attributes, '$.direction') AS direction,
           CASE WHEN MAX(value) >= MIN(value) THEN MAX(value) - MIN(value) ELSE 0 END AS delta_bytes
         FROM \`opsRobot\`.\`host_metrics_sum\`
         WHERE metric_name = 'system.network.io'
           AND timestamp >= ? AND timestamp <= ?
           AND get_json_string(resource_attributes, '$.host.name') = ?
         GROUP BY get_json_string(attributes, '$.device'), get_json_string(attributes, '$.direction')
       ) t`,
      [startIso, endIso, hostname]
    );
    const r = normalizeRow(rows[0] || {});
    return {
      rxBytes: Number(r.rx_bytes) || 0,
      txBytes: Number(r.tx_bytes) || 0,
    };
  } catch (e) {
    console.error("[host-monitor] queryHostNetworkTotals failed:", e?.message || e);
    return { rxBytes: 0, txBytes: 0 };
  }
}

/**
 * 查询主机列表及实时状态
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startIso
 * @param {string} endIso
 */
async function queryHostList(conn, startIso, endIso) {
  const [cpuLoadRows] = await conn.query(
    `SELECT 
        timestamp,
        metric_name,
        value,
        get_json_string(resource_attributes, '$.host.name') AS host_name,
        get_json_string(resource_attributes, '$.os.type') AS os_type,
        get_json_string(resource_attributes, '$.host.arch') AS host_arch,
        get_json_string(resource_attributes, '$.host.ip') AS host_ip
     FROM \`opsRobot\`.\`host_metrics_gauge\`
     WHERE metric_name IN ('system.cpu.load_average.1m')
     ORDER BY timestamp DESC
     LIMIT 500`
  );

  const [cpuTimeRows] = await conn.query(
    `SELECT 
        SUM(value) AS total_seconds,
        get_json_string(attributes, '$.state') AS state
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.cpu.time'
       AND timestamp >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     GROUP BY state`
  );
  const [cpuCoreRows] = await conn.query(
    `SELECT 
        MAX(value) AS cpu_cores
     FROM \`opsRobot\`.\`host_metrics_gauge\`
     WHERE metric_name = 'system.cpu.logical.count'
       AND timestamp >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
  );

  const [memoryRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.state') AS mem_state,
        MAX(value) AS bytes
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.memory.usage'
       AND timestamp >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
     GROUP BY mem_state`
  );

  const [diskRows] = await conn.query(
    `SELECT 
        get_json_string(attributes, '$.mountpoint') AS mountpoint,
        get_json_string(attributes, '$.state') AS fs_state,
        MAX(value) AS bytes
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.filesystem.usage'
       AND timestamp >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
     GROUP BY mountpoint, fs_state`
  );

  // 计算 CPU 使用率
  let totalTime = 0, idleTime = 0;
  for (const r of cpuTimeRows.map(normalizeRow)) {
    totalTime += Number(r.total_seconds) || 0;
    if (r.state === 'idle') idleTime += Number(r.total_seconds) || 0;
  }
  const cpuUtilization = totalTime > 0 ? ((totalTime - idleTime) / totalTime * 100).toFixed(1) : "0";

  // 计算内存使用率
  let usedMem = 0, freeMem = 0, cachedMem = 0, bufferMem = 0;
  for (const r of memoryRows.map(normalizeRow)) {
    switch (r.mem_state) {
      case 'used': usedMem += Number(r.bytes); break;
      case 'free': freeMem += Number(r.bytes); break;
      case 'cached': cachedMem += Number(r.bytes); break;
      case 'buffer': bufferMem += Number(r.bytes); break;
    }
  }
  const totalMem = usedMem + freeMem + cachedMem + bufferMem;
  const memoryUtilization = totalMem > 0 ? ((usedMem / totalMem) * 100).toFixed(1) : "0";

  // 计算最大磁盘使用率
  const fsMap = {};
  for (const r of diskRows.map(normalizeRow)) {
    const key = r.mountpoint;
    if (!fsMap[key]) fsMap[key] = { used: 0, free: 0 };
    if (r.fs_state === 'used') fsMap[key].used = Number(r.bytes);
    else if (r.fs_state === 'free') fsMap[key].free = Number(r.bytes);
  }
  const diskUtils = Object.values(fsMap).map(fs => {
    const total = fs.used + fs.free;
    return total > 0 ? (fs.used / total * 100) : 0;
  });
  const maxDiskUtil = diskUtils.length > 0 ? Math.max(...diskUtils).toFixed(1) : "0";
  const diskTotals = Object.values(fsMap).map(fs => (fs.used || 0) + (fs.free || 0)).filter(v => Number.isFinite(v) && v > 0);
  const maxDiskTotalBytes = diskTotals.length > 0 ? Math.max(...diskTotals) : 0;

  // 获取负载均衡（修复字符串.toFixed报错）
  const latestLoad = cpuLoadRows[0] ? normalizeRow(cpuLoadRows[0]) : {};
  const loadVal = Number(latestLoad.value);
  const load1m = !isNaN(loadVal) && loadVal > 0 ? loadVal.toFixed(2) : "0.00";
  const latestCpuCore = normalizeRow((cpuCoreRows && cpuCoreRows[0]) || {});
  const cpuCores = Number(latestCpuCore.cpu_cores);
  const hostNameForRow = String(latestLoad.host_name || "unknown").trim() || "unknown";
  const primaryIp = latestLoad.host_ip || "-";
  const { rxBytes, txBytes } = await queryHostNetworkTotals(conn, startIso, endIso, hostNameForRow);

  // 判断健康状态
  let healthStatus = 'healthy';
  const alerts = [];
  const cpuNum = parseFloat(cpuUtilization);
  const memNum = parseFloat(memoryUtilization);
  const diskNum = parseFloat(maxDiskUtil);

  if (cpuNum > 95 || memNum > 95 || diskNum > 95) {
    healthStatus = 'critical';
  } else if (cpuNum > 80 || memNum > 85 || diskNum > 80) {
    healthStatus = 'warning';
  }

  // 返回主机列表（当前单主机场景，后续扩展为多主机）
  return [{
    hostname: hostNameForRow,
    primaryIp,
    networkReceiveBytes: rxBytes,
    networkTransmitBytes: txBytes,
    networkReceiveDisplay: formatBytes(rxBytes),
    networkTransmitDisplay: formatBytes(txBytes),
    osType: latestLoad.os_type || 'linux',
    arch: latestLoad.host_arch || 'amd64',
    
    cpuUtilization,
    loadAvg1m: load1m,
    
    memoryUtilization,
    memoryUsed: usedMem,
    memoryTotal: totalMem,
    memoryFormatted: {
      used: formatBytes(usedMem),
      total: formatBytes(totalMem)
    },
    cpuCores: Number.isFinite(cpuCores) && cpuCores > 0 ? Math.round(cpuCores) : null,
    diskTotalBytes: maxDiskTotalBytes,
    diskTotalDisplay: formatBytes(maxDiskTotalBytes),
    
    maxDiskUtilization: maxDiskUtil,
    
    healthStatus,
    alertCount: alerts.length,
    
    lastUpdate: new Date().toISOString()
  }];
}

/**
 * 根据小时数计算聚合间隔（分钟）
 */
function getBucketMinutes(hours) {
  if (hours <= 6) return 5;
  if (hours <= 24) return 30;
  if (hours <= 72) return 60;
  return 120;
}

/**
 * 生成 Doris 兼容的时间桶表达式
 * 使用 SUBSTR + CAST 确保最大兼容性
 */
function timeBucketExpr(minutes) {
  if (minutes <= 1) return "SUBSTR(CAST(timestamp AS VARCHAR), 1, 19)";
  if (minutes === 5) return "SUBSTR(CONCAT(CAST(timestamp AS VARCHAR), '00'), 1, 16)";
  if (minutes === 30) return "SUBSTR(CONCAT(CAST(timestamp AS VARCHAR), ':00'), 1, 14)";
  if (minutes === 60) return "SUBSTR(CAST(timestamp AS VARCHAR), 1, 13)";
  if (minutes === 120) return "SUBSTR(CAST(timestamp AS VARCHAR), 1, 13)";
  return "SUBSTR(CAST(timestamp AS VARCHAR), 1, 13)";
}

/**
 * 查询 CPU 趋势数据（按时段聚合）
 */
async function queryCpuTrendData(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT 
        ${bucketExpr} AS time_bucket,
        SUM(CASE WHEN get_json_string(attributes, '$.state') IN ('user','system','iowait','irq','softirq','steal') THEN value ELSE 0 END) AS busy_time,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'idle' THEN value ELSE 0 END) AS idle_time,
        COUNT(*) AS sample_count
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.cpu.time'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY ${bucketExpr}
     ORDER BY time_bucket`,
    [startIso, endIso]
  );

  const timestamps = [];
  const data = [];

  for (const r of rows.map(normalizeRow)) {
    timestamps.push(r.time_bucket);
    const total = (Number(r.busy_time) || 0) + (Number(r.idle_time) || 0);
    data.push({
      utilization: total > 0 ? (((Number(r.busy_time) || 0) / total) * 100).toFixed(1) : "0",
      busyPct: total > 0 ? (((Number(r.busy_time) || 0) / total) * 100).toFixed(1) : "0",
      idlePct: total > 0 ? (((Number(r.idle_time) || 0) / total) * 100).toFixed(1) : "100"
    });
  }

  return { timestamps, data };
}

/** 统一时间桶键，便于与全集群趋势时间轴对齐 */
function normTrendTimeKey(ts) {
  if (ts == null) return "";
  if (ts instanceof Date) return ts.toISOString().replace("T", " ").slice(0, 16);
  const s = String(ts);
  return s.length >= 16 ? s.slice(0, 16) : s;
}

/** 总览：与 CPU 同一时间轴对齐的各主机利用率序列（内存 / 磁盘） */
function buildUtilByHostSeries(hostList, timestamps, perHostMap) {
  if (!perHostMap || perHostMap.size === 0 || !hostList?.length || !timestamps?.length) return undefined;
  return hostList.map((h) => {
    const inner = perHostMap.get(h.hostname);
    return {
      hostname: h.hostname,
      data: timestamps.map((ts) => {
        const u = inner?.get(normTrendTimeKey(ts));
        if (u == null || !Number.isFinite(u)) return { utilization: null };
        return { utilization: u.toFixed(1) };
      }),
    };
  });
}

/** 总览：各主机网络收发时间序列（MB） */
function buildNetworkByHostSeries(hostList, timestamps, perHostMap) {
  if (!perHostMap || perHostMap.size === 0 || !hostList?.length || !timestamps?.length) return undefined;
  return hostList.map((h) => {
    const inner = perHostMap.get(h.hostname);
    return {
      hostname: h.hostname,
      data: timestamps.map((ts) => {
        const b = inner?.get(normTrendTimeKey(ts));
        const rx = b?.rx || 0;
        const tx = b?.tx || 0;
        return {
          receiveMB: (rx / 1024 / 1024).toFixed(2),
          transmitMB: (tx / 1024 / 1024).toFixed(2),
        };
      }),
    };
  });
}

/** 总览：各主机磁盘 IO 读写时间序列（MB） */
function buildDiskIoByHostSeries(hostList, timestamps, perHostMap) {
  if (!perHostMap || perHostMap.size === 0 || !hostList?.length || !timestamps?.length) return undefined;
  return hostList.map((h) => {
    const inner = perHostMap.get(h.hostname);
    return {
      hostname: h.hostname,
      data: timestamps.map((ts) => {
        const b = inner?.get(normTrendTimeKey(ts));
        const read = b?.read || 0;
        const write = b?.write || 0;
        return {
          readMB: (read / 1024 / 1024).toFixed(2),
          writeMB: (write / 1024 / 1024).toFixed(2),
        };
      }),
    };
  });
}

/**
 * 按主机 + 时间桶聚合 CPU 使用率（总览多线趋势）
 * @returns {Map<string, Map<string, number>>} hostname -> (timeKey -> utilization 0–100)
 */
async function queryCpuTrendPerHost(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT 
        ${bucketExpr} AS time_bucket,
        get_json_string(resource_attributes, '$.host.name') AS hostname,
        SUM(CASE WHEN get_json_string(attributes, '$.state') IN ('user','system','iowait','irq','softirq','steal') THEN value ELSE 0 END) AS busy_time,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'idle' THEN value ELSE 0 END) AS idle_time
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.cpu.time'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY ${bucketExpr}, get_json_string(resource_attributes, '$.host.name')
     ORDER BY time_bucket, hostname`,
    [startIso, endIso]
  );

  const out = new Map();
  for (const r of rows.map(normalizeRow)) {
    const host = String(r.hostname || "unknown").trim() || "unknown";
    const tk = normTrendTimeKey(r.time_bucket);
    const total = (Number(r.busy_time) || 0) + (Number(r.idle_time) || 0);
    const util = total > 0 ? ((Number(r.busy_time) || 0) / total) * 100 : 0;
    if (!out.has(host)) out.set(host, new Map());
    out.get(host).set(tk, util);
  }
  return out;
}

/**
 * 按主机 + 时间桶聚合内存使用率（与 queryCpuTrendPerHost 对齐时间键）
 * @returns {Map<string, Map<string, number>>} hostname -> (timeKey -> utilization 0–100)
 */
async function queryMemoryTrendPerHost(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT 
        ${bucketExpr} AS time_bucket,
        get_json_string(resource_attributes, '$.host.name') AS hostname,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) AS used_bytes,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value ELSE 0 END) AS free_bytes,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'cached' THEN value ELSE 0 END) AS cached_bytes,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'buffer' THEN value ELSE 0 END) AS buffer_bytes
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.memory.usage'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY ${bucketExpr}, get_json_string(resource_attributes, '$.host.name')
     ORDER BY time_bucket, hostname`,
    [startIso, endIso]
  );

  const out = new Map();
  for (const r of rows.map(normalizeRow)) {
    const host = String(r.hostname || "unknown").trim() || "unknown";
    const tk = normTrendTimeKey(r.time_bucket);
    const used = Number(r.used_bytes) || 0;
    const free = Number(r.free_bytes) || 0;
    const cached = Number(r.cached_bytes) || 0;
    const buffer = Number(r.buffer_bytes) || 0;
    const total = used + free + cached + buffer;
    const util = total > 0 ? (used / total) * 100 : 0;
    if (!out.has(host)) out.set(host, new Map());
    out.get(host).set(tk, util);
  }
  return out;
}

/**
 * 按主机 + 时间桶聚合根分区磁盘使用率
 * @returns {Map<string, Map<string, number>>} hostname -> (timeKey -> utilization 0–100)
 */
async function queryDiskTrendPerHost(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT 
        ${bucketExpr} AS time_bucket,
        get_json_string(resource_attributes, '$.host.name') AS hostname,
        MAX(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value END) AS used_bytes,
        MAX(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value END) AS free_bytes
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.filesystem.usage'
       AND get_json_string(attributes, '$.mountpoint') = '/'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY ${bucketExpr}, get_json_string(resource_attributes, '$.host.name')
     ORDER BY time_bucket, hostname`,
    [startIso, endIso]
  );

  const out = new Map();
  for (const r of rows.map(normalizeRow)) {
    const host = String(r.hostname || "unknown").trim() || "unknown";
    const tk = normTrendTimeKey(r.time_bucket);
    const used = Number(r.used_bytes) || 0;
    const free = Number(r.free_bytes) || 0;
    const total = used + free;
    const util = total > 0 ? (used / total) * 100 : 0;
    if (!out.has(host)) out.set(host, new Map());
    out.get(host).set(tk, util);
  }
  return out;
}

/**
 * 按主机 + 时间桶汇总网络收发（排除 lo）
 * @returns {Map<string, Map<string, { rx: number, tx: number }>>}
 */
async function queryNetworkTrendPerHost(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT
        time_bucket,
        hostname,
        device,
        direction,
        CASE
          WHEN prev_value IS NULL THEN 0
          WHEN max_value >= prev_value THEN max_value - prev_value
          ELSE 0
        END AS bytes
     FROM (
       SELECT
         time_bucket,
         hostname,
         device,
         direction,
         max_value,
         LAG(max_value) OVER (PARTITION BY hostname, device, direction ORDER BY time_bucket) AS prev_value
       FROM (
         SELECT
           ${bucketExpr} AS time_bucket,
           get_json_string(resource_attributes, '$.host.name') AS hostname,
           get_json_string(attributes, '$.device') AS device,
           get_json_string(attributes, '$.direction') AS direction,
           MAX(value) AS max_value
         FROM \`opsRobot\`.\`host_metrics_sum\`
         WHERE metric_name = 'system.network.io'
           AND timestamp >= ? AND timestamp <= ?
         GROUP BY ${bucketExpr}, get_json_string(resource_attributes, '$.host.name'), get_json_string(attributes, '$.device'), get_json_string(attributes, '$.direction')
       ) b
     ) w
     ORDER BY time_bucket, hostname`,
    [startIso, endIso]
  );

  const out = new Map();
  for (const r of rows.map(normalizeRow)) {
    const host = String(r.hostname || "unknown").trim() || "unknown";
    const tk = normTrendTimeKey(r.time_bucket);
    const device = String(r.device || "");
    const direction = String(r.direction || "");
    const b = Number(r.bytes) || 0;
    if (!out.has(host)) out.set(host, new Map());
    if (!out.get(host).has(tk)) out.get(host).set(tk, { rx: 0, tx: 0 });
    const bucket = out.get(host).get(tk);
    if (direction === "receive" && device !== "lo") bucket.rx += b;
    if (direction === "transmit" && device !== "lo") bucket.tx += b;
  }
  return out;
}

/**
 * 按主机 + 时间桶汇总磁盘 IO 读写（字节）
 * @returns {Map<string, Map<string, { read: number, write: number }>>}
 */
async function queryDiskIoTrendPerHost(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT
        time_bucket,
        hostname,
        device,
        direction,
        CASE
          WHEN prev_value IS NULL THEN 0
          WHEN max_value >= prev_value THEN max_value - prev_value
          ELSE 0
        END AS bytes
     FROM (
       SELECT
         time_bucket,
         hostname,
         device,
         direction,
         max_value,
         LAG(max_value) OVER (PARTITION BY hostname, device, direction ORDER BY time_bucket) AS prev_value
       FROM (
         SELECT
           ${bucketExpr} AS time_bucket,
           get_json_string(resource_attributes, '$.host.name') AS hostname,
           get_json_string(attributes, '$.device') AS device,
           get_json_string(attributes, '$.direction') AS direction,
           MAX(value) AS max_value
         FROM \`opsRobot\`.\`host_metrics_sum\`
         WHERE metric_name = 'system.disk.io'
           AND timestamp >= ? AND timestamp <= ?
         GROUP BY ${bucketExpr}, get_json_string(resource_attributes, '$.host.name'), get_json_string(attributes, '$.device'), get_json_string(attributes, '$.direction')
       ) b
     ) w
     ORDER BY time_bucket, hostname`,
    [startIso, endIso]
  );

  const out = new Map();
  for (const r of rows.map(normalizeRow)) {
    const host = String(r.hostname || "unknown").trim() || "unknown";
    const tk = normTrendTimeKey(r.time_bucket);
    const direction = String(r.direction || "").toLowerCase();
    const b = Number(r.bytes) || 0;
    if (!out.has(host)) out.set(host, new Map());
    if (!out.get(host).has(tk)) out.get(host).set(tk, { read: 0, write: 0 });
    const bucket = out.get(host).get(tk);
    if (direction.includes("read")) bucket.read += b;
    if (direction.includes("write")) bucket.write += b;
  }
  return out;
}

/**
 * 查询内存趋势数据
 */
async function queryMemoryTrendData(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT 
        ${bucketExpr} AS time_bucket,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) AS used_bytes,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value ELSE 0 END) AS free_bytes,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'cached' THEN value ELSE 0 END) AS cached_bytes,
        SUM(CASE WHEN get_json_string(attributes, '$.state') = 'buffer' THEN value ELSE 0 END) AS buffer_bytes
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.memory.usage'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY ${bucketExpr}
     ORDER BY time_bucket`,
    [startIso, endIso]
  );

  const timestamps = [];
  const data = [];

  for (const r of rows.map(normalizeRow)) {
    timestamps.push(r.time_bucket);
    const used = Number(r.used_bytes) || 0;
    const free = Number(r.free_bytes) || 0;
    const cached = Number(r.cached_bytes) || 0;
    const buffer = Number(r.buffer_bytes) || 0;
    const total = used + free + cached + buffer;
    data.push({
      usedGB: (used / 1024 / 1024 / 1024).toFixed(2),
      freeGB: (free / 1024 / 1024 / 1024).toFixed(2),
      utilization: total > 0 ? ((used / total) * 100).toFixed(1) : "0"
    });
  }

  return { timestamps, data };
}

/**
 * 查询磁盘使用率趋势
 */
async function queryDiskTrendData(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT 
        ${bucketExpr} AS time_bucket,
        get_json_string(attributes, '$.mountpoint') AS mountpoint,
        MAX(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) AS used_bytes,
        MAX(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value ELSE 0 END) AS free_bytes
     FROM \`opsRobot\`.\`host_metrics_sum\`
     WHERE metric_name = 'system.filesystem.usage'
       AND timestamp >= ? AND timestamp <= ?
     GROUP BY ${bucketExpr}, mountpoint
     ORDER BY time_bucket`,
    [startIso, endIso]
  );

  const tsSet = [...new Set(rows.map(r => r.time_bucket))];
  const timestamps = tsSet.sort();
  const data = timestamps.map(ts => {
    const point = rows.filter(r => r.time_bucket === ts && r.mountpoint === '/');
    const used = point[0] ? Number(point[0].used_bytes) || 0 : 0;
    const free = point[0] ? Number(point[0].free_bytes) || 0 : 0;
    const total = used + free;
    return {
      utilization: total > 0 ? ((used / total) * 100).toFixed(1) : "0",
      usedGB: (used / 1024 / 1024 / 1024).toFixed(2)
    };
  });

  return { timestamps, data };
}

/**
 * 查询网络流量趋势
 */
async function queryNetworkTrendData(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT
        time_bucket,
        device,
        direction,
        CASE
          WHEN prev_value IS NULL THEN 0
          WHEN max_value >= prev_value THEN max_value - prev_value
          ELSE 0
        END AS bytes
     FROM (
       SELECT
         time_bucket,
         device,
         direction,
         max_value,
         LAG(max_value) OVER (PARTITION BY device, direction ORDER BY time_bucket) AS prev_value
       FROM (
         SELECT
           ${bucketExpr} AS time_bucket,
           get_json_string(attributes, '$.device') AS device,
           get_json_string(attributes, '$.direction') AS direction,
           MAX(value) AS max_value
         FROM \`opsRobot\`.\`host_metrics_sum\`
         WHERE metric_name = 'system.network.io'
           AND timestamp >= ? AND timestamp <= ?
         GROUP BY ${bucketExpr}, device, direction
       ) b
     ) w
     ORDER BY time_bucket`,
    [startIso, endIso]
  );

  const tsSet = [...new Set(rows.map(r => r.time_bucket))];
  const timestamps = tsSet.sort();
  const data = timestamps.map(ts => {
    const points = rows.filter(r => r.time_bucket === ts);
    let receiveBytes = 0, transmitBytes = 0;
    for (const p of points) {
      if (p.direction === 'receive' && p.device !== 'lo') receiveBytes += Number(p.bytes) || 0;
      if (p.direction === 'transmit' && p.device !== 'lo') transmitBytes += Number(p.bytes) || 0;
    }
    return {
      receiveMB: (receiveBytes / 1024 / 1024).toFixed(2),
      transmitMB: (transmitBytes / 1024 / 1024).toFixed(2)
    };
  });

  return { timestamps, data };
}

/**
 * 查询集群磁盘 IO 趋势（各设备读写字节汇总，按时间桶）
 */
async function queryDiskIoTrendData(conn, startIso, endIso, hours) {
  const bucketMin = getBucketMinutes(hours);
  const bucketExpr = timeBucketExpr(bucketMin);

  const [rows] = await conn.query(
    `SELECT
        time_bucket,
        device,
        direction,
        CASE
          WHEN prev_value IS NULL THEN 0
          WHEN max_value >= prev_value THEN max_value - prev_value
          ELSE 0
        END AS bytes
     FROM (
       SELECT
         time_bucket,
         device,
         direction,
         max_value,
         LAG(max_value) OVER (PARTITION BY device, direction ORDER BY time_bucket) AS prev_value
       FROM (
         SELECT
           ${bucketExpr} AS time_bucket,
           get_json_string(attributes, '$.device') AS device,
           get_json_string(attributes, '$.direction') AS direction,
           MAX(value) AS max_value
         FROM \`opsRobot\`.\`host_metrics_sum\`
         WHERE metric_name = 'system.disk.io'
           AND timestamp >= ? AND timestamp <= ?
         GROUP BY ${bucketExpr}, device, direction
       ) b
     ) w
     ORDER BY time_bucket`,
    [startIso, endIso]
  );

  const tsSet = [...new Set(rows.map((r) => r.time_bucket))];
  const timestamps = tsSet.sort();
  const data = timestamps.map((ts) => {
    const points = rows.filter((r) => r.time_bucket === ts);
    let readBytes = 0;
    let writeBytes = 0;
    for (const p of points) {
      const dir = String(p.direction || "").toLowerCase();
      if (dir.includes("read")) readBytes += Number(p.bytes) || 0;
      if (dir.includes("write")) writeBytes += Number(p.bytes) || 0;
    }
    return {
      readMB: (readBytes / 1024 / 1024).toFixed(2),
      writeMB: (writeBytes / 1024 / 1024).toFixed(2),
    };
  });

  return { timestamps, data };
}

/**
 * 查询 Top N 主机排行（通用）
 */
async function queryTopHostsByMetric(conn, metricType, startIso, endIso, limit) {
  switch (metricType) {
    case 'cpu': {
      const [rows] = await conn.query(
        `SELECT hostname, AVG(cpu_pct) * 100 AS value FROM (
           SELECT
              get_json_string(resource_attributes, '$.host.name') AS hostname,
              SUM(CASE WHEN get_json_string(attributes, '$.state') IN ('user','system','iowait','irq','softirq','steal') THEN value ELSE 0 END) /
              NULLIF(SUM(value), 0) AS cpu_pct
           FROM \`opsRobot\`.\`host_metrics_sum\`
           WHERE metric_name = 'system.cpu.time'
             AND timestamp >= ? AND timestamp <= ?
           GROUP BY get_json_string(resource_attributes, '$.host.name'), SUBSTR(CAST(timestamp AS VARCHAR), 1, 16)
         ) t
         GROUP BY hostname
         ORDER BY value DESC
         LIMIT ?`,
        [startIso, endIso, limit]
      );
      const coreMap = new Map();
      try {
        const [coreRows] = await conn.query(
          `SELECT get_json_string(resource_attributes, '$.host.name') AS hostname,
                  ROUND(AVG(value), 0) AS cpu_cores
           FROM \`opsRobot\`.\`host_metrics_gauge\`
           WHERE metric_name = 'system.cpu.logical.count'
             AND timestamp >= ? AND timestamp <= ?
             AND get_json_string(resource_attributes, '$.host.name') IS NOT NULL
             AND get_json_string(resource_attributes, '$.host.name') != ''
           GROUP BY get_json_string(resource_attributes, '$.host.name')`,
          [startIso, endIso]
        );
        for (const cr of coreRows.map(normalizeRow)) {
          const hn = cr.hostname || "";
          if (hn) coreMap.set(hn, Number(cr.cpu_cores) || 0);
        }
      } catch (e) {
        console.warn("[host-monitor] system.cpu.logical.count lookup failed:", e?.message || e);
      }
      return rows.map((r) => {
        const nr = normalizeRow(r);
        const hn = nr.hostname || "unknown";
        return {
          hostname: hn,
          value: parseFloat(Number(nr.value || 0).toFixed(1)),
          unit: "%",
          cpuCores: coreMap.has(hn) ? coreMap.get(hn) : null,
        };
      });
    }

    case 'memory': {
      const [rows] = await conn.query(
        `SELECT hostname, MAX(mem_pct) * 100 AS value, AVG(used_bytes) / 1024 / 1024 / 1024 AS usedGB, AVG(total_bytes) / 1024 / 1024 / 1024 AS totalGB FROM (
           SELECT
              get_json_string(resource_attributes, '$.host.name') AS hostname,
              SUM(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) /
              NULLIF(SUM(value), 0) AS mem_pct,
              SUM(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) AS used_bytes,
              SUM(value) AS total_bytes
           FROM \`opsRobot\`.\`host_metrics_sum\`
           WHERE metric_name = 'system.memory.usage'
             AND timestamp >= ? AND timestamp <= ?
           GROUP BY get_json_string(resource_attributes, '$.host.name'), SUBSTR(CAST(timestamp AS VARCHAR), 1, 16)
         ) t
         GROUP BY hostname
         ORDER BY value DESC
         LIMIT ?`,
        [startIso, endIso, limit]
      );
      return rows.map((r) => {
        const nr = normalizeRow(r);
        const used = Number(nr.usedGB ?? nr.usedgb ?? 0);
        const total = Number(nr.totalGB ?? nr.totalgb ?? 0);
        const free = Math.max(0, total - used);
        return {
          hostname: nr.hostname || "unknown",
          value: parseFloat(Number(nr.value || 0).toFixed(1)),
          unit: "%",
          usedGB: used.toFixed(1),
          totalGB: total.toFixed(1),
          freeGB: free.toFixed(1),
        };
      });
    }

    case 'disk_io': {
      const [rows] = await conn.query(
        `SELECT hostname, MAX(disk_pct) * 100 AS value FROM (
           SELECT
              get_json_string(resource_attributes, '$.host.name') AS hostname,
              get_json_string(attributes, '$.mountpoint') AS mountpoint,
              CASE WHEN (MAX(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) +
                        MAX(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value ELSE 0 END)) > 0
                THEN MAX(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) /
                     (MAX(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) +
                      MAX(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value ELSE 0 END))
                ELSE 0 END AS disk_pct
           FROM \`opsRobot\`.\`host_metrics_sum\`
           WHERE metric_name = 'system.filesystem.usage'
             AND timestamp >= ? AND timestamp <= ?
           GROUP BY get_json_string(resource_attributes, '$.host.name'), get_json_string(attributes, '$.mountpoint')
         ) t
         GROUP BY hostname
         ORDER BY value DESC
         LIMIT ?`,
        [startIso, endIso, limit]
      );
      const spaceMap = new Map();
      try {
        const [spaceRows] = await conn.query(
          `SELECT
              get_json_string(resource_attributes, '$.host.name') AS hostname,
              MAX(CASE WHEN get_json_string(attributes, '$.state') = 'used' THEN value ELSE 0 END) / 1024 / 1024 / 1024 AS used_gb,
              MAX(CASE WHEN get_json_string(attributes, '$.state') = 'free' THEN value ELSE 0 END) / 1024 / 1024 / 1024 AS free_gb
           FROM \`opsRobot\`.\`host_metrics_sum\`
           WHERE metric_name = 'system.filesystem.usage'
             AND timestamp >= ? AND timestamp <= ?
             AND get_json_string(attributes, '$.mountpoint') = '/'
           GROUP BY get_json_string(resource_attributes, '$.host.name')`,
          [startIso, endIso]
        );
        for (const sr of spaceRows.map(normalizeRow)) {
          const hn = sr.hostname || "";
          if (!hn) continue;
          const u = Number(sr.used_gb ?? sr.usedGb ?? sr.usedGB ?? 0) || 0;
          const f = Number(sr.free_gb ?? sr.freeGb ?? sr.freeGB ?? 0) || 0;
          const t = u + f;
          spaceMap.set(hn, { usedGB: u, freeGB: f, totalGB: t });
        }
      } catch (e) {
        console.warn("[host-monitor] disk space (/) lookup failed:", e?.message || e);
      }
      return rows.map((r) => {
        const nr = normalizeRow(r);
        const hn = nr.hostname || "unknown";
        const sp = spaceMap.get(hn);
        const used = sp ? sp.usedGB : 0;
        const total = sp ? sp.totalGB : 0;
        const free = sp ? sp.freeGB : 0;
        return {
          hostname: hn,
          value: parseFloat(Number(nr.value || 0).toFixed(1)),
          unit: "%",
          usedGB: sp ? used.toFixed(1) : null,
          totalGB: sp ? total.toFixed(1) : null,
          freeGB: sp ? free.toFixed(1) : null,
        };
      });
    }

    case 'network': {
      const [rows] = await conn.query(
        `SELECT 
            hostname,
            SUM(CASE WHEN direction = 'receive' AND device != 'lo' THEN delta_bytes ELSE 0 END) / 1024 / 1024 AS rxMB,
            SUM(CASE WHEN direction = 'transmit' AND device != 'lo' THEN delta_bytes ELSE 0 END) / 1024 / 1024 AS txMB,
            SUM(CASE WHEN device != 'lo' THEN delta_bytes ELSE 0 END) / 1024 / 1024 AS value
         FROM (
           SELECT
             get_json_string(resource_attributes, '$.host.name') AS hostname,
             get_json_string(attributes, '$.device') AS device,
             get_json_string(attributes, '$.direction') AS direction,
             CASE WHEN MAX(value) >= MIN(value) THEN MAX(value) - MIN(value) ELSE 0 END AS delta_bytes
           FROM \`opsRobot\`.\`host_metrics_sum\`
           WHERE metric_name = 'system.network.io'
             AND timestamp >= ? AND timestamp <= ?
           GROUP BY get_json_string(resource_attributes, '$.host.name'), get_json_string(attributes, '$.device'), get_json_string(attributes, '$.direction')
         ) t
         GROUP BY hostname
         ORDER BY value DESC
         LIMIT ?`,
        [startIso, endIso, limit]
      );
      return rows.map(r => ({
        hostname: r.hostname || 'unknown',
        value: parseFloat(Number(r.value || 0).toFixed(1)),
        unit: 'MB/s',
        rxMB: Number(r.rxMB || 0).toFixed(1),
        txMB: Number(r.txMB || 0).toFixed(1)
      }));
    }

    default:
      return [];
  }
}
