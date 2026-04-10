function pad2(v) {
  return String(v).padStart(2, "0");
}

function toIso(ts) {
  return new Date(ts).toISOString();
}

function toDisplay(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  return `${y}/${m}/${day} ${h}:${min}:${s}`;
}

function dayLabel(ts) {
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function rolling30Start(now = Date.now()) {
  return now - 30 * 24 * 60 * 60 * 1000;
}

const RISK_DIALOGUES_BASE = [
  { sessionId: "sess-main-001", agentName: "main", riskLevel: "中危", content: "异常退出：exec exitCode = 1", offsetMin: 35 },
  { sessionId: "sess-main-002", agentName: "main", riskLevel: "中危", content: "进程错误：process status = failed", offsetMin: 82 },
  { sessionId: "sess-main-003", agentName: "main", riskLevel: "低危", content: "任务重试次数偏高，建议检查上游依赖", offsetMin: 146 },
  { sessionId: "sess-sec-001", agentName: "安全审计员", riskLevel: "高危", content: "命中高危关键词：疑似敏感信息外传", offsetMin: 220 },
  { sessionId: "sess-ops-001", agentName: "运维巡检员", riskLevel: "低危", content: "接口响应超时，触发降级策略", offsetMin: 390 },
  { sessionId: "sess-cs-001", agentName: "客服助手-小云", riskLevel: "中危", content: "多轮追问未命中知识库，需补充 FAQ", offsetMin: 510 },
];

function buildRiskSessions(riskLimit = 0) {
  const now = Date.now();
  const full = RISK_DIALOGUES_BASE.map((x) => {
    const t = now - x.offsetMin * 60 * 1000;
    return {
      sessionId: x.sessionId,
      agentName: x.agentName,
      riskLevel: x.riskLevel,
      dialogueTimeMs: t,
      displayTime: toDisplay(t),
      content: x.content,
    };
  }).sort((a, b) => b.dialogueTimeMs - a.dialogueTimeMs);

  const total = full.length;
  const n = Number(riskLimit) || 0;
  const items = n > 0 ? full.slice(0, Math.min(n, 500)) : full;
  return { riskSessions: items, riskSessionsTotal: total };
}

function buildSessionTrend(trendDays = 30) {
  const n = Math.min(90, Math.max(7, Number(trendDays) || 30));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const t = today.getTime() - i * 24 * 60 * 60 * 1000;
    const value = Math.max(0, Math.round(1.2 + Math.sin((n - i) / 2.2) * 1.7 + ((n - i) % 9 === 0 ? 3.5 : 0)));
    out.push({ day: toIso(t), label: dayLabel(t), value });
  }
  return out;
}

export function mockMonitorSessionOverview() {
  const now = Date.now();
  const monthStart = rolling30Start(now);
  return {
    generatedAt: toIso(now),
    period: { monthStart: toIso(monthStart) },
    overview: {
      sessionTotal: 11,
      highRiskSessions: 1,
      mediumRiskSessions: 4,
      lowRiskSessions: 2,
    },
  };
}

export function mockMonitorSessionRiskSessions({ riskLimit = 0 } = {}) {
  const now = Date.now();
  const monthStart = rolling30Start(now);
  const riskData = buildRiskSessions(riskLimit);
  return {
    generatedAt: toIso(now),
    period: { monthStart: toIso(monthStart) },
    riskSessions: riskData.riskSessions,
    riskSessionsTotal: riskData.riskSessionsTotal,
  };
}

export function mockMonitorSessionTrend({ trendDays = 30 } = {}) {
  const now = Date.now();
  const trend = buildSessionTrend(trendDays);
  const total = trend.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const trendStart = today.getTime() - (Math.max(1, Number(trendDays) || 30) - 1) * 24 * 60 * 60 * 1000;
  return {
    generatedAt: toIso(now),
    period: {
      trendDays: Number(trendDays) || 30,
      trendStart: toIso(trendStart),
    },
    sessionTrend: trend,
    sessionTrendTotal: total,
  };
}

export function mockMonitorSession({ trendDays = 30, riskLimit = 0 } = {}) {
  const now = Date.now();
  const overviewData = mockMonitorSessionOverview();
  const riskData = mockMonitorSessionRiskSessions({ riskLimit });
  const trendData = mockMonitorSessionTrend({ trendDays });
  return {
    generatedAt: toIso(now),
    period: {
      monthStart: overviewData.period.monthStart,
      trendDays: Number(trendDays) || 30,
      trendStart: trendData.period.trendStart,
    },
    overview: overviewData.overview,
    riskSessions: riskData.riskSessions,
    riskSessionsTotal: riskData.riskSessionsTotal,
    sessionTrend: trendData.sessionTrend,
    sessionTrendTotal: trendData.sessionTrendTotal,
  };
}
