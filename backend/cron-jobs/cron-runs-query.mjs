/**
 * Doris：定时任务执行记录（`cron_runs` LEFT JOIN `cron_jobs`）
 *
 * 库名：`DORIS_CRON_DATABASE`（缺省与 `DORIS_DATABASE` 一致）。
 * 表名：`DORIS_CRON_JOBS_TABLE`（默认 cron_jobs）、`DORIS_CRON_RUNS_TABLE`（默认 cron_runs）。
 *
 * 默认列名（若实际 DDL 不同，请用环境变量覆盖，例如 `CRON_RUNS_COL_JOB_ID=jobid` / `cron_job_id`）：
 * - cron_jobs: id, name；Cron 表达式列名未设置 `CRON_JOBS_COL_CRON` 时，会按序探测
 *   schedule / cron_expression / cron / cron_expr / cronspec / spec / expression，均无则 SELECT NULL。
 *   也可显式设置 `CRON_JOBS_COL_CRON=你的列名`，或 `CRON_JOBS_COL_CRON=__omit__` 固定不查该列。
 * - `cron_jobs` 扩展 JSON：`CRON_JOBS_COL_LOG_ATTRIBUTES`；未设置时按序探测 `log_attributes`、`logattributes` 等；存在时按
 *   `docs/datamodel/cron_runs.md`（字段表）与 `docs/datamodel/cron_jobs.md`：`GET_JSON_STRING` 提取 job_source、trace_id 等到 API 标量字段（不返回整包 JSON 字符串）。
 *   **GET /api/cron-jobs 任务概览**：`display_name` 等键补 **名称**；`agent_id`、`session_key`、`schedule_tz` 等补 **基本信息 / schedule.tz**；
 *   **负载 `payload`**：优先从 **`log_attributes.payload`** 嵌套对象取 `kind` / `model` / `message`（及 `type`、`body` 等别名），再回落顶层扁平键 `$.payload_kind` 等。
 *   `total_lines`、`ok_count`、`fail_count`、`avg_duration_ms`、`total_tokens_sum`、`last_success_at_ms` 等补 **listRunSummary（卡片汇总）**——有值则**优先于** `cron_runs` 聚合。
 *   **最近执行**（`jobs[].state` 与 `listRunSummary.lastRunTokensTotal`）：优先 **`log_attributes.state`** 嵌套（如 `$.state.last_run_at_ms`），再回落顶层同名键，最后才用 `cron_runs` **最近一行**。
 *   **物理列**：若存在 `agent_id` / `agentid` / `digital_employee_id` 等（或 `CRON_JOBS_COL_AGENT_ID`）、`description` 等（或 `CRON_JOBS_COL_DESCRIPTION`），一并 SELECT 并与 JSON 路径合并（列优先于同名 JSON）。
 * - `cron_runs.log_attributes`（可选）：`CRON_RUNS_COL_LOG_ATTRIBUTES`（默认 `log_attributes`）；存在时与任务表一起参与 **`deliveryStatus`** 解析，**优先取执行行**再回落到任务行。
 *   **运行日志「产出摘要」**：`events[].summary` 从 **`cron_runs.log_attributes`** 读取 **`$.summary`**（并兼容 `$.output_summary`、`$.result_summary` 等别名）。
 *   同一列上按 `GET_JSON_STRING` 提取 **Token 用量**（写入 `events[].usage` 与列表 `listRunSummary`），路径兼容：
 *   `$.usage.input_tokens` / `prompt_tokens`，`$.usage.output_tokens` / `completion_tokens`，`$.usage.total_tokens`；
 *   及顶层 `$.input_tokens`、`$.total_tokens` 等。可选：`$.model`、`$.provider`。
 *   **运行耗时（运行性能 Tab）**：`$.durationMs`、`$.duration_ms`、`$.execution_duration_ms`、`$.elapsed_ms`、`$.latency_ms`、`$.run_duration_ms` 等；映射到事件 **`durationMs`** 时**优先于**由 `started_at`/`finished_at` 推算的墙钟耗时。
 *   **运行日志列**：**会话 ID**（`$.session_id` / `$.sessionId`）、**下次运行**（`$.nextRunAtMs` / `$.next_run_at_ms` 等，数值毫秒或 ISO）、**错误**（`$.error` / `$.error_message` 等）优先写入事件 `sessionId` / `nextRunAtMs` / `error`，无值时再回落 `cron_jobs.log_attributes` 的 `job_session_id` 与表列 `error_message`。
 * - cron_runs：未设置 `CRON_RUNS_COL_*` 时，对 `cron_runs` 执行 `SHOW COLUMNS` 并按候选列名匹配。
 *   **开始时间列 `CRON_RUNS_COL_STARTED_AT`**（可选）：显式指定「本条执行何时开始」的物理列名（仅字母数字下划线）。
 *   未设置时按 `RUNS_STARTED_CANDIDATES` 顺序在表上探测第一个存在的列：`started_at`、`start_time`、…、`ts`（常见于事件表）、`created_at`、`create_time`；
 *   再经 `coalesceExistingCol` 在 `insert_time` / `gmt_create` / `create_time` 上纠偏。该列用于：时间窗过滤、按日趋势分桶、排序、与结束列推算墙钟耗时等。
 *   **结束时间列 `CRON_RUNS_COL_FINISHED_AT`**（可选）：同理，候选见 `RUNS_FINISHED_CANDIDATES`，无则回退 `updated_at` / `update_time`。
 *
 * 排序列：`CRON_RUNS_COL_ORDER_BY`（缺省与解析得到的「开始时间」列一致，无则按 `id`）。
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

/** @param {string} name @param {string} fallback */
function sanitizeIdent(name, fallback) {
  const raw = String(name ?? "").trim() || fallback;
  const v = raw.replace(/[^a-zA-Z0-9_]/g, "");
  return v || fallback;
}

