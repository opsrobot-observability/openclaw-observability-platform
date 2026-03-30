/**
 * 会话成本明细：Doris `agent_sessions_logs` + `agent_sessions` 过滤查询
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

const COST_YUAN_PER_M_TOKEN = 3;

function pad2(n) { return String(n).padStart(2, "0"); }

function dayStrFromMs(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysMs(ms, days) {
  return ms + days * 24 * 60 * 60 * 1000;
}

function parseTimeRange({ timePreset, timeStart, timeEnd }) {
  const now = Date.now();
  const todayStr = dayStrFromMs(now);

  let startDay, endDay;
  switch (timePreset) {
    case 0: startDay = todayStr; endDay = todayStr; break;
    case 1: startDay = dayStrFromMs(addDaysMs(now, -1)); endDay = dayStrFromMs(addDaysMs(now, -1)); break;
    case 7: case 14: case 30:
      startDay = dayStrFromMs(addDaysMs(now, -(timePreset - 1)));
      endDay = todayStr;
      break;
    case "month": {
      const d = new Date(now);
      startDay = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
      endDay = todayStr;
      break;
    }
    case "naturalMonth": {
      const d = new Date(now);
      startDay = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
      endDay = todayStr;
      break;
    }
    default:
      startDay = timeStart ? timeStart.slice(0, 10) : todayStr;
      endDay = timeEnd ? timeEnd.slice(0, 10) : todayStr;
  }
  return { startDay, endDay };
}

async function withConn(fn) {
  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, connectTimeout: 30000,
  });
  try {
    if (cfg.database) await conn.query(`USE \`${cfg.database}\``);
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

function buildWhere(startDay, endDay, filters) {
  const conditions = [
    "LENGTH(l.`timestamp`) >= 10",
    "SUBSTR(l.`timestamp`, 1, 10) >= ?",
    "SUBSTR(l.`timestamp`, 1, 10) <= ?",
  ];
  const params = [startDay, endDay];

  if (filters.agents && filters.agents.length > 0) {
    const ph = filters.agents.map(() => "?").join(",");
    conditions.push(`COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名)') IN (${ph})`);
    params.push(...filters.agents);
  }
  if (filters.users && filters.users.length > 0) {
    const ph = filters.users.map(() => "?").join(",");
    conditions.push(`COALESCE(NULLIF(TRIM(s.display_name), ''), '(未知用户)') IN (${ph})`);
    params.push(...filters.users);
  }
  if (filters.gateways && filters.gateways.length > 0) {
    const ph = filters.gateways.map(() => "?").join(",");
    conditions.push(`COALESCE(NULLIF(TRIM(s.channel), ''), '(未知)') IN (${ph})`);
    params.push(...filters.gateways);
  }
  if (filters.models && filters.models.length > 0) {
    const ph = filters.models.map(() => "?").join(",");
    conditions.push(`COALESCE(NULLIF(TRIM(l.\`message_model\`), ''), '(未知模型)') IN (${ph})`);
    params.push(...filters.models);
  }

  return { conditions, params };
}

function validSortKey(k) {
  const key = String(k ?? "").trim();
  const allowed = [
    "sessionId", "agentName", "userName", "gateway", "model",
    "totalTokens", "inputTokens", "outputTokens", "costYuan", "createTime",
  ];
  return allowed.includes(key) ? key : "totalTokens";
}

/**
 * ORDER BY 使用与 SELECT/GROUP BY 一致的表达式（不用结果别名），兼容 Doris 对聚合查询排序的解析。
 */
function sortKeyToOrderExpr(k) {
  const m = {
    sessionId: "l.`sessionId`",
    agentName: "COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名)')",
    userName: "COALESCE(NULLIF(TRIM(s.display_name), ''), '(未知用户)')",
    gateway: "COALESCE(NULLIF(TRIM(s.channel), ''), '(未知)')",
    model: "COALESCE(NULLIF(TRIM(l.`message_model`), ''), '(未知模型)')",
    totalTokens: "COALESCE(SUM(l.`message_usage_total_tokens`), 0)",
    inputTokens: "COALESCE(SUM(l.`message_usage_input`), 0)",
    outputTokens: "COALESCE(SUM(l.`message_usage_output`), 0)",
    costYuan: "COALESCE(SUM(l.`message_usage_total_tokens`), 0)",
    createTime: "MIN(l.`timestamp`)",
  };
  return m[k] || m.totalTokens;
}

