/**
 * 连接 Doris（MySQL 协议），按库/表拉取 `SHOW FULL COLUMNS`，生成 `docs/datamodel/<table>.md`。
 * 版式为三个一级标题：**数据摘要**（库、表、原始来源/路径推断、用途定位）、**数据表列**（字段名称/类型/说明/示例）、**JSON扩展字段**（VARIANT/JSON 列路径平铺）。
 * 行样本至少 **100** 行（与 `--sample-rows` 取 max，封顶 500），供摘要推断与表列样例。
 * 表列「说明」优先 Doris COMMENT，无则用启发式或 `--description-source=db-only`；`--llm` 时可调用模型补 overview / columns / jsonFlat。
 *
 * 用法（仓库根）：
 *   node scripts/generate-doris-datamodel-md.mjs --table=cron_runs
 *   node scripts/generate-doris-datamodel-md.mjs --sample-rows=20
 *   node scripts/generate-doris-datamodel-md.mjs --no-json-sample
 *   node scripts/generate-doris-datamodel-md.mjs --log-database --table=agent_sessions --force
 *   node scripts/generate-doris-datamodel-md.mjs --table=agent_sessions --llm --force
 *
 * `--llm`：表行采样至少 100（与 `--sample-rows` 取 max 后封顶 500），写 `data/datamodel-llm/<表>.bundle.json`，
 * 若配置了 `DORIS_DATAMODEL_OPENAI_API_KEY` 或 `OPENAI_API_KEY` 则调用 OpenAI 兼容接口生成「概要」「表列说明」「JSON 平铺说明」
 *（有 Doris COMMENT 的列仍以库注释为准）。
 *
 * 环境变量与 `backend/agentSessionsQuery.mjs`、`backend/cron-jobs/cron-runs-query.mjs` 一致。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { getDorisConfig, getLogTablesDatabaseName } from "../backend/agentSessionsQuery.mjs";
import { getCronDatabaseName } from "../backend/cron-jobs/cron-runs-query.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");
const OUT_DIR = path.join(REPO_ROOT, "docs", "datamodel");

const SCRIPT_TAG = "scripts/generate-doris-datamodel-md.mjs";
const DEFAULT_SAMPLE_ROWS = 10;
const MAX_SAMPLE_ROWS = 500;
/** 数据摘要与表列样例至少拉取的行数（与 `--sample-rows` 取较大值） */
const MIN_DOC_SAMPLE_ROWS = 100;
/** `--llm` 时与 MIN_DOC_SAMPLE_ROWS 一致，仍受 MAX 与 `--sample-rows` 上界约束 */
const LLM_MIN_SAMPLE_ROWS = MIN_DOC_SAMPLE_ROWS;
const LLM_BUNDLE_DIR = path.join(REPO_ROOT, "data", "datamodel-llm");

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** 仅允许 [a-zA-Z0-9_] */
function assertSafeIdent(name, label) {
  const raw = String(name ?? "").trim();
  if (!raw || !/^[a-zA-Z0-9_]+$/.test(raw)) {
    throw new Error(`${label} 仅允许字母、数字、下划线：${JSON.stringify(name)}`);
  }
  return raw;
}

/** @param {unknown} v */
function cell(v) {
  if (v == null || v === "") return "—";
  return String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** @param {unknown} v 表单元格样例原始值（未做表格转义） */
function formatCellSampleRaw(v) {
  if (v == null) return "";
  if (Buffer.isBuffer(v)) return v.toString("utf8").slice(0, 120);
  if (typeof v === "object") {
    try {
      return JSON.stringify(v).slice(0, 120);
    } catch {
      return "[object]";
    }
  }
  return String(v).slice(0, 160);
}

/**
 * @param {string} field
 * @param {Record<string, unknown>[]} rows
 */
function aggregateColumnSamples(field, rows) {
  const seen = new Set();
  const parts = [];
  const lower = field.toLowerCase();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const v =
      row[field] !== undefined
        ? row[field]
        : row[lower] !== undefined
          ? row[lower]
          : undefined;
    if (v === undefined || v === null) continue;
    const s = formatCellSampleRaw(v);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    parts.push(s);
    if (parts.length >= 2) break;
  }
  return parts.length ? parts.join("；") : "—";
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} database
 * @param {string} table
 * @param {Record<string, unknown>[]} colRows
 * @param {number} limit
 * @param {string | null} orderCol
 */
async function fetchTableSampleRows(conn, database, table, colRows, limit, orderCol) {
  const names = colRows.map((r) => String(r.Field ?? r.field ?? "")).filter(Boolean);
  if (!names.length) return [];
  const quoted = names.map((n) => `\`${assertSafeIdent(n, "列名")}\``).join(", ");
  const qtbl = `\`${database}\`.\`${table}\``;
  const lim = Math.min(MAX_SAMPLE_ROWS, Math.max(1, limit));
  const safeOrder = orderCol && names.includes(orderCol) ? assertSafeIdent(orderCol, "ORDER BY") : null;
  const order = safeOrder ? `ORDER BY \`${safeOrder}\` DESC` : "";
  const sql = `SELECT ${quoted} FROM ${qtbl} ${order} LIMIT ${lim}`;
  try {
    const [rows] = await conn.query(sql);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    process.stderr.write(`[warn] ${table} 表列样例行采样失败：${e instanceof Error ? e.message : String(e)}\n`);
    return [];
  }
}

/**
 * @param {Record<string, unknown>[]} colRows
 * @param {Record<string, unknown>[]} rows
 * @returns {Map<string, string>}
 */
function buildColumnSampleTexts(colRows, rows) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const r of colRows) {
    const field = String(r.Field ?? r.field ?? "");
    if (!field) continue;
    map.set(field, aggregateColumnSamples(field, rows));
  }
  return map;
}

/** Doris / mysql2 列注释键名兼容 */
function getColumnComment(r) {
  const v =
    r.Comment ??
    r.comment ??
    r.COLUMN_COMMENT ??
    r.column_comment ??
    "";
  return String(v ?? "").trim();
}

/**
 * 常见 snake 词 → 中文语义碎片（用于无 COMMENT 时拼读列名）
 * @type {Map<string, string>}
 */