export function getCronDatabaseName() {
  const cfg = getDorisConfig();
  const raw = process.env.DORIS_CRON_DATABASE ?? cfg.database ?? "opsRobot";
  return String(raw).replace(/[`'"]/g, "").trim() || "opsRobot";
}

function qualifyTable(tableBase) {
  const db = getCronDatabaseName();
  const t = sanitizeIdent(tableBase, tableBase);
  return `\`${db}\`.\`${t}\``;
}

function tableRefs() {
  return {
    jobs: qualifyTable(sanitizeIdent(process.env.DORIS_CRON_JOBS_TABLE, "cron_jobs")),
    runs: qualifyTable(sanitizeIdent(process.env.DORIS_CRON_RUNS_TABLE, "cron_runs")),
  };
}

function jobColumnRefs() {
  return {
    jobsId: sanitizeIdent(process.env.CRON_JOBS_COL_ID, "id"),
    jobsName: sanitizeIdent(process.env.CRON_JOBS_COL_NAME, "name"),
  };
}

const RUNS_ID_CANDIDATES = ["id", "run_id", "pk"];
const RUNS_JOB_FK_CANDIDATES = ["job_id", "jobid", "cron_job_id", "task_id"];
const RUNS_STATUS_CANDIDATES = ["status", "state", "result", "run_status"];
const RUNS_STARTED_CANDIDATES = [
  "started_at",
  "start_time",
  "begin_at",
  "run_at",
  "started_time",
  "execute_at",
  "start_at",
  "trigger_time",
  "scheduled_at",
  "run_started_at",
  "begin_time",
  "start_ts",
  /** 部分表用 `ts` 存执行开始时间（Unix 毫秒或 DATETIME，与 Doris/MySQL 比较语义一致即可） */
  "ts",
  "created_at",
  "create_time",
];
const RUNS_FINISHED_CANDIDATES = [
  "finished_at",
  "end_time",
  "completed_at",
  "ended_at",
  "finish_time",
  "run_finished_at",
  "complete_time",
  "end_ts",
  "updated_at",
  "update_time",
];
const RUNS_ERROR_CANDIDATES = [
  "error_message",
  "error",
  "message",
  "failure_reason",
  "err_msg",
  "exception",
  "error_msg",
  "err",
];

/** `cron_runs` 上扩展 JSON 列名探测（与 `cron_jobs.log_attributes` 语义类似） */
const RUNS_LOG_ATTRIBUTES_CANDIDATES = ["log_attributes", "logattributes", "run_log_attributes", "ext_attrs"];

/** `cron_jobs` 上扩展 JSON 列（部分 Doris 表为无下划线 `logattributes`，见 docs/datamodel） */
const JOBS_LOG_ATTRIBUTES_CANDIDATES = ["log_attributes", "logattributes", "run_log_attributes", "ext_attrs"];

/** @param {Set<string>} fieldSet */
function firstMatchingColumn(fieldSet, candidates) {
  for (const c of candidates) {
    if (fieldSet.has(c)) return c;
  }
  return null;
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsLogAttributesColumn(jobsCols) {
  const env = process.env.CRON_JOBS_COL_LOG_ATTRIBUTES;
  if (env != null && String(env).trim()) {
    const c = sanitizeIdent(String(env).trim(), "log_attributes");
    return jobsCols.has(c) ? c : null;
  }
  return firstMatchingColumn(jobsCols, JOBS_LOG_ATTRIBUTES_CANDIDATES);
}

/**
 * @param {Set<string>} fieldSet
 * @param {string} envVar
 * @param {string[]} candidates
 * @param {string} fallbackWhenEmptySet
 */
function resolveRunsCol(fieldSet, envVar, candidates, fallbackWhenEmptySet) {
  if (process.env[envVar] != null && String(process.env[envVar]).trim()) {
    return sanitizeIdent(process.env[envVar], fallbackWhenEmptySet);
  }
  if (fieldSet.size > 0) {
    const hit = firstMatchingColumn(fieldSet, candidates);
    if (hit) return hit;
  }
  return fallbackWhenEmptySet;
}

/** @type {Record<string, unknown> | undefined} */
let cachedRunsColumnRefs;

/**
 * @param {Set<string>} fieldSet
 * @param {string} col
 * @param {string[]} alternates
 * @param {string} lastResort
 */
function coalesceExistingCol(fieldSet, col, alternates, lastResort) {
  if (fieldSet.size === 0) return col;
  if (fieldSet.has(col)) return col;
  for (const a of alternates) {
    if (fieldSet.has(a)) return a;
  }
  return fieldSet.has(lastResort) ? lastResort : col;
}

/**
 * 由 `SHOW COLUMNS` 的 Type 推断时间列：Unix 毫秒整型 vs DATETIME（见 docs/datamodel/cron_runs.md）。
 * @param {Map<string, string>} fieldTypes field(lower) -> type(lower)
 * @param {string} colName
 * @param {Set<string>} fieldSet
 */
function inferRunsTemporalKind(fieldTypes, colName, fieldSet) {
  if (!colName || !fieldSet.has(colName)) return "datetime";
  const cn = String(colName).toLowerCase();
  // cron_runs 文档：ts 为毫秒时间戳；避免 SHOW COLUMNS 的 Type 在部分 Doris 版本下为空或非整型描述时误判为 DATETIME，
  // 进而对 BIGINT 使用 DATE_FORMAT(列) 触发 Nereids 解析异常。
  if (cn === "ts") return "unix_ms";
  const tp = String(fieldTypes.get(colName) ?? "").toLowerCase();
  if (tp.includes("datetime") || tp.includes("timestamp") || /\bdate\b/.test(tp)) return "datetime";
  if (tp.includes("bigint") || tp.includes("largeint") || tp.includes("int(") || tp === "int" || tp.includes("integer"))
    return "unix_ms";
  return "datetime";
}

/** @param {string | null | undefined} iso */
function cronIsoRangeToMs(iso) {
  if (iso == null) return null;
  const t = Date.parse(String(iso).trim());
  return Number.isFinite(t) ? t : null;
}

/**
 * 时间窗：`ts` 等 bigint 毫秒与 ISO 边界比较；否则按 DATETIME 与 ISO 字符串比较。
 * @param {string[]} whereParts
 * @param {unknown[]} params
 * @param {{
 *   runsStarted: string,
 *   runsStartedTemporal: "unix_ms" | "datetime",
 * }} C
 */
function appendCronRunsTimeRangeFilters(whereParts, params, C, startIso, endIso) {
  const s = startIso != null && String(startIso).trim() ? String(startIso).trim() : null;
  const e = endIso != null && String(endIso).trim() ? String(endIso).trim() : null;
  if (s) {
    const ms = cronIsoRangeToMs(s);
    if (C.runsStartedTemporal === "unix_ms" && ms != null) {
      whereParts.push(`CAST(r.\`${C.runsStarted}\` AS BIGINT) >= ?`);
      params.push(ms);
    } else {
      whereParts.push(`r.\`${C.runsStarted}\` >= ?`);
      params.push(s);
    }
  }
  if (e) {
    const ms = cronIsoRangeToMs(e);
    if (C.runsStartedTemporal === "unix_ms" && ms != null) {
      whereParts.push(`CAST(r.\`${C.runsStarted}\` AS BIGINT) <= ?`);
      params.push(ms);
    } else {
      whereParts.push(`r.\`${C.runsStarted}\` <= ?`);
      params.push(e);
    }
  }
}

/**
 * 趋势按日分桶：毫秒时间戳用 `FROM_UNIXTIME(ms/1000)`；否则 `DATE_FORMAT`。
 * @param {{ runsStarted: string, runsStartedTemporal: "unix_ms" | "datetime" }} C
 */
function runsStartedDayBucketExpr(C) {
  const c = C.runsStarted;
  if (C.runsStartedTemporal === "unix_ms") {
    return `DATE_FORMAT(FROM_UNIXTIME(CAST(r.\`${c}\` AS BIGINT) / 1000), '%Y-%m-%d')`;
  }
  return `DATE_FORMAT(r.\`${c}\`, '%Y-%m-%d')`;
}

/**
 * 「最近 24 小时」与 `runsStarted` 同语义（毫秒列与 `NOW()` 对齐）。
 * @param {{ runsStarted: string, runsStartedTemporal: "unix_ms" | "datetime" }} C
 */
function runsStartedInLast24hPredicateSql(C) {
  const c = C.runsStarted;
  if (C.runsStartedTemporal === "unix_ms") {
    return `(CAST(r.\`${c}\` AS BIGINT) >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 24 HOUR)) * 1000)`;
  }
  return `(r.\`${c}\` >= DATE_SUB(NOW(), INTERVAL 24 HOUR))`;
}

/**
 * 列表/事件：`started_at` 统一为可 `Date.parse` 的标量（毫秒列转 `FROM_UNIXTIME`）。
 * @param {{ runsStarted: string, runsStartedTemporal: "unix_ms" | "datetime" }} C
 */
function runsStartedSelectSqlAsStartedAt(C) {
  const c = C.runsStarted;
  if (C.runsStartedTemporal === "unix_ms") {
    return `FROM_UNIXTIME(CAST(r.\`${c}\` AS BIGINT) / 1000) AS started_at`;
  }
  return `r.\`${c}\` AS started_at`;
}

/**
 * 运行开始时刻的 DATETIME 表达式（无别名），供 `MAX(...)` 等与 `runsStartedSelectSqlAsStartedAt` 对齐。
 * @param {{ runsStarted: string, runsStartedTemporal: "unix_ms" | "datetime" }} C
 * @param {string} [tableAlias]
 */
function runsStartedDatetimeExpr(C, tableAlias = "r") {
  const c = C.runsStarted;
  const a = tableAlias;
  if (C.runsStartedTemporal === "unix_ms") {
    return `FROM_UNIXTIME(CAST(${a}.\`${c}\` AS BIGINT) / 1000)`;
  }
  return `${a}.\`${c}\``;
}

/**
 * @param {{
 *   runsFinished: string,
 *   runsFinishedTemporal: "unix_ms" | "datetime",
 *   runsFinishedInTable: boolean,
 * }} C
 */
function runsFinishedSelectSqlAsFinishedAt(C) {
  if (!C.runsFinishedInTable) return `CAST(NULL AS DATETIME) AS finished_at`;
  const c = C.runsFinished;
  if (C.runsFinishedTemporal === "unix_ms") {
    return `FROM_UNIXTIME(CAST(r.\`${c}\` AS BIGINT) / 1000) AS finished_at`;
  }
  return `r.\`${c}\` AS finished_at`;
}

/**
 * 墙钟耗时（毫秒）：无独立结束列或与开始列为同一物理列时返回 NULL。
 * @param {{
 *   runsStarted: string,
 *   runsFinished: string,
 *   runsStartedTemporal: "unix_ms" | "datetime",
 *   runsFinishedTemporal: "unix_ms" | "datetime",
 *   runsWallClockAvailable: boolean,
 * }} C
 */
function buildRunsWallDurationMsExpr(C) {
  if (!C.runsWallClockAvailable) return "CAST(NULL AS DOUBLE)";
  if (C.runsStartedTemporal !== C.runsFinishedTemporal) return "CAST(NULL AS DOUBLE)";
  const s = C.runsStarted;
  const f = C.runsFinished;
  if (C.runsStartedTemporal === "unix_ms" && C.runsFinishedTemporal === "unix_ms") {
    return `(CASE WHEN r.\`${f}\` IS NOT NULL AND r.\`${s}\` IS NOT NULL AND CAST(r.\`${f}\` AS BIGINT) >= CAST(r.\`${s}\` AS BIGINT) THEN CAST(r.\`${f}\` AS BIGINT) - CAST(r.\`${s}\` AS BIGINT) ELSE NULL END)`;
  }
  return `(CASE WHEN r.\`${f}\` IS NOT NULL AND r.\`${s}\` IS NOT NULL AND r.\`${f}\` >= r.\`${s}\` THEN (UNIX_TIMESTAMP(r.\`${f}\`) - UNIX_TIMESTAMP(r.\`${s}\`)) * 1000.0 ELSE NULL END)`;
}

/**
 * @param {import("mysql2/promise").Connection} conn
 */
async function buildRunsColumnRefs(conn) {
  const db = getCronDatabaseName();
  const tbl = sanitizeIdent(process.env.DORIS_CRON_RUNS_TABLE, "cron_runs");
  /** @type {Set<string>} */
  let fieldSet = new Set();
  /** @type {Map<string, string>} */
  const fieldTypes = new Map();
  try {
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${db}\`.\`${tbl}\``);
    const colRows = Array.isArray(cols) ? cols : [];
    for (const r of colRows) {
      const fn = String(r.Field ?? r.field ?? r.COLUMN_NAME ?? r.column_name ?? "").toLowerCase();
      if (!fn) continue;
      fieldSet.add(fn);
      const tp = String(r.Type ?? r.type ?? "").toLowerCase();
      fieldTypes.set(fn, tp);
    }
  } catch {
    fieldSet = new Set();
    fieldTypes.clear();
  }

  const runsId = resolveRunsCol(fieldSet, "CRON_RUNS_COL_ID", RUNS_ID_CANDIDATES, "id");
  const runsJobFk = resolveRunsCol(fieldSet, "CRON_RUNS_COL_JOB_ID", RUNS_JOB_FK_CANDIDATES, "job_id");

  let runsStarted = resolveRunsCol(fieldSet, "CRON_RUNS_COL_STARTED_AT", RUNS_STARTED_CANDIDATES, "created_at");
  runsStarted = coalesceExistingCol(fieldSet, runsStarted, ["insert_time", "gmt_create", "create_time"], runsId);

  let runsFinished = resolveRunsCol(fieldSet, "CRON_RUNS_COL_FINISHED_AT", RUNS_FINISHED_CANDIDATES, "updated_at");
  runsFinished = coalesceExistingCol(fieldSet, runsFinished, ["modified_at", "gmt_modified", "update_time"], runsStarted);

  let runsStatus = resolveRunsCol(fieldSet, "CRON_RUNS_COL_STATUS", RUNS_STATUS_CANDIDATES, "status");
  if (fieldSet.size > 0 && !fieldSet.has(runsStatus)) {
    runsStatus = firstMatchingColumn(fieldSet, RUNS_STATUS_CANDIDATES) || null;
  }

  let runsError = resolveRunsCol(fieldSet, "CRON_RUNS_COL_ERROR_MESSAGE", RUNS_ERROR_CANDIDATES, "error_message");
  if (fieldSet.size > 0 && !fieldSet.has(runsError)) {
    runsError = firstMatchingColumn(fieldSet, RUNS_ERROR_CANDIDATES) || null;
  }

  const runsOrder =
    process.env.CRON_RUNS_COL_ORDER_BY != null && String(process.env.CRON_RUNS_COL_ORDER_BY).trim()
      ? sanitizeIdent(process.env.CRON_RUNS_COL_ORDER_BY, runsStarted)
      : fieldSet.size > 0 && fieldSet.has(runsStarted)
        ? runsStarted
        : runsId;

  const statusSql =
    runsStatus && (fieldSet.size === 0 || fieldSet.has(runsStatus))
      ? `r.\`${runsStatus}\` AS status`
      : `NULL AS status`;
  const errorSql =
    runsError && (fieldSet.size === 0 || fieldSet.has(runsError))
      ? `r.\`${runsError}\` AS error_message`
      : `NULL AS error_message`;

  /** @type {string | null} */
  let runsLogAttributesColumn = null;
  if (fieldSet.size > 0) {
    if (process.env.CRON_RUNS_COL_LOG_ATTRIBUTES != null && String(process.env.CRON_RUNS_COL_LOG_ATTRIBUTES).trim()) {
      const c = sanitizeIdent(process.env.CRON_RUNS_COL_LOG_ATTRIBUTES, "log_attributes");
      if (fieldSet.has(c)) runsLogAttributesColumn = c;
    }
    if (!runsLogAttributesColumn) {
      runsLogAttributesColumn = firstMatchingColumn(fieldSet, RUNS_LOG_ATTRIBUTES_CANDIDATES);
    }
  }

  const runsFinishedInTable = fieldSet.size > 0 && fieldSet.has(runsFinished);
  const runsStartedTemporal = inferRunsTemporalKind(fieldTypes, runsStarted, fieldSet);
  const runsFinishedTemporal = runsFinishedInTable
    ? inferRunsTemporalKind(fieldTypes, runsFinished, fieldSet)
    : "datetime";
  const runsWallClockAvailable = Boolean(runsFinishedInTable && runsFinished !== runsStarted);

  return {
    ...jobColumnRefs(),
    runsId,
    runsJobFk,
    runsStatus,
    runsStarted,
    runsFinished,
    runsError,
    runsOrder,
    runsLogAttributesColumn,
    statusSql,
    errorSql,
    runsStartedTemporal,
    runsFinishedTemporal,
    runsFinishedInTable,
    runsWallClockAvailable,
    _fieldProbe: fieldSet.size > 0,
  };
}

/**
 * @param {import("mysql2/promise").Connection} conn
 */
async function resolveRunsColumnRefs(conn) {
  if (cachedRunsColumnRefs !== undefined && "runsStartedTemporal" in cachedRunsColumnRefs) {
    return cachedRunsColumnRefs;
  }
  cachedRunsColumnRefs = await buildRunsColumnRefs(conn);
  return cachedRunsColumnRefs;
}

/** 首次解析后缓存：`string` = 列名，`null` = 无可用列 */
let cachedCronJobsExpressionColumn;

/** `cron_jobs` 列名小写集合（一次 SHOW COLUMNS，供 Cron 列与 log_attributes 共用） */
let cachedCronJobsColumnSet;

/**
 * @param {import("mysql2/promise").Connection} conn
 * @returns {Promise<Set<string>>}
 */
async function getCronJobsColumnSet(conn) {
  if (cachedCronJobsColumnSet !== undefined) return cachedCronJobsColumnSet;
  try {
    const db = getCronDatabaseName();
    const tbl = sanitizeIdent(process.env.DORIS_CRON_JOBS_TABLE, "cron_jobs");
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${db}\`.\`${tbl}\``);
    cachedCronJobsColumnSet = new Set(
      (Array.isArray(cols) ? cols : []).map((r) =>
        String(r.Field ?? r.field ?? r.COLUMN_NAME ?? r.column_name ?? "").toLowerCase(),
      ),
    );
  } catch {
    cachedCronJobsColumnSet = new Set();
  }
  return cachedCronJobsColumnSet;
}

/**
 * @param {string} castLa `CAST(j.\`log_attributes\` AS STRING)`
 * @param {string[]} paths JSONPath 列表，按序 COALESCE
 */
function coalesceGetJsonStringPaths(castLa, paths) {
  if (!paths.length) return "CAST(NULL AS STRING)";
  const parts = paths.map((p) => `NULLIF(TRIM(GET_JSON_STRING(${castLa}, '${p}')), '')`);
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

/**
 * `cron_jobs.log_attributes`：按 docs/datamodel/cron-jobs.md 等提取常用路径 + 整列 JSON 字符串
 * @param {import("mysql2/promise").Connection} conn
 * @returns {Promise<{ sql: string, hasLogAttributes: boolean, column: string | null }>}
 */
async function resolveJobsLogAttributesSelectSql(conn) {
  const jobsCols = await getCronJobsColumnSet(conn);
  const laName = pickJobsLogAttributesColumn(jobsCols);
  if (!laName) {
    return {
      sql: [
        "NULL AS job_source",
        "NULL AS job_trace_id",
        "NULL AS job_request_id",
        "NULL AS job_session_id",
        "NULL AS job_workspace",
        "NULL AS job_timeout_seconds",
        "NULL AS job_last_run_snapshot_raw",
        "NULL AS job_last_run_status_snapshot_raw",
        "NULL AS job_last_duration_ms_snapshot_raw",
        "NULL AS job_last_delivery_status_snapshot_raw",
        "NULL AS job_last_error_snapshot_raw",
        "NULL AS job_next_run_at_snapshot_raw",
        "NULL AS job_consecutive_errors_snapshot_raw",
        "NULL AS job_last_tokens_snapshot_raw",
        "NULL AS job_display_name_raw",
        "NULL AS job_agent_id_raw",
        "NULL AS job_session_key_raw",
        "NULL AS job_session_target_raw",
        "NULL AS job_wake_mode_raw",
        "NULL AS job_delivery_mode_raw",
        "NULL AS job_payload_kind_raw",
        "NULL AS job_payload_model_raw",
        "NULL AS job_payload_message_raw",
        "NULL AS job_schedule_tz_raw",
        "NULL AS job_summary_total_lines_raw",
        "NULL AS job_summary_ok_count_raw",
        "NULL AS job_summary_fail_count_raw",
        "NULL AS job_summary_avg_duration_ms_raw",
        "NULL AS job_summary_max_duration_ms_raw",
        "NULL AS job_summary_total_tokens_raw",
        "NULL AS job_summary_last_success_raw",
      ].join(",\n  "),
      hasLogAttributes: false,
      column: null,
    };
  }

  const jla = `j.\`${laName}\``;
  const castLa = `CAST(${jla} AS STRING)`;
  const coalescePaths = (p1, p2) =>
    `COALESCE(NULLIF(TRIM(GET_JSON_STRING(${castLa}, '${p1}')), ''), NULLIF(TRIM(GET_JSON_STRING(${castLa}, '${p2}')), ''))`;

  const sql = [
    `${coalescePaths("$.source", "$.kind")} AS job_source`,
    `${coalescePaths("$.trace_id", "$.traceId")} AS job_trace_id`,
    `${coalescePaths("$.request_id", "$.requestId")} AS job_request_id`,
    `${coalescePaths("$.session_id", "$.sessionId")} AS job_session_id`,
    `${coalescePaths("$.workspace", "$.cwd")} AS job_workspace`,
    `NULLIF(TRIM(GET_JSON_STRING(${castLa}, '$.timeout_seconds')), '') AS job_timeout_seconds`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.last_run_at_ms",
      "$.state.lastRunAtMs",
      "$.state.last_run_time",
      "$.state.run_at_ms",
      "$.state.runAtMs",
      "$.last_run_at_ms",
      "$.lastRunAtMs",
      "$.last_run_time",
    ])} AS job_last_run_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.last_run_status",
      "$.state.lastRunStatus",
      "$.state.status",
      "$.state.run_status",
      "$.last_run_status",
      "$.lastRunStatus",
    ])} AS job_last_run_status_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.last_duration_ms",
      "$.state.lastDurationMs",
      "$.state.duration_ms",
      "$.state.durationMs",
      "$.last_duration_ms",
      "$.lastDurationMs",
    ])} AS job_last_duration_ms_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.last_delivery_status",
      "$.state.lastDeliveryStatus",
      "$.state.delivery_status",
      "$.state.deliveryStatus",
      "$.last_delivery_status",
      "$.lastDeliveryStatus",
      "$.delivery_status",
      "$.deliveryStatus",
    ])} AS job_last_delivery_status_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.last_error",
      "$.state.lastError",
      "$.state.error",
      "$.state.error_message",
      "$.last_error",
      "$.lastError",
      "$.error",
      "$.error_message",
    ])} AS job_last_error_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.next_run_at_ms",
      "$.state.nextRunAtMs",
      "$.state.next_run_time",
      "$.next_run_at_ms",
      "$.nextRunAtMs",
      "$.next_run_time",
    ])} AS job_next_run_at_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.consecutive_errors",
      "$.state.consecutiveErrors",
      "$.consecutive_errors",
      "$.consecutiveErrors",
    ])} AS job_consecutive_errors_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.state.last_run_tokens_total",
      "$.state.lastRunTokensTotal",
      "$.state.last_total_tokens",
      "$.last_run_tokens_total",
      "$.lastRunTokensTotal",
      "$.last_total_tokens",
    ])} AS job_last_tokens_snapshot_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.display_name", "$.displayName", "$.title"])} AS job_display_name_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.agent_id", "$.agentId"])} AS job_agent_id_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.session_key", "$.sessionKey"])} AS job_session_key_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.session_target", "$.sessionTarget"])} AS job_session_target_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.wake_mode", "$.wakeMode"])} AS job_wake_mode_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.delivery_mode", "$.deliveryMode"])} AS job_delivery_mode_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.payload.kind",
      "$.payload.type",
      "$.payload.payloadKind",
      "$.payload_kind",
      "$.payloadKind",
    ])} AS job_payload_kind_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.payload.model",
      "$.payload.modelName",
      "$.payload_model",
      "$.payloadModel",
      "$.default_model",
      "$.defaultModel",
    ])} AS job_payload_model_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.payload.message",
      "$.payload.body",
      "$.payload.text",
      "$.payload.prompt",
      "$.payload_message",
      "$.payloadMessage",
      "$.message",
      "$.prompt",
    ])} AS job_payload_message_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.schedule_tz", "$.timezone", "$.tz"])} AS job_schedule_tz_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.total_lines", "$.totalLines", "$.run_count", "$.runCount"])} AS job_summary_total_lines_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.ok_count", "$.okCount", "$.success_count", "$.successCount"])} AS job_summary_ok_count_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.fail_count", "$.failCount", "$.failure_count", "$.failureCount"])} AS job_summary_fail_count_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.avg_duration_ms", "$.avgDurationMs"])} AS job_summary_avg_duration_ms_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.max_duration_ms", "$.maxDurationMs"])} AS job_summary_max_duration_ms_raw`,
    `${coalesceGetJsonStringPaths(castLa, [
      "$.total_tokens_sum",
      "$.totalTokensSum",
      "$.sum_tokens",
      "$.sumTokens",
    ])} AS job_summary_total_tokens_raw`,
    `${coalesceGetJsonStringPaths(castLa, ["$.last_success_at_ms", "$.lastSuccessAtMs", "$.last_success_time"])} AS job_summary_last_success_raw`,
  ].join(",\n  ");

  return { sql, hasLogAttributes: true, column: laName };
}

/**
 * `deliveryStatus`：优先 `cron_runs.log_attributes`，否则 `cron_jobs.log_attributes`。
 * 路径：`$.delivery_status` / `$.deliveryStatus`，并兼容 `$.dispatch_status` / `$.dispatchStatus`。
 * @param {{ hasLogAttributes: boolean, column: string | null }} jobsLaSel
 * @param {string | null} runsLogAttributesColumn
 */
function buildDeliveryStatusSelectFragment(jobsLaSel, runsLogAttributesColumn) {
  const exprFromCast = (cast) =>
    `COALESCE(
    NULLIF(TRIM(GET_JSON_STRING(${cast}, '$.delivery_status')), ''),
    NULLIF(TRIM(GET_JSON_STRING(${cast}, '$.deliveryStatus')), ''),
    NULLIF(TRIM(GET_JSON_STRING(${cast}, '$.dispatch_status')), ''),
    NULLIF(TRIM(GET_JSON_STRING(${cast}, '$.dispatchStatus')), '')
  )`;

  const castRun =
    runsLogAttributesColumn != null
      ? `CAST(r.\`${sanitizeIdent(runsLogAttributesColumn, "log_attributes")}\` AS STRING)`
      : null;
  const castJob =
    jobsLaSel.hasLogAttributes && jobsLaSel.column
      ? `CAST(j.\`${sanitizeIdent(jobsLaSel.column, "log_attributes")}\` AS STRING)`
      : null;

  if (castRun && castJob) {
    return `COALESCE(${exprFromCast(castRun)}, ${exprFromCast(castJob)})`;
  }
  if (castRun) return exprFromCast(castRun);
  if (castJob) return exprFromCast(castJob);
  return "NULL";
}

