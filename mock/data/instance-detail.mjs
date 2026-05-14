const CHANNELS = ["webchat", "discord", "telegram", "api"];
const MODELS = ["MiniMax-M2.7", "gpt-4o", "claude-3.5-sonnet", "deepseek-v3", "qwen-max"];
const HOST_IPS = ["192.168.1.101", "192.168.1.102", "192.168.1.103", "192.168.1.104", "192.168.2.201"];

const CALL_CHAIN_TEMPLATES = [
  {
    name: "normal_chat",
    weight: 35,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [50, 2000] },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [500, 8000], hasModel: true },
      { spanName: "openclaw.webhook.processed", spanKind: "SPAN_KIND_INTERNAL", durationRange: [10, 500] },
    ],
  },
  {
    name: "normal_api",
    weight: 20,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [30, 1500] },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [300, 5000], hasModel: true },
    ],
  },
  {
    name: "webhook_error",
    weight: 10,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [50, 2000] },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [500, 6000], hasModel: true },
      { spanName: "openclaw.webhook.processed", spanKind: "SPAN_KIND_INTERNAL", durationRange: [10, 300] },
      { spanName: "openclaw.webhook.error", spanKind: "SPAN_KIND_INTERNAL", durationRange: [1, 200], isError: true },
    ],
  },
  {
    name: "session_stuck",
    weight: 5,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [50, 1000] },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [5000, 15000], hasModel: true },
      { spanName: "openclaw.session.stuck", spanKind: "SPAN_KIND_INTERNAL", durationRange: [1, 5], isError: true },
    ],
  },
  {
    name: "direct_webhook",
    weight: 15,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [20, 800] },
      { spanName: "openclaw.webhook.processed", spanKind: "SPAN_KIND_INTERNAL", durationRange: [10, 400] },
    ],
  },
  {
    name: "multi_model",
    weight: 10,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [50, 2000] },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [500, 5000], hasModel: true },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [300, 4000], hasModel: true },
      { spanName: "openclaw.webhook.processed", spanKind: "SPAN_KIND_INTERNAL", durationRange: [10, 300] },
    ],
  },
  {
    name: "model_then_stuck",
    weight: 5,
    layers: [
      { spanName: "openclaw.message.processed", spanKind: "SPAN_KIND_SERVER", durationRange: [50, 1500] },
      { spanName: "openclaw.model.usage", spanKind: "SPAN_KIND_CLIENT", durationRange: [8000, 20000], hasModel: true },
      { spanName: "openclaw.session.stuck", spanKind: "SPAN_KIND_INTERNAL", durationRange: [1, 3], isError: true },
      { spanName: "openclaw.webhook.error", spanKind: "SPAN_KIND_INTERNAL", durationRange: [1, 100], isError: true },
    ],
  },
];

