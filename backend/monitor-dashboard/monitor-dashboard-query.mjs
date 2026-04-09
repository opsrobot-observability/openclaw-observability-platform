/**
 * 数字员工监控大屏：聚合 OTel（opsRobot.otel_metrics_*）与审计会话（agent_sessions / logs）
 */
import { queryOtelOverviewData, queryOtelSumTrendStandalone } from "../otel-metrics/otel-overview-query.mjs";
import { queryAuditDashboardMetrics } from "../security-audit/audit-dashboard-query.mjs";

function formatDateTimeLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function formatTokenShort(n) {
  const x = Number(n) || 0;
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return String(Math.round(x));
}

/**
 * 按日聚合 Token（openclaw.tokens），用于柱状图
 * @param {object[]} sumTrendRows querySumTrend 结果
 * @param {number} trendDays
 */
function buildDailyTokenSeries(sumTrendRows, trendDays) {
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const r of sumTrendRows) {
    if (r.metric_name !== "openclaw.tokens") continue;
    const tb = r.time_bucket;
    const day = typeof tb === "string" ? tb.slice(0, 10) : "";
    if (day.length < 10) continue;
    byDay[day] = (byDay[day] || 0) + (Number(r.total_value) || 0);
  }
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const v = byDay[day] ?? 0;
    out.push({
      day,
      dateLabel: day.slice(5),
      value: v,
      valueMillions: v / 1e6,
    });
  }
  return out;
}

/**
 * Input / Output Token 占比（饼图）
 * @param {object[]} tokenByType tokenAnalytics.byType 同源结构 { name, value }
 */
function buildIoDonut(tokenByType) {
  let input = 0;
  let output = 0;
  for (const { name, value } of tokenByType) {
    const v = Number(value) || 0;
    if (name === "input" || name === "prompt") input += v;
    else if (name === "output") output += v;
  }
  const t = input + output;
  if (t <= 0) {
    return [
      { value: 50, name: "Input Token 50%" },
      { value: 50, name: "Output Token 50%" },
    ];
  }
  const ip = (input / t) * 100;
  const op = (output / t) * 100;
  return [
    { value: Math.round(ip * 10) / 10, name: `Input Token ${ip.toFixed(1)}%` },
    { value: Math.round(op * 10) / 10, name: `Output Token ${op.toFixed(1)}%` },
  ];
}

/**
 * 模型维度饼图数据
 * @param {object[]} byModel
 */
function buildModelDonut(byModel, maxItems = 5) {
  const sorted = [...byModel].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  const top = sorted.slice(0, maxItems);
  const rest = sorted.slice(maxItems);
  const restSum = rest.reduce((a, x) => a + (Number(x.value) || 0), 0);
  const total = sorted.reduce((a, x) => a + (Number(x.value) || 0), 0);
  const out = [];
  for (const row of top) {
    const v = Number(row.value) || 0;
    const pct = total > 0 ? (v / total) * 100 : 0;
    const name = row.name && String(row.name).trim() ? String(row.name) : "(未命名模型)";
    out.push({
      value: Math.round(pct * 10) / 10,
      name: `${name} ${pct.toFixed(1)}%`,
    });
  }
  if (restSum > 0 && total > 0) {
    const pct = (restSum / total) * 100;
    out.push({
      value: Math.round(pct * 10) / 10,
      name: `其他 ${pct.toFixed(1)}%`,
    });
  }
  return out.length ? out : [{ value: 100, name: "暂无数据 100%" }];
}

/**
 * Top 实例 Token（横向条形图），名称优先 host / 实例 id
 */
