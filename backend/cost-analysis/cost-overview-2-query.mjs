/**
 * 成本概览2：Doris `agent_sessions_logs` + `agent_sessions` 聚合查询
 * 数据模型参考：docs/datamodel/token_metrics.md
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

const PIE_COLORS = ["#165DFF", "#00B42A", "#FF7D00", "#F53FAD", "#722ED1", "#14CBD3", "#F7BA1E", "#BD69F3"];

function momPct(cur, prev) {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function pct(part, total) {
  if (!total || total === 0) return 0;
  return (part / total) * 100;
}

/**
 * 解析时间范围为 startDay, endDay
 * @param {object} filters
 */
function parseTimeRange(filters) {
  const { timePreset, timeStart, timeEnd } = filters;
  const now = Date.now();
  const todayStr = dayStrFromMs(now);

  let startDay, endDay;

  switch (timePreset) {
    case 0: // 今日
      startDay = todayStr;
      endDay = todayStr;
      break;
    case 1: // 昨日
      startDay = dayStrFromMs(addDaysMs(now, -1));
      endDay = dayStrFromMs(addDaysMs(now, -1));
      break;
    case 7:
    case 30:
      startDay = dayStrFromMs(addDaysMs(now, -(timePreset - 1)));
      endDay = todayStr;
      break;
    case "month": {
      const d = new Date(now);
      startDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      endDay = todayStr;
      break;
    }
    case "naturalMonth": {
      const d = new Date(now);
      startDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      endDay = todayStr;
      break;
    }
    case "custom":
    default:
      // timeStart/timeEnd 格式为 YYYY-MM-DDTHH:mm
      startDay = timeStart ? timeStart.slice(0, 10) : todayStr;
      endDay = timeEnd ? timeEnd.slice(0, 10) : todayStr;
      break;
  }

  return { startDay, endDay };
}

/**
 * 解析模型筛选
 * @param {string} model
 */
function parseModelFilter(model) {
  const modelMap = {
    "gpt-4o": ["gpt-4o", "gpt-4o-mini", "chatgpt-4o-latest"],
    "claude-3": ["claude-3-5-sonnet", "claude-3-5-sonnet-20241022", "claude-3-opus", "claude-3-sonnet"],
    "llama-3": ["llama-3", "llama-3.1", "llama-3.2", "meta-llama"],
    "qwen": ["qwen", "qwen-turbo", "qwen-plus", "qwen-max", "qwen2", "qwen2.5"],
  };

  if (model === "all") return null;
  return modelMap[model] || null;
}

/**
 * 获取 KPI 汇总数据
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function queryKpiData(conn, startDay, endDay) {
  // 今日数据
  const todayStr = dayStrFromMs(Date.now());
  const yesterdayStr = dayStrFromMs(addDaysMs(Date.now(), -1));

  // 上期数据（同比/环比）
  const dayCount = Math.ceil((new Date(endDay) - new Date(startDay)) / (24 * 60 * 60 * 1000)) + 1;
  const prevStartDay = dayStrFromMs(addDaysMs(new Date(startDay).getTime(), -dayCount));
  const prevEndDay = yesterdayStr;

  const sql = `
    SELECT
      COALESCE(SUM(\`message_usage_total_tokens\`), 0) AS total_tokens,
      COALESCE(SUM(\`message_usage_input\`), 0) AS input_tokens,
      COALESCE(SUM(\`message_usage_output\`), 0) AS output_tokens,
      COALESCE(SUM(\`message_usage_cache_read\`), 0) AS cache_read_tokens,
      COALESCE(SUM(\`message_usage_cache_write\`), 0) AS cache_write_tokens,
      COUNT(DISTINCT \`message_model\`) AS model_count,
      COUNT(DISTINCT \`sessionId\`) AS session_count
    FROM agent_sessions_logs
    WHERE LENGTH(\`timestamp\`) >= 10
      AND SUBSTR(\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(\`timestamp\`, 1, 10) <= ?
  `;

  const [currentRows] = await conn.query(sql, [startDay, endDay]);
  const [prevRows] = await conn.query(sql, [prevStartDay, prevEndDay]);

  const cur = normalizeAggRow(currentRows[0] || {});
  const prev = normalizeAggRow(prevRows[0] || {});

  return {
    current: cur,
    prev: prev,
    todayTokens: Number(cur.total_tokens) || 0,
    prevPeriodTokens: Number(prev.total_tokens) || 0,
  };
}

/**
 * 获取月度累计成本
 * @param {import("mysql2/promise").Connection} conn
 */
