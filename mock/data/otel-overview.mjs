const instances = [
  {
    id: "inst-001",
    name: "openclaw-gateway-1",
    hostName: "gateway-node-1",
    hostArch: "x86_64",
    processPid: "12345",
    processOwner: "openclaw",
    runtime: "Node.js v20.10.0",
    startupCommand: "node /app/gateway/dist/index.js",
    lastActive: new Date().toISOString(),
    status: "在线",
    activeSessions: 12,
    stuckSessions: 0,
    tokenConsumption: "1.2M",
    totalCost: "$15.32",
    totalCostRaw: 15.32,
    messageProcessed: 8456,
    messageQueued: 23,
    queueDepth: 5,
    sessionTotal: 156,
    inputTokens: "800K",
    outputTokens: "400K",
    enqueueTotal: 8900,
    dequeueTotal: 8877,
    cpuUtilizationPct: 42.3,
    memoryUtilizationPct: 58.6,
    diskUtilizationPct: 63.2,
  },
  {
    id: "inst-002",
    name: "openclaw-gateway-2",
    hostName: "gateway-node-2",
    hostArch: "x86_64",
    processPid: "23456",
    processOwner: "openclaw",
    runtime: "Node.js v20.10.0",
    startupCommand: "node /app/gateway/dist/index.js",
    lastActive: new Date().toISOString(),
    status: "在线",
    activeSessions: 8,
    stuckSessions: 1,
    tokenConsumption: "856K",
    totalCost: "$10.45",
    totalCostRaw: 10.45,
    messageProcessed: 5678,
    messageQueued: 15,
    queueDepth: 3,
    sessionTotal: 98,
    inputTokens: "570K",
    outputTokens: "286K",
    enqueueTotal: 6000,
    dequeueTotal: 5985,
    cpuUtilizationPct: 55.1,
    memoryUtilizationPct: 71.2,
    diskUtilizationPct: 48.9,
  },
  {
    id: "inst-003",
    name: "openclaw-gateway-3",
    hostName: "gateway-node-3",
    hostArch: "arm64",
    processPid: "34567",
    processOwner: "openclaw",
    runtime: "Node.js v20.10.0",
    startupCommand: "node /app/gateway/dist/index.js",
    lastActive: new Date(Date.now() - 60000).toISOString(),
    status: "在线",
    activeSessions: 5,
    stuckSessions: 0,
    tokenConsumption: "423K",
    totalCost: "$5.67",
    totalCostRaw: 5.67,
    messageProcessed: 2345,
    messageQueued: 8,
    queueDepth: 2,
    sessionTotal: 45,
    inputTokens: "280K",
    outputTokens: "143K",
    enqueueTotal: 2500,
    dequeueTotal: 2492,
    cpuUtilizationPct: 28.4,
    memoryUtilizationPct: 44.0,
    diskUtilizationPct: 82.5,
  },
];

function generateTrendData(points, baseValue, variance) {
  const data = [];
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 1000);
    const hours = String(time.getHours()).padStart(2, "0");
    const minutes = String(time.getMinutes()).padStart(2, "0");
    data.push({
      time: `${hours}:${minutes}`,
      value: Math.max(0, baseValue + Math.floor(Math.random() * variance - variance / 2)),
    });
  }
  return data;
}