const SNAKE_SEMANTIC_PARTS = new Map([
  ["origin", "来源侧"],
  ["delivery", "投递"],
  ["context", "上下文"],
  ["last", "最近一次"],
  ["label", "展示标签"],
  ["provider", "提供方"],
  ["surface", "客户端或入口界面"],
  ["chat", "聊天"],
  ["type", "类型"],
  ["from", "发送端 From"],
  ["to", "接收端 To"],
  ["account", "账号"],
  ["channel", "渠道"],
  ["group", "群组"],
  ["aborted", "是否中止"],
  ["sent", "已发送"],
  ["system", "系统侧"],
  ["digital", "数字"],
  ["employee", "员工"],
  ["attributes", "扩展属性"],
  ["capabilities", "能力"],
  ["cron", "定时任务"],
  ["schedule", "调度"],
  ["expression", "表达式"],
  ["payload", "负载"],
  ["trace", "链路"],
  ["status", "状态"],
  ["action", "动作或阶段"],
  ["model", "模型"],
  ["message", "消息"],
  ["error", "错误"],
  ["summary", "摘要"],
  ["duration", "耗时"],
  ["started", "开始"],
  ["updated", "更新"],
  ["ended", "结束"],
  ["created", "创建"],
  ["modified", "修改"],
  ["gmt", "时间"],
  ["name", "名称"],
  ["key", "键"],
  ["path", "路径"],
  ["sha", "摘要"],
  ["hash", "哈希"],
  ["window", "窗口"],
  ["tokens", "Token"],
  ["input", "输入"],
  ["output", "输出"],
  ["cache", "缓存"],
  ["read", "读"],
  ["write", "写"],
  ["cost", "费用"],
  ["total", "总计"],
  ["count", "计数"],
  ["time", "时间"],
  ["source", "来源"],
  ["target", "目标"],
  ["level", "级别"],
  ["module", "模块"],
  ["event", "事件"],
]);

/**
 * 无精确映射时，用下划线词表拼出可读中文（推断）。
 * @param {string} field
 */
function describePhysicalColumnFromSnake(field) {
  const parts = String(field ?? "")
    .toLowerCase()
    .split("_")
    .filter(Boolean);
  if (!parts.length) return null;
  const zh = [];
  for (const p of parts) {
    if (SNAKE_SEMANTIC_PARTS.has(p)) zh.push(SNAKE_SEMANTIC_PARTS.get(p));
  }
  if (zh.length === 0) return null;
  return `${zh.join("")}（据列名推断）`;
}

/**
 * 库表无 COMMENT 时的列说明：优先精确/正则，再列名语义组合，最后短占位。
 * @param {string} field
 * @param {string} typeDdl
 */
function describePhysicalColumn(field, typeDdl) {
  const f = String(field ?? "").trim();
  const t = String(typeDdl ?? "").toLowerCase();
  if (!f) return "—";

  /** 精确列名（小写键）→ 业务语义，覆盖 agent_sessions 等高频表 */
  /** @type {Map<string, string>} */
  const exact = new Map([
    ["origin_label", "会话来源侧的展示文案或标题（入口侧可读标签）"],
    ["origin_provider", "会话来源的提供方（如 webchat、网关、第三方标识）"],
    ["origin_surface", "会话来源的客户端或入口界面（如浏览器、IDE 插件）"],
    ["origin_chat_type", "来源侧聊天形态（如 agent、main、插件会话类型）"],
    ["origin_from", "来源侧发送方标识（用户、账号或路由 From）"],
    ["origin_to", "来源侧接收方标识（目标地址或会话路由 To）"],
    ["origin_account_id", "来源侧主账号或租户标识"],
    [
      "delivery_context_channel",
      "投递/交付上下文中使用的渠道（与 channel 列可能不同，偏运行时上下文）",
    ],
    ["delivery_context_to", "投递上下文中的接收端 To（如会话路由目标）"],
    ["delivery_context_account_id", "投递上下文中绑定的账号标识"],
    ["last_channel", "最近一次对外交互使用的渠道"],
    ["last_to", "最近一次交互的接收端 To"],
    ["last_account_id", "最近一次交互关联的账号 id"],
    ["chat_type", "会话聊天类型（如 agent、人与 bot 的对话形态）"],
    ["channel", "主会话或产品维度上的渠道（web、api 等）"],
    ["group_id", "同组会话或协作分组 id"],
    ["system_sent", "是否已由系统侧下发过关键消息或首包"],
    ["aborted_last_run", "上一轮执行是否被中止或中断"],
    ["display_name", "会话或任务在界面上的展示名称"],
    ["agent_name", "Agent 标识（如 main、子 agent 名）"],
  ]);
  const hit = exact.get(f.toLowerCase());
  if (hit) return hit;

  /** @type {[RegExp, string][]} */
  const full = [
    [/^agent_name$/i, "Agent 标识（如 main）"],
    [/^provider$/i, "模型或渠道提供商"],
    [/^model_id$/i, "模型 id"],
    [/^display_name$/i, "展示名称"],
    [/^reasoning$/i, "是否推理模型"],
    [/^context_window$/i, "上下文窗口大小"],
    [/^max_tokens$/i, "最大输出 token"],
    [/^cost_input$/i, "输入侧单价"],
    [/^cost_output$/i, "输出侧单价"],
    [/^cost_cache_read$/i, "缓存读单价"],
    [/^cost_cache_write$/i, "缓存写单价"],
    [/^input_capabilities_csv$/i, "输入能力（逗号分隔枚举）"],
    [/^collected_at$/i, "采集时间（毫秒）"],
    [/^content_sha256$/i, "原文内容摘要（SHA-256，预留）"],
    [/^source_path$/i, "采集源文件路径"],
    [/^log_attributes$/i, "会话或审计用的 JSON/VARIANT 扩展字段（模型、用量、路由等）"],
    [/^session_id$/i, "会话唯一 id"],
    [/^session_key$/i, "会话业务键（路由、幂等或外部关联）"],
    [/^started_at$/i, "开始时间（毫秒）"],
    [/^updated_at$/i, "最近更新时间（毫秒）"],
    [/^ended_at$/i, "结束时间（毫秒）"],
    [/^job_id$/i, "关联任务 id"],
    [/^cron_job/i, "定时任务相关 id"],
  ];
  for (const [re, text] of full) {
    if (re.test(f)) return text;
  }

  const composed = describePhysicalColumnFromSnake(f);
  if (composed) return composed;

  if (/\bjson\b|\bvariant\b/.test(t)) return `结构化扩展列，存 JSON 形态业务数据（${f}）`;
  if (/\bboolean\b|\btinyint\b\(1\)/.test(t)) return `布尔或开关量（${f}）`;
  if (/\b(bigint|int)\b/.test(t) && /_at$|_time$|_ms$/i.test(f)) return `时间戳或毫秒级数值（${f}）`;
  if (/_id$/i.test(f)) return `关联实体标识（${f}）`;
  if (/_at$|_time$/i.test(f)) return `时间相关列（${f}）`;
  if (/^cost_/i.test(f)) return `计费或单价相关（${f}）`;
  return `业务列「${f}」，含义需结合表用途校对`;
}