/**
 * 会话成本明细列表（分页、排序、过滤）
 */
export async function querySessionCostDetail({
  startDay, endDay,
  agents = [], users = [], gateways = [], models = [],
  page = 1, pageSize = 20,
  sortKey = "totalTokens", sortOrder = "desc",
} = {}) {
  return withConn(async (conn) => {
    const { conditions, params } = buildWhere(startDay, endDay, { agents, users, gateways, models });
    const safeKey = validSortKey(sortKey);
    const orderExpr = sortKeyToOrderExpr(safeKey);
    const safeOrder = sortOrder === "asc" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const whereClause = conditions.join("\n      AND ");

    const [countResult, rowsResult] = await Promise.all([
      conn.query(`SELECT COUNT(DISTINCT l.\`sessionId\`) AS total FROM agent_sessions_logs l LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\` WHERE ${whereClause}`, params),
      conn.query(`
SELECT
  l.\`sessionId\` AS session_id,
  COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名)') AS agent_name,
  COALESCE(NULLIF(TRIM(s.display_name), ''), '(未知用户)') AS user_name,
  COALESCE(NULLIF(TRIM(s.channel), ''), '(未知)') AS gateway,
  COALESCE(NULLIF(TRIM(l.\`message_model\`), ''), '(未知模型)') AS model,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS total_tokens,
  COALESCE(SUM(l.\`message_usage_input\`), 0) AS input_tokens,
  COALESCE(SUM(l.\`message_usage_output\`), 0) AS output_tokens,
  MIN(l.\`timestamp\`) AS create_time
FROM agent_sessions_logs l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE ${whereClause}
GROUP BY l.\`sessionId\`, agent_name, user_name, gateway, model
ORDER BY ${orderExpr} ${safeOrder}
LIMIT ? OFFSET ?
`, [...params, Number(pageSize), offset]),
    ]);

    const total = Number(countResult[0]?.[0]?.total) || 0;
    const rows = rowsResult[0];

    const mapped = rows.map((r) => {
      const totalTokens = Number(r.total_tokens) || 0;
      const inputTokens = Number(r.input_tokens) || 0;
      const outputTokens = Number(r.output_tokens) || 0;
      const costYuan = Math.round((totalTokens / 1_000_000) * COST_YUAN_PER_M_TOKEN * 10000) / 10000;
      return {
        sessionId: String(r.session_id || ""),
        agentName: r.agent_name,
        userName: r.user_name,
        gateway: r.gateway,
        model: r.model,
        totalTokens,
        inputTokens,
        outputTokens,
        costYuan,
        createTime: String(r.create_time || "").slice(0, 16).replace("T", " "),
      };
    });

    return { rows: mapped, total };
  });
}

/**
 * 下拉选项（用于筛选器的可选项）；四个下拉在同一条连接上并发查询。
 */
export async function querySessionCostOptions({ startDay, endDay } = {}) {
  return withConn(async (conn) => {
    const now = Date.now();
    const defStart = dayStrFromMs(addDaysMs(now, -29));
    const defEnd = dayStrFromMs(now);
    const s = startDay || defStart;
    const e = endDay || defEnd;

    const tsCond = "LENGTH(l.`timestamp`) >= 10 AND SUBSTR(l.`timestamp`, 1, 10) >= ? AND SUBSTR(l.`timestamp`, 1, 10) <= ?";
    const sqlBase = `FROM agent_sessions_logs l LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\` WHERE ${tsCond}`;

    const [[agentsRows], [usersRows], [gatewayRows], [modelRows]] = await Promise.all([
      conn.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名)') AS v ${sqlBase} ORDER BY v LIMIT 100`, [s, e]),
      conn.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(s.display_name), ''), '(未知用户)') AS v ${sqlBase} ORDER BY v LIMIT 100`, [s, e]),
      conn.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(s.channel), ''), '(未知)') AS v ${sqlBase} ORDER BY v LIMIT 100`, [s, e]),
      conn.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(l.\`message_model\`), ''), '(未知模型)') AS v FROM agent_sessions_logs l WHERE ${tsCond} ORDER BY v LIMIT 100`, [s, e]),
    ]);

    return {
      agents: agentsRows.map((r) => r.v).filter(Boolean),
      users: usersRows.map((r) => r.v).filter(Boolean),
      gateways: gatewayRows.map((r) => r.v).filter(Boolean),
      models: modelRows.map((r) => r.v).filter(Boolean),
    };
  });
}