export function mockOtelOverview(opts = {}) {
  const hours = Number(opts.hours) || 24;
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const formatDateTime = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  const points = Math.min(hours * 60, 1440);

  const sessionAnalytics = {
    byState: [
      { name: "processing", value: 25 },
      { name: "completed", value: 245 },
      { name: "pending", value: 15 },
      { name: "failed", value: 3 },
    ],
    byReason: [
      { name: "timeout", value: 8 },
      { name: "rate_limit", value: 5 },
      { name: "model_error", value: 3 },
      { name: "network_error", value: 2 },
    ],
    byChannel: [
      { name: "api", value: 156 },
      { name: "websocket", value: 89 },
      { name: "cli", value: 45 },
    ],
    topInstances: [
      { name: "openclaw-gateway-1", value: 156 },
      { name: "openclaw-gateway-2", value: 98 },
      { name: "openclaw-gateway-3", value: 45 },
    ],
  };

  const tokenAnalytics = {
    byType: [
      { name: "input", value: 1650000 },
      { name: "output", value: 829000 },
    ],
    byModel: [
      { name: "gpt-4o", value: 1200000 },
      { name: "claude-3.5-sonnet", value: 850000 },
      { name: "gpt-4-turbo", value: 320000 },
      { name: "gemini-pro", value: 109000 },
    ],
    byChannel: [
      { name: "api", value: 1450000 },
      { name: "websocket", value: 680000 },
      { name: "cli", value: 349000 },
    ],
    byProvider: [
      { name: "openai", value: 1520000 },
      { name: "anthropic", value: 850000 },
      { name: "google", value: 109000 },
    ],
    topInstances: [
      { name: "openclaw-gateway-1", value: 1200000 },
      { name: "openclaw-gateway-2", value: 856000 },
      { name: "openclaw-gateway-3", value: 423000 },
    ],
  };

  const costAnalytics = {
    byModel: [
      { name: "gpt-4o", value: 18.56 },
      { name: "claude-3.5-sonnet", value: 12.34 },
      { name: "gpt-4-turbo", value: 5.67 },
      { name: "gemini-pro", value: 0.87 },
    ],
    byChannel: [
      { name: "api", value: 22.45 },
      { name: "websocket", value: 10.23 },
      { name: "cli", value: 4.76 },
    ],
    byProvider: [
      { name: "openai", value: 24.23 },
      { name: "anthropic", value: 12.34 },
      { name: "google", value: 0.87 },
    ],
    topInstances: [
      { name: "openclaw-gateway-1", value: 15.32 },
      { name: "openclaw-gateway-2", value: 10.45 },
      { name: "openclaw-gateway-3", value: 5.67 },
    ],
  };

  const messageAnalytics = {
    byChannel: [
      { name: "api", value: 8456 },
      { name: "websocket", value: 5678 },
      { name: "cli", value: 2345 },
    ],
    topInstances: [
      { name: "openclaw-gateway-1", value: 8456 },
      { name: "openclaw-gateway-2", value: 5678 },
      { name: "openclaw-gateway-3", value: 2345 },
    ],
    durationStats: {
      avg: 245.6,
      max: 1523.2,
    },
  };

  const queueAnalytics = {
    byLane: [
      { name: "default", value: 8900 },
      { name: "priority", value: 4500 },
      { name: "batch", value: 2300 },
    ],
    byChannel: [
      { name: "api", value: 6500 },
      { name: "websocket", value: 5200 },
      { name: "cli", value: 4000 },
    ],
    topInstances: [
      { name: "openclaw-gateway-1", value: 8900 },
      { name: "openclaw-gateway-2", value: 6000 },
      { name: "openclaw-gateway-3", value: 2500 },
    ],
    waitStats: {
      avg: 12.3,
      max: 89.5,
    },
    depthStats: {
      max: 15,
    },
  };

  return {
    generatedAt: formatDateTime(now),
    timeRange: {
      start: formatDateTime(start),
      end: formatDateTime(now),
    },
    instances: instances,
    overview: {
      totalInstances: instances.length,
      onlineInstances: instances.filter((i) => i.status === "在线").length,
      offlineInstances: instances.filter((i) => i.status !== "在线").length,
      totalSessions: instances.reduce((a, i) => a + i.sessionTotal, 0),
      activeSessions: instances.reduce((a, i) => a + i.activeSessions, 0),
      stuckSessions: instances.reduce((a, i) => a + i.stuckSessions, 0),
      totalTokens: 2479000,
      totalCost: 31.44,
      messageProcessed: 16479,
      messageQueued: 46,
    },
    trends: {
      session: generateTrendData(points, 25, 20),
      token: generateTrendData(points, 50000, 30000),
      cost: generateTrendData(points, 0.5, 0.4),
      messageProcessed: generateTrendData(points, 100, 80),
      queueDepth: generateTrendData(points, 3, 4),
    },
    histogramStats: {
      messageDuration: {
        avg: 245.6,
        max: 1523.2,
      },
      queueWait: {
        avg: 12.3,
        max: 89.5,
      },
    },
    sessionAnalytics,
    tokenAnalytics,
    costAnalytics,
    messageAnalytics,
    queueAnalytics,
  };
}