/**
 * `cron_runs.log_attributes` → Token / 模型 / 耗时 / 产出摘要 / 运行日志展示字段（别名供行映射复用）。
 * @param {string | null} runsLogAttributesColumn
 * @returns {{ castRun: string | null, selectParts: string[] }}
 */
function buildRunsLogAttributesTokenSelectSql(runsLogAttributesColumn) {
  if (!runsLogAttributesColumn) {
    return {
      castRun: null,
      selectParts: [
        "NULL AS run_usage_in_raw",
        "NULL AS run_usage_out_raw",
        "NULL AS run_usage_total_raw",
        "NULL AS run_log_model_raw",
        "NULL AS run_log_provider_raw",
        "NULL AS run_duration_ms_raw",
        "NULL AS run_log_session_id_raw",
        "NULL AS run_log_next_run_raw",
        "NULL AS run_log_error_raw",
        "NULL AS run_log_summary_raw",
      ],
    };
  }
  const id = sanitizeIdent(runsLogAttributesColumn, "log_attributes");
  const castRun = `CAST(r.\`${id}\` AS STRING)`;
  const coalescePaths = (paths) =>
    `COALESCE(${paths.map((p) => `NULLIF(TRIM(GET_JSON_STRING(${castRun}, '${p}')), '')`).join(", ")})`;
  const durationPaths = [
    "$.durationMs",
    "$.duration_ms",
    "$.execution_duration_ms",
    "$.elapsed_ms",
    "$.latency_ms",
    "$.run_duration_ms",
  ];
  const inputPaths = [
    "$.usage.input_tokens",
    "$.usage.prompt_tokens",
    "$.input_tokens",
    "$.prompt_tokens",
  ];
  const outputPaths = [
    "$.usage.output_tokens",
    "$.usage.completion_tokens",
    "$.output_tokens",
    "$.completion_tokens",
  ];
  const totalPaths = ["$.usage.total_tokens", "$.total_tokens", "$.usage.totalTokens", "$.totalTokens"];
  const modelPaths = ["$.model", "$.payload.model"];
  const providerPaths = ["$.provider"];
  const sessionPaths = ["$.session_id", "$.sessionId", "$.run.session_id", "$.run.sessionId"];
  const nextRunPaths = [
    "$.nextRunAtMs",
    "$.next_run_at_ms",
    "$.next_run_ms",
    "$.scheduler.next_run_at_ms",
    "$.scheduler.nextRunAtMs",
  ];
  const errorPaths = [
    "$.error",
    "$.error_message",
    "$.errorMessage",
    "$.failure_reason",
    "$.err_msg",
    "$.exception",
  ];
  const summaryPaths = ["$.summary", "$.output_summary", "$.result_summary", "$.run_summary"];
  const selectParts = [
    `${coalescePaths(inputPaths)} AS run_usage_in_raw`,
    `${coalescePaths(outputPaths)} AS run_usage_out_raw`,
    `${coalescePaths(totalPaths)} AS run_usage_total_raw`,
    `${coalescePaths(modelPaths)} AS run_log_model_raw`,
    `${coalescePaths(providerPaths)} AS run_log_provider_raw`,
    `${coalescePaths(durationPaths)} AS run_duration_ms_raw`,
    `${coalescePaths(sessionPaths)} AS run_log_session_id_raw`,
    `${coalescePaths(nextRunPaths)} AS run_log_next_run_raw`,
    `${coalescePaths(errorPaths)} AS run_log_error_raw`,
    `${coalescePaths(summaryPaths)} AS run_log_summary_raw`,
  ];
  return { castRun, selectParts };
}

/**
 * 失败原因分布：与 `buildRunsLogAttributesTokenSelectSql` 中 error 路径一致，
 * 优先物理错误列，再回落 `cron_runs.log_attributes` 内 JSON。
 * 返回合并后的标量表达式（不含 SUBSTRING），便于外层包一层再 GROUP BY。
 * @param {{ runsError?: string | null, runsLogAttributesColumn?: string | null }} C
 * @returns {string | null}
 */
function buildFailureReasonMergedExprForAgg(C) {
  /** @type {string[]} */
  const coalesceParts = [];
  if (C.runsError && String(C.runsError).trim()) {
    const errCol = sanitizeIdent(C.runsError, "error_message");
    coalesceParts.push(`NULLIF(TRIM(CAST(r.\`${errCol}\` AS STRING)), '')`);
  }
  if (C.runsLogAttributesColumn) {
    const id = sanitizeIdent(C.runsLogAttributesColumn, "log_attributes");
    const castRun = `CAST(r.\`${id}\` AS STRING)`;
    const errorPaths = [
      "$.error",
      "$.error_message",
      "$.errorMessage",
      "$.failure_reason",
      "$.err_msg",
      "$.exception",
    ];
    coalesceParts.push(
      `COALESCE(${errorPaths.map((p) => `NULLIF(TRIM(GET_JSON_STRING(${castRun}, '${p}')), '')`).join(", ")})`,
    );
  }
  if (!coalesceParts.length) return null;
  return coalesceParts.length === 1 ? coalesceParts[0] : `COALESCE(${coalesceParts.join(", ")})`;
}

/**
 * Doris 聚合：单行 log_attributes 上「有效总 Token」表达式（无列时为 NULL）。
 * @param {string | null} runsLogAttributesColumn
 */
function buildRunsLogAttributesEffectiveTotalSql(runsLogAttributesColumn) {
  if (!runsLogAttributesColumn) return "CAST(NULL AS DOUBLE)";
  const id = sanitizeIdent(runsLogAttributesColumn, "log_attributes");
  const c = `CAST(r.\`${id}\` AS STRING)`;
  const g = (p) => `NULLIF(TRIM(GET_JSON_STRING(${c}, '${p}')), '')`;
  const totalCoalesce = `COALESCE(${["$.usage.total_tokens", "$.total_tokens", "$.usage.totalTokens", "$.totalTokens"].map((p) => g(p)).join(", ")})`;
  const inCoalesce = `COALESCE(${["$.usage.input_tokens", "$.usage.prompt_tokens", "$.input_tokens", "$.prompt_tokens"].map((p) => g(p)).join(", ")})`;
  const outCoalesce = `COALESCE(${["$.usage.output_tokens", "$.usage.completion_tokens", "$.output_tokens", "$.completion_tokens"].map((p) => g(p)).join(", ")})`;
  return `(
  CASE
    WHEN NULLIF(TRIM(${totalCoalesce}), '') IS NOT NULL
      THEN CAST(NULLIF(TRIM(${totalCoalesce}), '') AS DOUBLE)
    WHEN NULLIF(TRIM(${inCoalesce}), '') IS NOT NULL OR NULLIF(TRIM(${outCoalesce}), '') IS NOT NULL
      THEN CAST(COALESCE(NULLIF(TRIM(${inCoalesce}), ''), '0') AS DOUBLE)
         + CAST(COALESCE(NULLIF(TRIM(${outCoalesce}), ''), '0') AS DOUBLE)
    ELSE NULL
  END
)`;
}

/**
 * Doris 聚合：单行 log_attributes 上「有效输入 Token」表达式（无列时为 NULL）。
 * @param {string | null} runsLogAttributesColumn
 */
function buildRunsLogAttributesEffectiveInputSql(runsLogAttributesColumn) {
  if (!runsLogAttributesColumn) return "CAST(NULL AS DOUBLE)";
  const id = sanitizeIdent(runsLogAttributesColumn, "log_attributes");
  const c = `CAST(r.\`${id}\` AS STRING)`;
  const g = (p) => `NULLIF(TRIM(GET_JSON_STRING(${c}, '${p}')), '')`;
  const inCoalesce = `COALESCE(${["$.usage.input_tokens", "$.usage.prompt_tokens", "$.input_tokens", "$.prompt_tokens"].map((p) => g(p)).join(", ")})`;
  return `(
  CASE
    WHEN NULLIF(TRIM(${inCoalesce}), '') IS NOT NULL
      THEN CAST(NULLIF(TRIM(${inCoalesce}), '') AS DOUBLE)
    ELSE NULL
  END
)`;
}

/**
 * Doris 聚合：单行 log_attributes 上「有效输出 Token」表达式（无列时为 NULL）。
 * @param {string | null} runsLogAttributesColumn
 */
function buildRunsLogAttributesEffectiveOutputSql(runsLogAttributesColumn) {
  if (!runsLogAttributesColumn) return "CAST(NULL AS DOUBLE)";
  const id = sanitizeIdent(runsLogAttributesColumn, "log_attributes");
  const c = `CAST(r.\`${id}\` AS STRING)`;
  const g = (p) => `NULLIF(TRIM(GET_JSON_STRING(${c}, '${p}')), '')`;
  const outCoalesce = `COALESCE(${["$.usage.output_tokens", "$.usage.completion_tokens", "$.output_tokens", "$.completion_tokens"].map((p) => g(p)).join(", ")})`;
  return `(
  CASE
    WHEN NULLIF(TRIM(${outCoalesce}), '') IS NOT NULL
      THEN CAST(NULLIF(TRIM(${outCoalesce}), '') AS DOUBLE)
    ELSE NULL
  END
)`;
}

/**
 * 任务列表聚合：单行 `cron_runs` 有效耗时（毫秒）。与 `mapCronRunPageRowToJsonlEvent` 一致：**log_attributes 内 duration* 优先**，否则墙钟 `finished_at - started_at`。
 * @param {{ runsFinished: string, runsStarted: string }} C
 * @param {string | null} runsLogAttributesColumn
 * @returns {string}
 */
function buildRunEffectiveDurationMsExprForAgg(C, runsLogAttributesColumn) {
  const wall = buildRunsWallDurationMsExpr(C);
  if (!runsLogAttributesColumn) return wall;
  const id = sanitizeIdent(runsLogAttributesColumn, "log_attributes");
  const castRun = `CAST(r.\`${id}\` AS STRING)`;
  const durationPaths = [
    "$.durationMs",
    "$.duration_ms",
    "$.execution_duration_ms",
    "$.elapsed_ms",
    "$.latency_ms",
    "$.run_duration_ms",
  ];
  const logStr = `COALESCE(${durationPaths.map((p) => `NULLIF(TRIM(GET_JSON_STRING(${castRun}, '${p}')), '')`).join(", ")})`;
  const logNum = `(CASE WHEN NULLIF(TRIM(${logStr}), '') IS NOT NULL AND CAST(NULLIF(TRIM(${logStr}), '') AS DOUBLE) >= 0 THEN CAST(NULLIF(TRIM(${logStr}), '') AS DOUBLE) ELSE NULL END)`;
  return `COALESCE(${logNum}, ${wall})`;
}

/** @param {unknown} v */
function parsePositiveNumberOrNull(v) {
  if (v == null) return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** @param {unknown} v log_attributes 中的下次运行：Unix 毫秒数字串、秒级时间戳或 ISO 时间 */
function parseNextRunAtMsFromLogRaw(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1e11) return Math.floor(n);
    if (n >= 1e9) return Math.floor(n * 1000);
    return null;
  }
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : null;
}

/** @param {...unknown} parts */
function firstNonEmptyTrimmedString(...parts) {
  for (const p of parts) {
    if (p == null) continue;
    const s = String(p).trim();
    if (s) return s;
  }
  return null;
}

/**
 * 由 SELECT 别名或 mock 行构造 `usage`（与 jsonl / jobTokenMetrics 一致）。
 * @param {{ run_usage_in_raw?: unknown, run_usage_out_raw?: unknown, run_usage_total_raw?: unknown }} row
 * @returns {{ input_tokens: number, output_tokens: number, total_tokens: number } | null}
 */
export function buildUsageFromRunLogRawRow(row) {
  const total = parsePositiveNumberOrNull(row?.run_usage_total_raw ?? row?.RUN_USAGE_TOTAL_RAW);
  const inn = parsePositiveNumberOrNull(row?.run_usage_in_raw ?? row?.RUN_USAGE_IN_RAW);
  const out = parsePositiveNumberOrNull(row?.run_usage_out_raw ?? row?.RUN_USAGE_OUT_RAW);
  if (total == null && inn == null && out == null) return null;
  if (inn != null && out != null) {
    return { input_tokens: inn, output_tokens: out, total_tokens: total ?? inn + out };
  }
  if (total != null && inn != null && out == null) {
    return { input_tokens: inn, output_tokens: Math.max(0, total - inn), total_tokens: total };
  }
  if (total != null && out != null && inn == null) {
    return { input_tokens: Math.max(0, total - out), output_tokens: out, total_tokens: total };
  }
  if (total != null) return { input_tokens: total, output_tokens: 0, total_tokens: total };
  if (inn != null && out == null) return { input_tokens: inn, output_tokens: 0, total_tokens: inn };
  if (out != null && inn == null) return { input_tokens: 0, output_tokens: out, total_tokens: out };
  return null;
}

const CRON_EXPR_CANDIDATES = [
  "schedule",
  "cron_expression",
  "cron",
  "cron_expr",
  "cronspec",
  "cron_spec",
  "spec",
  "expression",
  "time_expression",
  "trigger",
];

/**
 * Cron 表达式在 SELECT 中的片段（别名统一为 cron_expression，供前端不变）
 * @param {import("mysql2/promise").Connection} conn
 * @returns {Promise<{ sql: string, source: string }>}
 */