async function queryMonthCumulativeData(conn) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = dayStrFromMs(Date.now());

  const sql = `
    SELECT
      COALESCE(SUM(\`message_usage_total_tokens\`), 0) AS total_tokens,
      COALESCE(SUM(\`message_usage_input\`), 0) AS input_tokens,
      COALESCE(SUM(\`message_usage_output\`), 0) AS output_tokens,
      COUNT(DISTINCT \`message_model\`) AS model_count,
      COUNT(DISTINCT \`sessionId\`) AS session_count
    FROM agent_sessions_logs
    WHERE LENGTH(\`timestamp\`) >= 10
      AND SUBSTR(\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(\`timestamp\`, 1, 10) <= ?
  `;

  const [monthRows] = await conn.query(sql, [monthStart, todayStr]);

  // 上月同期
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevMonthStartStr = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const prevMonthEndStr = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(prevMonthEnd.getDate()).padStart(2, "0")}`;

  const [prevMonthRows] = await conn.query(sql, [prevMonthStartStr, prevMonthEndStr]);

  return {
    current: normalizeAggRow(monthRows[0] || {}),
    prev: normalizeAggRow(prevMonthRows[0] || {}),
  };
}

/**
 * 按模型聚合成本数据
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function queryModelCostData(conn, startDay, endDay) {
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(\`message_model\`), ''), '(未知模型)') AS model_name,
      COALESCE(NULLIF(TRIM(\`provider\`), ''), 'unknown') AS provider,
      SUM(\`message_usage_total_tokens\`) AS total_tokens,
      SUM(\`message_usage_input\`) AS input_tokens,
      SUM(\`message_usage_output\`) AS output_tokens,
      COUNT(*) AS call_count,
      SUM(CASE WHEN \`message_is_error\` = true THEN 1 ELSE 0 END) AS error_count
    FROM agent_sessions_logs
    WHERE LENGTH(\`timestamp\`) >= 10
      AND SUBSTR(\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(\`timestamp\`, 1, 10) <= ?
    GROUP BY model_name, provider
    ORDER BY total_tokens DESC
  `;

  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * 按模型-日期聚合成本趋势
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 * @param {string[]} topModels
 */