function formatDateTime(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function randomId(prefix = "", len = 16) {
  const chars = "0123456789abcdef";
  let s = prefix;
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickTemplate() {
  const totalWeight = CALL_CHAIN_TEMPLATES.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const t of CALL_CHAIN_TEMPLATES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return CALL_CHAIN_TEMPLATES[0];
}

function generateSpans(instanceId, hours, filters) {
  const now = new Date();
  const traceCount = 25 + Math.floor(Math.random() * 20);
  const allSpans = [];

  for (let t = 0; t < traceCount; t++) {
    const template = pickTemplate();
    const traceId = randomId("trace-", 24);
    const channel = randomPick(CHANNELS);
    const sessionKey = randomId("sess-", 12);
    const sessionId = randomId("sess-", 12);
    const hostIp = randomPick(HOST_IPS);
    const hostName = instanceId.split("@@")[1] || "unknown";
    const offsetMs = Math.floor(Math.random() * hours * 60 * 60 * 1000);
    const traceStartTime = new Date(now.getTime() - offsetMs);
    const runId = randomId("run-", 8);

    let currentOffsetMs = 0;
    const parentStack = [];

    for (let layerIdx = 0; layerIdx < template.layers.length; layerIdx++) {
      const layer = template.layers[layerIdx];
      const spanId = randomId("span-", 16);
      const parentSpanId = layerIdx === 0 ? null : parentStack[parentStack.length - 1];
      const durationMs = randomRange(layer.durationRange[0], layer.durationRange[1]);
      const isError = !!layer.isError;
      const model = layer.hasModel ? randomPick(MODELS) : null;

      const spanStartTime = new Date(traceStartTime.getTime() + currentOffsetMs);

      allSpans.push({
        traceId,
        spanId,
        parentSpanId,
        spanName: layer.spanName,
        spanKind: layer.spanKind,
        serviceName: "openclaw-gateway",
        startTime: formatDateTime(spanStartTime),
        durationMs,
        status: isError ? "error" : "ok",
        statusMessage: isError
          ? (layer.spanName === "openclaw.session.stuck"
            ? "Session stuck: no response for 300s"
            : "Webhook delivery failed: timeout")
          : null,
        hostIp,
        hostName,
        instanceId,
        channel,
        sessionKey,
        sessionId,
        modelName: model,
        tokens: model ? Math.floor(Math.random() * 5000) + 200 : 0,
        inputTokens: model ? Math.floor(Math.random() * 3000) + 100 : 0,
        outputTokens: model ? Math.floor(Math.random() * 2000) + 50 : 0,
        runId,
        roundId: String(layerIdx + 1),
        version: "v3.2.1",
        errorType: isError ? (layer.spanName === "openclaw.session.stuck" ? "SESSION_STUCK" : "WEBHOOK_ERROR") : null,
        errorMessage: isError
          ? (layer.spanName === "openclaw.session.stuck"
            ? "Session has been stuck for over 300 seconds without processing"
            : "Webhook delivery failed after 3 retries: connection timeout")
          : null,
        spanAttributes: {
          "openclaw.channel": channel,
          "openclaw.session_key": sessionKey,
          ...(model ? { "openclaw.model": model } : {}),
          "openclaw.version": "3.2.1",
          "openclaw.instance_id": instanceId,
        },
      });

      parentStack.push(spanId);
      currentOffsetMs += Math.floor(durationMs * 0.1) + randomRange(5, 50);
    }
  }

  if (filters) {
    let filtered = [...allSpans];
    if (filters.status && filters.status.length < 2 && filters.status.length > 0) {
      filtered = filtered.filter((s) => filters.status.includes(s.status));
    }
    if (filters.minDuration != null) {
      filtered = filtered.filter((s) => s.durationMs >= filters.minDuration);
    }
    if (filters.maxDuration != null) {
      filtered = filtered.filter((s) => s.durationMs <= filters.maxDuration);
    }
    if (filters.spanNames && filters.spanNames.length > 0) {
      filtered = filtered.filter((s) => filters.spanNames.includes(s.spanName));
    }
    if (filters.channels && filters.channels.length > 0) {
      filtered = filtered.filter((s) => filters.channels.includes(s.channel));
    }
    if (filters.models && filters.models.length > 0) {
      filtered = filtered.filter((s) => !s.modelName || filters.models.includes(s.modelName));
    }
    if (filters.sessionKey) {
      const kw = filters.sessionKey.toLowerCase();
      filtered = filtered.filter((s) => (s.sessionKey || "").toLowerCase().includes(kw) || (s.sessionId || "").toLowerCase().includes(kw));
    }
    return { spans: filtered, allSpans };
  }

  return { spans: allSpans, allSpans };
}

export function mockInstanceDetailSpans(opts = {}) {
  const { instanceId, hours = 1, filters = null } = opts;
  const { spans, allSpans } = generateSpans(instanceId, hours, filters);

  const totalCalls = allSpans.length;
  const errorCount = allSpans.filter((s) => s.status === "error").length;
  const successCount = totalCalls - errorCount;
  const avgDurationMs = totalCalls > 0 ? Math.round(allSpans.reduce((a, s) => a + s.durationMs, 0) / totalCalls * 100) / 100 : 0;
  const durations = allSpans.map((s) => s.durationMs).sort((a, b) => a - b);
  const p95 = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;
  const p99 = durations.length > 0 ? durations[Math.floor(durations.length * 0.99)] : 0;
  const errorRate = totalCalls > 0 ? Math.round(errorCount / totalCalls * 10000) / 100 : 0;

  const now = new Date();
  const trendPoints = Math.min(Number(hours) * 6, 60);
  const trend = [];
  for (let i = trendPoints - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 10 * 60 * 1000);
    const h = String(time.getHours()).padStart(2, "0");
    const m = String(time.getMinutes()).padStart(2, "0");
    const callCount = Math.floor(Math.random() * 30) + 5;
    const errCount = Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0;
    trend.push({ time: formatDateTime(time), callCount, errorCount: errCount, successCount: callCount - errCount });
  }

  const spanNameSet = new Set(allSpans.map((s) => s.spanName));
  const channelSet = new Set(allSpans.map((s) => s.channel).filter(Boolean));
  const modelSet = new Set(allSpans.map((s) => s.modelName).filter(Boolean));
  const okCount = allSpans.filter((s) => s.status === "ok").length;
  const errCount = allSpans.filter((s) => s.status === "error").length;

  return {
    spans,
    metrics: {
      totalCalls,
      successCount,
      errorCount,
      successRate: totalCalls > 0 ? Math.round(successCount / totalCalls * 10000) / 100 : 100,
      avgDurationMs,
      p95DurationMs: p95,
      p99DurationMs: p99,
      errorRate,
      totalTraces: new Set(allSpans.map((s) => s.traceId)).size,
    },
    trend,
    filterOptions: {
      spanNames: [...spanNameSet].map((n) => ({ name: n, count: allSpans.filter((s) => s.spanName === n).length })),
      channels: [...channelSet],
      models: [...modelSet],
      statusCounts: { ok: okCount, error: errCount },
    },
  };
}

export function mockInstanceDetailTraces(opts = {}) {
  const { instanceId, hours = 1, traceId = null, filters = null } = opts;
  const { allSpans } = generateSpans(instanceId, hours, filters);

  if (traceId) {
    const traceSpans = allSpans.filter((s) => s.traceId === traceId);
    if (traceSpans.length === 0) {
      const template = pickTemplate();
      const channel = randomPick(CHANNELS);
      const hostIp = randomPick(HOST_IPS);
      const hostName = instanceId.split("@@")[1] || "unknown";
      const now2 = new Date();
      const generatedSpans = [];
      let currentOffsetMs = 0;
      const parentStack = [];

      for (let layerIdx = 0; layerIdx < template.layers.length; layerIdx++) {
        const layer = template.layers[layerIdx];
        const spanId = randomId("span-", 16);
        const parentSpanId = layerIdx === 0 ? null : parentStack[parentStack.length - 1];
        const durationMs = randomRange(layer.durationRange[0], layer.durationRange[1]);
        const isError = !!layer.isError;
        const model = layer.hasModel ? randomPick(MODELS) : null;

        generatedSpans.push({
          traceId,
          spanId,
          parentSpanId,
          spanName: layer.spanName,
          spanKind: layer.spanKind,
          serviceName: "openclaw-gateway",
          startTime: formatDateTime(new Date(now2.getTime() + currentOffsetMs)),
          durationMs,
          status: isError ? "error" : "ok",
          statusMessage: isError ? "Error occurred during processing" : null,
          hostIp,
          hostName,
          instanceId,
          channel,
          sessionKey: randomId("sess-", 12),
          sessionId: randomId("sess-", 12),
          modelName: model,
          tokens: model ? Math.floor(Math.random() * 5000) + 200 : 0,
          inputTokens: model ? Math.floor(Math.random() * 3000) + 100 : 0,
          outputTokens: model ? Math.floor(Math.random() * 2000) + 50 : 0,
          runId: randomId("run-", 8),
          roundId: String(layerIdx + 1),
          version: "v3.2.1",
          errorType: isError ? "PROCESSING_ERROR" : null,
          errorMessage: isError ? "Failed to process: internal timeout" : null,
          spanAttributes: {
            "openclaw.channel": channel,
            "openclaw.session_key": randomId("sk-", 8),
            ...(model ? { "openclaw.model": model } : {}),
            "openclaw.version": "3.2.1",
            "openclaw.instance_id": instanceId,
          },
        });

        parentStack.push(spanId);
        currentOffsetMs += Math.floor(durationMs * 0.1) + randomRange(5, 50);
      }

      return { spans: generatedSpans };
    }
    return { spans: traceSpans };
  }

  const traceMap = new Map();
  for (const s of allSpans) {
    if (!traceMap.has(s.traceId)) {
      traceMap.set(s.traceId, { traceId: s.traceId, spans: [], rootSpanName: "", startTime: s.startTime, totalDurationMs: 0, status: "ok" });
    }
    const t = traceMap.get(s.traceId);
    t.spans.push(s);
    if (!s.parentSpanId) t.rootSpanName = s.spanName;
    if (s.status === "error") t.status = "error";
  }

  const traces = [...traceMap.values()].map((t) => {
    const sortedSpans = t.spans.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const firstStart = sortedSpans.length > 0 ? new Date(sortedSpans[0].startTime).getTime() : 0;
    const lastEnd = sortedSpans.length > 0 ? Math.max(...sortedSpans.map((s) => new Date(s.startTime).getTime() + s.durationMs)) : 0;
    return {
      traceId: t.traceId,
      rootSpanName: t.rootSpanName || sortedSpans[0]?.spanName || "unknown",
      spanCount: t.spans.length,
      totalDurationMs: lastEnd - firstStart || sortedSpans[0]?.durationMs || 0,
      status: t.status,
      startTime: sortedSpans[0]?.startTime || "",
      totalTokens: t.spans.reduce((a, s) => a + (s.tokens || 0), 0),
    };
  }).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  return { traces };
}

export function mockInstanceDetailScatter(opts = {}) {
  const { instanceId, hours = 1 } = opts;
  const now = new Date();
  const count = 50 + Math.floor(Math.random() * 30);
  const points = [];

  for (let i = 0; i < count; i++) {
    const offsetMs = Math.floor(Math.random() * hours * 60 * 60 * 1000);
    const startTime = new Date(now.getTime() - offsetMs);
    const template = pickTemplate();
    const spanCount = template.layers.length;
    const isError = template.layers.some((l) => l.isError);
    const rootSpanName = template.layers[0].spanName;
    const totalDurationMs = template.layers.reduce((a, l) => a + randomRange(l.durationRange[0], l.durationRange[1]), 0);

    points.push({
      traceId: randomId("trace-", 24),
      rootSpanName,
      spanCount,
      totalDurationMs,
      totalTokens: template.layers.some((l) => l.hasModel) ? Math.floor(Math.random() * 8000) + 200 : 0,
      status: isError ? "error" : "ok",
      startTime: formatDateTime(startTime),
    });
  }

  return { points };
}

export function mockInstanceDetailApdex(opts = {}) {
  const { instanceId, hours = 1, threshold = 500 } = opts;
  const now = new Date();
  const totalCalls = 200 + Math.floor(Math.random() * 100);
  const t4 = threshold * 4;

  let satisfied = 0;
  let tolerating = 0;
  let frustrated = 0;
  for (let i = 0; i < totalCalls; i++) {
    const r = Math.random();
    if (r < 0.65) satisfied++;
    else if (r < 0.88) tolerating++;
    else frustrated++;
  }

  const apdex = (satisfied + tolerating / 2) / totalCalls;
  const satisfiedRate = (satisfied / totalCalls * 100);
  const toleratingRate = (tolerating / totalCalls * 100);
  const frustratedRate = (frustrated / totalCalls * 100);

  const trendPoints = Math.min(Number(hours) * 6, 60);
  const trend = [];
  for (let i = trendPoints - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 10 * 60 * 1000);
    const h = String(time.getHours()).padStart(2, "0");
    const m = String(time.getMinutes()).padStart(2, "0");
    const t = 0.7 + Math.random() * 0.28;
    trend.push({ time: `${h}:${m}`, apdex: Math.round(t * 100) / 100 });
  }

  const SPAN_NAMES = ["openclaw.message.processed", "openclaw.model.usage", "openclaw.webhook.processed", "openclaw.webhook.error", "openclaw.session.stuck"];
  const bySpan = SPAN_NAMES.map((spanName) => {
    const calls = 30 + Math.floor(Math.random() * 70);
    const sat = Math.floor(calls * (0.5 + Math.random() * 0.4));
    const tol = Math.floor((calls - sat) * 0.7);
    const frust = calls - sat - tol;
    return {
      spanName,
      totalCalls: calls,
      satisfiedCount: sat,
      toleratingCount: tol,
      frustratedCount: frust,
      apdex: Math.round(((sat + tol / 2) / calls) * 100) / 100,
      satisfiedRate: Math.round(sat / calls * 1000) / 10,
      toleratingRate: Math.round(tol / calls * 1000) / 10,
      frustratedRate: Math.round(frust / calls * 1000) / 10,
      avgDurationMs: Math.floor(Math.random() * 2000) + 100,
    };
  });

  return {
    overall: {
      apdex: Math.round(apdex * 100) / 100,
      satisfiedRate: Math.round(satisfiedRate * 10) / 10,
      toleratingRate: Math.round(toleratingRate * 10) / 10,
      frustratedRate: Math.round(frustratedRate * 10) / 10,
      totalCalls,
      threshold,
      t4,
    },
    trend,
    bySpan,
  };
}