function buildTopAgentsBar(otel) {
  const inst = Array.isArray(otel.instances) ? otel.instances : [];
  const withTokens = inst
    .map((r) => {
      const id = r.id || r.service_instance_id || "";
      const label = (r.hostName && String(r.hostName)) || (r.name && String(r.name)) || id.slice(0, 12) || "实例";
      const tv = r.tokenConsumption;
      let num = 0;
      if (typeof tv === "string") {
        const m = tv.match(/^([\d.]+)\s*([KMB])?$/i);
        if (m) {
          num = Number(m[1]);
          const u = (m[2] || "").toUpperCase();
          if (u === "K") num *= 1e3;
          else if (u === "M") num *= 1e6;
          else if (u === "B") num *= 1e9;
        }
      }
      return { name: label.length > 16 ? `${label.slice(0, 14)}…` : label, value: num };
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  let rows = withTokens;
  if (rows.length === 0) {
    const ch = otel.tokenAnalytics?.byChannel || [];
    rows = ch.slice(0, 10).map((x) => ({
      name: String(x.name || "").slice(0, 16) || "channel",
      value: Number(x.value) || 0,
    }));
  }

  const max = Math.max(1, ...rows.map((x) => x.value));
  return {
    categories: rows.map((x) => x.name).reverse(),
    values: rows.map((x) => Math.round((x.value / max) * 100)).reverse(),
  };
}

/**
 * 数字员工表行
 */
function buildDigitalEmployeeRows(otel) {
  const inst = Array.isArray(otel.instances) ? otel.instances : [];
  return inst.map((r) => {
    const id = r.id || "";
    const online = r.status === "在线";
    return {
      id,
      name: (r.hostName && String(r.hostName)) || (r.name && String(r.name)) || id.slice(0, 8) || "Gateway",
      status: r.status || "在线",
      active: online,
      sessions: typeof r.sessionTotal === "number" ? String(r.sessionTotal) : "0",
      token: r.tokenConsumption != null ? String(r.tokenConsumption) : "0",
    };
  });
}

/**
 * @param {object} [opts]
 * @param {number} [opts.otelHours] 中心 KPI、列表、分布所基于的 OTel 时间窗（小时）
 * @param {number} [opts.trendDays] Token 日趋势与 OTel 宽窗口（天）
 */
export async function queryMonitorDashboardData(opts = {}) {
  const otelHours = Number(opts.otelHours) > 0 ? Number(opts.otelHours) : 24;
  const trendDays = Number(opts.trendDays) > 0 ? Number(opts.trendDays) : 14;
  const endMs = Date.now();
  const startMs = endMs - trendDays * 24 * 60 * 60 * 1000;
  const startIso = formatDateTimeLocal(startMs);
  const endIso = formatDateTimeLocal(endMs);

  const [otel, audit, sumTrendWide] = await Promise.all([
    queryOtelOverviewData({ hours: otelHours }),
    queryAuditDashboardMetrics(),
    queryOtelSumTrendStandalone(startIso, endIso),
  ]);

  const todayW = audit.windows?.today || {};
  const agentTotal = Array.isArray(otel.instances) ? otel.instances.length : 0;
  const userTotal = Number(todayW.user_access) || 0;
  const terminalCount = Number(todayW.device_connections) || 0;
  const tokenRaw = Number(otel.overview?.totalTokens) || 0;

  const tokenByType = otel.tokenAnalytics?.byType || [];
  const tokenByModel = otel.tokenAnalytics?.byModel || [];
  const dailyToken = buildDailyTokenSeries(sumTrendWide, trendDays);
  const ioDonut = buildIoDonut(tokenByType);
  const modelDonut = buildModelDonut(tokenByModel);
  const topAgentsBar = buildTopAgentsBar(otel);
  const digitalEmployees = buildDigitalEmployeeRows(otel);

  const sessions7d = audit.trends?.sessions7d || [];
  const sessionTrendSum = sessions7d.reduce((a, x) => a + (Number(x.sessions) || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    params: { otelHours, trendDays },
    legend: {
      riskCounts:
        "audit.risk.high/medium/low 为 agent_sessions_logs 行级风险分类计数；界面若显示为「会话」需与产品确认文案。",
      otelKpis: `OTel 指标时间窗为最近 ${otelHours} 小时（与审计「今日」日历窗口独立）。`,
    },
    centerKpis: {
      agentTotal,
      userTotal,
      terminalCount,
      tokenDisplay: formatTokenShort(tokenRaw),
      tokenRaw,
    },
    sessionOverview: {
      todaySessionTotal: Number(todayW.session_total) || 0,
      riskHigh: Number(audit.risk?.high) || 0,
      riskMedium: Number(audit.risk?.medium) || 0,
      riskLow: Number(audit.risk?.low) || 0,
    },
    charts: {
      dailyToken,
      ioDonut,
      modelDonut,
      topAgentsBar,
      sessionTrend: sessions7d.map((x) => ({
        dateLabel: x.dateLabel,
        day: x.day,
        sessions: x.sessions,
      })),
      sessionTrendTotal: sessionTrendSum,
    },
    digitalEmployees,
    otel,
    audit,
  };
}
