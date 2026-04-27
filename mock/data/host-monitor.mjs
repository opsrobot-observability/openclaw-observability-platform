/**
 * 主机监控 Mock 数据（默认 10 台主机）
 * 用于 `npm run dev:mock` 等场景，无需连接 Doris
 */

const MOCK_HOST_COUNT = 10;

/** @param {string} s */
function strSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

/** 0..1 */
function rnd(seed, i = 0) {
  const x = Math.sin((seed + i * 9973) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hostName(i) {
  return `mock-hv-${String(i + 1).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / k ** i).toFixed(2)} ${sizes[i]}`;
}

/**
 * 单机详情 Mock（hostname 与总览列表一致）
 * @param {{ hostname?: string, startIso?: string, endIso?: string, hours?: number | string }} [opts]
 */
export function mockHostMonitorData(opts = {}) {
  const now = new Date();
  const hostname = opts?.hostname || "";
  const displayName = hostname && String(hostname).trim() ? String(hostname).trim() : hostName(0);
  const seed = strSeed(displayName);
  const cpuU = (18 + rnd(seed, 1) * 55).toFixed(1);
  const memU = (40 + rnd(seed, 2) * 45).toFixed(1);
  const diskU = (35 + rnd(seed, 3) * 45).toFixed(1);
  const healthRoll = rnd(seed, 4);
  const healthStatus = healthRoll > 0.88 ? "critical" : healthRoll > 0.72 ? "warning" : "healthy";

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

  const startInput = parseInputDate(opts?.startIso);
  const endInput = parseInputDate(opts?.endIso);
  const hoursInput = Number(opts?.hours);

  let startDt = null;
  let endDt = null;
  if (startInput && endInput && endInput.getTime() > startInput.getTime()) {
    startDt = startInput;
    endDt = endInput;
  } else if (Number.isFinite(hoursInput) && hoursInput > 0) {
    const h = Math.min(Math.max(hoursInput, 1), 168);
    endDt = now;
    startDt = new Date(now.getTime() - h * 3600000);
  } else {
    endDt = now;
    startDt = new Date(now.getTime() - 24 * 3600000);
  }

  const rangeHours = Math.min(
    168,
    Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 3600000)),
  );

  const timestamps = [];
  const pointCount = Math.max(2, Math.floor((endDt.getTime() - startDt.getTime()) / 3600000) + 1);
  for (let i = 0; i < pointCount; i += 1) {
    timestamps.push(new Date(startDt.getTime() + i * 3600000).toISOString());
  }

  const cpuBase = Number(cpuU);
  const memBase = Number(memU);
  const cpuUtilization = timestamps.map((_, i) => {
    const wave = Math.sin((i / Math.max(8, pointCount)) * Math.PI * 2) * 6;
    const noise = (rnd(seed, 200 + i) - 0.5) * 5;
    const v = Math.min(99.5, Math.max(0, cpuBase + wave + noise));
    return Number(v.toFixed(1));
  });
  const memoryUtilization = timestamps.map((_, i) => {
    const wave = Math.sin((i / Math.max(10, pointCount)) * Math.PI * 2 + 1.1) * 4;
    const noise = (rnd(seed, 300 + i) - 0.5) * 4;
    const v = Math.min(99.5, Math.max(0, memBase + wave + noise));
    return Number(v.toFixed(1));
  });
  const loadAverage = timestamps.map((_, i) => {
    const l1Base = 0.8 + rnd(seed, 21) * 6;
    const l1Wave = Math.sin((i / Math.max(8, pointCount)) * Math.PI * 2 + 0.6) * 0.55;
    const l1Noise = (rnd(seed, 400 + i) - 0.5) * 0.4;
    const load1m = Math.max(0.05, l1Base + l1Wave + l1Noise);
    const load5m = Math.max(0.05, load1m * (0.88 + rnd(seed, 500 + i) * 0.12));
    const load15m = Math.max(0.05, load5m * (0.88 + rnd(seed, 600 + i) * 0.12));
    return {
      load1m: Number(load1m.toFixed(2)),
      load5m: Number(load5m.toFixed(2)),
      load15m: Number(load15m.toFixed(2)),
    };
  });

  /** 与 Doris `queryNetworkTrendData` 一致：每点 { receiveMB, transmitMB }（MB，两位小数） */
  const network = timestamps.map((_, i) => {
    const wave = Math.sin((i / Math.max(8, pointCount)) * Math.PI * 2 + 0.3) * 18;
    const rx = 55 + rnd(seed, 800 + i) * 120 + wave;
    const tx = 45 + rnd(seed, 900 + i) * 95 + wave * 0.85;
    return {
      receiveMB: Math.max(0.1, rx).toFixed(2),
      transmitMB: Math.max(0.1, tx).toFixed(2),
    };
  });

  const diskMaxUtilization = timestamps.map((_, i) => {
    const wave = Math.sin((i / Math.max(10, pointCount)) * Math.PI * 2 + 0.5) * 5;
    const noise = (rnd(seed, 1000 + i) - 0.5) * 4;
    const v = Math.min(99.5, Math.max(0, Number(diskU) + wave + noise));
    return Number(v.toFixed(1));
  });

  const onlineStatus = timestamps.map(() => 1);

  return {
    generatedAt: now.toISOString(),
    dataTimestamp: now.toISOString(),
    timeRange: {
      start: startDt.toISOString(),
      end: endDt.toISOString(),
      hours: rangeHours,
    },

    hostInfo: {
      name: displayName,
      osType: "linux",
      arch: rnd(seed, 5) > 0.85 ? "arm64" : "amd64",
    },

    summary: {
      avgCpuUtilization: cpuU,
      avgMemoryUtilization: memU,
      maxDiskUtilization: diskU,
      loadAverage: {
        "1m": (0.8 + rnd(seed, 6) * 6).toFixed(2),
        "5m": (1.0 + rnd(seed, 7) * 5).toFixed(2),
        "15m": (1.2 + rnd(seed, 8) * 4).toFixed(2),
      },
      processCount: 120 + Math.floor(rnd(seed, 9) * 180),
      networkInterfaces: 3,
      alertCount: {
        critical: healthStatus === "critical" ? 2 : 0,
        warning: healthStatus === "warning" ? 1 : healthStatus === "critical" ? 1 : 0,
      },
      warningHosts: healthStatus === "warning" || healthStatus === "critical" ? 1 : 0,
      criticalHosts: healthStatus === "critical" ? 1 : 0,
      diskReadOps: Math.floor(800 + rnd(seed, 35) * 4000),
      diskWriteOps: Math.floor(600 + rnd(seed, 36) * 3000),
      diskReadBytes: `${(120 + rnd(seed, 37) * 400).toFixed(0)} KB/s`,
      diskWriteBytes: `${(80 + rnd(seed, 38) * 300).toFixed(0)} KB/s`,
    },

    cpu: {
      coreCount: 8 + Math.floor(rnd(seed, 10) * 24),
      utilizationPercent: cpuU,
      userPercent: (12 + rnd(seed, 11) * 25).toFixed(1),
      systemPercent: (5 + rnd(seed, 12) * 12).toFixed(1),
      iowaitPercent: (0.5 + rnd(seed, 13) * 4).toFixed(1),
      idlePercent: (40 + rnd(seed, 14) * 40).toFixed(1),
      stealPercent: (0 + rnd(seed, 15) * 2).toFixed(1),
      nicePercent: (0 + rnd(seed, 16) * 1).toFixed(1),
      irqPercent: (0 + rnd(seed, 17) * 0.5).toFixed(1),
      softIrqPercent: (0 + rnd(seed, 18) * 0.5).toFixed(1),
      contextSwitches: Math.floor(8000 + rnd(seed, 19) * 12000),
      interrupts: Math.floor(5000 + rnd(seed, 20) * 8000),
      load: {
        hostname: displayName,
        osType: "linux",
        arch: "amd64",
        loadAvg1m: Number((0.8 + rnd(seed, 21) * 6).toFixed(2)),
        loadAvg5m: Number((1.0 + rnd(seed, 22) * 5).toFixed(2)),
        loadAvg15m: Number((1.2 + rnd(seed, 23) * 4).toFixed(2)),
      },
    },

    memory: {
      totalBytes: 68719476736,
      usedBytes: Math.floor(68719476736 * (parseFloat(memU) / 100)),
      freeBytes: 2147483648,
      cachedBytes: 17179869184,
      bufferBytes: 1073741824,
      utilizationPercent: memU,
      pageTables: `${Math.floor(80 + rnd(seed, 24) * 120)} MB`,
      swapFormatted: { total: "8.00 GB", used: "0 B" },
      formatted: {
        total: "64.00 GB",
        used: `${(42 + rnd(seed, 25) * 10).toFixed(1)} GB`,
        free: "2.00 GB",
        cached: "16.00 GB",
        buffer: "1.00 GB",
        available: `${(18 + rnd(seed, 26) * 8).toFixed(1)} GB`,
      },
    },

    disks: [
      {
        device: "/dev/sda1",
        mountpoint: "/",
        fsType: "ext4",
        totalBytes: 500 * 1024 * 1024 * 1024,
        usedBytes: 300 * 1024 * 1024 * 1024,
        freeBytes: 200 * 1024 * 1024 * 1024,
        utilizationPercent: "60.0",
        ioReadBytes: 107374182400,
        ioWriteBytes: 53687091200,
        readOperations: 15000,
        writeOperations: 8000,
        totalFormatted: "500.00 GB",
        usedFormatted: "300.00 GB",
        freeFormatted: "200.00 GB",
        ioReadFormatted: "100.00 GB",
        ioWriteFormatted: "50.00 GB",
      },
      {
        device: "/dev/sdb1",
        mountpoint: "/data",
        fsType: "xfs",
        totalBytes: 1024 * 1024 * 1024 * 1024,
        usedBytes: 858993459200,
        freeBytes: 164926744166,
        utilizationPercent: "83.7",
        ioReadBytes: 214748364800,
        ioWriteBytes: 322122547200,
        readOperations: 25000,
        writeOperations: 30000,
        totalFormatted: "1.00 TB",
        usedFormatted: "800.00 GB",
        freeFormatted: "153.60 GB",
        ioReadFormatted: "200.00 GB",
        ioWriteFormatted: "300.00 GB",
      },
    ],

    networks: [
      {
        device: "eth0",
        receiveBytes: 10737418240,
        transmitBytes: 5368709120,
        receivePackets: 8500000,
        transmitPackets: 4200000,
        receiveErrors: 12,
        transmitErrors: 3,
        receiveDropped: 45,
        transmitDropped: 8,
        connections: 256,
        receiveFormatted: "10.00 GB",
        transmitFormatted: "5.00 GB",
      },
      {
        device: "eth1",
        receiveBytes: 5368709120,
        transmitBytes: 10737418240,
        receivePackets: 3200000,
        transmitPackets: 6800000,
        receiveErrors: 0,
        transmitErrors: 1,
        receiveDropped: 2,
        transmitDropped: 0,
        connections: 128,
        receiveFormatted: "5.00 GB",
        transmitFormatted: "10.00 GB",
      },
      {
        device: "lo",
        receiveBytes: 1073741824,
        transmitBytes: 1073741824,
        receivePackets: 1200000,
        transmitPackets: 1200000,
        receiveErrors: 0,
        transmitErrors: 0,
        receiveDropped: 0,
        transmitDropped: 0,
        connections: 0,
        receiveFormatted: "1.00 GB",
        transmitFormatted: "1.00 GB",
      },
    ],

    processes: {
      running: 3 + Math.floor(rnd(seed, 30) * 6),
      sleeping: 180 + Math.floor(rnd(seed, 31) * 80),
      stopped: 2 + Math.floor(rnd(seed, 32) * 3),
      zombie: rnd(seed, 33) > 0.92 ? 1 : 0,
      total: 200 + Math.floor(rnd(seed, 34) * 100),
    },
    processDetails: [
      {
        pid: 1,
        name: "systemd",
        user: "root",
        cpuPercent: Number((0.2 + rnd(seed, 910) * 0.8).toFixed(1)),
        memoryPercent: Number((0.4 + rnd(seed, 911) * 0.8).toFixed(1)),
        state: "sleeping",
        command: "/usr/lib/systemd/systemd --system --deserialize=35",
      },
      {
        pid: 878,
        name: "node",
        user: "ops",
        cpuPercent: Number((8 + rnd(seed, 912) * 15).toFixed(1)),
        memoryPercent: Number((4 + rnd(seed, 913) * 10).toFixed(1)),
        state: "running",
        command: "node backend/server.mjs --env=dev",
      },
      {
        pid: 1024,
        name: "otelcol",
        user: "otel",
        cpuPercent: Number((2 + rnd(seed, 914) * 6).toFixed(1)),
        memoryPercent: Number((1 + rnd(seed, 915) * 4).toFixed(1)),
        state: "running",
        command: "/usr/local/bin/otelcol --config /etc/otel/config.yaml",
      },
      {
        pid: 1356,
        name: "sshd",
        user: "root",
        cpuPercent: Number((0.1 + rnd(seed, 916) * 0.9).toFixed(1)),
        memoryPercent: Number((0.2 + rnd(seed, 917) * 0.6).toFixed(1)),
        state: "sleeping",
        command: "sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups",
      },
      {
        pid: 2015,
        name: "python",
        user: "ops",
        cpuPercent: Number((1 + rnd(seed, 918) * 7).toFixed(1)),
        memoryPercent: Number((0.8 + rnd(seed, 919) * 3).toFixed(1)),
        state: "stopped",
        command: "python monitor_worker.py --queue host-check",
      },
    ],

    healthStatus,
    alerts: [],

    trends: {
      timestamps,
      cpuUtilization,
      memoryUtilization,
      diskMaxUtilization,
      network,
      loadAverage,
      onlineStatus,
    },
  };
}

