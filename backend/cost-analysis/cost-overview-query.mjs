/**
 * 成本概览：`otel.agent_sessions_logs`（关联 `agent_sessions` 取 Agent 名）
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

/** @param {Record<string, unknown>} row */
function normalizeAggRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === "bigint") out[k] = Number(v);
  }
  return out;
}

function dayStrFromMs(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysMs(ms, days) {
  return ms + days * 24 * 60 * 60 * 1000;
}

const AGENT_COLORS = ["#165DFF", "#3b82f6", "#60a5fa", "#34d399", "#f59e0b", "#a855f7", "#94a3b8", "#64748b"];

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function sumTokensRange(conn, startDay, endDay) {
  const sql = `
SELECT COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS t
FROM agent_sessions_logs l
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
`;
  const [[row]] = await conn.query(sql, [startDay, endDay]);
  return Number(row?.t) || 0;
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function sumInOutRange(conn, startDay, endDay) {
  const sql = `
SELECT
  COALESCE(SUM(l.\`message_usage_input\`), 0) AS inp,
  COALESCE(SUM(l.\`message_usage_output\`), 0) AS outp
FROM agent_sessions_logs l
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
`;
  const [[row]] = await conn.query(sql, [startDay, endDay]);
  return { input: Number(row?.inp) || 0, output: Number(row?.outp) || 0 };
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function tokensByDay(conn, startDay, endDay) {
  const sql = `
SELECT SUBSTR(l.\`timestamp\`, 1, 10) AS d, COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS tokens
FROM agent_sessions_logs l
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY d
ORDER BY d
`;
  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function tokensByAgent(conn, startDay, endDay) {
  const sql = `
SELECT
  COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名 Agent)') AS name,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS tokens
FROM agent_sessions_logs l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY name
ORDER BY tokens DESC
`;
  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * 按 Agent 统计 Token 消耗详情：总Token、平均单次Token、调用次数
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function agentTokenDetail(conn, startDay, endDay) {
  const sql = `
SELECT
  COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名 Agent)') AS agent_name,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS total_tokens,
  COUNT(*) AS call_count,
  CASE
    WHEN COUNT(*) > 0 THEN COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) / COUNT(*)
    ELSE 0
  END AS avg_tokens_per_call
FROM agent_sessions_logs l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY agent_name
ORDER BY total_tokens DESC
`;
  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 * @param {string[]} agentNames
 */
async function tokensByDayAndAgent(conn, startDay, endDay, agentNames) {
  if (agentNames.length === 0) return [];
  const ph = agentNames.map(() => "?").join(",");
  const sql = `
SELECT
  SUBSTR(l.\`timestamp\`, 1, 10) AS d,
  COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名 Agent)') AS agent_name,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS tokens
FROM agent_sessions_logs l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
  AND COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名 Agent)') IN (${ph})
GROUP BY d, agent_name
ORDER BY d, agent_name
`;
  const [rows] = await conn.query(sql, [startDay, endDay, ...agentNames]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function tokensByModel(conn, startDay, endDay) {
  const sql = `
SELECT
  COALESCE(
    NULLIF(TRIM(l.\`model_id\`), ''),
    NULLIF(TRIM(l.\`message_model\`), ''),
    '(未知模型)'
  ) AS model,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS total_tokens,
  COALESCE(SUM(l.\`message_usage_input\`), 0) AS input_tokens,
  COALESCE(SUM(l.\`message_usage_output\`), 0) AS output_tokens
FROM agent_sessions_logs l
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY model
ORDER BY total_tokens DESC
`;
  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 * @param {number} [limit]
 */
async function topSessionsByTokens(conn, startDay, endDay, limit = 10) {
  const sql = `
SELECT
  l.\`sessionId\` AS session_id,
  COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名 Agent)') AS agent_name,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS total_tokens,
  COALESCE(SUM(l.\`message_usage_input\`), 0) AS input_tokens,
  COALESCE(SUM(l.\`message_usage_output\`), 0) AS output_tokens,
  COUNT(*) AS log_lines,
  MIN(l.\`timestamp\`) AS first_time
FROM agent_sessions_logs l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY l.\`sessionId\`, agent_name
ORDER BY total_tokens DESC
LIMIT ?
`;
  const [rows] = await conn.query(sql, [startDay, endDay, limit]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

function momPct(cur, prev) {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function fillDayMap(rows) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const r of rows) {
    const k = r.d != null ? String(r.d).slice(0, 10) : "";
    if (k.length >= 10) m[k] = Number(r.tokens) || 0;
  }
  return m;
}

function fillDaysRange(startDayStr, endDayStr, map) {
  const out = [];
  const start = new Date(startDayStr + "T00:00:00");
  const end = new Date(endDayStr + "T00:00:00");
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, tokens: map[key] ?? 0 });
  }
  return out;
}

function pct(part, total) {
  if (!total || total === 0) return 0;
  return (part / total) * 100;
}

/**
 * @param {{ trendDays?: number }} [opts]
 */
export async function queryCostOverviewSnapshot(opts = {}) {
  const rawDays = Number(opts.trendDays);
  const trendWindowDays = [7, 14, 30].includes(rawDays) ? rawDays : 14;

  const now = Date.now();
  const todayStr = dayStrFromMs(now);
  const yesterdayStr = dayStrFromMs(addDaysMs(now, -1));
  const weekStartStr = dayStrFromMs(addDaysMs(now, -6));
  const prevWeekStartStr = dayStrFromMs(addDaysMs(now, -13));
  const prevWeekEndStr = dayStrFromMs(addDaysMs(now, -7));
  const trendStartStr = dayStrFromMs(addDaysMs(now, -(trendWindowDays - 1)));

  const nowDate = new Date(now);
  const monthStartStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-01`;

  const prevMonthLast = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0);
  const prevMonthYear = prevMonthLast.getFullYear();
  const prevMonthIdx = prevMonthLast.getMonth();
  const prevMonthStartStr = `${prevMonthYear}-${String(prevMonthIdx + 1).padStart(2, "0")}-01`;
  const daysInPrevMonth = prevMonthLast.getDate();
  const sameDayPrevMonth = Math.min(nowDate.getDate(), daysInPrevMonth);
  const prevMonthCompareEndStr = `${prevMonthYear}-${String(prevMonthIdx + 1).padStart(2, "0")}-${String(sameDayPrevMonth).padStart(2, "0")}`;

  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    connectTimeout: 30000,
  });

  try {
    if (cfg.database) {
      await conn.query(`USE \`${cfg.database}\``);
    }
    const todayTokens = await sumTokensRange(conn, todayStr, todayStr);
    const yesterdayTokens = await sumTokensRange(conn, yesterdayStr, yesterdayStr);

    const weekTokens = await sumTokensRange(conn, weekStartStr, todayStr);
    const prevWeekTokens = await sumTokensRange(conn, prevWeekStartStr, prevWeekEndStr);

    const monthTokens = await sumTokensRange(conn, monthStartStr, todayStr);
    const prevMonthSliceTokens = await sumTokensRange(conn, prevMonthStartStr, prevMonthCompareEndStr);

    const last7Rows = await tokensByDay(conn, dayStrFromMs(addDaysMs(now, -6)), todayStr);
    const last7Map = fillDayMap(last7Rows);
    const last7Filled = fillDaysRange(dayStrFromMs(addDaysMs(now, -6)), todayStr, last7Map);
    const sum7 = last7Filled.reduce((a, x) => a + x.tokens, 0);
    const avg7 = last7Filled.length ? sum7 / last7Filled.length : 0;
    let peak = { day: todayStr, tokens: 0 };
    for (const x of last7Filled) {
      if (x.tokens >= peak.tokens) peak = { day: x.day, tokens: x.tokens };
    }

    const trendRows = await tokensByDay(conn, trendStartStr, todayStr);
    const trendMap = fillDayMap(trendRows);
    const trend14 = fillDaysRange(trendStartStr, todayStr, trendMap).map((x) => ({
      date: x.day.slice(5),
      day: x.day,
      tokens: Math.round((x.tokens / 1_000_000) * 1000) / 1000,
      tokensRaw: x.tokens,
    }));

    const monthAgents = await tokensByAgent(conn, monthStartStr, todayStr);
    const totalAgentTok = monthAgents.reduce((a, x) => a + (Number(x.tokens) || 0), 0);
    const agentShare = monthAgents.slice(0, 8).map((x, i) => ({
      name: String(x.name),
      tokens: Number(x.tokens) || 0,
      value: Math.round(pct(Number(x.tokens) || 0, totalAgentTok) * 10) / 10,
      fill: AGENT_COLORS[i % AGENT_COLORS.length],
    }));

    const topNames = monthAgents.slice(0, 5).map((x) => String(x.name));
    const dayAgentRows =
      topNames.length > 0 ? await tokensByDayAndAgent(conn, trendStartStr, todayStr, topNames) : [];

    /** @type {Record<string, Record<string, number>>} */
    const byDayAgent = {};
    for (const r of dayAgentRows) {
      const d = String(r.d).slice(0, 10);
      const ag = String(r.agent_name);
      if (!byDayAgent[d]) byDayAgent[d] = {};
      byDayAgent[d][ag] = Number(r.tokens) || 0;
    }

    const trendDayRange = fillDaysRange(trendStartStr, todayStr, {});

    /** @type {{ dataKey: string; name: string; color: string }[]} */
    let series = [];
    /** @type {Record<string, string|number>[]} */
    let dailyByAgentRows = [];

    if (topNames.length === 0) {
      series = [{ dataKey: "total", name: "Σ Token", color: "#165DFF" }];
      dailyByAgentRows = trendDayRange.map(({ day }) => ({
        date: day.slice(5),
        total: Math.round(((trendMap[day] ?? 0) / 1_000_000) * 1000) / 1000,
      }));
    } else {
      series = topNames.map((name, i) => ({
        dataKey: `a${i}`,
        name,
        color: AGENT_COLORS[i % AGENT_COLORS.length],
      }));
      dailyByAgentRows = trendDayRange.map(({ day }) => {
        /** @type {Record<string, number|string>} */
        const row = { date: day.slice(5) };
        const dayMap = byDayAgent[day] ?? {};
        const totalDay = trendMap[day] ?? 0;
        let sumTop = 0;
        topNames.forEach((name, i) => {
          const v = dayMap[name] ?? 0;
          sumTop += v;
          row[`a${i}`] = Math.round((v / 1_000_000) * 1000) / 1000;
        });
        const other = Math.max(0, totalDay - sumTop);
        row.aOther = Math.round((other / 1_000_000) * 1000) / 1000;
        return row;
      });
      series.push({ dataKey: "aOther", name: "其他", color: "#cbd5e1" });
    }

    const inOut = await sumInOutRange(conn, monthStartStr, todayStr);
    const inSum = inOut.input;
    const outSum = inOut.output;
    const ioTotal = inSum + outSum;
    const inOutShare = [
      {
        name: "输入 Token",
        value: Math.round(pct(inSum, ioTotal) * 10) / 10,
        fill: "#2563eb",
      },
      {
        name: "输出 Token",
        value: Math.round(pct(outSum, ioTotal) * 10) / 10,
        fill: "#34d399",
      },
    ];

    // 大模型消耗占比（按模型）
    const modelRows = await tokensByModel(conn, monthStartStr, todayStr);
    const totalModelTokens = modelRows.reduce((a, x) => a + (Number(x.total_tokens) || 0), 0);
    const modelShare = modelRows.slice(0, 8).map((x, i) => ({
      name: String(x.model),
      tokens: Number(x.total_tokens) || 0,
      value: Math.round(pct(Number(x.total_tokens) || 0, totalModelTokens) * 10) / 10,
      inputTokens: Number(x.input_tokens) || 0,
      outputTokens: Number(x.output_tokens) || 0,
      fill: AGENT_COLORS[i % AGENT_COLORS.length],
    }));

    // Agent Token 消耗详情
    const agentTokenDetailRows = await agentTokenDetail(conn, monthStartStr, todayStr);

    // Top10 会话 Token 消耗
    const topSessionRows = await topSessionsByTokens(conn, monthStartStr, todayStr, 10);
    const topSessions = topSessionRows.map((r) => {
      const total = Number(r.total_tokens) || 0;
      const inp = Number(r.input_tokens) || 0;
      const outT = Number(r.output_tokens) || 0;
      const io = inp + outT;
      return {
        sessionId: String(r.session_id || "").slice(0, 16),
        agentName: String(r.agent_name),
        tokens: Math.round((total / 1_000_000) * 1000) / 1000,
        inputTokens: Math.round((inp / 1_000_000) * 1000) / 1000,
        outputTokens: Math.round((outT / 1_000_000) * 1000) / 1000,
        inputPct: io > 0 ? Math.round((inp / io) * 1000) / 10 : 0,
        outputPct: io > 0 ? Math.round((outT / io) * 1000) / 10 : 0,
        logLines: Number(r.log_lines) || 0,
        createTime: String(r.first_time || "").slice(0, 16).replace("T", " "),
      };
    });

    return {
      source: "otel.agent_sessions_logs + otel.agent_sessions",
      generatedAt: now,
      meta: {
        trendDays: trendWindowDays,
        trendRangeLabel: `${trendStartStr} ~ ${todayStr}`,
      },
      cards: {
        today: {
          totalTokens: todayTokens,
          momPct: momPct(todayTokens, yesterdayTokens),
        },
        week: {
          totalTokens: weekTokens,
          momPct: momPct(weekTokens, prevWeekTokens),
        },
        month: {
          totalTokens: monthTokens,
          momPct: momPct(monthTokens, prevMonthSliceTokens),
        },
        dailyAvg7d: {
          avgTokens: avg7,
          peakDay: peak.day.slice(5),
          peakTokens: peak.tokens,
        },
      },
      agentShare,
      inOut: {
        inputTokens: inSum,
        outputTokens: outSum,
        inputPct: Math.round(pct(inSum, ioTotal) * 10) / 10,
        outputPct: Math.round(pct(outSum, ioTotal) * 10) / 10,
        pie: inOutShare,
      },
      trend14d: trend14,
      dailyByAgent: {
        series,
        rows: dailyByAgentRows,
      },
      modelShare,
      topSessions,
      agentTokenDetail: agentTokenDetailRows.map((r) => ({
        agentName: String(r.agent_name),
        totalTokens: Number(r.total_tokens) || 0,
        avgTokensPerCall: Math.round((Number(r.avg_tokens_per_call) || 0) * 100) / 100,
        callCount: Number(r.call_count) || 0,
      })),
      legend:
        "按日志行 `timestamp` 前 10 位（YYYY-MM-DD）汇总 `message_usage_*`；与 `agent_sessions.session_id` 左连接取 `agent_name`。无人民币字段时以 Token 为成本代理指标。",
    };
  } finally {
    await conn.end();
  }
}