export function mockInstanceDetailAggregation(opts = {}) {
  const { instanceId, hours = 1, dimension = "spanName" } = opts;
  const now = new Date();

  const SPAN_NAMES = ["openclaw.message.processed", "openclaw.model.usage", "openclaw.webhook.processed", "openclaw.webhook.error", "openclaw.session.stuck"];

  let dimValues;
  switch (dimension) {
    case "spanName":
      dimValues = SPAN_NAMES;
      break;
    case "status":
      dimValues = ["ok", "error"];
      break;
    case "channel":
      dimValues = CHANNELS;
      break;
    case "model":
      dimValues = MODELS;
      break;
    case "durationBucket":
      dimValues = ["0~100ms", "100ms~1s", "1s~5s", "5s~10s", ">10s"];
      break;
    case "hour":
      dimValues = Array.from({ length: Math.min(Number(hours), 24) }, (_, i) => {
        const d = new Date(now.getTime() - i * 3600000);
        return `${String(d.getHours()).padStart(2, "0")}:00`;
      });
      break;
    case "minute":
      dimValues = Array.from({ length: 10 }, (_, i) => {
        const d = new Date(now.getTime() - i * 600000);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      });
      break;
    default:
      dimValues = SPAN_NAMES;
  }

  const rows = dimValues.map((dimValue) => {
    const totalCalls = 20 + Math.floor(Math.random() * 100);
    const errorCount = Math.random() < 0.2 ? Math.floor(Math.random() * 10) + 1 : 0;
    const successCount = totalCalls - errorCount;
    return {
      dimValue,
      totalCalls,
      successCount,
      errorCount,
      successRate: Math.round(successCount / totalCalls * 10000) / 100,
      avgDurationMs: Math.floor(Math.random() * 2000) + 50,
      p99DurationMs: Math.floor(Math.random() * 8000) + 500,
      totalTokens: Math.floor(Math.random() * 500000),
    };
  });

  const trendPoints = Math.min(Number(hours) * 6, 60);
  const trend = [];
  for (let i = trendPoints - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 10 * 60 * 1000);
    const h = String(time.getHours()).padStart(2, "0");
    const m = String(time.getMinutes()).padStart(2, "0");
    for (const dv of dimValues.slice(0, 3)) {
      trend.push({
        time: `${h}:${m}`,
        dimValue: dv,
        totalCalls: Math.floor(Math.random() * 30) + 5,
      });
    }
  }

  return { rows, trend };
}