async function resolveCronExpressionSelectSql(conn) {
  const explicit = process.env.CRON_JOBS_COL_CRON;
  if (explicit != null && String(explicit).trim()) {
    const raw = String(explicit).trim();
    if (["__omit__", "__none__", "-"].includes(raw.toLowerCase())) {
      return { sql: "NULL AS cron_expression", source: "__omit__" };
    }
    const col = sanitizeIdent(raw, "schedule");
    return { sql: `j.\`${col}\` AS cron_expression`, source: col };
  }

  if (cachedCronJobsExpressionColumn !== undefined) {
    if (cachedCronJobsExpressionColumn === null) {
      return { sql: "NULL AS cron_expression", source: "none" };
    }
    return { sql: `j.\`${cachedCronJobsExpressionColumn}\` AS cron_expression`, source: cachedCronJobsExpressionColumn };
  }

  try {
    const fieldSet = await getCronJobsColumnSet(conn);
    for (const c of CRON_EXPR_CANDIDATES) {
      if (fieldSet.has(c)) {
        cachedCronJobsExpressionColumn = c;
        return { sql: `j.\`${c}\` AS cron_expression`, source: c };
      }
    }
    cachedCronJobsExpressionColumn = null;
    return { sql: "NULL AS cron_expression", source: "none" };
  } catch {
    cachedCronJobsExpressionColumn = null;
    return { sql: "NULL AS cron_expression", source: "probe_failed" };
  }
}

/** @param {unknown} v */
function normScalar(v) {
  if (v == null) return null;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    const s = v.toString("utf8").trim();
    return s === "" ? null : s;
  }
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return v;
}

/**
 * @param {string | null | undefined} startedAt
 * @param {string | null | undefined} finishedAt
 */
function durationMs(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  const a = Date.parse(String(startedAt));
  const b = Date.parse(String(finishedAt));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = b - a;
  return d >= 0 ? d : null;
}

/**
 * @param {{
 *   page?: number,
 *   pageSize?: number,
 *   jobId?: string | null,
 *   startIso?: string | null,
 *   endIso?: string | null,
 *   agentId?: string | null,
 *   status?: string | null,
 *   q?: string | null,
 *   jobName?: string | null,
 * }} opts
 */