/**
 * 总览 Mock：固定 10 台主机，指标随索引与 hours 变化
 * @param {{ hours?: number }} opts
 */
export function mockHostMonitorOverviewData(opts = {}) {
  const now = new Date();
  const hours = Math.min(Math.max(Number(opts.hours) || 24, 1), 168);

  const timestamps = [];
  for (let i = hours; i >= 0; i -= 1) {
    const t = new Date(now.getTime() - i * 3600000);
    timestamps.push(t.toISOString().replace("T", " ").slice(0, 16));
  }

  const seedBase = 4242;
  const cpuTrend = timestamps.map((_, idx) => ({
    utilization: (32 + rnd(seedBase, idx) * 35).toFixed(1),
    user: "25",
    system: "10",
    iowait: "3",
    idle: "62",
  }));

  const memoryTrend = timestamps.map((_, idx) => ({
    usedGB: (35 + rnd(seedBase + 1, idx) * 20).toFixed(2),
    freeGB: (10 + rnd(seedBase + 2, idx) * 15).toFixed(2),
    utilization: (58 + rnd(seedBase + 3, idx) * 28).toFixed(1),
  }));

  const diskTrend = timestamps.map((_, idx) => ({
    utilization: (48 + rnd(seedBase + 4, idx) * 32).toFixed(1),
    usedGB: (200 + rnd(seedBase + 5, idx) * 200).toFixed(2),
  }));

  const networkTrend = timestamps.map((_, idx) => ({
    receiveMB: (60 + rnd(seedBase + 6, idx) * 140).toFixed(2),
    transmitMB: (50 + rnd(seedBase + 7, idx) * 110).toFixed(2),
  }));

  const diskIoTrend = timestamps.map((_, idx) => ({
    readMB: (25 + rnd(seedBase + 8, idx) * 120).toFixed(2),
    writeMB: (18 + rnd(seedBase + 9, idx) * 95).toFixed(2),
  }));

  /** @type {{ hostname: string, primaryIp: string, networkReceiveDisplay: string, networkTransmitDisplay: string, osType: string, arch: string, cpuUtilization: string, loadAvg1m: string, memoryUtilization: string, memoryUsed: number, memoryTotal: number, memoryFormatted: { used: string, total: string }, maxDiskUtilization: string, healthStatus: string, alertCount: number, lastUpdate: string }[]} */
  const hostList = [];
  for (let i = 0; i < MOCK_HOST_COUNT; i += 1) {
    const hn = hostName(i);
    const s = strSeed(hn);
    const cpuU = 15 + (i * 7 + rnd(s, 1) * 40) % 75;
    const memU = 40 + (i * 5 + rnd(s, 2) * 45) % 55;
    const diskU = 35 + (i * 3 + rnd(s, 3) * 40) % 55;
    const load1 = (1 + rnd(s, 4) * 14).toFixed(2);
    const memTotal = 32 * 1024 * 1024 * 1024 + Math.floor(rnd(s, 5) * 96 * 1024 * 1024 * 1024);
    const memUsed = Math.floor(memTotal * (memU / 100));
    const diskTotalBytes = Math.floor((400 + rnd(s, 41) * 1600) * 1024 * 1024 * 1024);
    const rxBytes = Math.floor((60 + rnd(s, 20) * 140) * 1024 * 1024);
    const txBytes = Math.floor((50 + rnd(s, 21) * 110) * 1024 * 1024);
    let healthStatus = "healthy";
    if (i === 2 || i === 5) healthStatus = "warning";
    if (i === 7) healthStatus = "critical";

    hostList.push({
      hostname: hn,
      primaryIp: `10.${(i % 200) + 1}.${(i * 3) % 200}.${10 + (i % 240)}`,
      networkReceiveBytes: rxBytes,
      networkTransmitBytes: txBytes,
      networkReceiveDisplay: formatBytes(rxBytes),
      networkTransmitDisplay: formatBytes(txBytes),
      osType: "linux",
      arch: i % 4 === 3 ? "arm64" : "amd64",
      cpuCores: 4 + Math.floor(rnd(s, 30) * 60),
      cpuUtilization: cpuU.toFixed(1),
      loadAvg1m: load1,
      memoryUtilization: memU.toFixed(1),
      memoryUsed: memUsed,
      memoryTotal: memTotal,
      memoryFormatted: {
        used: `${(memUsed / 1024 ** 3).toFixed(1)} GB`,
        total: `${(memTotal / 1024 ** 3).toFixed(1)} GB`,
      },
      diskTotalBytes,
      diskTotalDisplay: formatBytes(diskTotalBytes),
      maxDiskUtilization: diskU.toFixed(1),
      healthStatus,
      alertCount: healthStatus === "critical" ? 3 : healthStatus === "warning" ? 1 : 0,
      lastUpdate: now.toISOString(),
    });
  }

  const healthyHosts = hostList.filter((h) => h.healthStatus === "healthy").length;
  const warningHosts = hostList.filter((h) => h.healthStatus === "warning").length;
  const criticalHosts = hostList.filter((h) => h.healthStatus === "critical").length;

  const avgCpu =
    hostList.reduce((a, h) => a + parseFloat(h.cpuUtilization), 0) / Math.max(hostList.length, 1);
  const avgMem =
    hostList.reduce((a, h) => a + parseFloat(h.memoryUtilization), 0) / Math.max(hostList.length, 1);
  const maxDisk = Math.max(...hostList.map((h) => parseFloat(h.maxDiskUtilization)));
  const avgLoad1 =
    hostList.reduce((a, h) => a + parseFloat(h.loadAvg1m), 0) / Math.max(hostList.length, 1);

  const rankCpu = [...hostList]
    .sort((a, b) => parseFloat(b.cpuUtilization) - parseFloat(a.cpuUtilization))
    .map((h) => ({
      hostname: h.hostname,
      value: parseFloat(h.cpuUtilization),
      unit: "%",
      cpuCores: 4 + Math.floor(rnd(strSeed(h.hostname), 30) * 60),
    }));

  const rankMem = [...hostList]
    .sort((a, b) => parseFloat(b.memoryUtilization) - parseFloat(a.memoryUtilization))
    .map((h) => {
      const total = Number((h.memoryTotal || 0) / 1024 ** 3);
      const used = Number((h.memoryUsed || 0) / 1024 ** 3);
      const free = Math.max(0, total - used);
      return {
        hostname: h.hostname,
        value: parseFloat(h.memoryUtilization),
        unit: "%",
        usedGB: used.toFixed(1),
        totalGB: total.toFixed(1),
        freeGB: free.toFixed(1),
      };
    });

  /** 磁盘利用率 Top（与总览 disk 排行一致，附根分区空间 GB） */
  const rankDiskUtil = [...hostList]
    .sort((a, b) => parseFloat(b.maxDiskUtilization) - parseFloat(a.maxDiskUtilization))
    .map((h) => {
      const s = strSeed(h.hostname);
      const total = 400 + rnd(s, 40) * 1600;
      const used = total * (parseFloat(h.maxDiskUtilization) / 100);
      const free = Math.max(0, total - used);
      return {
        hostname: h.hostname,
        value: parseFloat(h.maxDiskUtilization),
        unit: "%",
        usedGB: used.toFixed(1),
        totalGB: total.toFixed(1),
        freeGB: free.toFixed(1),
      };
    });

  const rankNet = [...hostList]
    .sort((a, b) => parseFloat(b.cpuUtilization) - parseFloat(a.cpuUtilization))
    .slice(0, 8)
    .map((h, idx) => ({
      hostname: h.hostname,
      value: 100 + idx * 18 + rnd(strSeed(h.hostname), 12) * 90,
      unit: "MB/s",
      rxMB: (70 + rnd(strSeed(h.hostname), 13) * 100).toFixed(1),
      txMB: (55 + rnd(strSeed(h.hostname), 14) * 85).toFixed(1),
    }));

  return {
    generatedAt: now.toISOString(),
    timeRange: {
      start: new Date(now.getTime() - hours * 3600000).toISOString(),
      end: now.toISOString(),
      hours,
    },

    summary: {
      totalHosts: MOCK_HOST_COUNT,
      healthyHosts,
      warningHosts,
      criticalHosts,
      avgCpuUtilization: avgCpu.toFixed(1),
      avgMemoryUtilization: avgMem.toFixed(1),
      maxDiskUtilization: maxDisk.toFixed(1),
      loadAverage: {
        "1m": avgLoad1.toFixed(2),
        "5m": (avgLoad1 * 1.15).toFixed(2),
        "15m": (avgLoad1 * 1.28).toFixed(2),
      },
    },

    hostList,

    trends: {
      timestamps,
      cpu: cpuTrend,
      cpuByHost: hostList.map((h, hi) => {
        const s = strSeed(h.hostname);
        return {
          hostname: h.hostname,
          data: timestamps.map((_, idx) => {
            // 模拟部分时段无上报（离线），便于总览堆叠柱状图展示红段
            const simDrop = hi % 3 === 0 && idx > 4 && idx < timestamps.length - 2 && rnd(s, idx + 880) > 0.78;
            if (simDrop) return { utilization: null };
            return {
              utilization: (12 + rnd(s, idx + 200) * 55 + (idx / timestamps.length) * 8).toFixed(1),
            };
          }),
        };
      }),
      memoryByHost: hostList.map((h) => {
        const s = strSeed(h.hostname + "m");
        return {
          hostname: h.hostname,
          data: timestamps.map((_, idx) => ({
            utilization: (40 + rnd(s, idx + 300) * 45 + (idx / timestamps.length) * 5).toFixed(1),
          })),
        };
      }),
      diskByHost: hostList.map((h) => {
        const s = strSeed(h.hostname + "d");
        return {
          hostname: h.hostname,
          data: timestamps.map((_, idx) => ({
            utilization: (35 + rnd(s, idx + 400) * 40 + (idx / timestamps.length) * 6).toFixed(1),
          })),
        };
      }),
      networkByHost: hostList.map((h) => {
        const s = strSeed(h.hostname + "n");
        return {
          hostname: h.hostname,
          data: timestamps.map((_, idx) => ({
            receiveMB: (20 + rnd(s, idx + 500) * 80 + idx * 0.1).toFixed(2),
            transmitMB: (15 + rnd(s, idx + 600) * 70 + idx * 0.08).toFixed(2),
          })),
        };
      }),
      diskIoByHost: hostList.map((h) => {
        const s = strSeed(h.hostname + "dio");
        return {
          hostname: h.hostname,
          data: timestamps.map((_, idx) => ({
            readMB: (10 + rnd(s, idx + 700) * 55 + idx * 0.06).toFixed(2),
            writeMB: (8 + rnd(s, idx + 800) * 45 + idx * 0.05).toFixed(2),
          })),
        };
      }),
      memory: memoryTrend,
      disk: diskTrend,
      diskIo: diskIoTrend,
      network: networkTrend,
    },

    rankings: {
      cpu: rankCpu,
      memory: rankMem,
      diskIo: rankDiskUtil,
      network: rankNet,
    },
  };
}
