/**
 * Doris `cron_jobs` / `cron_runs` 查询（库名：DORIS_CRON_DATABASE 或 DORIS_DATABASE，供 Vite 中间件与独立 API 复用）
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

/** 连接超时（毫秒），避免错误地址时浏览器长时间「无响应」 */
function getCronConnectMs() {
  return Math.min(Math.max(Number(process.env.DORIS_CRON_CONNECT_MS) || 10000, 2000), 60000);
}

/** 单条 SQL 超时（毫秒），mysql2 QueryOptions.timeout */
function getCronQueryMs() {
  return Math.min(Math.max(Number(process.env.DORIS_CRON_QUERY_MS) || 20000, 3000), 120000);
}

function cronConnectionOptions() {
  return {
    ...getDorisConfig(),
    connectTimeout: getCronConnectMs(),
  };
}

/**
 * cron 表所在库：优先 DORIS_CRON_DATABASE，否则与连接配置 DORIS_DATABASE 一致（避免写死 opsRobot 与真实库不一致导致查不到数据）
 * @returns {string}
 */
function getCronDatabaseName() {
  const raw = process.env.DORIS_CRON_DATABASE ?? getDorisConfig().database ?? "opsRobot";
  return String(raw).replace(/[`'";\\]/g, "").trim() || "opsRobot";
}

/** @param {string} table */
function qualifyCronTable(table) {
  const safeTable = String(table ?? "").replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeTable) throw new Error("invalid cron table name");
  return `\`${getCronDatabaseName()}\`.\`${safeTable}\``;
}

/**
 * Doris BIGINT 等可能以 BigInt 返回，直接 JSON.stringify 会抛错；递归转为可序列化值。
 * @param {unknown} v
 * @returns {unknown}
 */
function jsonSafe(v) {
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : String(v);
  }
  if (v == null) return v;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    try {
      const s = v.toString("utf8");
      const t = s.trim();
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) return JSON.parse(t);
    } catch {
      /* ignore */
    }
    return v.toString("utf8");
  }
  if (Array.isArray(v)) return v.map((x) => jsonSafe(x));
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    const o = /** @type {Record<string, unknown>} */ (v);
    const out = {};
    for (const k of Object.keys(o)) out[k] = jsonSafe(o[k]);
    return out;
  }
  return v;
}

/**
 * mysql2 / Doris 下 SELECT 结果应为 RowDataPacket[]；若形态异常则降级为空数组，避免误把非数组当数据
 * @param {unknown} rows
 * @returns {object[]}
 */
function asRowArray(rows) {
  if (Array.isArray(rows)) return /** @type {object[]} */ (rows);
  return [];
}

/**
 * 从任务快照 JSON 中尝试取 Agent 展示名（无则返回空串）
 * @param {unknown} jobLog
 * @returns {string}
 */
function pickAgentDisplayName(jobLog) {
  if (!jobLog || typeof jobLog !== "object") return "";
  for (const k of ["agentName", "agentDisplayName", "displayName", "agentLabel"]) {
    const v = /** @type {Record<string, unknown>} */ (jobLog)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * 合并 `cron_jobs` 关联字段并去掉内部 `job_log_attributes`
 * @param {object} row
 * @returns {object}
 */
export function normalizeCronRunRow(row) {
  let jobLog = row.job_log_attributes;
  if (typeof jobLog === "string") {
    try {
      jobLog = JSON.parse(jobLog);
    } catch {
      jobLog = null;
    }
  }
  const agentId = row.agent_id != null && String(row.agent_id) !== "" ? String(row.agent_id) : "";
  const jobName = row.job_name != null ? String(row.job_name) : "";
  let agentName = pickAgentDisplayName(jobLog);
  if (!agentName) agentName = agentId || "—";
  const { job_log_attributes: _jl, ...rest } = row;
  let logAttrs = rest.log_attributes;
  if (typeof logAttrs === "string") {
    try {
      logAttrs = JSON.parse(logAttrs);
    } catch {
      /* keep string */
    }
  }
  return /** @type {object} */ (
    jsonSafe({ ...rest, log_attributes: logAttrs, agent_id: agentId, job_name: jobName, agent_name: agentName })
  );
}

/**
 * @returns {Promise<object[]>}
 */
export async function queryCronJobsSummary() {
  const conn = await mysql.createConnection(cronConnectionOptions());
  try {
    const sql = `
SELECT id, agent_id, session_key, name, log_attributes
FROM ${qualifyCronTable("cron_jobs")}
ORDER BY id
`;
    const [rows] = await conn.query({ sql, timeout: getCronQueryMs() });
    return asRowArray(rows).map((r) => /** @type {object} */ (jsonSafe(r)));
  } finally {
    await conn.end();
  }
}

/**
 * @param {{ jobId?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
export async function queryCronRuns(opts = {}) {
  const jobId = String(opts.jobId ?? "").trim();
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
  const limitLit = Math.floor(limit);
  const conn = await mysql.createConnection(cronConnectionOptions());
  try {
    if (jobId) {
      const sql = `
SELECT
  r.id,
  r.ts,
  r.job_id,
  r.action,
  r.status,
  r.delivery_status,
  r.model,
  r.provider,
  r.log_attributes,
  j.agent_id,
  j.name AS job_name,
  j.log_attributes AS job_log_attributes
FROM ${qualifyCronTable("cron_runs")} r
LEFT JOIN ${qualifyCronTable("cron_jobs")} j ON r.job_id = j.id
WHERE r.\`job_id\` = ?
ORDER BY r.\`ts\` DESC, r.\`id\` DESC
LIMIT ${limitLit}
`;
      const [rows] = await conn.query({ sql, values: [jobId], timeout: getCronQueryMs() });
      return asRowArray(rows).map(normalizeCronRunRow);
    }
    const sql = `
SELECT
  r.id,
  r.ts,
  r.job_id,
  r.action,
  r.status,
  r.delivery_status,
  r.model,
  r.provider,
  r.log_attributes,
  j.agent_id,
  j.name AS job_name,
  j.log_attributes AS job_log_attributes
FROM ${qualifyCronTable("cron_runs")} r
LEFT JOIN ${qualifyCronTable("cron_jobs")} j ON r.job_id = j.id
ORDER BY r.\`ts\` DESC, r.\`id\` DESC
LIMIT ${limitLit}
`;
    const [rows] = await conn.query({ sql, timeout: getCronQueryMs() });
    return asRowArray(rows).map(normalizeCronRunRow);
  } finally {
    await conn.end();
  }
}