export async function queryCronRunsPage(opts = {}) {
  const page = Number.isFinite(Number(opts.page)) ? Math.max(1, Math.floor(Number(opts.page))) : 1;
  const pageSizeRaw = Number.isFinite(Number(opts.pageSize)) ? Math.floor(Number(opts.pageSize)) : 20;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
  const offset = (page - 1) * pageSize;

  const jobId = opts.jobId != null && String(opts.jobId).trim() ? String(opts.jobId).trim() : null;
  const startIso = opts.startIso != null && String(opts.startIso).trim() ? String(opts.startIso).trim() : null;
  const endIso = opts.endIso != null && String(opts.endIso).trim() ? String(opts.endIso).trim() : null;
  const agentIdFilter = opts.agentId != null && String(opts.agentId).trim() ? String(opts.agentId).trim() : null;
  const statusFilter = opts.status != null && String(opts.status).trim() ? String(opts.status).trim().toLowerCase() : "";
  const qRaw = opts.q != null && String(opts.q).trim() ? String(opts.q).trim().slice(0, 200) : "";
  const jobNameRaw = opts.jobName != null && String(opts.jobName).trim() ? String(opts.jobName).trim().slice(0, 200) : "";

  const T = tableRefs();

  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  try {
    const C = await resolveRunsColumnRefs(conn);
    const cronSel = await resolveCronExpressionSelectSql(conn);
    const jobsLaSel = await resolveJobsLogAttributesSelectSql(conn);
    const deliveryStatusSql = buildDeliveryStatusSelectFragment(jobsLaSel, C.runsLogAttributesColumn ?? null);
    const tokenSel = buildRunsLogAttributesTokenSelectSql(C.runsLogAttributesColumn ?? null);
    const jobsCols = await getCronJobsColumnSet(conn);

    const whereParts = ["1=1"];
    const params = [];

    if (jobId) {
      whereParts.push(`r.\`${C.runsJobFk}\` = ?`);
      params.push(jobId);
    }
    appendCronRunsTimeRangeFilters(whereParts, params, C, startIso, endIso);

    if (agentIdFilter) {
      const agentColRaw = pickJobsAgentIdColumn(jobsCols);
      const agentCol = agentColRaw ? sanitizeIdent(agentColRaw, "agent_id") : null;
      const laCol = jobsLaSel.column;
      const jsonAgent = laCol
        ? coalesceGetJsonStringPaths(`CAST(j.\`${laCol}\` AS STRING)`, ["$.agent_id", "$.agentId"])
        : `CAST(NULL AS STRING)`;
      if (agentCol) {
        whereParts.push(
          `LOWER(TRIM(COALESCE(NULLIF(TRIM(CAST(j.\`${agentCol}\` AS STRING)), ''), NULLIF(TRIM(${jsonAgent}), '')))) = LOWER(?)`,
        );
        params.push(agentIdFilter);
      } else if (jobsLaSel.hasLogAttributes) {
        whereParts.push(`LOWER(TRIM(NULLIF(TRIM(${jsonAgent}), ''))) = LOWER(?)`);
        params.push(agentIdFilter);
      }
    }

    const stLower = runsStatusLowerExpr(C);
    if (stLower) {
      if (statusFilter === "success") {
        whereParts.push(`(${stLower}) IN ${SUCCESS_STATUSES_SQL}`);
      } else if (statusFilter === "failure") {
        whereParts.push(`(${stLower}) IN ${FAIL_STATUSES_SQL}`);
      }
    }

    if (qRaw) {
      const like = `%${qRaw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      const errClause =
        C.runsError && String(C.runsError).trim()
          ? ` OR LOWER(CAST(r.\`${C.runsError}\` AS STRING)) LIKE LOWER(?)`
          : "";
      whereParts.push(
        `(
  CAST(r.\`${C.runsId}\` AS STRING) LIKE ?
  OR LOWER(CAST(r.\`${C.runsJobFk}\` AS STRING)) LIKE LOWER(?)
  OR LOWER(CAST(j.\`${C.jobsName}\` AS STRING)) LIKE LOWER(?)
  ${errClause}
)`,
      );
      params.push(like, like, like);
      if (C.runsError && String(C.runsError).trim()) params.push(like);
    }

    if (jobNameRaw) {
      const like = `%${jobNameRaw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      whereParts.push(`LOWER(CAST(j.\`${C.jobsName}\` AS STRING)) LIKE LOWER(?)`);
      params.push(like);
    }

    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    const countSql = `SELECT COUNT(*) AS c FROM ${T.runs} r LEFT JOIN ${T.jobs} j ON j.\`${C.jobsId}\` = r.\`${C.runsJobFk}\` ${whereSql}`;
    const [[countRow]] = await conn.query(countSql, params);
    const total = Number(normScalar(countRow?.c)) || 0;

    const agentIdColPick = pickJobsAgentIdColumn(jobsCols);
    const agentIdSelect = agentIdColPick
      ? `NULLIF(TRIM(CAST(j.\`${sanitizeIdent(agentIdColPick, "agent_id")}\` AS STRING)), '') AS job_agent_id_col`
      : `CAST(NULL AS STRING) AS job_agent_id_col`;

    const listSql = `
SELECT
  r.\`${C.runsId}\` AS run_id,
  r.\`${C.runsJobFk}\` AS job_id,
  j.\`${C.jobsName}\` AS job_name,
  ${agentIdSelect},
  ${cronSel.sql},
  ${jobsLaSel.sql},
  ${deliveryStatusSql} AS delivery_status,
  ${C.statusSql},
  ${runsStartedSelectSqlAsStartedAt(C)},
  ${runsFinishedSelectSqlAsFinishedAt(C)},
  ${C.errorSql},
  ${tokenSel.selectParts.join(",\n  ")}
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${C.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
ORDER BY r.\`${C.runsOrder}\` DESC, r.\`${C.runsId}\` DESC
LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}
`;

    const [rawRows] = await conn.query(listSql, params);

    const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => {
      const startedAt = normScalar(row.started_at);
      const finishedAt = normScalar(row.finished_at);
      const wallDur = durationMs(
        startedAt != null ? String(startedAt) : null,
        finishedAt != null ? String(finishedAt) : null,
      );
      const logDur = parsePositiveNumberOrNull(row.run_duration_ms_raw ?? row.RUN_DURATION_MS_RAW);
      const durationMsOut = logDur != null ? logDur : wallDur;
      return {
        runId: normScalar(row.run_id),
        jobId: normScalar(row.job_id),
        jobName: normScalar(row.job_name),
        cronExpression: normScalar(row.cron_expression),
        jobSource: normScalar(row.job_source),
        jobTraceId: normScalar(row.job_trace_id),
        jobRequestId: normScalar(row.job_request_id),
        jobSessionId: normScalar(row.job_session_id),
        jobWorkspace: normScalar(row.job_workspace),
        jobTimeoutSeconds: normScalar(row.job_timeout_seconds),
        deliveryStatus: normScalar(row.delivery_status ?? row.DELIVERY_STATUS),
        status: normScalar(row.status),
        startedAt,
        finishedAt,
        errorMessage: normScalar(row.error_message),
        durationMs: durationMsOut,
        run_usage_in_raw: row.run_usage_in_raw,
        run_usage_out_raw: row.run_usage_out_raw,
        run_usage_total_raw: row.run_usage_total_raw,
        run_log_model_raw: row.run_log_model_raw,
        run_log_provider_raw: row.run_log_provider_raw,
        run_duration_ms_raw: row.run_duration_ms_raw,
        run_log_session_id_raw: row.run_log_session_id_raw,
        run_log_next_run_raw: row.run_log_next_run_raw,
        run_log_error_raw: row.run_log_error_raw,
        run_log_summary_raw: row.run_log_summary_raw,
        job_agent_id_col: normScalar(row.job_agent_id_col ?? row.JOB_AGENT_ID_COL),
        job_agent_id_raw: row.job_agent_id_raw ?? row.JOB_AGENT_ID_RAW,
        agentId:
          firstNonEmptyTrimmedString(row.job_agent_id_col ?? row.JOB_AGENT_ID_COL, row.job_agent_id_raw ?? row.JOB_AGENT_ID_RAW) ??
          null,
      };
    });

    return {
      total,
      page,
      pageSize,
      rows,
      meta: {
        database: getCronDatabaseName(),
        jobsTable: sanitizeIdent(process.env.DORIS_CRON_JOBS_TABLE, "cron_jobs"),
        runsTable: sanitizeIdent(process.env.DORIS_CRON_RUNS_TABLE, "cron_runs"),
        cronExpressionSource: cronSel.source,
        runsColumnProbe: C._fieldProbe,
        runsStartedColumn: C.runsStarted,
        runsFinishedColumn: C.runsFinished,
        cronJobsLogAttributes: jobsLaSel.hasLogAttributes,
        cronJobsLogAttributesColumn: jobsLaSel.column,
        cronRunsLogAttributes: C.runsLogAttributesColumn != null,
        cronRunsLogAttributesColumn: C.runsLogAttributesColumn ?? null,
        runsStartedTemporal: C.runsStartedTemporal,
        runsFinishedInTable: C.runsFinishedInTable,
      },
    };
  } finally {
    await conn.end();
  }
}

/**
 * 定时任务「运行概览」：`cron_runs` 在时间窗内聚合（成功/失败口径与 `queryCronRunsPage` 一致）。
 * 最近 24 小时失败任务数：按「开始时间列」落在 `NOW()-24h` 之后且状态为失败统计 **distinct job_id**（`ts` 为毫秒时与 `UNIX_TIMESTAMP*1000` 对齐，见 docs/datamodel/cron_runs.md）。
 * 慢任务：有效耗时（与列表行一致）> 10 分钟的 **distinct job_id**。
 *
 * @param {{ startIso?: string | null, endIso?: string | null }} opts
 */
export async function queryCronRunsOverviewMetrics(opts = {}) {
  const startIso = opts.startIso != null && String(opts.startIso).trim() ? String(opts.startIso).trim() : null;
  const endIso = opts.endIso != null && String(opts.endIso).trim() ? String(opts.endIso).trim() : null;

  const T = tableRefs();
  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  try {
    const C = await resolveRunsColumnRefs(conn);
    const effDurSql = buildRunEffectiveDurationMsExprForAgg(C, C.runsLogAttributesColumn ?? null);
    const stLower = runsStatusLowerExpr(C);

    const whereParts = ["1=1"];
    const params = [];
    appendCronRunsTimeRangeFilters(whereParts, params, C, startIso, endIso);
    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    const okSumExpr = stLower
      ? `SUM(CASE WHEN ${stLower} IN ${SUCCESS_STATUSES_SQL} THEN 1 ELSE 0 END)`
      : `CAST(0 AS BIGINT)`;
    const failSumExpr = stLower
      ? `SUM(CASE WHEN ${stLower} IN ${FAIL_STATUSES_SQL} THEN 1 ELSE 0 END)`
      : `CAST(0 AS BIGINT)`;
    const distFailJob = stLower
      ? `COUNT(DISTINCT CASE WHEN ${stLower} IN ${FAIL_STATUSES_SQL} THEN r.\`${C.runsJobFk}\` END)`
      : `CAST(0 AS BIGINT)`;
    const last24 = runsStartedInLast24hPredicateSql(C);
    const distFailJob24 = stLower
      ? `COUNT(DISTINCT CASE WHEN ${stLower} IN ${FAIL_STATUSES_SQL} AND ${last24} THEN r.\`${C.runsJobFk}\` END)`
      : `CAST(0 AS BIGINT)`;
    const slowJobsExpr = `COUNT(DISTINCT CASE WHEN (${effDurSql}) > 600000 THEN r.\`${C.runsJobFk}\` END)`;

    const sql = `
SELECT
  COUNT(*) AS runs_total,
  ${okSumExpr} AS runs_success,
  ${failSumExpr} AS runs_failure,
  ${distFailJob} AS jobs_with_failure_in_range,
  ${distFailJob24} AS jobs_with_failure_last_24h,
  ${slowJobsExpr} AS slow_jobs_in_range
FROM ${T.runs} r
${whereSql}
`;

    const [[row]] = await conn.query(sql, params);
    return {
      version: 0,
      range: { startIso, endIso },
      runs: {
        total: Number(normScalar(row?.runs_total)) || 0,
        success: Number(normScalar(row?.runs_success)) || 0,
        failure: Number(normScalar(row?.runs_failure)) || 0,
      },
      alerts: {
        jobsWithFailureInRange: Number(normScalar(row?.jobs_with_failure_in_range)) || 0,
        jobsWithFailureLast24h: Number(normScalar(row?.jobs_with_failure_last_24h)) || 0,
        slowJobsInRange: Number(normScalar(row?.slow_jobs_in_range)) || 0,
      },
      meta: {
        slowThresholdMs: 600000,
      },
    };
  } finally {
    await conn.end();
  }
}

/**
 * 运行概览饼图：互斥分类（优先级：禁用 > 连续失败 ≥2 > 未配置通道 > 时间窗内有失败或末次失败 > 慢执行≥30s > 正常）。
 * @param {{
 *   enabled: boolean,
 *   consecutiveErrors: number | null,
 *   deliveryMode: string | null,
 *   failCount: number,
 *   maxDurMs: number | null,
 *   lastStatusFail: boolean,
 * }} p
 */
export function classifyRunOverviewPieBucket(p) {
  if (!p.enabled) return "disabled";
  if (p.consecutiveErrors != null && p.consecutiveErrors >= 2) return "consecutiveFail";
  const dm = p.deliveryMode != null && String(p.deliveryMode).trim();
  if (!dm) return "noChannel";
  if (p.failCount > 0 || p.lastStatusFail) return "execFail";
  if (p.maxDurMs != null && p.maxDurMs >= 30000) return "slowExec";
  return "normal";
}

/** @param {unknown} st */
export function runOverviewStatusIsFailure(st) {
  const s = String(st ?? "").trim().toLowerCase();
  return s === "error" || s === "failed" || s === "failure";
}

/**
 * 与运行概览接口侧一致： trim、折叠空白、超长截断；空串映射为 **`__EMPTY__`**（前端展示「无错误信息」）。
 * @param {unknown} raw
 */
export function normalizeFailureReasonKeyForOverview(raw) {
  let key = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!key) return "__EMPTY__";
  if (key.length > 240) key = `${key.slice(0, 237)}…`;
  return key;
}

/**
 * 定时任务「运行概览」图表：按日成功/失败、平均耗时；慢任务/Token Top10；任务 TOP10 分析（执行次数/失败次数/最大耗时/平均耗时）；任务状态分布饼图（时间窗内执行记录的成功/失败次数）；失败原因分布饼图（均受 startIso/endIso 约束）。
 *
 * @param {{ startIso?: string | null, endIso?: string | null, jobId?: string | null }} opts
 */
export async function queryCronRunsRunOverviewCharts(opts = {}) {
  const startIso = opts.startIso != null && String(opts.startIso).trim() ? String(opts.startIso).trim() : null;
  const endIso = opts.endIso != null && String(opts.endIso).trim() ? String(opts.endIso).trim() : null;
  const jobId = opts.jobId != null && String(opts.jobId).trim() ? String(opts.jobId).trim() : null;

  const T = tableRefs();
  const J = jobColumnRefs();
  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  try {
    /** 便于定位 Doris 500：错误信息带步骤标签 */
    const runOverviewSql = async (label, sql, p) => {
      try {
        return await conn.query(sql, p);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`[cron-runs-run-overview:${label}] ${msg}`);
      }
    };

    const C = await resolveRunsColumnRefs(conn);
    const effDurSql = buildRunEffectiveDurationMsExprForAgg(C, C.runsLogAttributesColumn ?? null);
    const tokenEffSql = buildRunsLogAttributesEffectiveTotalSql(C.runsLogAttributesColumn ?? null);
    const tokenInEffSql = buildRunsLogAttributesEffectiveInputSql(C.runsLogAttributesColumn ?? null);
    const tokenOutEffSql = buildRunsLogAttributesEffectiveOutputSql(C.runsLogAttributesColumn ?? null);
    const stLower = runsStatusLowerExpr(C);

    const jobsCols = await getCronJobsColumnSet(conn);
    const jobAgentIdCol = pickJobsAgentIdColumn(jobsCols);
    const jobAgentNameCol = pickJobsAgentNameColumn(jobsCols);
    const jobsLaName = pickJobsLogAttributesColumn(jobsCols);
    const hasJobsLa = jobsLaName != null;
    /** `cron_jobs` 侧 Agent 标识：物理列优先，回退 log_attributes（与 queryCronRunsOverviewMetrics 一致） */
    const jobAgentExpr = (() => {
      /** @type {string[]} */
      const parts = [];
      if (jobAgentIdCol) {
        parts.push(`NULLIF(TRIM(CAST(j.\`${sanitizeIdent(jobAgentIdCol, "agent_id")}\` AS STRING)), '')`);
      }
      if (hasJobsLa) {
        const castLa = `CAST(j.\`${jobsLaName}\` AS STRING)`;
        parts.push(coalesceGetJsonStringPaths(castLa, ["$.agent_id", "$.agentId"]));
      }
      return parts.length ? `COALESCE(${parts.join(", ")})` : "CAST(NULL AS STRING)";
    })();
    const jobAgentNameExpr = (() => {
      /** @type {string[]} */
      const parts = [];
      if (jobAgentNameCol) {
        parts.push(`NULLIF(TRIM(CAST(j.\`${sanitizeIdent(jobAgentNameCol, "agent_name")}\` AS STRING)), '')`);
      }
      if (hasJobsLa) {
        const castLa = `CAST(j.\`${jobsLaName}\` AS STRING)`;
        parts.push(coalesceGetJsonStringPaths(castLa, ["$.agentName", "$.agentDisplayName", "$.displayName", "$.agentLabel"]));
      }
      return parts.length ? `COALESCE(${parts.join(", ")})` : "CAST(NULL AS STRING)";
    })();

    const whereParts = ["1=1"];
    const params = [];
    appendCronRunsTimeRangeFilters(whereParts, params, C, startIso, endIso);
    if (jobId) {
      whereParts.push(`r.\`${C.runsJobFk}\` = ?`);
      params.push(jobId);
    }
    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    const okSum = stLower
      ? `SUM(CASE WHEN ${stLower} IN ${SUCCESS_STATUSES_SQL} THEN 1 ELSE 0 END)`
      : `CAST(0 AS BIGINT)`;
    const failSum = stLower
      ? `SUM(CASE WHEN ${stLower} IN ${FAIL_STATUSES_SQL} THEN 1 ELSE 0 END)`
      : `CAST(0 AS BIGINT)`;
    const avgDur = `AVG(CASE WHEN (${effDurSql}) IS NOT NULL THEN (${effDurSql}) END)`;
    const dayExpr = runsStartedDayBucketExpr(C);

    // 避免 Doris Nereids 对「GROUP BY 1 / ORDER BY 1」在复杂首列表达式上出现 expr=null（arity NPE）
    const trendSql = `
SELECT
  ${dayExpr} AS bucket_day,
  COUNT(*) AS total_count,
  ${okSum} AS success_count,
  ${failSum} AS failure_count,
  ${avgDur} AS avg_duration_ms,
  SUM(COALESCE((${tokenInEffSql}), 0)) AS input_tokens,
  SUM(COALESCE((${tokenOutEffSql}), 0)) AS output_tokens
FROM ${T.runs} r
${whereSql}
GROUP BY ${dayExpr}
ORDER BY ${dayExpr} ASC
`;

    const [trendRaw] = await runOverviewSql("trend", trendSql, [...params]);
    /** 按日 × 任务聚合 Token（输入+输出），供「Token 趋势」按定时任务堆叠 */
    const tokenTrendByJobSql = `
SELECT
  ${dayExpr} AS bucket_day,
  r.\`${C.runsJobFk}\` AS job_id,
  MAX(j.\`${J.jobsName}\`) AS job_name,
  SUM(COALESCE((${tokenInEffSql}), 0) + COALESCE((${tokenOutEffSql}), 0)) AS total_tokens
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
GROUP BY ${dayExpr}, r.\`${C.runsJobFk}\`
ORDER BY bucket_day ASC
`;
    const [tokenTrendByJobRaw] = await runOverviewSql("tokenTrendByJob", tokenTrendByJobSql, [...params]);
    const tokenTrendByJob = (Array.isArray(tokenTrendByJobRaw) ? tokenTrendByJobRaw : []).map((row) => ({
      day:
        normScalar(row.bucket_day ?? row.BUCKET_DAY) != null
          ? String(normScalar(row.bucket_day ?? row.BUCKET_DAY))
          : "",
      jobId: normScalar(row.job_id ?? row.JOB_ID) != null ? String(normScalar(row.job_id ?? row.JOB_ID)) : "",
      jobName: normScalar(row.job_name ?? row.JOB_NAME) != null ? String(normScalar(row.job_name ?? row.JOB_NAME)) : "",
      totalTokens:
        (row.total_tokens ?? row.TOTAL_TOKENS) != null && Number.isFinite(Number(row.total_tokens ?? row.TOTAL_TOKENS))
          ? Math.floor(Number(row.total_tokens ?? row.TOTAL_TOKENS))
          : 0,
    }));

    const trend = (Array.isArray(trendRaw) ? trendRaw : []).map((row) => ({
      day:
        normScalar(row.bucket_day ?? row.BUCKET_DAY) != null
          ? String(normScalar(row.bucket_day ?? row.BUCKET_DAY))
          : "",
      totalCount: Number(normScalar(row.total_count ?? row.TOTAL_COUNT)) || 0,
      successCount: Number(normScalar(row.success_count ?? row.SUCCESS_COUNT)) || 0,
      failureCount: Number(normScalar(row.failure_count ?? row.FAILURE_COUNT)) || 0,
      avgDurationMs:
        (row.avg_duration_ms ?? row.AVG_DURATION_MS) != null &&
        Number.isFinite(Number(row.avg_duration_ms ?? row.AVG_DURATION_MS))
          ? Math.round(Number(row.avg_duration_ms ?? row.AVG_DURATION_MS))
          : null,
      inputTokens:
        (row.input_tokens ?? row.INPUT_TOKENS) != null &&
        Number.isFinite(Number(row.input_tokens ?? row.INPUT_TOKENS))
          ? Math.floor(Number(row.input_tokens ?? row.INPUT_TOKENS))
          : 0,
      outputTokens:
        (row.output_tokens ?? row.OUTPUT_TOKENS) != null &&
        Number.isFinite(Number(row.output_tokens ?? row.OUTPUT_TOKENS))
          ? Math.floor(Number(row.output_tokens ?? row.OUTPUT_TOKENS))
          : 0,
    }));

    /** 任务状态分布：`distribution` 为时间窗内各 run 的成功/失败笔数（与 SUCCESS_STATUSES_SQL / FAIL_STATUSES_SQL 一致；其余状态不计入二者）。 */
    let distribution = { success: 0, failure: 0 };
    if (stLower) {
      const runOutcomeDistSql = `
SELECT
  ${okSum} AS success_count,
  ${failSum} AS failure_count
FROM ${T.runs} r
${whereSql}
`;
      try {
        const [rodRaw] = await runOverviewSql("runOutcomeDist", runOutcomeDistSql, [...params]);
        const rod = Array.isArray(rodRaw) ? rodRaw[0] : null;
        if (rod) {
          distribution = {
            success: Number(normScalar(rod.success_count ?? rod.SUCCESS_COUNT)) || 0,
            failure: Number(normScalar(rod.failure_count ?? rod.FAILURE_COUNT)) || 0,
          };
        }
      } catch {
        distribution = { success: 0, failure: 0 };
      }
    }

    const startedDtExpr = runsStartedDatetimeExpr(C, "r");
    const slowStatusSql =
      C.runsStatus && String(C.runsStatus).trim()
        ? `r.\`${sanitizeIdent(C.runsStatus, "status")}\` AS run_status`
        : `CAST(NULL AS STRING) AS run_status`;
    const slowSql = `
WITH ranked AS (
  SELECT
    r.\`${C.runsJobFk}\` AS job_id,
    j.\`${J.jobsName}\` AS job_name,
    ${jobAgentExpr} AS job_agent_id,
    ${jobAgentNameExpr} AS job_agent_name,
    (${effDurSql}) AS eff_ms,
    ${startedDtExpr} AS started_at,
    ${slowStatusSql},
    r.\`${C.runsId}\` AS run_pk
  FROM ${T.runs} r
  LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
  ${whereSql}
),
picked AS (
  SELECT
    job_id,
    job_name,
    job_agent_id,
    job_agent_name,
    eff_ms AS max_duration_ms,
    started_at AS max_duration_run_started_at,
    run_status AS max_duration_run_status,
    ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY eff_ms DESC, started_at DESC, run_pk DESC) AS rn
  FROM ranked
  WHERE eff_ms IS NOT NULL
)
SELECT
  job_id,
  job_name,
  job_agent_id,
  job_agent_name,
  max_duration_ms,
  max_duration_run_started_at,
  max_duration_run_status
FROM picked
WHERE rn = 1
ORDER BY max_duration_ms DESC
LIMIT 10
`;
    const [slowRaw] = await runOverviewSql("slowTop10", slowSql, [...params]);
    const slowTop10 = (Array.isArray(slowRaw) ? slowRaw : []).map((row) => {
      const startedRaw = row.max_duration_run_started_at ?? row.MAX_DURATION_RUN_STARTED_AT;
      const startedNorm = normScalar(startedRaw);
      const stRaw = row.max_duration_run_status ?? row.MAX_DURATION_RUN_STATUS;
      const stNorm = normScalar(stRaw);
      return {
        jobId: normScalar(row.job_id) != null ? String(normScalar(row.job_id)) : "",
        jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
        jobAgentId:
          normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
            ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
            : null,
        jobAgentName: (() => {
          const v = normScalar(row.job_agent_name ?? row.JOB_AGENT_NAME);
          if (v == null) return null;
          const s = String(v).trim();
          return s || null;
        })(),
        maxDurationMs:
          row.max_duration_ms != null && Number.isFinite(Number(row.max_duration_ms))
            ? Math.floor(Number(row.max_duration_ms))
            : null,
        maxDurationRunStartedAt: startedNorm != null ? String(startedNorm) : null,
        maxDurationRunStatus: stNorm != null ? String(stNorm) : null,
      };
    });

    const runCountTopSql = `
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  MAX(j.\`${J.jobsName}\`) AS job_name,
  MAX(${jobAgentExpr}) AS job_agent_id,
  MAX(${jobAgentNameExpr}) AS job_agent_name,
  COUNT(*) AS run_count
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
GROUP BY r.\`${C.runsJobFk}\`
ORDER BY run_count DESC
LIMIT 10
`;
    const [runCountRaw] = await runOverviewSql("jobTop10RunCount", runCountTopSql, [...params]);
    const jobTop10ByRunCount = (Array.isArray(runCountRaw) ? runCountRaw : []).map((row) => ({
      jobId: normScalar(row.job_id) != null ? String(normScalar(row.job_id)) : "",
      jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
      jobAgentId:
        normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
          ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
          : null,
      jobAgentName: (() => {
        const v = normScalar(row.job_agent_name ?? row.JOB_AGENT_NAME);
        if (v == null) return null;
        const s = String(v).trim();
        return s || null;
      })(),
      runCount: Number(normScalar(row.run_count ?? row.RUN_COUNT)) || 0,
    }));

    const failCountTopSql = `
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  MAX(j.\`${J.jobsName}\`) AS job_name,
  MAX(${jobAgentExpr}) AS job_agent_id,
  MAX(${jobAgentNameExpr}) AS job_agent_name,
  ${failSum} AS failure_count,
  COUNT(*) AS run_count
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
GROUP BY r.\`${C.runsJobFk}\`
ORDER BY failure_count DESC
LIMIT 10
`;
    const [failCountRaw] = await runOverviewSql("jobTop10FailCount", failCountTopSql, [...params]);
    const jobTop10ByFailCount = (Array.isArray(failCountRaw) ? failCountRaw : []).map((row) => ({
      jobId: normScalar(row.job_id) != null ? String(normScalar(row.job_id)) : "",
      jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
      jobAgentId:
        normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
          ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
          : null,
      jobAgentName: (() => {
        const v = normScalar(row.job_agent_name ?? row.JOB_AGENT_NAME);
        if (v == null) return null;
        const s = String(v).trim();
        return s || null;
      })(),
      failureCount: Number(normScalar(row.failure_count ?? row.FAILURE_COUNT)) || 0,
      runCount: Number(normScalar(row.run_count ?? row.RUN_COUNT)) || 0,
    }));

    const avgDurTopSql = `
SELECT job_id, job_name, job_agent_id, job_agent_name, avg_duration_ms FROM (
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  MAX(j.\`${J.jobsName}\`) AS job_name,
  MAX(${jobAgentExpr}) AS job_agent_id,
  MAX(${jobAgentNameExpr}) AS job_agent_name,
  AVG(CASE WHEN (${effDurSql}) IS NOT NULL THEN (${effDurSql}) END) AS avg_duration_ms
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
GROUP BY r.\`${C.runsJobFk}\`
) t
WHERE t.avg_duration_ms IS NOT NULL
ORDER BY t.avg_duration_ms DESC
LIMIT 10
`;
    const [avgDurRaw] = await runOverviewSql("jobTop10AvgDur", avgDurTopSql, [...params]);
    const jobTop10ByAvgDurationMs = (Array.isArray(avgDurRaw) ? avgDurRaw : []).map((row) => ({
      jobId: normScalar(row.job_id) != null ? String(normScalar(row.job_id)) : "",
      jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
      jobAgentId:
        normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
          ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
          : null,
      jobAgentName: (() => {
        const v = normScalar(row.job_agent_name ?? row.JOB_AGENT_NAME);
        if (v == null) return null;
        const s = String(v).trim();
        return s || null;
      })(),
      avgDurationMs:
        row.avg_duration_ms != null && Number.isFinite(Number(row.avg_duration_ms))
          ? Math.round(Number(row.avg_duration_ms))
          : null,
    }));

    const successRateTopSql = `
SELECT * FROM (
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  MAX(j.\`${J.jobsName}\`) AS job_name,
  MAX(${jobAgentExpr}) AS job_agent_id,
  MAX(${jobAgentNameExpr}) AS job_agent_name,
  COUNT(*) AS run_count,
  ${okSum} AS success_count,
  ${failSum} AS failure_count
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
GROUP BY r.\`${C.runsJobFk}\`
) t
WHERE t.run_count >= 5
ORDER BY CAST(t.success_count AS DOUBLE) / CAST(t.run_count AS DOUBLE) DESC, t.run_count DESC
LIMIT 10
`;
    const [successRateRaw] = await runOverviewSql("jobTop10SuccessRate", successRateTopSql, [...params]);
    const jobTop10BySuccessRate = (Array.isArray(successRateRaw) ? successRateRaw : []).map((row) => {
      const runCnt = Number(normScalar(row.run_count ?? row.RUN_COUNT)) || 0;
      const succ = Number(normScalar(row.success_count ?? row.SUCCESS_COUNT)) || 0;
      const fail = Number(normScalar(row.failure_count ?? row.FAILURE_COUNT)) || 0;
      const successRatePct =
        runCnt > 0 && Number.isFinite(succ / runCnt) ? Math.round((succ / runCnt) * 1000) / 10 : null;
      return {
        jobId: normScalar(row.job_id) != null ? String(normScalar(row.job_id)) : "",
        jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
        jobAgentId:
          normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
            ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
            : null,
        jobAgentName: (() => {
          const v = normScalar(row.job_agent_name ?? row.JOB_AGENT_NAME);
          if (v == null) return null;
          const s = String(v).trim();
          return s || null;
        })(),
        runCount: runCnt,
        successCount: succ,
        failureCount: fail,
        successRatePct,
      };
    });

    const tokenLastStartedExpr = runsStartedDatetimeExpr(C, "r");
    /** 单段聚合：避免 WITH+嵌套 ROW_NUMBER 在部分 Doris Nereids 上 expr=null NPE */
    const tokenSql = `
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  MAX(j.\`${J.jobsName}\`) AS job_name,
  MAX(${jobAgentExpr}) AS job_agent_id,
  MAX(${jobAgentNameExpr}) AS job_agent_name,
  SUM(COALESCE((${tokenEffSql}), 0)) AS total_tokens,
  MAX(${tokenLastStartedExpr}) AS last_run_started_at
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
GROUP BY r.\`${C.runsJobFk}\`
HAVING SUM(COALESCE((${tokenEffSql}), 0)) > 0
ORDER BY total_tokens DESC
LIMIT 10
`;
    const [tokenRaw] = await runOverviewSql("tokenTop10", tokenSql, [...params]);
    const tokenTop10Rows = Array.isArray(tokenRaw) ? tokenRaw : [];
    const tokenJobIds = tokenTop10Rows
      .map((row) => normScalar(row.job_id ?? row.JOB_ID))
      .filter((id) => id != null)
      .map((id) => String(id));

    /** 与 lastWinSql 同形的「每任务最新一条」状态，仅对 Token Top10 的 job_id 拉取 */
    /** @type {Map<string, string | null>} */
    const tokenLastStatusByJob = new Map();
    if (tokenJobIds.length && C.runsStatus && String(C.runsStatus).trim()) {
      const stCol = sanitizeIdent(C.runsStatus, "status");
      const placeholders = tokenJobIds.map(() => "?").join(", ");
      const lastStSql = `
SELECT * FROM (
  SELECT
    r.\`${C.runsJobFk}\` AS job_id,
    r.\`${stCol}\` AS last_run_status,
    ROW_NUMBER() OVER (
      PARTITION BY r.\`${C.runsJobFk}\`
      ORDER BY r.\`${sanitizeIdent(C.runsOrder, C.runsId)}\` DESC, r.\`${C.runsId}\` DESC
    ) AS rn
  FROM ${T.runs} r
  ${whereSql}
  AND r.\`${C.runsJobFk}\` IN (${placeholders})
) t
WHERE t.rn = 1
`;
      try {
        const [lastStRaw] = await runOverviewSql("tokenTop10LastStatus", lastStSql, [...params, ...tokenJobIds]);
        for (const row of Array.isArray(lastStRaw) ? lastStRaw : []) {
          const jid = normScalar(row.job_id ?? row.JOB_ID);
          const st = normScalar(row.last_run_status ?? row.LAST_RUN_STATUS);
          if (jid != null) tokenLastStatusByJob.set(String(jid), st != null ? String(st) : null);
        }
      } catch {
        /* 状态列为可选展示，失败时不阻塞整页图表 */
      }
    }

    const tokenTop10 = tokenTop10Rows.map((row) => {
      const lastRaw = row.last_run_started_at ?? row.LAST_RUN_STARTED_AT;
      const lastNorm = normScalar(lastRaw);
      const jid = normScalar(row.job_id ?? row.JOB_ID) != null ? String(normScalar(row.job_id ?? row.JOB_ID)) : "";
      const stFromMap = jid ? tokenLastStatusByJob.get(jid) : undefined;
      const stNorm = stFromMap !== undefined ? stFromMap : null;
      return {
        jobId: jid,
        jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
        jobAgentId:
          normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
            ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
            : null,
        jobAgentName: (() => {
          const v = normScalar(row.job_agent_name ?? row.JOB_AGENT_NAME);
          if (v == null) return null;
          const s = String(v).trim();
          return s || null;
        })(),
        totalTokens:
          row.total_tokens != null && Number.isFinite(Number(row.total_tokens))
            ? Math.floor(Number(row.total_tokens))
            : 0,
        lastRunStartedAt: lastNorm != null ? String(lastNorm) : null,
        lastRunStatus: stNorm != null && String(stNorm).trim() ? String(stNorm) : null,
      };
    });

    /** 按任务 Token 合计（饼图）：前 8 个任务 + 其余合并为 `__other__` */
    const TOKEN_PIE_TOP_N = 8;
    const tokenPieSql = `
SELECT job_id, job_name, total_tokens FROM (
  SELECT
    r.\`${C.runsJobFk}\` AS job_id,
    MAX(j.\`${J.jobsName}\`) AS job_name,
    MAX(${jobAgentExpr}) AS job_agent_id,
    SUM(COALESCE((${tokenEffSql}), 0)) AS total_tokens
  FROM ${T.runs} r
  LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
  ${whereSql}
  GROUP BY r.\`${C.runsJobFk}\`
) t
WHERE total_tokens > 0
ORDER BY total_tokens DESC
`;
    const [tokenPieRaw] = await runOverviewSql("tokenPie", tokenPieSql, [...params]);
    const allTokenByJob = (Array.isArray(tokenPieRaw) ? tokenPieRaw : [])
      .map((row) => ({
        jobId: normScalar(row.job_id) != null ? String(normScalar(row.job_id)) : "",
        jobName: normScalar(row.job_name) != null ? String(normScalar(row.job_name)) : "",
        jobAgentId:
          normScalar(row.job_agent_id ?? row.JOB_AGENT_ID) != null
            ? String(normScalar(row.job_agent_id ?? row.JOB_AGENT_ID))
            : null,
        totalTokens:
          row.total_tokens != null && Number.isFinite(Number(row.total_tokens))
            ? Math.floor(Number(row.total_tokens))
            : 0,
      }))
      .filter((r) => r.jobId && r.totalTokens > 0);
    const tokenDistributionByJob = (() => {
      if (!allTokenByJob.length) return [];
      const sorted = [...allTokenByJob].sort((a, b) => b.totalTokens - a.totalTokens);
      const top = sorted.slice(0, TOKEN_PIE_TOP_N);
      const otherSum = sorted.slice(TOKEN_PIE_TOP_N).reduce((s, r) => s + r.totalTokens, 0);
      if (otherSum > 0) {
        return [...top, { jobId: "__other__", jobName: "", totalTokens: otherSum }];
      }
      return top;
    })();

    /** @type {{ reasonKey: string, count: number }[]} */
    let failureReasonDistribution = [];
    const failureMerged = buildFailureReasonMergedExprForAgg(C);
    if (stLower && failureMerged) {
      try {
        /** 内层先算 raw_key，外层 GROUP BY 别名列，避免 Nereids 对「SELECT/GROUP BY 重复复杂表达式」报错 */
        const failReasonSql = `
SELECT raw_key, COUNT(*) AS cnt
FROM (
  SELECT SUBSTRING(TRIM(COALESCE((${failureMerged}), '')), 1, 240) AS raw_key
  FROM ${T.runs} r
  ${whereSql}
  AND (${stLower}) IN ${FAIL_STATUSES_SQL}
) fr
GROUP BY raw_key
ORDER BY cnt DESC
LIMIT 64
`;
        const [failReasonRaw] = await runOverviewSql("failureReasonDist", failReasonSql, [...params]);
        /** @type {Map<string, number>} */
        const mergeMap = new Map();
        for (const row of Array.isArray(failReasonRaw) ? failReasonRaw : []) {
          const rk = normScalar(row.raw_key ?? row.RAW_KEY);
          const cnt = Number(normScalar(row.cnt ?? row.CNT)) || 0;
          const nk = normalizeFailureReasonKeyForOverview(rk != null ? String(rk) : "");
          mergeMap.set(nk, (mergeMap.get(nk) ?? 0) + cnt);
        }
        failureReasonDistribution = [...mergeMap.entries()]
          .map(([reasonKey, count]) => ({ reasonKey, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);
      } catch (frErr) {
        const msg = frErr instanceof Error ? frErr.message : String(frErr);
        console.error("[cron-runs-run-overview] failure reason distribution failed:", msg);
        failureReasonDistribution = [];
      }
    }

    /** @type {{ jobId: string, jobName: string, reasons: string[] }[]} */
    let anomalyTasks = [];

    try {
    const jobsCols = await getCronJobsColumnSet(conn);
    const orderCol = pickJobsUpdatedOrderColumn(jobsCols) ?? J.jobsId;
    const enabledCol = pickJobsEnabledColumn(jobsCols);
    const cronSel = await resolveCronExpressionSelectSql(conn);
    const jobsLaSel = await resolveJobsLogAttributesSelectSql(conn);
    const enabledSelect = enabledCol
      ? `j.\`${sanitizeIdent(enabledCol, "enabled")}\` AS enabled_raw`
      : `NULL AS enabled_raw`;
    const jobsListSql = `
SELECT
  j.\`${J.jobsId}\` AS id,
  j.\`${J.jobsName}\` AS name,
  ${enabledSelect},
  ${cronSel.sql},
  ${jobsLaSel.sql}
FROM ${T.jobs} j
ORDER BY j.\`${sanitizeIdent(orderCol, J.jobsId)}\` DESC
`;
    const [jobRows] = await runOverviewSql("jobsList", jobsListSql, []);

    const aggWinSql = `
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  COUNT(*) AS run_cnt,
  ${okSum} AS ok_count,
  ${failSum} AS fail_count,
  MAX((${effDurSql})) AS max_duration_ms
FROM ${T.runs} r
${whereSql}
GROUP BY r.\`${C.runsJobFk}\`
`;
    const [aggWinRaw] = await runOverviewSql("aggWinByJob", aggWinSql, [...params]);
    /** @type {Map<string, object>} */
    const aggWinByJob = new Map();
    for (const row of Array.isArray(aggWinRaw) ? aggWinRaw : []) {
      const jid = normScalar(row.job_id);
      if (jid != null) aggWinByJob.set(String(jid), row);
    }

    const lastWinSql = `
SELECT * FROM (
  SELECT
    r.\`${C.runsJobFk}\` AS job_id,
    ${C.statusSql},
    ROW_NUMBER() OVER (
      PARTITION BY r.\`${C.runsJobFk}\`
      ORDER BY r.\`${C.runsOrder}\` DESC, r.\`${C.runsId}\` DESC
    ) AS rn
  FROM ${T.runs} r
  ${whereSql}
) t
WHERE t.rn = 1
`;
    const [lastWinRaw] = await runOverviewSql("lastRunByJob", lastWinSql, [...params]);
    /** @type {Map<string, object>} */
    const lastWinByJob = new Map();
    for (const row of Array.isArray(lastWinRaw) ? lastWinRaw : []) {
      const jid = normScalar(row.job_id);
      if (jid != null) lastWinByJob.set(String(jid), row);
    }

    for (const row of Array.isArray(jobRows) ? jobRows : []) {
      const id = normScalar(row.id);
      const jid = id != null ? String(id) : "";
      if (!jid) continue;

      const nameCol = normScalar(row.name);
      const nameFromLog = firstNonEmptyTrimmedString(row.job_display_name_raw, row.JOB_DISPLAY_NAME_RAW);
      const jobName =
        nameCol != null && String(nameCol).trim()
          ? String(nameCol)
          : nameFromLog != null
            ? nameFromLog
            : jid;

      const rawEn = row.enabled_raw;
      let enabled = true;
      if (rawEn != null) {
        const s = String(rawEn).trim().toLowerCase();
        if (s === "0" || s === "false" || s === "n" || s === "no" || s === "disabled") enabled = false;
        else if (s === "1" || s === "true" || s === "y" || s === "yes" || s === "enabled") enabled = true;
        else if (Number.isFinite(Number(rawEn))) enabled = Number(rawEn) !== 0;
      }

      const deliveryMode = firstNonEmptyTrimmedString(row.job_delivery_mode_raw, row.JOB_DELIVERY_MODE_RAW);
      const consecFromJob = parsePositiveNumberOrNull(
        row.job_consecutive_errors_snapshot_raw ?? row.JOB_CONSECUTIVE_ERRORS_SNAPSHOT_RAW,
      );
      const consecutiveErrors = consecFromJob ?? null;

      const aggW = aggWinByJob.get(jid);
      const failCount = aggW ? Number(normScalar(aggW.fail_count)) || 0 : 0;
      let maxDurMs = null;
      if (aggW?.max_duration_ms != null && Number.isFinite(Number(aggW.max_duration_ms))) {
        maxDurMs = Math.floor(Number(aggW.max_duration_ms));
      }

      const lastWr = lastWinByJob.get(jid);
      const lastSt = lastWr ? normScalar(lastWr.status ?? lastWr.STATUS) : null;
      const lastStatusFail = runOverviewStatusIsFailure(lastSt);

      const reasons = [];
      if (consecutiveErrors != null && consecutiveErrors >= 2) reasons.push("consecutive_fail");
      if (lastStatusFail) reasons.push("recent_fail");
      if (!deliveryMode || !String(deliveryMode).trim()) reasons.push("no_channel");
      if (maxDurMs != null && maxDurMs > 600000) reasons.push("slow_over_10m");
      if (reasons.length) {
        anomalyTasks.push({ jobId: jid, jobName, reasons });
      }
    }

    anomalyTasks.sort((a, b) => {
      const ra = a.reasons.includes("consecutive_fail") ? 1 : 0;
      const rb = b.reasons.includes("consecutive_fail") ? 1 : 0;
      if (rb !== ra) return rb - ra;
      return String(a.jobName).localeCompare(String(b.jobName), "zh");
    });
    } catch (distErr) {
      const msg = distErr instanceof Error ? distErr.message : String(distErr);
      console.error("[cron-runs-run-overview] distribution / anomaly block failed:", msg);
      anomalyTasks = [];
    }

    return {
      version: 0,
      range: { startIso, endIso },
      trend,
      tokenTrendByJob,
      slowTop10,
      tokenTop10,
      tokenDistributionByJob,
      failureReasonDistribution,
      distribution,
      anomalyTasks,
      jobTop10Analysis: {
        byRunCount: jobTop10ByRunCount,
        byFailCount: jobTop10ByFailCount,
        byMaxDurationMs: slowTop10,
        byAvgDurationMs: jobTop10ByAvgDurationMs,
        bySuccessRate: jobTop10BySuccessRate,
        byTokenTotal: tokenTop10,
      },
    };
  } finally {
    await conn.end();
  }
}

/** 任务详情抽屉：单次拉取 run 行上限（与原先 jsonl limit=500 对齐） */
export const MAX_CRON_TASK_DETAIL_EVENTS = 500;

/**
 * Doris 任务 id 路由用：非 UUID 专用，禁止路径注入。
 * @param {string | null | undefined} jobId
 * @returns {string}
 */
export function assertSafeCronJobIdParam(jobId) {
  const s = String(jobId ?? "").trim();
  if (!s || s.length > 128) throw new Error("invalid jobId");
  if (/[\\/]/.test(s) || s.includes("..")) throw new Error("invalid jobId");
  return s;
}

/** @param {string | null | undefined} iso */
function isoToMs(iso) {
  if (iso == null) return null;
  const n = Date.parse(String(iso));
  return Number.isFinite(n) ? n : null;
}

/**
 * 将 `queryCronRunsPage` 单行对象映射为与 `job-run-events-jsonl` 尽量同形的 event。
 * @param {{
 *   jobId: unknown,
 *   status: unknown,
 *   startedAt: unknown,
 *   finishedAt: unknown,
 *   durationMs: unknown,
 *   deliveryStatus: unknown,
 *   errorMessage: unknown,
 *   jobSessionId: unknown,
 *   usage?: unknown,
 *   model?: unknown,
 *   provider?: unknown,
 *   run_usage_in_raw?: unknown,
 *   run_usage_out_raw?: unknown,
 *   run_usage_total_raw?: unknown,
 *   run_log_model_raw?: unknown,
 *   run_log_provider_raw?: unknown,
 *   run_duration_ms_raw?: unknown,
 *   run_log_session_id_raw?: unknown,
 *   run_log_next_run_raw?: unknown,
 *   run_log_error_raw?: unknown,
 *   run_log_summary_raw?: unknown,
 *   job_agent_id_col?: unknown,
 *   job_agent_id_raw?: unknown,
 *   JOB_AGENT_ID_COL?: unknown,
 *   JOB_AGENT_ID_RAW?: unknown,
 * }} runRow
 */
export function mapCronRunPageRowToJsonlEvent(runRow) {
  const startedMs = isoToMs(runRow.startedAt != null ? String(runRow.startedAt) : null);
  const finishedMs = isoToMs(runRow.finishedAt != null ? String(runRow.finishedAt) : null);
  const ts = finishedMs ?? startedMs ?? Date.now();
  const runAtMs = startedMs ?? finishedMs ?? ts;
  const wallDur =
    runRow.durationMs != null && Number.isFinite(Number(runRow.durationMs)) && Number(runRow.durationMs) >= 0
      ? Math.floor(Number(runRow.durationMs))
      : null;
  const logDur = parsePositiveNumberOrNull(runRow.run_duration_ms_raw ?? runRow.RUN_DURATION_MS_RAW);
  const durationMs = logDur != null ? logDur : wallDur;
  const del = runRow.deliveryStatus != null && String(runRow.deliveryStatus).trim()
    ? String(runRow.deliveryStatus).trim()
    : "unknown";
  let usage = null;
  if (runRow.usage != null && typeof runRow.usage === "object") {
    const u = /** @type {Record<string, unknown>} */ (runRow.usage);
    const built = buildUsageFromRunLogRawRow({
      run_usage_in_raw: u.input_tokens ?? u.prompt_tokens,
      run_usage_out_raw: u.output_tokens ?? u.completion_tokens,
      run_usage_total_raw: u.total_tokens ?? u.totalTokens,
    });
    usage = built;
  } else {
    usage = buildUsageFromRunLogRawRow(runRow);
  }
  const modelRaw =
    runRow.model != null
      ? runRow.model
      : runRow.run_log_model_raw != null
        ? runRow.run_log_model_raw
        : runRow.RUN_LOG_MODEL_RAW;
  const providerRaw =
    runRow.provider != null
      ? runRow.provider
      : runRow.run_log_provider_raw != null
        ? runRow.run_log_provider_raw
        : runRow.RUN_LOG_PROVIDER_RAW;
  const model = modelRaw != null && String(modelRaw).trim() ? String(modelRaw).trim() : null;
  const provider = providerRaw != null && String(providerRaw).trim() ? String(providerRaw).trim() : null;

  const sessionFromRunLog = firstNonEmptyTrimmedString(
    runRow.run_log_session_id_raw,
    runRow.RUN_LOG_SESSION_ID_RAW,
  );
  const sessionId =
    sessionFromRunLog ??
    (runRow.jobSessionId != null && String(runRow.jobSessionId).trim()
      ? String(runRow.jobSessionId).trim()
      : null);

  const nextRunAtMs = parseNextRunAtMsFromLogRaw(
    runRow.run_log_next_run_raw ?? runRow.RUN_LOG_NEXT_RUN_RAW,
  );

  const errFromRunLog = firstNonEmptyTrimmedString(runRow.run_log_error_raw, runRow.RUN_LOG_ERROR_RAW);
  const errFromCol = runRow.errorMessage != null ? String(runRow.errorMessage).trim() : "";
  const error = errFromRunLog ?? errFromCol ?? "";

  const summary = firstNonEmptyTrimmedString(runRow.run_log_summary_raw, runRow.RUN_LOG_SUMMARY_RAW);

  const agentIdColVal = normScalar(runRow.job_agent_id_col ?? runRow.JOB_AGENT_ID_COL);
  const agentIdLog = firstNonEmptyTrimmedString(runRow.job_agent_id_raw, runRow.JOB_AGENT_ID_RAW);
  const agentIdFromJob =
    agentIdColVal != null && String(agentIdColVal).trim() ? String(agentIdColVal).trim() : agentIdLog;

  return {
    ts,
    jobId: runRow.jobId != null ? String(runRow.jobId) : null,
    action: "finished",
    status: runRow.status != null ? String(runRow.status) : null,
    error,
    deliveryStatus: del,
    runAtMs,
    durationMs,
    nextRunAtMs,
    summary: summary ?? null,
    sessionId,
    sessionKey: null,
    agentId: agentIdFromJob ?? null,
    model,
    provider,
    usage,
  };
}

/**
 * @param {import("mysql2/promise").Connection} conn
 * @param {Awaited<ReturnType<typeof resolveRunsColumnRefs>>} C
 */
function runsStatusLowerExpr(C) {
  const raw = String(C.statusSql ?? "").trim();
  const m = /^(.+)\s+AS\s+status$/i.exec(raw);
  if (!m) return null;
  const inner = m[1].trim();
  if (/^NULL$/i.test(inner)) return null;
  return `LOWER(TRIM(COALESCE(CAST(${inner} AS STRING), '')))`;
}

const SUCCESS_STATUSES_SQL = "('success','succeeded','ok','completed')";
const FAIL_STATUSES_SQL = "('error','failed','failure')";

/**
 * 某任务最近 N 次执行 → jsonl 形 events（时间升序，等价于 tail jsonl）。
 * @param {string} jobId
 * @param {{ limit?: number, startIso?: string | null, endIso?: string | null }} [opts]
 */
export async function queryCronJobRunEvents(jobId, opts = {}) {
  const id = assertSafeCronJobIdParam(jobId);
  const limitRaw = Number(opts.limit ?? MAX_CRON_TASK_DETAIL_EVENTS);
  const limit = Math.min(MAX_CRON_TASK_DETAIL_EVENTS, Math.max(1, Math.floor(limitRaw)));
  const startIso = opts.startIso != null && String(opts.startIso).trim() ? String(opts.startIso).trim() : null;
  const endIso = opts.endIso != null && String(opts.endIso).trim() ? String(opts.endIso).trim() : null;

  const T = tableRefs();
  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  try {
    const C = await resolveRunsColumnRefs(conn);
    const cronSel = await resolveCronExpressionSelectSql(conn);
    const jobsLaSel = await resolveJobsLogAttributesSelectSql(conn);
    const deliveryStatusSql = buildDeliveryStatusSelectFragment(jobsLaSel, C.runsLogAttributesColumn ?? null);
    const tokenSel = buildRunsLogAttributesTokenSelectSql(C.runsLogAttributesColumn ?? null);
    const jobsCols = await getCronJobsColumnSet(conn);
    const agentIdCol = pickJobsAgentIdColumn(jobsCols);
    const agentIdSelect = agentIdCol
      ? `j.\`${sanitizeIdent(agentIdCol, "agent_id")}\` AS job_agent_id_col`
      : `NULL AS job_agent_id_col`;

    const whereParts = ["1=1"];
    const params = [];
    whereParts.push(`r.\`${C.runsJobFk}\` = ?`);
    params.push(id);
    appendCronRunsTimeRangeFilters(whereParts, params, C, startIso, endIso);
    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    const countSql = `SELECT COUNT(*) AS c FROM ${T.runs} r ${whereSql}`;
    const [[countRow]] = await conn.query(countSql, params);
    const total = Number(normScalar(countRow?.c)) || 0;

    const listSql = `
SELECT
  r.\`${C.runsId}\` AS run_id,
  r.\`${C.runsJobFk}\` AS job_id,
  j.\`${C.jobsName}\` AS job_name,
  ${agentIdSelect},
  ${cronSel.sql},
  ${jobsLaSel.sql},
  ${deliveryStatusSql} AS delivery_status,
  ${C.statusSql},
  ${runsStartedSelectSqlAsStartedAt(C)},
  ${runsFinishedSelectSqlAsFinishedAt(C)},
  ${C.errorSql},
  ${tokenSel.selectParts.join(",\n  ")}
FROM ${T.runs} r
LEFT JOIN ${T.jobs} j ON j.\`${C.jobsId}\` = r.\`${C.runsJobFk}\`
${whereSql}
ORDER BY r.\`${C.runsOrder}\` DESC, r.\`${C.runsId}\` DESC
LIMIT ${Number(limit)}
`;

    const [rawRows] = await conn.query(listSql, params);
    const rows = (Array.isArray(rawRows) ? rawRows : []).map((row) => {
      const startedAt = normScalar(row.started_at);
      const finishedAt = normScalar(row.finished_at);
      const wallDur = durationMs(
        startedAt != null ? String(startedAt) : null,
        finishedAt != null ? String(finishedAt) : null,
      );
      const logDur = parsePositiveNumberOrNull(row.run_duration_ms_raw ?? row.RUN_DURATION_MS_RAW);
      const durationMsOut = logDur != null ? logDur : wallDur;
      return {
        runId: normScalar(row.run_id),
        jobId: normScalar(row.job_id),
        jobName: normScalar(row.job_name),
        cronExpression: normScalar(row.cron_expression),
        jobSource: normScalar(row.job_source),
        jobTraceId: normScalar(row.job_trace_id),
        jobRequestId: normScalar(row.job_request_id),
        jobSessionId: normScalar(row.job_session_id),
        jobWorkspace: normScalar(row.job_workspace),
        jobTimeoutSeconds: normScalar(row.job_timeout_seconds),
        deliveryStatus: normScalar(row.delivery_status ?? row.DELIVERY_STATUS),
        status: normScalar(row.status),
        startedAt,
        finishedAt,
        errorMessage: normScalar(row.error_message),
        durationMs: durationMsOut,
        run_usage_in_raw: row.run_usage_in_raw,
        run_usage_out_raw: row.run_usage_out_raw,
        run_usage_total_raw: row.run_usage_total_raw,
        run_log_model_raw: row.run_log_model_raw,
        run_log_provider_raw: row.run_log_provider_raw,
        run_duration_ms_raw: row.run_duration_ms_raw,
        run_log_session_id_raw: row.run_log_session_id_raw,
        run_log_next_run_raw: row.run_log_next_run_raw,
        run_log_error_raw: row.run_log_error_raw,
        run_log_summary_raw: row.run_log_summary_raw,
        job_agent_id_col: normScalar(row.job_agent_id_col ?? row.JOB_AGENT_ID_COL),
        job_agent_id_raw: row.job_agent_id_raw ?? row.JOB_AGENT_ID_RAW,
      };
    });

    const events = rows.map(mapCronRunPageRowToJsonlEvent).reverse();
    return { jobId: id, events, totalLines: total };
  } finally {
    await conn.end();
  }
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsUpdatedOrderColumn(jobsCols) {
  const cands = ["updated_at", "update_time", "gmt_modified", "modified_at", "created_at", "create_time", "id"];
  for (const c of cands) {
    if (jobsCols.has(c)) return c;
  }
  return null;
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsEnabledColumn(jobsCols) {
  for (const c of ["enabled", "is_enabled"]) {
    if (jobsCols.has(c)) return c;
  }
  return null;
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsCreatedAtColumn(jobsCols) {
  for (const c of ["created_at", "create_time", "gmt_create"]) {
    if (jobsCols.has(c)) return c;
  }
  return null;
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsAgentIdColumn(jobsCols) {
  const env = process.env.CRON_JOBS_COL_AGENT_ID;
  if (env != null && String(env).trim()) {
    const c = sanitizeIdent(String(env).trim(), "agent_id");
    return jobsCols.has(c) ? c : null;
  }
  for (const c of ["agent_id", "agentid", "digital_employee_id", "agent_uuid", "employee_id"]) {
    if (jobsCols.has(c)) return c;
  }
  return null;
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsAgentNameColumn(jobsCols) {
  const env = process.env.CRON_JOBS_COL_AGENT_NAME;
  if (env != null && String(env).trim()) {
    const c = sanitizeIdent(String(env).trim(), "agent_name");
    return jobsCols.has(c) ? c : null;
  }
  for (const c of ["agent_name", "digital_employee_name", "agent_display_name", "agent_label"]) {
    if (jobsCols.has(c)) return c;
  }
  return null;
}

/**
 * @param {Set<string>} jobsCols
 * @returns {string | null}
 */
function pickJobsDescriptionColumn(jobsCols) {
  const env = process.env.CRON_JOBS_COL_DESCRIPTION;
  if (env != null && String(env).trim()) {
    const c = sanitizeIdent(String(env).trim(), "description");
    return jobsCols.has(c) ? c : null;
  }
  for (const c of ["description", "remark", "memo", "job_description", "comment"]) {
    if (jobsCols.has(c)) return c;
  }
  return null;
}

/** @param {unknown} v 非负数字（含小数），用于 Token 汇总、均耗时等 */
function parseNonNegativeNumberOrNull(v) {
  if (v == null) return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * 任务详情左侧列表：`cron_jobs` + `cron_runs` 聚合，形状贴近 `GET /api/local-jobs` 的 `jobs[]`。
 */
export async function queryCronJobsForTaskDetailList() {
  const T = tableRefs();
  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  try {
    const J = jobColumnRefs();
    const jobsCols = await getCronJobsColumnSet(conn);
    const orderCol = pickJobsUpdatedOrderColumn(jobsCols) ?? J.jobsId;
    const enabledCol = pickJobsEnabledColumn(jobsCols);
    const createdCol = pickJobsCreatedAtColumn(jobsCols);
    const cronSel = await resolveCronExpressionSelectSql(conn);
    const C = await resolveRunsColumnRefs(conn);
    const jobsLaSel = await resolveJobsLogAttributesSelectSql(conn);
    const deliveryStatusSql = buildDeliveryStatusSelectFragment(jobsLaSel, C.runsLogAttributesColumn ?? null);
    const tokenSel = buildRunsLogAttributesTokenSelectSql(C.runsLogAttributesColumn ?? null);
    const tokenEffSql = buildRunsLogAttributesEffectiveTotalSql(C.runsLogAttributesColumn ?? null);
    const effDurSql = buildRunEffectiveDurationMsExprForAgg(C, C.runsLogAttributesColumn ?? null);

    const enabledSelect = enabledCol
      ? `j.\`${sanitizeIdent(enabledCol, "enabled")}\` AS enabled_raw`
      : `NULL AS enabled_raw`;
    const createdSelect = createdCol
      ? `j.\`${sanitizeIdent(createdCol, "created_at")}\` AS created_raw`
      : `NULL AS created_raw`;
    const updatedSelect =
      orderCol !== J.jobsId
        ? `j.\`${sanitizeIdent(orderCol, "updated_at")}\` AS updated_raw`
        : `NULL AS updated_raw`;

    const agentIdCol = pickJobsAgentIdColumn(jobsCols);
    const agentIdSelect = agentIdCol
      ? `j.\`${sanitizeIdent(agentIdCol, "agent_id")}\` AS job_agent_id_col`
      : `NULL AS job_agent_id_col`;
    const descCol = pickJobsDescriptionColumn(jobsCols);
    const descriptionSelect = descCol
      ? `j.\`${sanitizeIdent(descCol, "description")}\` AS job_description_col`
      : `NULL AS job_description_col`;

    const jobsSql = `
SELECT
  j.\`${J.jobsId}\` AS id,
  j.\`${J.jobsName}\` AS name,
  ${enabledSelect},
  ${createdSelect},
  ${updatedSelect},
  ${agentIdSelect},
  ${descriptionSelect},
  ${cronSel.sql},
  ${jobsLaSel.sql}
FROM ${T.jobs} j
ORDER BY j.\`${sanitizeIdent(orderCol, J.jobsId)}\` DESC
`;

    const [jobRows] = await conn.query(jobsSql);
    const stLower = runsStatusLowerExpr(C);
    const okSum = stLower
      ? `SUM(CASE WHEN ${stLower} IN ${SUCCESS_STATUSES_SQL} THEN 1 ELSE 0 END)`
      : `CAST(0 AS BIGINT)`;
    const failSum = stLower
      ? `SUM(CASE WHEN ${stLower} IN ${FAIL_STATUSES_SQL} THEN 1 ELSE 0 END)`
      : `CAST(0 AS BIGINT)`;
    const lastSuccIso = stLower
      ? C.runsStartedTemporal === "unix_ms"
        ? `MAX(CASE WHEN ${stLower} IN ${SUCCESS_STATUSES_SQL} THEN FROM_UNIXTIME(CAST(r.\`${C.runsStarted}\` AS BIGINT) / 1000) END)`
        : `MAX(CASE WHEN ${stLower} IN ${SUCCESS_STATUSES_SQL} THEN r.\`${C.runsStarted}\` END)`
      : `NULL`;

    const aggSql = `
SELECT
  r.\`${C.runsJobFk}\` AS job_id,
  COUNT(*) AS total_lines,
  ${okSum} AS ok_count,
  ${failSum} AS fail_count,
  AVG(${effDurSql}) AS avg_duration_ms,
  MAX(${effDurSql}) AS max_duration_ms,
  ${lastSuccIso} AS last_success_started_at,
  SUM(${tokenEffSql}) AS sum_token_total
FROM ${T.runs} r
GROUP BY r.\`${C.runsJobFk}\`
`;

    const [aggRows] = await conn.query(aggSql);
    /** @type {Map<string, object>} */
    const aggByJob = new Map();
    for (const row of Array.isArray(aggRows) ? aggRows : []) {
      const jid = normScalar(row.job_id);
      if (jid != null) aggByJob.set(String(jid), row);
    }

    const lastRunSql = `
SELECT * FROM (
  SELECT
    r.\`${C.runsJobFk}\` AS job_id,
    ${C.statusSql},
    ${runsStartedSelectSqlAsStartedAt(C)},
    ${runsFinishedSelectSqlAsFinishedAt(C)},
    ${C.errorSql},
    ${deliveryStatusSql} AS delivery_status,
    ${tokenSel.selectParts.join(",\n    ")},
    ROW_NUMBER() OVER (
      PARTITION BY r.\`${C.runsJobFk}\`
      ORDER BY r.\`${C.runsOrder}\` DESC, r.\`${C.runsId}\` DESC
    ) AS rn
  FROM ${T.runs} r
  LEFT JOIN ${T.jobs} j ON j.\`${J.jobsId}\` = r.\`${C.runsJobFk}\`
) t
WHERE t.rn = 1
`;
    const [lastRunRows] = await conn.query(lastRunSql);
    /** @type {Map<string, object>} */
    const lastByJob = new Map();
    for (const row of Array.isArray(lastRunRows) ? lastRunRows : []) {
      const jid = normScalar(row.job_id);
      if (jid != null) lastByJob.set(String(jid), row);
    }

    const jobs = (Array.isArray(jobRows) ? jobRows : []).map((row) => {
      const id = normScalar(row.id);
      const nameCol = normScalar(row.name);
      const nameFromLog = firstNonEmptyTrimmedString(row.job_display_name_raw, row.JOB_DISPLAY_NAME_RAW);
      const name =
        nameCol != null && String(nameCol).trim()
          ? String(nameCol)
          : nameFromLog != null
            ? nameFromLog
            : id != null
              ? String(id)
              : "";
      const cronExpression = normScalar(row.cron_expression);
      const rawEn = row.enabled_raw;
      let enabled = true;
      if (rawEn != null) {
        const s = String(rawEn).trim().toLowerCase();
        if (s === "0" || s === "false" || s === "n" || s === "no" || s === "disabled") enabled = false;
        else if (s === "1" || s === "true" || s === "y" || s === "yes" || s === "enabled") enabled = true;
        else if (Number.isFinite(Number(rawEn))) enabled = Number(rawEn) !== 0;
      }

      const createdMs = isoToMs(normScalar(row.created_raw));
      const updatedMs = isoToMs(normScalar(row.updated_raw)) ?? createdMs ?? Date.now();
      const createdAtMs = createdMs ?? updatedMs;
      const updatedAtMs = updatedMs;

      const jid = id != null ? String(id) : "";
      const agg = jid ? aggByJob.get(jid) : null;
      const last = jid ? lastByJob.get(jid) : null;

      const totalLinesAgg = agg ? Number(normScalar(agg.total_lines)) || 0 : 0;
      const okCountAgg = agg ? Number(normScalar(agg.ok_count)) || 0 : 0;
      const failCountAgg = agg ? Number(normScalar(agg.fail_count)) || 0 : 0;
      const totalLinesJob = parsePositiveNumberOrNull(
        row.job_summary_total_lines_raw ?? row.JOB_SUMMARY_TOTAL_LINES_RAW,
      );
      const okCountJob = parsePositiveNumberOrNull(row.job_summary_ok_count_raw ?? row.JOB_SUMMARY_OK_COUNT_RAW);
      const failCountJob = parsePositiveNumberOrNull(row.job_summary_fail_count_raw ?? row.JOB_SUMMARY_FAIL_COUNT_RAW);
      const totalLines = totalLinesJob != null ? totalLinesJob : totalLinesAgg;
      const okCount = okCountJob != null ? okCountJob : okCountAgg;
      const failCount = failCountJob != null ? failCountJob : failCountAgg;
      const neutralCount = Math.max(0, totalLines - okCount - failCount);
      const terminal = okCount + failCount;
      const successRatePct = terminal > 0 ? Math.round((okCount / terminal) * 1000) / 10 : null;

      const avgDurationMsAgg =
        agg?.avg_duration_ms != null && Number.isFinite(Number(agg.avg_duration_ms))
          ? Number(agg.avg_duration_ms)
          : null;
      const avgDurationMsJob = parseNonNegativeNumberOrNull(
        row.job_summary_avg_duration_ms_raw ?? row.JOB_SUMMARY_AVG_DURATION_MS_RAW,
      );
      const avgDurationMs = avgDurationMsJob != null ? avgDurationMsJob : avgDurationMsAgg;

      const maxDurationMsAgg =
        agg?.max_duration_ms != null && Number.isFinite(Number(agg.max_duration_ms))
          ? Number(agg.max_duration_ms)
          : null;
      const maxDurationMsJob = parseNonNegativeNumberOrNull(
        row.job_summary_max_duration_ms_raw ?? row.JOB_SUMMARY_MAX_DURATION_MS_RAW,
      );
      const maxDurationMs = maxDurationMsJob != null ? maxDurationMsJob : maxDurationMsAgg;

      const lastSuccessAtMsAgg = isoToMs(normScalar(agg?.last_success_started_at));
      const lastSuccJobRaw = normScalar(row.job_summary_last_success_raw ?? row.JOB_SUMMARY_LAST_SUCCESS_RAW);
      const lastSuccessAtMsFromJob =
        lastSuccJobRaw != null && String(lastSuccJobRaw).trim()
          ? parseNextRunAtMsFromLogRaw(lastSuccJobRaw)
          : null;
      const lastSuccessAtMs = lastSuccessAtMsFromJob ?? lastSuccessAtMsAgg;

      const sumTokAgg =
        agg?.sum_token_total != null && Number.isFinite(Number(agg.sum_token_total))
          ? Number(agg.sum_token_total)
          : null;
      const sumTokJob = parseNonNegativeNumberOrNull(
        row.job_summary_total_tokens_raw ?? row.JOB_SUMMARY_TOTAL_TOKENS_RAW,
      );
      const totalTokensSum = sumTokJob != null ? sumTokJob : sumTokAgg;

      const lastStarted = normScalar(last?.started_at);
      const lastFinished = normScalar(last?.finished_at);
      const lastRunAtMsFromRun = isoToMs(lastStarted != null ? String(lastStarted) : null);
      const jobLastRunRaw = normScalar(row.job_last_run_snapshot_raw ?? row.JOB_LAST_RUN_SNAPSHOT_RAW);
      const lastRunAtMsFromJob =
        jobLastRunRaw != null && String(jobLastRunRaw).trim()
          ? parseNextRunAtMsFromLogRaw(jobLastRunRaw)
          : null;
      const lastRunAtMs = lastRunAtMsFromJob ?? lastRunAtMsFromRun;

      const lastDurationMsWall = durationMs(
        lastStarted != null ? String(lastStarted) : null,
        lastFinished != null ? String(lastFinished) : null,
      );
      const lastLogDur = parsePositiveNumberOrNull(last?.run_duration_ms_raw ?? last?.RUN_DURATION_MS_RAW);
      const lastDurFromJob = parsePositiveNumberOrNull(
        row.job_last_duration_ms_snapshot_raw ?? row.JOB_LAST_DURATION_MS_SNAPSHOT_RAW,
      );
      const lastDurationMs =
        lastDurFromJob != null ? lastDurFromJob : lastLogDur != null ? lastLogDur : lastDurationMsWall;

      const lastUsage = last ? buildUsageFromRunLogRawRow(last) : null;
      const lastTokFromJob = parsePositiveNumberOrNull(
        row.job_last_tokens_snapshot_raw ?? row.JOB_LAST_TOKENS_SNAPSHOT_RAW,
      );
      const lastRunTokensTotal = lastTokFromJob ?? lastUsage?.total_tokens ?? null;

      const lastRunStatusFromJob = firstNonEmptyTrimmedString(
        row.job_last_run_status_snapshot_raw,
        row.JOB_LAST_RUN_STATUS_SNAPSHOT_RAW,
      );
      const lastRunStatus =
        lastRunStatusFromJob ?? (last?.status != null ? normScalar(last.status) : null);

      const lastDelFromJob = firstNonEmptyTrimmedString(
        row.job_last_delivery_status_snapshot_raw,
        row.JOB_LAST_DELIVERY_STATUS_SNAPSHOT_RAW,
      );
      const lastDeliveryStatus =
        lastDelFromJob ?? (last?.delivery_status != null ? normScalar(last.delivery_status) : null);

      const lastErrFromJob = firstNonEmptyTrimmedString(
        row.job_last_error_snapshot_raw,
        row.JOB_LAST_ERROR_SNAPSHOT_RAW,
      );
      const lastError =
        lastErrFromJob ?? (last?.error_message != null ? normScalar(last.error_message) : null);

      const jobNextRaw = normScalar(row.job_next_run_at_snapshot_raw ?? row.JOB_NEXT_RUN_AT_SNAPSHOT_RAW);
      const nextRunAtMsFromJob =
        jobNextRaw != null && String(jobNextRaw).trim() ? parseNextRunAtMsFromLogRaw(jobNextRaw) : null;

      const consecFromJob = parsePositiveNumberOrNull(
        row.job_consecutive_errors_snapshot_raw ?? row.JOB_CONSECUTIVE_ERRORS_SNAPSHOT_RAW,
      );
      const consecutiveErrors = consecFromJob ?? null;

      const agentIdColVal = normScalar(row.job_agent_id_col ?? row.JOB_AGENT_ID_COL);
      const agentIdLog = firstNonEmptyTrimmedString(row.job_agent_id_raw, row.JOB_AGENT_ID_RAW);
      const agentId = agentIdColVal != null && String(agentIdColVal).trim() ? String(agentIdColVal) : agentIdLog;

      const sessionKey = firstNonEmptyTrimmedString(
        row.job_session_key_raw,
        row.JOB_SESSION_KEY_RAW,
        row.job_session_id,
        row.JOB_SESSION_ID,
      );
      const sessionTarget = firstNonEmptyTrimmedString(row.job_session_target_raw, row.JOB_SESSION_TARGET_RAW);
      const wakeMode = firstNonEmptyTrimmedString(row.job_wake_mode_raw, row.JOB_WAKE_MODE_RAW);
      const deliveryMode = firstNonEmptyTrimmedString(row.job_delivery_mode_raw, row.JOB_DELIVERY_MODE_RAW);
      const payloadKind = firstNonEmptyTrimmedString(row.job_payload_kind_raw, row.JOB_PAYLOAD_KIND_RAW);
      const payloadModel = firstNonEmptyTrimmedString(row.job_payload_model_raw, row.JOB_PAYLOAD_MODEL_RAW);
      const payloadMessage = firstNonEmptyTrimmedString(row.job_payload_message_raw, row.JOB_PAYLOAD_MESSAGE_RAW);
      const scheduleTz = firstNonEmptyTrimmedString(row.job_schedule_tz_raw, row.JOB_SCHEDULE_TZ_RAW);
      const descriptionCol = normScalar(row.job_description_col ?? row.JOB_DESCRIPTION_COL);
      const description =
        descriptionCol != null && String(descriptionCol).trim() ? String(descriptionCol) : null;

      return {
        id: jid,
        name: name != null ? String(name) : jid,
        enabled,
        description,
        agentId: agentId ?? null,
        sessionKey: sessionKey ?? null,
        sessionTarget: sessionTarget ?? null,
        wakeMode: wakeMode ?? null,
        createdAtMs,
        updatedAtMs,
        schedule: {
          kind: "cron",
          expr: cronExpression != null && String(cronExpression).trim() ? String(cronExpression) : "—",
          tz: scheduleTz != null && String(scheduleTz).trim() ? String(scheduleTz) : "Asia/Shanghai",
        },
        delivery: { mode: deliveryMode ?? null },
        payload: {
          kind: payloadKind ?? null,
          message: payloadMessage ?? null,
          model: payloadModel ?? null,
        },
        state: {
          nextRunAtMs: nextRunAtMsFromJob,
          lastRunAtMs,
          lastRunStatus,
          lastDurationMs,
          lastDeliveryStatus,
          lastError,
          consecutiveErrors,
        },
        listRunSummary: {
          totalLines,
          sampleSize: totalLines,
          truncated: false,
          okCount,
          failCount,
          neutralCount,
          successRatePct,
          avgDurationMs,
          maxDurationMs,
          totalTokensSum,
          lastRunTokensTotal,
          lastSuccessAtMs,
        },
      };
    });

    return { version: 0, jobs };
  } finally {
    await conn.end();
  }
}
