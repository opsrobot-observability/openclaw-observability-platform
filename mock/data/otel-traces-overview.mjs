export function mockOtelTracesOverview(opts = {}) {
  const hours = Number(opts.hours) || 24;
  const now = new Date();

  const formatDateTime = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  const INSTANCE_IDS = [
    "openclaw-gateway@@WIN-SERVER01",
    "openclaw-gateway@@WIN-SERVER02",
    "openclaw-gateway@@WIN-DESKTOP03",
    "openclaw-gateway@@LINUX-PROD04",
    "openclaw-gateway@@WIN-DEV05",
    "openclaw-gateway@@LINUX-STAGING06",
    "openclaw-gateway@@WIN-TEST07",
    "openclaw-gateway@@LINUX-PROD08",
  ];

  const points = Math.min(hours * 6, 144);
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 10 * 60 * 1000);
    const h = String(time.getHours()).padStart(2, "0");
    const m = String(time.getMinutes()).padStart(2, "0");
    const totalCalls = Math.floor(Math.random() * 200) + 50;
    const errorCount = Math.floor(Math.random() * 5);
    const successCount = totalCalls - errorCount;
    trend.push({
      time: `${h}:${m}`,
      totalCalls,
      successCount,
      errorCount,
      avgDurationMs: Math.floor(Math.random() * 500) + 100,
      maxDurationMs: Math.floor(Math.random() * 5000) + 500,
      successRate: Math.round((successCount / totalCalls * 100) * 100) / 100,
    });
  }

  const trendByInstance = [];
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 10 * 60 * 1000);
    const h = String(time.getHours()).padStart(2, "0");
    const m = String(time.getMinutes()).padStart(2, "0");
    for (const instId of INSTANCE_IDS) {
      const totalCalls = Math.floor(Math.random() * 60) + 5;
      const errorCount = Math.random() < 0.1 ? Math.floor(Math.random() * 3) + 1 : 0;
      const successCount = totalCalls - errorCount;
      trendByInstance.push({
        time_bucket: `${h}:${m}`,
        instance_id: instId,
        total_calls: totalCalls,
        success_count: successCount,
        error_count: errorCount,
        avg_duration_ms: Math.floor(Math.random() * 600) + 80,
      });
    }
  }

  const instances = [
    { instanceId: "openclaw-gateway@@WIN-SERVER01", hostName: "WIN-SERVER01", serviceName: "openclaw-gateway", totalCalls: 12456, errorCount: 23, failureRate: 0.18, avgDurationMs: 345.6 },
    { instanceId: "openclaw-gateway@@WIN-SERVER02", hostName: "WIN-SERVER02", serviceName: "openclaw-gateway", totalCalls: 8934, errorCount: 45, failureRate: 0.50, avgDurationMs: 567.8 },
    { instanceId: "openclaw-gateway@@WIN-DESKTOP03", hostName: "WIN-DESKTOP03", serviceName: "openclaw-gateway", totalCalls: 5678, errorCount: 12, failureRate: 0.21, avgDurationMs: 234.5 },
    { instanceId: "openclaw-gateway@@LINUX-PROD04", hostName: "LINUX-PROD04", serviceName: "openclaw-gateway", totalCalls: 3456, errorCount: 8, failureRate: 0.23, avgDurationMs: 189.3 },
    { instanceId: "openclaw-gateway@@WIN-DEV05", hostName: "WIN-DEV05", serviceName: "openclaw-gateway", totalCalls: 2345, errorCount: 67, failureRate: 2.86, avgDurationMs: 890.1 },
    { instanceId: "openclaw-gateway@@LINUX-STAGING06", hostName: "LINUX-STAGING06", serviceName: "openclaw-gateway", totalCalls: 1890, errorCount: 34, failureRate: 1.80, avgDurationMs: 456.7 },
    { instanceId: "openclaw-gateway@@WIN-TEST07", hostName: "WIN-TEST07", serviceName: "openclaw-gateway", totalCalls: 987, errorCount: 89, failureRate: 9.01, avgDurationMs: 1234.5 },
    { instanceId: "openclaw-gateway@@LINUX-PROD08", hostName: "LINUX-PROD08", serviceName: "openclaw-gateway", totalCalls: 4567, errorCount: 5, failureRate: 0.11, avgDurationMs: 156.2 },
  ];

  const instanceDuration = [
    { instanceId: "openclaw-gateway@@WIN-SERVER01", hostName: "WIN-SERVER01", serviceName: "openclaw-gateway", maxDurationMs: 5678.9, successRate: 99.82, successCount: 12433, errorCount: 23, avgDurationMs: 345.6 },
    { instanceId: "openclaw-gateway@@WIN-SERVER02", hostName: "WIN-SERVER02", serviceName: "openclaw-gateway", maxDurationMs: 8901.2, successRate: 99.50, successCount: 8889, errorCount: 45, avgDurationMs: 567.8 },
    { instanceId: "openclaw-gateway@@WIN-DESKTOP03", hostName: "WIN-DESKTOP03", serviceName: "openclaw-gateway", maxDurationMs: 3456.7, successRate: 99.79, successCount: 5666, errorCount: 12, avgDurationMs: 234.5 },
    { instanceId: "openclaw-gateway@@LINUX-PROD04", hostName: "LINUX-PROD04", serviceName: "openclaw-gateway", maxDurationMs: 12345.6, successRate: 99.77, successCount: 3448, errorCount: 8, avgDurationMs: 189.3 },
    { instanceId: "openclaw-gateway@@WIN-DEV05", hostName: "WIN-DEV05", serviceName: "openclaw-gateway", maxDurationMs: 15678.9, successRate: 97.14, successCount: 2278, errorCount: 67, avgDurationMs: 890.1 },
    { instanceId: "openclaw-gateway@@LINUX-STAGING06", hostName: "LINUX-STAGING06", serviceName: "openclaw-gateway", maxDurationMs: 6789.0, successRate: 98.20, successCount: 1856, errorCount: 34, avgDurationMs: 456.7 },
    { instanceId: "openclaw-gateway@@WIN-TEST07", hostName: "WIN-TEST07", serviceName: "openclaw-gateway", maxDurationMs: 23456.7, successRate: 90.99, successCount: 898, errorCount: 89, avgDurationMs: 1234.5 },
    { instanceId: "openclaw-gateway@@LINUX-PROD08", hostName: "LINUX-PROD08", serviceName: "openclaw-gateway", maxDurationMs: 2345.6, successRate: 99.89, successCount: 4562, errorCount: 5, avgDurationMs: 156.2 },
  ];

  const topSlow = [
    { spanName: "openclaw.model.usage", maxDurationMs: 12345.6, totalCalls: 8934, errorCount: 12, avgDurationMs: 1234.5 },
    { spanName: "openclaw.message.processed", maxDurationMs: 5678.9, totalCalls: 12456, errorCount: 23, avgDurationMs: 345.6 },
    { spanName: "openclaw.webhook.processed", maxDurationMs: 2890.3, totalCalls: 5678, errorCount: 45, avgDurationMs: 56.7 },
    { spanName: "openclaw.webhook.error", maxDurationMs: 234.5, totalCalls: 45, errorCount: 45, avgDurationMs: 12.3 },
    { spanName: "openclaw.session.stuck", maxDurationMs: 1.2, totalCalls: 8, errorCount: 8, avgDurationMs: 0.5 },
  ];

  const topSlowDetailMap = {
    "openclaw.model.usage": { traceId: "trace-model-max-001", spanId: "span-model-max-001", timestamp: formatDateTime(new Date(now.getTime() - 3600000)), instanceId: "openclaw-gateway@@LINUX-PROD04", channel: "api" },
    "openclaw.message.processed": { traceId: "trace-msg-max-001", spanId: "span-msg-max-001", timestamp: formatDateTime(new Date(now.getTime() - 1800000)), instanceId: "openclaw-gateway@@WIN-SERVER01", channel: "webchat" },
    "openclaw.webhook.processed": { traceId: "trace-wh-max-001", spanId: "span-wh-max-001", timestamp: formatDateTime(new Date(now.getTime() - 900000)), instanceId: "openclaw-gateway@@WIN-SERVER02", channel: "discord" },
    "openclaw.webhook.error": { traceId: "trace-wh-err-001", spanId: "span-wh-err-001", timestamp: formatDateTime(new Date(now.getTime() - 600000)), instanceId: "openclaw-gateway@@WIN-DEV05", channel: "telegram" },
    "openclaw.session.stuck": { traceId: "trace-stuck-001", spanId: "span-stuck-001", timestamp: formatDateTime(new Date(now.getTime() - 300000)), instanceId: "openclaw-gateway@@WIN-TEST07", channel: "api" },
  };

  const topLowSuccess = [
    { spanName: "openclaw.webhook.error", successRate: 0, totalCalls: 45, successCount: 0, errorCount: 45 },
    { spanName: "openclaw.session.stuck", successRate: 0, totalCalls: 8, successCount: 0, errorCount: 8 },
    { spanName: "openclaw.webhook.processed", successRate: 99.21, totalCalls: 5678, successCount: 5633, errorCount: 45 },
    { spanName: "openclaw.message.processed", successRate: 99.82, totalCalls: 12456, successCount: 12433, errorCount: 23 },
    { spanName: "openclaw.model.usage", successRate: 99.87, totalCalls: 8934, successCount: 8922, errorCount: 12 },
  ];

  const topLowSuccessDetailMap = {
    "openclaw.webhook.error": { traceId: "trace-wh-err-ls-001", spanId: "span-wh-err-ls-001", timestamp: formatDateTime(new Date(now.getTime() - 2400000)), instanceId: "openclaw-gateway@@WIN-DEV05", channel: "telegram" },
    "openclaw.session.stuck": { traceId: "trace-stuck-ls-001", spanId: "span-stuck-ls-001", timestamp: formatDateTime(new Date(now.getTime() - 1200000)), instanceId: "openclaw-gateway@@WIN-TEST07", channel: "api" },
    "openclaw.webhook.processed": { traceId: "trace-wh-ls-001", spanId: "span-wh-ls-001", timestamp: formatDateTime(new Date(now.getTime() - 800000)), instanceId: "openclaw-gateway@@WIN-SERVER02", channel: "discord" },
    "openclaw.message.processed": { traceId: "trace-msg-ls-001", spanId: "span-msg-ls-001", timestamp: formatDateTime(new Date(now.getTime() - 400000)), instanceId: "openclaw-gateway@@WIN-SERVER01", channel: "webchat" },
    "openclaw.model.usage": { traceId: "trace-model-ls-001", spanId: "span-model-ls-001", timestamp: formatDateTime(new Date(now.getTime() - 200000)), instanceId: "openclaw-gateway@@LINUX-PROD04", channel: "api" },
  };

  const topErrors = [
    { spanName: "openclaw.webhook.error", errorCount: 45, totalCalls: 45, errorRate: 100 },
    { spanName: "openclaw.session.stuck", errorCount: 8, totalCalls: 8, errorRate: 100 },
    { spanName: "openclaw.webhook.processed", errorCount: 45, totalCalls: 5678, errorRate: 0.79 },
    { spanName: "openclaw.message.processed", errorCount: 23, totalCalls: 12456, errorRate: 0.18 },
    { spanName: "openclaw.model.usage", errorCount: 12, totalCalls: 8934, errorRate: 0.13 },
  ];

  const topErrorDetailMap = {
    "openclaw.webhook.error": { traceId: "trace-wh-err-top-001", spanId: "span-wh-err-top-001", timestamp: formatDateTime(new Date(now.getTime() - 3000000)), instanceId: "openclaw-gateway@@WIN-DEV05", channel: "telegram" },
    "openclaw.session.stuck": { traceId: "trace-stuck-top-001", spanId: "span-stuck-top-001", timestamp: formatDateTime(new Date(now.getTime() - 1500000)), instanceId: "openclaw-gateway@@WIN-TEST07", channel: "api" },
    "openclaw.webhook.processed": { traceId: "trace-wh-top-001", spanId: "span-wh-top-001", timestamp: formatDateTime(new Date(now.getTime() - 700000)), instanceId: "openclaw-gateway@@WIN-SERVER02", channel: "discord" },
    "openclaw.message.processed": { traceId: "trace-msg-top-001", spanId: "span-msg-top-001", timestamp: formatDateTime(new Date(now.getTime() - 350000)), instanceId: "openclaw-gateway@@WIN-SERVER01", channel: "webchat" },
    "openclaw.model.usage": { traceId: "trace-model-top-001", spanId: "span-model-top-001", timestamp: formatDateTime(new Date(now.getTime() - 180000)), instanceId: "openclaw-gateway@@LINUX-PROD04", channel: "api" },
  };

  const channels = [
    { name: "webchat", totalCalls: 12340, percentage: 45.5, successCount: 12306, errorCount: 34, successRate: 99.72, avgDurationMs: 456.7, instanceId: "openclaw-gateway@@WIN-SERVER01" },
    { name: "discord", totalCalls: 8900, percentage: 32.8, successCount: 8872, errorCount: 28, successRate: 99.69, avgDurationMs: 567.8, instanceId: "openclaw-gateway@@WIN-SERVER02" },
    { name: "telegram", totalCalls: 4560, percentage: 16.8, successCount: 4545, errorCount: 15, successRate: 99.67, avgDurationMs: 345.6, instanceId: "openclaw-gateway@@WIN-DESKTOP03" },
    { name: "api", totalCalls: 2340, percentage: 8.6, successCount: 2332, errorCount: 8, successRate: 99.66, avgDurationMs: 234.5, instanceId: "openclaw-gateway@@LINUX-PROD04" },
  ];

  const modelTokens = [
    { name: "MiniMax-M2.7", totalTokens: 5600000, inputTokens: 3800000, outputTokens: 1800000, cacheTokens: 2348800, callCount: 4500, avgDurationMs: 1567.8 },
    { name: "gpt-4o", totalTokens: 3200000, inputTokens: 2100000, outputTokens: 1100000, cacheTokens: 980000, callCount: 2800, avgDurationMs: 2345.6 },
    { name: "claude-3.5-sonnet", totalTokens: 1800000, inputTokens: 1200000, outputTokens: 600000, cacheTokens: 540000, callCount: 1200, avgDurationMs: 1890.3 },
    { name: "deepseek-v3", totalTokens: 560000, inputTokens: 380000, outputTokens: 180000, cacheTokens: 120000, callCount: 434, avgDurationMs: 890.5 },
    { name: "qwen-max", totalTokens: 420000, inputTokens: 280000, outputTokens: 140000, cacheTokens: 85000, callCount: 320, avgDurationMs: 678.9 },
  ];

  const durationBuckets = [
    { bucket: "0~100ms", spanCount: 8456, percentage: 31.18, avgDurationMs: 45.3, maxDurationMs: 98.7 },
    { bucket: "100ms~1s", spanCount: 12340, percentage: 45.50, avgDurationMs: 456.7, maxDurationMs: 987.6 },
    { bucket: "1s~5s", spanCount: 4560, percentage: 16.81, avgDurationMs: 2345.6, maxDurationMs: 4890.3 },
    { bucket: "5s~10s", spanCount: 1234, percentage: 4.55, avgDurationMs: 6789.1, maxDurationMs: 9876.5 },
    { bucket: ">10s", spanCount: 531, percentage: 1.96, avgDurationMs: 12345.6, maxDurationMs: 56789.0 },
  ];

  return {
    generatedAt: formatDateTime(now),
    timeRange: {
      start: formatDateTime(new Date(now.getTime() - hours * 60 * 60 * 1000)),
      end: formatDateTime(now),
    },
    overview: {
      totalCalls: 42213,
      successCount: 42058,
      errorCount: 155,
      successRate: 99.63,
      avgDurationMs: 456.78,
      maxDurationMs: 23456.7,
      totalCallsChangeRate: 5.23,
      successRateChangeRate: -0.12,
      avgDurationChangeRate: 8.45,
    },
    trend,
    trendByInstance,
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
    durationPercentiles: { p50: 234.5, p90: 1890.3, p99: 5678.9 },
  };
}
