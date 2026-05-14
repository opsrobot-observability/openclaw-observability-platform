export function mockOtelTraces(opts = {}) {
  const hours = Number(opts.hours) || 24;
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const formatDateTime = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  const bySpanName = [
    { name: "openclaw.message.processed", value: 12456, errorCount: 23, avgDurationMs: 345.6, maxDurationMs: 2890.3 },
    { name: "openclaw.model.usage", value: 8934, errorCount: 12, avgDurationMs: 1234.5, maxDurationMs: 5678.9 },
    { name: "openclaw.webhook.processed", value: 5678, errorCount: 45, avgDurationMs: 56.7, maxDurationMs: 890.1 },
    { name: "openclaw.webhook.error", value: 45, errorCount: 45, avgDurationMs: 12.3, maxDurationMs: 234.5 },
    { name: "openclaw.session.stuck", value: 8, errorCount: 8, avgDurationMs: 0.5, maxDurationMs: 1.2 },
  ];

  const byChannel = [
    { name: "webchat", value: 12340, errorCount: 34, avgDurationMs: 456.7 },
    { name: "discord", value: 8900, errorCount: 28, avgDurationMs: 567.8 },
    { name: "telegram", value: 4560, errorCount: 15, avgDurationMs: 345.6 },
    { name: "api", value: 2340, errorCount: 8, avgDurationMs: 234.5 },
  ];

  const byModel = [
    { name: "MiniMax-M2.7", value: 4500, errorCount: 5, avgDurationMs: 1567.8 },
    { name: "gpt-4o", value: 2800, errorCount: 4, avgDurationMs: 2345.6 },
    { name: "claude-3.5-sonnet", value: 1200, errorCount: 2, avgDurationMs: 1890.3 },
    { name: "deepseek-v3", value: 434, errorCount: 1, avgDurationMs: 890.5 },
  ];

  const byOutcome = [
    { name: "completed", value: 11200 },
    { name: "success", value: 8800 },
    { name: "error", value: 78 },
  ];

  const tokenByModel = [
    { name: "MiniMax-M2.7", value: 5600000, inputTokens: 3800000, outputTokens: 1800000, callCount: 4500 },
    { name: "gpt-4o", value: 3200000, inputTokens: 2100000, outputTokens: 1100000, callCount: 2800 },
    { name: "claude-3.5-sonnet", value: 1800000, inputTokens: 1200000, outputTokens: 600000, callCount: 1200 },
    { name: "deepseek-v3", value: 560000, inputTokens: 380000, outputTokens: 180000, callCount: 434 },
  ];

  const points = Math.min(hours * 6, 144);
  const trends = {};
  const spanNames = ["openclaw.message.processed", "openclaw.model.usage", "openclaw.webhook.processed"];
  for (const name of spanNames) {
    trends[name] = [];
    for (let i = points - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 10 * 60 * 1000);
      const h = String(time.getHours()).padStart(2, "0");
      const m = String(time.getMinutes()).padStart(2, "0");
      trends[name].push({
        time: `${h}:${m}`,
        value: Math.floor(Math.random() * 50) + 10,
        errorCount: Math.floor(Math.random() * 3),
        avgDurationMs: Math.floor(Math.random() * 500) + 100,
      });
    }
  }

  const topSlow = [];
  for (let i = 0; i < 10; i++) {
    topSlow.push({
      traceId: `trace-${Date.now()}-${i}`,
      spanId: `span-${i}`,
      spanName: bySpanName[i % bySpanName.length].name,
      timestamp: formatDateTime(new Date(now.getTime() - i * 60000)),
      durationMs: Math.floor(Math.random() * 5000) + 1000,
      statusCode: i < 2 ? "STATUS_CODE_ERROR" : "STATUS_CODE_UNSET",
      channel: byChannel[i % byChannel.length].name,
      model: byModel[i % byModel.length].name,
    });
  }

  const recentErrors = [];
  for (let i = 0; i < 8; i++) {
    recentErrors.push({
      traceId: `err-trace-${Date.now()}-${i}`,
      spanId: `err-span-${i}`,
      spanName: i < 4 ? "openclaw.webhook.error" : "openclaw.message.processed",
      timestamp: formatDateTime(new Date(now.getTime() - i * 120000)),
      durationMs: Math.floor(Math.random() * 500) + 10,
      statusCode: "STATUS_CODE_ERROR",
      statusMessage: i < 4 ? "Discord API rate limit exceeded" : "Model timeout",
      channel: byChannel[i % byChannel.length].name,
      errorMsg: i < 4 ? "rate_limit" : "timeout",
    });
  }

  return {
    generatedAt: formatDateTime(now),
    timeRange: { start: formatDateTime(start), end: formatDateTime(now) },
    overview: {
      totalSpans: 27121,
      totalErrors: 88,
      errorRate: 0.32,
      avgDurationMs: 456.78,
      maxDurationMs: 5678.9,
      totalInputTokens: 7480000,
      totalOutputTokens: 3680000,
      totalTokens: 11160000,
    },
    bySpanName,
    byChannel,
    byModel,
    byOutcome,
    tokenByModel,
    trends,
    topSlow,
    recentErrors,
  };
}