async function queryModelTrendData(conn, startDay, endDay, topModels = []) {
  if (topModels.length === 0) {
    // 返回每日总成本趋势
    const sql = `
      SELECT
        SUBSTR(\`timestamp\`, 1, 10) AS date,
        SUM(\`message_usage_total_tokens\`) AS total_tokens
      FROM agent_sessions_logs
      WHERE LENGTH(\`timestamp\`) >= 10
        AND SUBSTR(\`timestamp\`, 1, 10) >= ?
        AND SUBSTR(\`timestamp\`, 1, 10) <= ?
      GROUP BY date
      ORDER BY date
    `;
    const [rows] = await conn.query(sql, [startDay, endDay]);
    return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
  }

  const placeholders = topModels.map(() => "?").join(",");
  const sql = `
    SELECT
      SUBSTR(\`timestamp\`, 1, 10) AS date,
      COALESCE(NULLIF(TRIM(\`message_model\`), ''), '(未知模型)') AS model_name,
      SUM(\`message_usage_total_tokens\`) AS total_tokens
    FROM agent_sessions_logs
    WHERE LENGTH(\`timestamp\`) >= 10
      AND SUBSTR(\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(\`timestamp\`, 1, 10) <= ?
      AND COALESCE(NULLIF(TRIM(\`message_model\`), ''), '(未知模型)') IN (${placeholders})
    GROUP BY date, model_name
    ORDER BY date, model_name
  `;

  const [rows] = await conn.query(sql, [startDay, endDay, ...topModels]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * Token 日消耗趋势（输入/输出）
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function queryTokenTrendData(conn, startDay, endDay) {
  const sql = `
    SELECT
      SUBSTR(\`timestamp\`, 1, 10) AS date,
      SUM(\`message_usage_input\`) AS input_tokens,
      SUM(\`message_usage_output\`) AS output_tokens,
      SUM(\`message_usage_total_tokens\`) AS total_tokens
    FROM agent_sessions_logs
    WHERE LENGTH(\`timestamp\`) >= 10
      AND SUBSTR(\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(\`timestamp\`, 1, 10) <= ?
    GROUP BY date
    ORDER BY date
  `;

  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * Token 消耗占比（按模型）
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function queryTokenRatioByModel(conn, startDay, endDay) {
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(\`message_model\`), ''), '(未知模型)') AS model_name,
      SUM(\`message_usage_total_tokens\`) AS total_tokens
    FROM agent_sessions_logs
    WHERE LENGTH(\`timestamp\`) >= 10
      AND SUBSTR(\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(\`timestamp\`, 1, 10) <= ?
    GROUP BY model_name
    ORDER BY total_tokens DESC
    LIMIT 10
  `;

  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * Token 消耗占比（按环境 - 通过 channel 或其他字段推断）
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function queryTokenRatioByEnv(conn, startDay, endDay) {
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(s.channel), ''), 'unknown') AS env,
      SUM(l.\`message_usage_total_tokens\`) AS total_tokens
    FROM agent_sessions_logs l
    LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
    WHERE LENGTH(l.\`timestamp\`) >= 10
      AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
    GROUP BY env
    ORDER BY total_tokens DESC
    LIMIT 10
  `;

  const [rows] = await conn.query(sql, [startDay, endDay]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * 会话/Agent 成本归因排行
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 * @param {number} limit
 */
async function querySessionCostRanking(conn, startDay, endDay, limit = 50) {
  const sql = `
    SELECT
      l.\`sessionId\` AS session_id,
      COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未知Agent)') AS agent_name,
      COALESCE(NULLIF(TRIM(l.\`message_model\`), ''), '(未知模型)') AS model,
      SUM(l.\`message_usage_total_tokens\`) AS total_tokens,
      SUM(l.\`message_usage_input\`) AS input_tokens,
      SUM(l.\`message_usage_output\`) AS output_tokens,
      COUNT(*) AS call_count,
      SUM(CASE WHEN l.\`message_is_error\` = true THEN 1 ELSE 0 END) AS error_count,
      MIN(l.\`timestamp\`) AS first_time,
      MAX(l.\`timestamp\`) AS last_time
    FROM agent_sessions_logs l
    LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
    WHERE LENGTH(l.\`timestamp\`) >= 10
      AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
      AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
    GROUP BY l.\`sessionId\`, agent_name, model
    ORDER BY total_tokens DESC
    LIMIT ?
  `;

  const [rows] = await conn.query(sql, [startDay, endDay, limit]);
  return Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
}

/**
 * 异常会话统计
 * @param {import("mysql2/promise").Connection} conn
 * @param {string} startDay
 * @param {string} endDay
 */
async function queryAbnormalSessions(conn, startDay, endDay) {
  // Token > 100,000 的会话数
  const sql = `
    SELECT COUNT(DISTINCT session_id) AS abnormal_count
    FROM (
      SELECT
        \`sessionId\` AS session_id,
        SUM(\`message_usage_total_tokens\`) AS total_tokens
      FROM agent_sessions_logs
      WHERE LENGTH(\`timestamp\`) >= 10
        AND SUBSTR(\`timestamp\`, 1, 10) >= ?
        AND SUBSTR(\`timestamp\`, 1, 10) <= ?
      GROUP BY session_id
      HAVING total_tokens > 100000
    ) t
  `;

  const [rows] = await conn.query(sql, [startDay, endDay]);
  return rows[0]?.abnormal_count || 0;
}

/**
 * 成本概览2 主查询
 * @param {object} filters
 * @param {number|string} filters.timePreset - 时间预设
 * @param {string} filters.timeStart - 自定义开始时间
 * @param {string} filters.timeEnd - 自定义结束时间
 * @param {string} filters.model - 模型筛选
 * @param {string} filters.env - 环境筛选
 * @param {string} filters.userType - 用户类型筛选
 * @param {string} filters.projectId - 项目ID
 */
export async function queryCostOverview2Data(filters = {}) {
  const defaultFilters = {
    timePreset: 7,
    timeStart: "",
    timeEnd: "",
    model: "all",
    env: "all",
    userType: "all",
    projectId: "",
  };
  const f = { ...defaultFilters, ...filters };
  const { startDay, endDay } = parseTimeRange(f);

  const config = getDorisConfig();
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    connectTimeout: 30000,
  });

  try {
    // 先切换到指定数据库
    if (config.database) {
      await conn.query(`USE \`${config.database}\``);
    }
    // 1. KPI 数据
    const kpiData = await queryKpiData(conn, startDay, endDay);
    const monthData = await queryMonthCumulativeData(conn);
    const abnormalCount = await queryAbnormalSessions(conn, startDay, endDay);

    // Token 单价估算（$/1M Token，基于平均模型组合）
    const AVG_COST_PER_M_TOKEN = 3.0; // 估算值，实际应从配置获取

    const totalTokensToday = kpiData.todayTokens;
    const totalCostToday = (totalTokensToday / 1_000_000) * AVG_COST_PER_M_TOKEN;

    const totalTokensMonth = Number(monthData.current.total_tokens) || 0;
    const totalCostMonth = (totalTokensMonth / 1_000_000) * AVG_COST_PER_M_TOKEN;

    const avgCostPerM = kpiData.todayTokens > 0
      ? (totalCostToday / (totalTokensToday / 1_000_000))
      : AVG_COST_PER_M_TOKEN;

    // 2. 模型成本数据
    const modelCostRows = await queryModelCostData(conn, startDay, endDay);
    const totalModelTokens = modelCostRows.reduce((sum, r) => sum + Number(r.total_tokens || 0), 0);

    const modelCostData = modelCostRows.slice(0, 6).map((r, i) => ({
      name: r.model_name,
      provider: r.provider,
      costAmount: Math.round((Number(r.total_tokens) / 1_000_000) * AVG_COST_PER_M_TOKEN * 100) / 100,
      costRatio: Math.round(pct(Number(r.total_tokens), totalModelTokens) * 10) / 10,
      totalTokens: Number(r.total_tokens),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      callCount: Number(r.call_count),
      errorCount: Number(r.error_count),
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));

    // 3. 模型成本趋势
    const topModels = modelCostData.slice(0, 4).map((r) => r.name);
    const trendRows = await queryModelTrendData(conn, startDay, endDay, topModels);

    // 转换为图表格式
    const trendDates = [...new Set(trendRows.map((r) => r.date))].sort();
    const modelTrendMap = {};

    for (const model of topModels) {
      modelTrendMap[model] = {};
    }
    modelTrendMap["总计"] = {};

    for (const row of trendRows) {
      const date = row.date.slice(5); // MM-DD
      for (const model of topModels) {
        if (!modelTrendMap[model][date]) modelTrendMap[model][date] = 0;
      }
      if (!modelTrendMap["总计"][date]) modelTrendMap["总计"][date] = 0;
    }

    // 重新查询每日总计
    const dailyTotalSql = `
      SELECT
        SUBSTR(\`timestamp\`, 1, 10) AS date,
        SUM(\`message_usage_total_tokens\`) AS total_tokens
      FROM agent_sessions_logs
      WHERE LENGTH(\`timestamp\`) >= 10
        AND SUBSTR(\`timestamp\`, 1, 10) >= ?
        AND SUBSTR(\`timestamp\`, 1, 10) <= ?
      GROUP BY date
      ORDER BY date
    `;
    const [dailyTotalRows] = await conn.query(dailyTotalSql, [startDay, endDay]);
    const dailyTotals = {};
    for (const row of dailyTotalRows) {
      const date = String(row.date).slice(5);
      dailyTotals[date] = Math.round((Number(row.total_tokens) / 1_000_000) * AVG_COST_PER_M_TOKEN * 100) / 100;
    }

    // 按日期汇总各模型成本
    const modelDailyTotals = {};
    for (const row of trendRows) {
      const date = row.date.slice(5);
      const model = row.model_name;
      if (!modelDailyTotals[date]) modelDailyTotals[date] = {};
      if (!modelDailyTotals[date][model]) modelDailyTotals[date][model] = 0;
      modelDailyTotals[date][model] += Math.round((Number(row.total_tokens) / 1_000_000) * AVG_COST_PER_M_TOKEN * 100) / 100;
    }

    const modelTrendData = trendDates.map((date) => {
      const item = { date: date.slice(5) };
      for (const model of topModels) {
        item[model] = modelDailyTotals[date]?.[model] || 0;
      }
      item["总计"] = dailyTotals[date] || 0;
      return item;
    });

    // 4. Token 日消耗趋势
    const tokenTrendRows = await queryTokenTrendData(conn, startDay, endDay);
    const tokenTrendData = tokenTrendRows.map((r) => ({
      date: String(r.date).slice(5),
      input: Math.round((Number(r.input_tokens) / 1_000_000) * 1000) / 1000,
      output: Math.round((Number(r.output_tokens) / 1_000_000) * 1000) / 1000,
      total: Math.round((Number(r.total_tokens) / 1_000_000) * 1000) / 1000,
    }));

    // 5. Token 消耗占比
    const tokenRatioByModelRows = await queryTokenRatioByModel(conn, startDay, endDay);
    const totalTokenRatio = tokenRatioByModelRows.reduce((sum, r) => sum + Number(r.total_tokens || 0), 0);
    const tokenRatioByModel = tokenRatioByModelRows.map((r, i) => ({
      name: r.model_name,
      value: Math.round(pct(Number(r.total_tokens), totalTokenRatio) * 10) / 10,
      tokens: Number(r.total_tokens),
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));

    const tokenRatioByEnvRows = await queryTokenRatioByEnv(conn, startDay, endDay);
    const totalEnvTokens = tokenRatioByEnvRows.reduce((sum, r) => sum + Number(r.total_tokens || 0), 0);
    const tokenRatioByEnv = tokenRatioByEnvRows.map((r, i) => ({
      name: r.env === "unknown" ? "未知环境" : r.env,
      value: Math.round(pct(Number(r.total_tokens), totalEnvTokens) * 10) / 10,
      tokens: Number(r.total_tokens),
      fill: PIE_COLORS[(i + 2) % PIE_COLORS.length],
    }));

    // 6. 会话成本归因
    const sessionRows = await querySessionCostRanking(conn, startDay, endDay, 50);
    const sessionData = sessionRows.map((r) => {
      const totalTokens = Number(r.total_tokens) || 0;
      const cost = Math.round((totalTokens / 1_000_000) * AVG_COST_PER_M_TOKEN * 10000) / 10000;

      let status = "normal";
      if (totalTokens > 500000) status = "error";
      else if (totalTokens > 100000) status = "over-token";

      return {
        sessionId: r.session_id,
        agentName: r.agent_name,
        model: r.model,
        tokenM: Math.round((totalTokens / 1_000_000) * 100) / 100,
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        cost: cost,
        callCount: Number(r.call_count) || 0,
        errorCount: Number(r.error_count) || 0,
        userType: r.user_type || "normal",
        createTime: String(r.first_time || "").slice(0, 16).replace("T", " "),
        status: status,
      };
    });

    // 7. 汇总卡片数据
    const kpiCards = [
      {
        title: "今日总成本",
        value: totalCostToday.toFixed(2),
        unit: "元",
        trend: momPct(totalCostToday, (kpiData.prevPeriodTokens / 1_000_000) * AVG_COST_PER_M_TOKEN),
        status: totalCostToday > 10000 ? "warning" : "normal",
        accent: PIE_COLORS[0],
      },
      {
        title: "本月累计成本",
        value: (totalCostMonth / 1000).toFixed(1) + "K",
        unit: "元",
        trend: momPct(totalCostMonth, (Number(monthData.prev.total_tokens) / 1_000_000) * AVG_COST_PER_M_TOKEN),
        status: totalCostMonth > 100000 ? "warning" : "normal",
        accent: PIE_COLORS[1],
      },
      {
        title: "总Token消耗",
        value: (kpiData.todayTokens / 1_000_000).toFixed(2),
        unit: "M",
        trend: momPct(kpiData.todayTokens, kpiData.prevPeriodTokens),
        status: "normal",
        accent: PIE_COLORS[2],
      },
      {
        title: "每1M Token成本",
        value: avgCostPerM.toFixed(2),
        unit: "元",
        trend: null,
        status: avgCostPerM > 5 ? "warning" : "normal",
        accent: PIE_COLORS[3],
      },
      {
        title: "活跃模型数量",
        value: Number(monthData.current.model_count) || 0,
        unit: "个",
        trend: null,
        status: "normal",
        accent: PIE_COLORS[4],
      },
      {
        title: "异常会话数",
        value: abnormalCount,
        unit: "个",
        trend: null,
        status: abnormalCount > 20 ? "error" : abnormalCount > 10 ? "warning" : "normal",
        accent: PIE_COLORS[5],
      },
    ];

    // 计算输入/输出占比
    const totalInput = tokenTrendRows.reduce((sum, r) => sum + Number(r.input_tokens || 0), 0);
    const totalOutput = tokenTrendRows.reduce((sum, r) => sum + Number(r.output_tokens || 0), 0);
    const ioTotal = totalInput + totalOutput;
    const inputPct = ioTotal > 0 ? Math.round((totalInput / ioTotal) * 1000) / 10 : 0;
    const outputPct = ioTotal > 0 ? Math.round((totalOutput / ioTotal) * 1000) / 10 : 0;

    return {
      source: "otel.agent_sessions_logs + otel.agent_sessions",
      generatedAt: Date.now(),
      filters: {
        timePreset: f.timePreset,
        timeStart: startDay,
        timeEnd: endDay,
        model: f.model,
        env: f.env,
        userType: f.userType,
        projectId: f.projectId,
      },
      kpiCards,
      modelCostData,
      modelTrendData,
      tokenTrendData,
      tokenRatioByModel,
      tokenRatioByEnv,
      sessionData,
      totalTokens: kpiData.todayTokens,
      totalCost: totalCostToday,
      monthTokens: totalTokensMonth,
      monthCost: totalCostMonth,
      inputPct,
      outputPct,
      legend: {
        tokenUnit: "M (百万 Token)",
        costUnit: "元 (基于估算单价 $3/1M Token)",
        abnormalThreshold: "Token > 100,000 为异常会话",
      },
    };
  } finally {
    await conn.end();
  }
}
