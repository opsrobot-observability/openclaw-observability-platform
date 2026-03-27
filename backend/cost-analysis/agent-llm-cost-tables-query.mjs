/**
 * Agent 成本列表、LLM 成本明细：基于 Doris `otel.agent_sessions_logs`，左连 `agent_sessions` 取 Agent 名
 */
import crypto from "node:crypto";
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

/** @param {string} name */
function agentIdFromName(name) {
  const h = crypto.createHash("md5").update(String(name), "utf8").digest("hex").slice(0, 12);
  return `agt-${h}`;
}

function fmtTokensShort(n) {
  const x = Number(n) || 0;
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return String(Math.round(x));
}

function pctPart(part, total) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function inputOutStr(inp, out) {
  const io = (Number(inp) || 0) + (Number(out) || 0);
  if (io <= 0) return "—";
  const ip = pctPart(Number(inp) || 0, io);
  const op = pctPart(Number(out) || 0, io);
  return `${ip}% / ${op}%`;
}

/**
 * @param {string} startDay YYYY-MM-DD
 * @param {string} endDay YYYY-MM-DD
 */
export function validateDayRange(startDay, endDay) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startDay) || !re.test(endDay)) {
    throw new Error("invalid startDay or endDay (expect YYYY-MM-DD)");
  }
  if (startDay > endDay) throw new Error("startDay must be <= endDay");
}

/**
 * @param {string} startDay
 * @param {string} endDay
 */
export async function queryAgentCostList(startDay, endDay) {
  validateDayRange(startDay, endDay);

  const sql = `
SELECT
  COALESCE(NULLIF(TRIM(s.agent_name), ''), '(未命名 Agent)') AS agent_name,
  COUNT(*) AS log_lines,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS total_tokens,
  COALESCE(SUM(l.\`message_usage_input\`), 0) AS input_tokens,
  COALESCE(SUM(l.\`message_usage_output\`), 0) AS output_tokens,
  SUM(CASE WHEN l.\`message_usage_total_tokens\` > 0 THEN 1 ELSE 0 END) AS usage_calls,
  SUM(CASE WHEN l.\`message_is_error\` IS NOT NULL THEN 1 ELSE 0 END) AS error_known_lines,
  SUM(CASE WHEN l.\`message_is_error\` = 0 THEN 1 ELSE 0 END) AS ok_lines,
  SUM(CASE WHEN l.\`message_is_error\` = 1 THEN 1 ELSE 0 END) AS err_lines
FROM agent_sessions_logs l
LEFT JOIN agent_sessions s ON s.session_id = l.\`sessionId\`
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY agent_name
ORDER BY total_tokens DESC
`;

  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    const [rows] = await conn.query(sql, [startDay, endDay]);
    const list = Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];

    const outRows = list.map((r) => {
      const name = String(r.agent_name);
      const total = Number(r.total_tokens) || 0;
      const inp = Number(r.input_tokens) || 0;
      const outT = Number(r.output_tokens) || 0;
      const usageCalls = Number(r.usage_calls) || 0;
      const ok = Number(r.ok_lines) || 0;
      const err = Number(r.err_lines) || 0;
      const denom = ok + err;
      let successRate = null;
      if (denom > 0) successRate = (ok / denom) * 100;
      const avg = usageCalls > 0 ? total / usageCalls : 0;

      const io = inp + outT;
      const drill = [
        {
          segment: "输入 Token",
          tokens: fmtTokensShort(inp),
          pct: io > 0 ? `${pctPart(inp, io)}%` : "—",
        },
        {
          segment: "输出 Token",
          tokens: fmtTokensShort(outT),
          pct: io > 0 ? `${pctPart(outT, io)}%` : "—",
        },
      ];

      return {
        agentId: agentIdFromName(name),
        agent: name,
        totalCost: fmtTokensShort(total),
        avgPerTask: fmtTokensShort(avg),
        callCount: usageCalls,
        successRate: successRate != null ? `${successRate.toFixed(1)}%` : "—",
        drill,
      };
    });

    return {
      source: "otel.agent_sessions_logs + otel.agent_sessions",
      startDay,
      endDay,
      legend:
        "按日志行 timestamp 前 10 位（日）筛选；Agent 名来自左连 agent_sessions。总 Token 为 message_usage_total_tokens 求和；调用次数为 message_usage_total_tokens>0 的行数；成功率仅在 message_is_error 非空时统计（成功/（成功+失败））。",
      rows: outRows,
    };
  } finally {
    await conn.end();
  }
}

/**
 * @param {string} startDay
 * @param {string} endDay
 */
export async function queryLlmCostDetail(startDay, endDay) {
  validateDayRange(startDay, endDay);

  const sql = `
SELECT
  SUBSTR(l.\`timestamp\`, 1, 10) AS d,
  COALESCE(
    NULLIF(TRIM(l.\`model_id\`), ''),
    NULLIF(TRIM(l.\`message_model\`), ''),
    '(未知模型)'
  ) AS model,
  COALESCE(MAX(l.\`provider\`), '') AS provider,
  COALESCE(SUM(l.\`message_usage_total_tokens\`), 0) AS total_tokens,
  COALESCE(SUM(l.\`message_usage_input\`), 0) AS input_tokens,
  COALESCE(SUM(l.\`message_usage_output\`), 0) AS output_tokens
FROM agent_sessions_logs l
WHERE LENGTH(l.\`timestamp\`) >= 10
  AND SUBSTR(l.\`timestamp\`, 1, 10) >= ?
  AND SUBSTR(l.\`timestamp\`, 1, 10) <= ?
GROUP BY d, COALESCE(
    NULLIF(TRIM(l.\`model_id\`), ''),
    NULLIF(TRIM(l.\`message_model\`), ''),
    '(未知模型)'
  )
ORDER BY d DESC, total_tokens DESC
`;

  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    const [rows] = await conn.query(sql, [startDay, endDay]);
    const raw = Array.isArray(rows) ? rows.map((r) => normalizeAggRow(r)) : [];
    const list = raw.filter((r) => (Number(r.total_tokens) || 0) > 0);

    let grandTotal = 0;
    for (const r of list) {
      grandTotal += Number(r.total_tokens) || 0;
    }

    const outRows = list.map((r) => {
      const model = String(r.model);
      const d = String(r.d).slice(0, 10);
      const total = Number(r.total_tokens) || 0;
      const inp = Number(r.input_tokens) || 0;
      const outT = Number(r.output_tokens) || 0;
      const prov = String(r.provider || "").trim();
      const sharePct = grandTotal > 0 ? pctPart(total, grandTotal) : 0;

      const io = inp + outT;
      const drill = [
        {
          segment: "输入 Token",
          tokens: fmtTokensShort(inp),
          pct: io > 0 ? `${pctPart(inp, io)}%` : "—",
        },
        {
          segment: "输出 Token",
          tokens: fmtTokensShort(outT),
          pct: io > 0 ? `${pctPart(outT, io)}%` : "—",
        },
      ];

      return {
        model,
        statDate: d,
        provider: prov || "—",
        tokens: fmtTokensShort(total),
        share: `${sharePct}%`,
        inputOut: inputOutStr(inp, outT),
        drill,
      };
    });

    return {
      source: "otel.agent_sessions_logs",
      startDay,
      endDay,
      legend:
        "按日 + 模型维度汇总：模型取自 model_id，缺省用 message_model。占比为该行 Token 占所选区间内全量 Token 的比例。无人民币单价字段。",
      rows: outRows,
    };
  } finally {
    await conn.end();
  }
}