/** @param {Record<string, unknown>} r */
function ddlLike(r) {
  const Type = String(r.Type ?? r.type ?? "").trim();
  const Null = String(r.Null ?? r.null ?? "").toUpperCase();
  const parts = [Type, Null === "YES" ? "NULL" : "NOT NULL"];
  const def = r.Default ?? r.default;
  if (def !== undefined && def !== null && String(def) !== "") {
    parts.push(`DEFAULT ${String(def)}`);
  }
  const Extra = String(r.Extra ?? r.extra ?? "").trim();
  if (Extra && Extra.toUpperCase() !== "NONE") parts.push(Extra);
  return parts.join(" ");
}

/** @param {Record<string, unknown>} r */
function columnLooksJsonish(r) {
  const t = String(r.Type ?? r.type ?? "").toLowerCase();
  return /\b(json|variant)\b/.test(t) || /\bstruct\b/.test(t) || /\bmap\s*</.test(t) || /\barray\s*</.test(t);
}

/** @param {unknown} v */
function typeLabel(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * @param {unknown} val
 * @param {string} prefix
 * @param {Map<string, { types: Set<string>, samples: string[] }>} acc
 */
function walk(val, prefix, acc) {
  if (val === null || val === undefined) {
    if (!prefix) return;
    const e = acc.get(prefix) ?? { types: new Set(), samples: [] };
    e.types.add("null");
    acc.set(prefix, e);
    return;
  }
  if (Array.isArray(val)) {
    if (prefix) {
      const e = acc.get(prefix) ?? { types: new Set(), samples: [] };
      e.types.add("array");
      acc.set(prefix, e);
    }
    const pStar = prefix ? `${prefix}[*]` : "[*]";
    const max = Math.min(val.length, 50);
    for (let i = 0; i < max; i += 1) {
      const item = val[i];
      walk(item, pStar, acc);
    }
    return;
  }
  if (typeof val === "object") {
    for (const [k, child] of Object.entries(val)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (child !== null && typeof child === "object") {
        walk(child, p, acc);
      } else {
        const e = acc.get(p) ?? { types: new Set(), samples: [] };
        e.types.add(typeLabel(child));
        const s =
          child === null || child === undefined
            ? ""
            : typeof child === "object"
              ? JSON.stringify(child).slice(0, 100)
              : String(child).slice(0, 120);
        if (s && e.samples.length < 2 && !e.samples.includes(s)) e.samples.push(s);
        acc.set(p, e);
      }
    }
    return;
  }
  const e = acc.get(prefix) ?? { types: new Set(), samples: [] };
  e.types.add(typeLabel(val));
  const s = String(val).slice(0, 120);
  if (s && e.samples.length < 2 && !e.samples.includes(s)) e.samples.push(s);
  acc.set(prefix, e);
}

/** @param {unknown} raw */
function parseJsonValue(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return null;
    }
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

/**
 * @param {Record<string, unknown>[]} colRows
 * @returns {string | null}
 */
function pickOrderColumn(colRows) {
  const fields = colRows.map((r) => String(r.Field ?? r.field ?? ""));
  if (fields.includes("id")) return "id";
  const pri = colRows.find((r) => String(r.Key ?? r.key ?? "").toUpperCase() === "PRI");
  if (pri) return String(pri.Field ?? pri.field ?? "");
  for (const n of ["updated_at", "created_at", "started_at", "ts", "job_id", "gmt_modified"]) {
    if (fields.includes(n)) return n;
  }
  return fields[0] ?? null;
}

/**
 * @param {Record<string, unknown>[]} sampleRows
 * @returns {Map<string, { types: Set<string>, samples: string[] }>}
 */
function mergePathsFromSampleRows(sampleRows) {
  /** @type {Map<string, { types: Set<string>, samples: string[] }>} */
  const merged = new Map();
  let parsedRows = 0;
  for (const row of sampleRows) {
    const raw = row.__j ?? row._j;
    const root = parseJsonValue(raw);
    if (root == null || typeof root !== "object") continue;
    walk(root, "", merged);
    parsedRows += 1;
  }
  return { merged, parsedRows };
}

/**
 * 从整表采样行中取出单列 JSON 原始值（`__j` 键），供 `mergePathsFromSampleRows` 使用。
 * @param {Record<string, unknown>[]} tableRows
 * @param {string} colName
 */
function tableRowsToJsonSampleRows(tableRows, colName) {
  const lower = colName.toLowerCase();
  return tableRows.map((row) => {
    if (!row || typeof row !== "object") return { __j: undefined };
    const v =
      row[colName] !== undefined ? row[colName] : row[lower] !== undefined ? row[lower] : undefined;
    return { __j: v };
  });
}

/**
 * @param {string} table
 */
function describeTablePurpose(table) {
  const t = String(table ?? "").toLowerCase();
  if (t === "agent_sessions") {
    return "OpenClaw Agent 会话主数据，支撑会话列表、审计详情、用量与工具风险聚合等能力。";
  }
  if (t === "agent_sessions_logs") {
    return "会话维度下的消息/工具调用流水，与会话主表关联。";
  }
  if (t === "agent_models") {
    return "Agent 侧模型配置与单价等快照，用于成本与能力展示。";
  }
  if (t === "cron_jobs") {
    return "定时任务定义与调度元数据。";
  }
  if (t === "cron_runs") {
    return "定时任务运行实例与结果记录。";
  }
  return "业务数据表；具体用途请结合库内数据与前后端消费代码确认。";
}

/**
 * 从最多前 100 行样本推断「原始来源」「原始路径」等摘要字段。
 * @param {string} database
 * @param {string} table
 * @param {Record<string, unknown>[]} colRows
 * @param {Record<string, unknown>[]} tableRows
 */
function inferDataSummaryFields(database, table, colRows, tableRows) {
  const fields = colRows.map((r) => String(r.Field ?? r.field ?? ""));
  const slice = tableRows.slice(0, MIN_DOC_SAMPLE_ROWS);
  const provs = new Set();
  const labels = new Set();
  for (const row of slice) {
    if (!row || typeof row !== "object") continue;
    const op = row.origin_provider;
    const ol = row.origin_label;
    if (op != null && String(op).trim()) provs.add(String(op).trim());
    if (ol != null && String(ol).trim()) labels.add(String(ol).trim());
  }
  let origin = "—";
  if (provs.size || labels.size) {
    const parts = [];
    if (provs.size) parts.push(`典型提供方：${[...provs].slice(0, 5).join("、")}`);
    if (labels.size) parts.push(`典型入口标签：${[...labels].slice(0, 5).join("、")}`);
    origin = parts.join("；");
  }

  let rawPath = "—";
  if (fields.includes("source_path")) {
    for (const row of slice) {
      const sp = row.source_path;
      if (sp != null && String(sp).trim()) {
        rawPath = String(sp).trim().slice(0, 500);
        break;
      }
    }
  }
  const laField = fields.find((f) => f.toLowerCase() === "log_attributes");
  if (rawPath === "—" && laField) {
    for (const row of slice) {
      const raw = row[laField];
      const root = parseJsonValue(raw);
      if (root && typeof root === "object" && "sessionFile" in root) {
        const sf = /** @type {Record<string, unknown>} */ (root).sessionFile;
        if (sf != null && String(sf).trim()) {
          rawPath = String(sf).trim().slice(0, 500);
          break;
        }
      }
    }
  }

  const purpose = describeTablePurpose(table);
  return { origin, rawPath, purpose };
}

/**
 * @param {string} iso
 * @param {string} database
 * @param {number} sampleRows
 * @param {"hybrid" | "db-only"} descriptionSource
 * @param {Record<string, string> | null} llmColMap
 */
function buildFileBanner(iso, database, sampleRows, descriptionSource, llmColMap) {
  return `<!-- generated: ${iso} · database: ${database} · rowSamples: ${sampleRows} · tableDescription: ${descriptionSource}${llmColMap ? " · llmDescriptions: yes" : ""} · layout: datamodel-v2 -->`;
}

/**
 * @param {string} database
 * @param {string} table
 * @param {Record<string, unknown>[]} colRows
 * @param {Record<string, unknown>[]} tableRows
 * @param {string} overviewLlm 模型生成的补充摘要（可为空）
 */
function buildDataSummaryMarkdown(database, table, colRows, tableRows, overviewLlm) {
  const { origin, rawPath, purpose } = inferDataSummaryFields(database, table, colRows, tableRows);
  const lines = [
    "# 数据摘要",
    "",
    `- **数据库**：${database}`,
    `- **数据表**：${table}`,
    `- **原始来源**：${origin}`,
    `- **原始路径**：${cell(rawPath)}`,
    `- **用途定位**：${purpose}`,
    "",
  ];
  const ov = String(overviewLlm ?? "").trim();
  if (ov) {
    lines.push("以下为基于样本由模型生成的补充摘要（若有）：", "", ov, "");
  }
  return lines.join("\n");
}

/**
 * JSON 路径无库表 COMMENT，用规则 + 末段键名给出简要中文说明（需业务校对）。
 * @param {string} path
 */
function describeJsonPath(path) {
  const p = String(path ?? "").trim();
  if (!p) return "—";

  /** @type {[RegExp, string][]} 前项优先匹配更具体规则 */
  const rules = [
    [/authProfileOverrideCompactionCount/i, "鉴权配置覆盖相关的压缩/合并计数"],
    [/authProfileOverrideSource/i, "鉴权配置覆盖的来源（如 auto）"],
    [/authProfileOverride/i, "鉴权配置覆盖标识（如默认 profile 名）"],
    [/abortedLastRun/i, "上一轮运行是否被中止"],
    [/^cacheRead$/i, "缓存读 token 用量"],
    [/^cacheWrite$/i, "缓存写 token 用量"],
    [/^inputTokens$/i, "输入侧 token 用量"],
    [/^outputTokens$/i, "输出侧 token 用量"],
    [/^totalTokens$/i, "总 token 用量"],
    [/usage\.input/i, "输入侧 token 用量（如 prompt_tokens）"],
    [/usage\.output/i, "输出侧 token 用量（如 completion_tokens）"],
    [/usage\.total/i, "总 token 用量"],
    [/usage\./i, "Token 用量相关"],
    [/cost\.input/i, "输入单价"],
    [/cost\.output/i, "输出单价"],
    [/cost\.cacheRead/i, "缓存读单价"],
    [/cost\.cacheWrite/i, "缓存写单价"],
    [/cost\.cache/i, "缓存单价相关"],
    [/cost\./i, "计费单价相关"],
    [/contextwindow/i, "上下文窗口大小"],
    [/maxtokens/i, "最大输出 token"],
    [/sessionid/i, "会话唯一 id"],
    [/sessionkey/i, "会话业务键"],
    [/deliverystatus/i, "交付状态"],
    [/nextrunatms/i, "下次运行时间（毫秒）"],
    [/runatms/i, "本次运行时间（毫秒）"],
    [/durationms/i, "执行耗时（毫秒）"],
    [/error/i, "错误描述"],
    [/summary/i, "产出/结果摘要"],
    [/duration/i, "执行耗时"],
    [/provider/i, "模型提供商"],
    [/model/i, "模型名或标识"],
    [/status/i, "运行状态"],
    [/payload/i, "业务负载"],
    [/trace/i, "链路追踪"],
    [/action/i, "生命周期/动作阶段"],
    [/compat\./i, "兼容特性开关"],
    [/inputcapabilities/i, "输入能力（多模态等）"],
    [/api$/i, "底层 API 类型（如 completions）"],
    [/\[\*\]/i, "数组内元素（路径聚合）"],
  ];
  for (const [re, text] of rules) {
    if (re.test(p)) return text;
  }

  const segs = p.split(/[\.\[\]]+/).filter(Boolean);
  const tail = segs[segs.length - 1] ?? p;
  const tailKey = tail.replace(/_/g, "").toLowerCase();
  /** @type {Map<string, string>} */
  const tailMap = new Map([
    ["name", "名称"],
    ["id", "标识 id"],
    ["ts", "时间戳"],
    ["input", "输入项"],
    ["output", "输出项"],
    ["type", "类型"],
    ["kind", "种类"],
    ["body", "正文"],
    ["message", "消息"],
    ["reasoning", "推理相关"],
    ["collectedat", "采集时间"],
    ["sourcepath", "采集源路径"],
    ["contentsha256", "内容摘要哈希"],
  ]);
  if (tailMap.has(tailKey)) return `${tailMap.get(tailKey)}（\`${tail}\`）`;
  return `无本地规则：键「${tail}」。可加 **--llm** 由大模型结合样本中的类型与样例生成中文说明。`;
}

/** @param {unknown} v @param {number} max */
function truncateLlmValue(v, max) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v.toString("utf8").slice(0, max);
  if (typeof v === "object") {
    try {
      return JSON.stringify(v).slice(0, max);
    } catch {
      return "[object]";
    }
  }
  const s = String(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * @param {Map<string, { types: Set<string>, samples: string[] }>} merged
 * @returns {{ path: string; types: string[]; samples: string[] }[]}
 */
function mergedPathsForBundle(merged) {
  return [...merged.entries()]
    .filter(([p]) => p && String(p) !== "(root)")
    .map(([path, v]) => ({
      path,
      types: [...v.types].sort(),
      samples: v.samples.slice(0, 3),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 250);
}

/**
 * @param {string} table
 * @param {string} database
 * @param {Record<string, unknown>[]} colRows
 * @param {Record<string, unknown>[]} tableRows
 * @param {{ colName: string; fetched: number; merged: Map<string, { types: Set<string>; samples: string[] }> }[]} jsonBlocks
 */
function buildLlmBundle(table, database, colRows, tableRows, jsonBlocks) {
  const columns = colRows.map((r) => ({
    name: String(r.Field ?? r.field ?? ""),
    typeDdl: ddlLike(r),
    commentFromDb: getColumnComment(r) || null,
  }));
  const rowSnapshots = tableRows.slice(0, LLM_MIN_SAMPLE_ROWS).map((row) => {
    /** @type {Record<string, unknown>} */
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      o[k] = truncateLlmValue(v, 500);
    }
    return o;
  });
  const jsonColumns = jsonBlocks.map((j) => ({
    name: j.colName,
    sampleRowCount: j.fetched,
    paths: mergedPathsForBundle(j.merged),
  }));
  return {
    generatedAt: new Date().toISOString(),
    database,
    table,
    columns,
    rowSnapshots,
    jsonColumns,
  };
}

/**
 * @param {unknown} data
 * @returns {{ overview: string; columns: Record<string, string>; jsonFlat: Record<string, Record<string, string>> } | null}
 */
function normalizeLlmResult(data) {
  if (!data || typeof data !== "object") return null;
  const d = /** @type {Record<string, unknown>} */ (data);
  const overview = typeof d.overview === "string" ? d.overview.trim() : "";
  /** @type {Record<string, string>} */
  const columns = {};
  if (d.columns && typeof d.columns === "object") {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (d.columns))) {
      if (typeof v === "string" && v.trim()) columns[k] = v.trim();
    }
  }
  /** @type {Record<string, Record<string, string>>} */
  const jsonFlat = {};
  if (d.jsonFlat && typeof d.jsonFlat === "object") {
    for (const [jk, jv] of Object.entries(/** @type {Record<string, unknown>} */ (d.jsonFlat))) {
      if (!jv || typeof jv !== "object") continue;
      /** @type {Record<string, string>} */
      const inner = {};
      for (const [pk, pv] of Object.entries(/** @type {Record<string, unknown>} */ (jv))) {
        if (typeof pv === "string" && pv.trim()) inner[pk] = pv.trim();
      }
      if (Object.keys(inner).length) jsonFlat[jk] = inner;
    }
  }
  return { overview, columns, jsonFlat };
}

/**
 * @param {Record<string, unknown>} bundle
 * @returns {Promise<{ overview: string; columns: Record<string, string>; jsonFlat: Record<string, Record<string, string>> } | null>}
 */
async function callOpenAiDatamodel(bundle) {
  const apiKey = process.env.DORIS_DATAMODEL_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const base = (process.env.DORIS_DATAMODEL_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.DORIS_DATAMODEL_OPENAI_MODEL || "gpt-4o-mini";
  const sys =
    "你是资深数据建模与文档工程师。用户将提供 JSON bundle（Doris 表元数据 + 至多约 100 行脱敏样本 + JSON 路径汇总）。请只输出一个 JSON 对象（不要 markdown 围栏），键为：overview（字符串，2～8 句中文 Markdown 正文，不含 # 标题）、columns（对象：物理列名 -> 中文说明）、jsonFlat（对象：JSON 列名 -> { 点分路径: 中文说明 }）。规则：若 bundle.columns[].commentFromDb 非空，该列说明应与其一致或略写，不得矛盾；无 commentFromDb 时必须给出合理 columns[name]。jsonFlat：外层键须与 bundle.jsonColumns[].name 一致；对每个 bundle.jsonColumns[].paths[] 中的 path **必须**给出一条独立、可读的中文说明，须综合该 path 的 types、samples 及列名/父路径语义推断业务含义；禁止输出「请结合上游契约」「待业务确认」等占位套话；仅当样本完全无法推断时可用短句「含义未明」。";
  const user = JSON.stringify({
    task: "generate_datamodel_descriptions_zh",
    bundle,
  });
  const body = {
    model,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user.slice(0, 120_000) },
    ],
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      process.stderr.write(`[warn] LLM HTTP ${res.status}: ${txt.slice(0, 500)}\n`);
      return null;
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed = JSON.parse(content);
    return normalizeLlmResult(parsed);
  } catch (e) {
    process.stderr.write(`[warn] LLM 调用失败：${e instanceof Error ? e.message : String(e)}\n`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} colName
 * @param {Map<string, { types: Set<string>, samples: string[] }>} merged
 * @param {number} fetched 实际拉到的非空样本行数
 * @param {number} parsedRows 成功解析为 JSON 并参与 walk 的行数
 * @param {string} iso
 * @param {number} maxLimit 每列请求上限
 * @param {Record<string, string> | null} llmPathMap 点分路径 → 模型说明（无则启发式）
 */
function buildJsonFlatMarkdown(colName, merged, fetched, parsedRows, iso, maxLimit, llmPathMap) {
  const paths = [...merged.entries()]
    .map(([path, v]) => ({
      path: path || "(root)",
      types: v.types,
      samples: v.samples,
    }))
    .filter((x) => x.path !== "(root)")
    .sort((a, b) => a.path.localeCompare(b.path));

  const lines = [
    `<!-- DATAMODEL_JSON_FLAT:${colName}_START -->`,
    `## ${colName}`,
    "",
  ];

  if (fetched === 0) {
    lines.push(`> 当前列 **${colName}** 无可用非空样本（每列最多请求 **${maxLimit}** 行）。`, "");
  } else if (paths.length === 0) {
    lines.push(
      `> 已对 **${colName}** 采样 **${fetched}** 行（上限 ${maxLimit}），其中 **${parsedRows}** 行解析为 JSON 并参与汇总，但未产生可平铺路径（可能为空对象、仅标量或非对象根）。`,
      "",
    );
  } else {
    const note = llmPathMap
      ? `> 以下 **字段名**（点分路径）由 **\`${SCRIPT_TAG}\`** 汇总 **${fetched}** 行 \`${colName}\`（UTC **${iso}**）。**说明**列优先采用大模型结合样本生成的描述；缺省处为脚本启发式。`
      : `> 以下 **字段名**（点分路径）由 **\`${SCRIPT_TAG}\`** 连接 Doris 扫描 **${fetched}** 行 \`${colName}\` 汇总（UTC **${iso}**）。**说明**列为启发式或本地规则；需要数据驱动的中文说明时请使用 **\`--llm\`**。未出现的键不代表上游永远不会写入。`;
    lines.push(note, "", "| 字段名 | 字段类型 | 说明 | 样例（截断） |", "|--------|----------|------|--------------|");
    for (const p of paths) {
      const types = [...p.types].sort().join(" · ");
      const desc = (llmPathMap && llmPathMap[p.path]) || describeJsonPath(p.path);
      const sample = p.samples.length ? p.samples.join("；").replace(/\|/g, "\\|").replace(/\r?\n/g, " ") : "—";
      lines.push(`| \`${p.path}\` | ${types} | ${cell(desc)} | ${cell(sample)} |`);
    }
    lines.push("");
  }

  lines.push(`<!-- DATAMODEL_JSON_FLAT:${colName}_END -->`, "");
  return lines.join("\n");
}

/**
 * @param {string} table
 * @param {string} database
 * @param {Record<string, unknown>[]} colRows
 * @param {number} sampleRows
 * @param {Map<string, string>} colSamples 字段名 → 样例文本（已聚合，未表格转义）
 * @param {"hybrid" | "db-only"} descriptionSource hybrid：无 COMMENT 时用脚本启发式；db-only：无 COMMENT 时填「—」供 Agent 补写
 * @param {Record<string, string> | null} llmColMap 物理列名 → 模型说明（无 COMMENT 时优先于启发式 / db-only 的「—」）
 */
function buildTableColumnsMarkdown(
  table,
  database,
  colRows,
  sampleRows,
  colSamples,
  descriptionSource,
  llmColMap,
) {
  const lines = [
    "# 数据表列",
    "",
    "| 字段名称 | 字段类型 | 字段说明 | 字段示例 |",
    "|----------|----------|----------|----------|",
  ];
  for (const r of colRows) {
    const field = String(r.Field ?? r.field ?? "");
    const ddl = ddlLike(r);
    const dbComment = getColumnComment(r);
    const llmText = llmColMap && typeof llmColMap[field] === "string" ? llmColMap[field].trim() : "";
    let commentCell;
    if (dbComment) commentCell = dbComment;
    else if (llmText) commentCell = llmText;
    else if (descriptionSource === "db-only") commentCell = "—";
    else commentCell = describePhysicalColumn(field, ddl);
    const sampleRaw = colSamples.get(field) ?? "—";
    lines.push(`| ${cell(field)} | ${cell(ddl)} | ${cell(commentCell)} | ${cell(sampleRaw)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function usage() {
  process.stderr.write(`用法: node scripts/generate-doris-datamodel-md.mjs [选项] [表名]

选项:
  --database=NAME     库名（显式指定时优先）
  --log-database        缺省库名改用 getLogTablesDatabaseName()（DORIS_LOG_DATABASE 或 DORIS_DATABASE）
  --table=NAME          单表
  --tables=a,b,c      多表（逗号分隔）
  --all-tables          当前库下全部用户表
  --prefix=PRE          与 --all-tables 联用
  --sample-rows=N       与内置下限取较大值后拉取行数（下限 ${MIN_DOC_SAMPLE_ROWS}，最大 ${MAX_SAMPLE_ROWS}；默认 CLI 为 ${DEFAULT_SAMPLE_ROWS}，实际至少 ${MIN_DOC_SAMPLE_ROWS} 行）
  --no-json-sample      不做 JSON 平铺（仍会拉表行填「表列 · 样例」）
  --description-source=hybrid|db-only
                        hybrid（默认）：表列「说明」无 COMMENT 时用脚本启发式
                        db-only：无 COMMENT 时「说明」填「—」，交由 Cursor Agent（大模型）补写
  --llm                 采样至少 ${LLM_MIN_SAMPLE_ROWS} 行（与 --sample-rows 取较大值，封顶 ${MAX_SAMPLE_ROWS}），
                        写 bundle 到 data/datamodel-llm/（可用 --llm-bundle-dir= 覆盖目录）；若配置了 OpenAI 兼容 Key 则生成概要 + 表列/JSON 说明
  --llm-bundle-dir=DIR  与 --llm 联用：bundle JSON 写入目录 DIR（文件名仍为 <表名>.bundle.json）
  --dry-run             不写文件；Markdown 写到 stdout
  --print               同 --dry-run
  --force               覆盖已存在的 md

表名、库名仅允许 [a-zA-Z0-9_]。
`);
}

function parseArgs(argv) {
  /** @type {{ database: string | null, logDatabase: boolean, tables: string[], allTables: boolean, prefix: string | null, dryRun: boolean, printOnly: boolean, force: boolean, help: boolean, sampleRows: number, noJsonSample: boolean, descriptionSource: "hybrid" | "db-only", llm: boolean, llmBundleDir: string | null }} */
  const out = {
    database: null,
    logDatabase: false,
    tables: [],
    allTables: false,
    prefix: null,
    dryRun: false,
    printOnly: false,
    force: false,
    help: false,
    sampleRows: DEFAULT_SAMPLE_ROWS,
    noJsonSample: false,
    descriptionSource: /** @type {"hybrid" | "db-only"} */ ("hybrid"),
    llm: false,
    llmBundleDir: null,
  };
  const pos = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--log-database") out.logDatabase = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--print") out.printOnly = true;
    else if (a === "--force") out.force = true;
    else if (a === "--all-tables") out.allTables = true;
    else if (a === "--no-json-sample") out.noJsonSample = true;
    else if (a === "--llm") out.llm = true;
    else if (a.startsWith("--database=")) out.database = a.slice("--database=".length);
    else if (a.startsWith("--table=")) out.tables.push(a.slice("--table=".length));
    else if (a.startsWith("--sample-rows=")) {
      const n = Number(a.slice("--sample-rows=".length));
      if (Number.isFinite(n) && n >= 1) out.sampleRows = Math.min(MAX_SAMPLE_ROWS, Math.floor(n));
    } else if (a.startsWith("--tables=")) {
      const rest = a.slice("--tables=".length);
      for (const t of rest.split(",")) {
        const s = t.trim();
        if (s) out.tables.push(s);
      }
    } else if (a.startsWith("--llm-bundle-dir=")) {
      const d = a.slice("--llm-bundle-dir=".length).trim();
      out.llmBundleDir = d || null;
    } else if (a.startsWith("--prefix=")) out.prefix = a.slice("--prefix=".length);
    else if (a.startsWith("--description-source=")) {
      const v = a.slice("--description-source=".length).trim().toLowerCase();
      if (v === "db-only" || v === "hybrid") out.descriptionSource = v;
    } else if (!a.startsWith("-")) pos.push(a);
  }
  if (pos.length) out.tables.push(...pos);
  return out;
}

/**
 * @param {string | null} cliDb
 * @param {boolean} useLogDb
 */
function resolveDatabase(cliDb, useLogDb) {
  if (cliDb != null && String(cliDb).trim()) {
    return assertSafeIdent(cliDb, "--database");
  }
  if (useLogDb) {
    return assertSafeIdent(getLogTablesDatabaseName(), "日志库名（DORIS_LOG_DATABASE / DORIS_DATABASE）");
  }
  return assertSafeIdent(getCronDatabaseName(), "默认库名（DORIS_CRON_DATABASE / DORIS_DATABASE）");
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} database
 * @returns {Promise<string[]>}
 */
async function listUserTables(conn, database) {
  const [rows] = await conn.query(`SHOW TABLES FROM \`${database}\``);
  const list = Array.isArray(rows) ? rows : [];
  /** @type {string[]} */
  const names = [];
  const keyPat = /^Tables_in_/i;
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const keys = Object.keys(row);
    const k = keys.find((x) => keyPat.test(x));
    if (!k) continue;
    const v = row[k];
    if (v != null && String(v).trim()) names.push(String(v).trim());
  }
  return names.sort();
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} database
 * @param {string} table
 * @param {Record<string, unknown>[]} colRows
 * @param {{
 *   sampleRows: number;
 *   noJsonSample: boolean;
 *   descriptionSource: "hybrid" | "db-only";
 *   llm: boolean;
 *   llmBundleDir: string | null;
 *   dryRun: boolean;
 *   printOnly: boolean;
 * }} opts
 */
async function buildFullMarkdown(conn, database, table, colRows, opts) {
  const iso = new Date().toISOString();
  const orderCol = pickOrderColumn(colRows);
  const effTableRows = Math.min(MAX_SAMPLE_ROWS, Math.max(MIN_DOC_SAMPLE_ROWS, opts.sampleRows));
  const tableRows = await fetchTableSampleRows(conn, database, table, colRows, effTableRows, orderCol);
  const colSamples = buildColumnSampleTexts(colRows, tableRows);

  const jsonCols = colRows.filter(columnLooksJsonish).map((r) => String(r.Field ?? r.field ?? ""));
  /** @type {{ colName: string; fetched: number; merged: Map<string, { types: Set<string>; samples: string[] }>; parsedRows: number }[]} */
  const jsonBlocks = [];
  if (!opts.noJsonSample && jsonCols.length) {
    for (const colName of jsonCols) {
      assertSafeIdent(colName, "JSON 列名");
      /** 与表列共用同一次 SELECT 的样本行，保证路径汇总与「前 N 条」一致 */
      const sampleRows = tableRowsToJsonSampleRows(tableRows, colName);
      const { merged, parsedRows } = mergePathsFromSampleRows(sampleRows);
      const fetched = sampleRows.filter((row) => {
        const raw = row.__j ?? row._j;
        return raw != null && raw !== "";
      }).length;
      jsonBlocks.push({ colName, fetched, merged, parsedRows });
    }
  }

  /** @type {Record<string, string> | null} */
  let llmColMap = null;
  /** @type {Record<string, Record<string, string>> | null} */
  let llmJsonFlat = null;
  let overview = "";

  if (opts.llm) {
    const bundle = buildLlmBundle(table, database, colRows, tableRows, jsonBlocks);
    const bundleDir = opts.llmBundleDir && String(opts.llmBundleDir).trim() ? String(opts.llmBundleDir).trim() : LLM_BUNDLE_DIR;
    const bundlePath = path.join(bundleDir, `${table}.bundle.json`);
    if (!opts.dryRun && !opts.printOnly) {
      fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
      fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
    }
    const hasKey = Boolean(process.env.DORIS_DATAMODEL_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
    if (!hasKey) {
      process.stderr.write(
        "[info] --llm：未设置 DORIS_DATAMODEL_OPENAI_API_KEY / OPENAI_API_KEY，已跳过 API；可本地将 bundle 交给模型后再手工合并，或使用 hybrid 默认说明。\n",
      );
    } else {
      const llm = await callOpenAiDatamodel(/** @type {Record<string, unknown>} */ (bundle));
      if (llm) {
        overview = llm.overview;
        llmColMap = Object.keys(llm.columns).length ? llm.columns : null;
        llmJsonFlat = Object.keys(llm.jsonFlat).length ? llm.jsonFlat : null;
      }
    }
  }

  const banner = buildFileBanner(iso, database, effTableRows, opts.descriptionSource, llmColMap);
  const summaryMd = buildDataSummaryMarkdown(database, table, colRows, tableRows, overview);
  const columnsMd = buildTableColumnsMarkdown(
    table,
    database,
    colRows,
    effTableRows,
    colSamples,
    opts.descriptionSource,
    llmColMap,
  ).trimEnd();

  if (opts.noJsonSample) {
    return `${banner}\n\n${summaryMd}\n\n${columnsMd}\n`;
  }

  if (!jsonCols.length) {
    return `${banner}\n\n${summaryMd}\n\n${columnsMd}\n\n# JSON扩展字段\n\n> 当前表无 JSON/VARIANT 类列需平铺。\n`;
  }

  /** @type {string[]} */
  const jsonParts = [];
  for (const block of jsonBlocks) {
    const { colName, merged, fetched, parsedRows } = block;
    const jsonLimit = effTableRows;
    const pathMap = llmJsonFlat && llmJsonFlat[colName] ? llmJsonFlat[colName] : null;
    jsonParts.push(buildJsonFlatMarkdown(colName, merged, fetched, parsedRows, iso, jsonLimit, pathMap).trimEnd());
  }

  return `${banner}\n\n${summaryMd}\n\n${columnsMd}\n\n# JSON扩展字段\n\n${jsonParts.join("\n\n")}\n`;
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const noWrite = args.dryRun || args.printOnly;
  const database = resolveDatabase(args.database, args.logDatabase);

  /** @type {string[]} */
  let tables = [];
  if (args.allTables) {
    if (args.tables.length) {
      throw new Error("不能同时使用 --all-tables 与表名参数/--table/--tables");
    }
  } else if (args.tables.length) {
    tables = args.tables.map((t) => assertSafeIdent(t, "表名"));
  } else {
    usage();
    process.exit(1);
  }

  const cfg = getDorisConfig();
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  const jsonOpts = {
    sampleRows: args.sampleRows,
    noJsonSample: args.noJsonSample,
    descriptionSource: args.descriptionSource,
    llm: args.llm,
    llmBundleDir: args.llmBundleDir,
    dryRun: args.dryRun,
    printOnly: args.printOnly,
  };

  try {
    if (args.allTables) {
      let all = await listUserTables(conn, database);
      const pfx = args.prefix != null && String(args.prefix).trim() ? String(args.prefix).trim() : "";
      if (pfx) {
        assertSafeIdent(pfx, "--prefix");
        all = all.filter((t) => t.startsWith(pfx));
      }
      tables = all.map((t) => assertSafeIdent(t, "表名"));
    }

    if (!tables.length) {
      throw new Error("没有可生成的表（检查 --table / --tables / --all-tables / --prefix）");
    }

    const outputs = [];
    for (const table of tables) {
      const [rawCols] = await conn.query(`SHOW FULL COLUMNS FROM \`${database}\`.\`${table}\``);
      const colRows = Array.isArray(rawCols) ? rawCols : [];
      const md = await buildFullMarkdown(conn, database, table, colRows, jsonOpts);
      const relPath = path.join("docs", "datamodel", `${table}.md`);
      const absPath = path.join(OUT_DIR, `${table}.md`);

      if (!noWrite) {
        if (!args.force && fs.existsSync(absPath)) {
          process.stderr.write(`跳过已存在（加 --force 覆盖）: ${relPath}\n`);
          continue;
        }
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(absPath, md, "utf8");
        const jsonCols = colRows.filter(columnLooksJsonish).length;
        const effOut = Math.min(MAX_SAMPLE_ROWS, Math.max(MIN_DOC_SAMPLE_ROWS, args.sampleRows));
        const rowNote = `sample ${effOut} rows${args.llm ? " (llm)" : ""}`;
        process.stdout.write(
          `OK: ${relPath} (${colRows.length} columns${args.noJsonSample ? "" : `, ${jsonCols} json-ish cols, ${rowNote}`})\n`,
        );
      } else {
        outputs.push({ relPath, md });
      }
    }

    if (noWrite) {
      for (let i = 0; i < outputs.length; i += 1) {
        if (i > 0) process.stdout.write("\n\n---\n\n");
        process.stdout.write(outputs[i].md);
      }
      if (outputs.length) {
        process.stderr.write(
          `\n(${args.dryRun || args.printOnly ? "dry-run/print：未写入磁盘" : ""}；共 ${outputs.length} 张表)\n`,
        );
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
