/**
 * 读取 `.env` 中 Doris 配置，对 `cron_jobs` 执行 `SHOW FULL COLUMNS`，并可选扫描
 * `log_attributes`（或 `CRON_JOBS_COL_LOG_ATTRIBUTES`）若干行汇总 JSON 平铺路径，
 * 生成 `docs/datamodel/cron_jobs.md`（版式对齐 `cron_runs.md`）。
 *
 * 用法（仓库根目录）：
 *   node scripts/write-cron-jobs-md.mjs
 *   node scripts/write-cron-jobs-md.mjs --print   # 只打印到 stdout，不写文件
 *   node scripts/write-cron-jobs-md.mjs --limit=500
 *
 * 环境变量与 `backend/agentSessionsQuery.mjs`、`backend/cron-jobs/cron-runs-query.mjs` 一致。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { getDorisConfig } from "../backend/agentSessionsQuery.mjs";
import { getCronDatabaseName } from "../backend/cron-jobs/cron-runs-query.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");
const MD_PATH = path.join(REPO_ROOT, "docs", "datamodel", "cron_jobs.md");
const JSON_OUT = path.join(REPO_ROOT, "data", "cron_jobs_log_attributes_paths.json");

const MARK_START = "<!-- CRON_JOBS_LOG_ATTR_AUTO_START -->";
const MARK_END = "<!-- CRON_JOBS_LOG_ATTR_AUTO_END -->";

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

/** @param {string} name @param {string} fallback */
function sanitizeIdent(name, fallback) {
  const raw = String(name ?? "").trim() || fallback;
  const v = raw.replace(/[^a-zA-Z0-9_]/g, "");
  return v || fallback;
}

/** @param {unknown} v */
function cell(v) {
  if (v == null) return "—";
  return String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
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

/**
 * @param {Record<string, unknown>[]} colRows
 * @returns {string | null}
 */
function pickOrderColumn(colRows) {
  const fields = colRows.map((r) => String(r.Field ?? r.field ?? ""));
  if (fields.includes("id")) return "id";
  const pri = colRows.find((r) => String(r.Key ?? r.key ?? "").toUpperCase() === "PRI");
  if (pri) return String(pri.Field ?? pri.field ?? "");
  for (const n of ["updated_at", "created_at", "job_id", "gmt_modified"]) {
    if (fields.includes(n)) return n;
  }
  return fields[0] ?? null;
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
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        walk(item, pStar, acc);
      } else {
        walk(item, pStar, acc);
      }
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
function parseLogAttributes(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) {
    const s = raw.toString("utf8");
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function parseArgs() {
  const printOnly = process.argv.includes("--print");
  let limit = 800;
  for (const a of process.argv) {
    const m = /^--limit=(\d+)$/.exec(a);
    if (m) limit = Math.min(5000, Math.max(1, Number(m[1])));
  }
  return { printOnly, limit };
}

/**
 * @param {{ path: string; types: Set<string>; samples: string[] }[]} paths
 * @param {number} rowCount
 * @param {string} iso
 * @param {string} colName
 */
function buildLogMarkdown(paths, rowCount, iso, colName) {
  const lines = [
    "## log_attributes（JSON）平铺字段",
    "",
    `> 以下路径由 **\`scripts/write-cron-jobs-md.mjs\`** 连接 Doris 扫描 **${rowCount}** 行 \`${colName}\` 汇总（UTC **${iso}**）。未出现的键不代表上游永远不会写入。`,
    "",
    "| JSON 路径 | 观测类型 | 样例（截断） |",
    "|-----------|----------|--------------|",
  ];
  for (const p of paths) {
    const types = [...p.types].sort().join(" · ");
    const sample = p.samples.length ? p.samples.join("；").replace(/\|/g, "\\|").replace(/\r?\n/g, " ") : "—";
    lines.push(`| \`${p.path}\` | ${types} | ${sample} |`);
  }
  lines.push("");
  lines.push(
    "后端从 `cron_jobs.log_attributes` 提取标量字段的路径说明见 `backend/cron-jobs/cron-runs-query.mjs` 文件头注释；执行行 JSON 见 [cron_runs.md](./cron_runs.md)。",
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * @param {Record<string, unknown>[]} colRows
 * @param {string} db
 * @param {string} table
 */
function buildTableColumnsMarkdown(colRows) {
  const lines = [
    "# cron_jobs",
    "",
    "## 表列",
    "",
    "| 字段名 | 类型 | 说明 |",
    "|--------|------|------|",
  ];
  for (const r of colRows) {
    const field = String(r.Field ?? r.field ?? "");
    lines.push(`| ${cell(field)} | ${cell(ddlLike(r))} | ${cell(r.Comment ?? r.comment ?? "")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  loadDotEnv();
  const { printOnly, limit } = parseArgs();
  const cfg = getDorisConfig();
  const db = getCronDatabaseName();
  const table = sanitizeIdent(process.env.DORIS_CRON_JOBS_TABLE, "cron_jobs");
  const laCol = sanitizeIdent(process.env.CRON_JOBS_COL_LOG_ATTRIBUTES, "log_attributes");

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  let colRows = [];
  try {
    const [rawCols] = await conn.query(`SHOW FULL COLUMNS FROM \`${db}\`.\`${table}\``);
    colRows = Array.isArray(rawCols) ? rawCols : [];
  } catch (e) {
    await conn.end();
    throw e;
  }

  const fieldNames = new Set(colRows.map((r) => String(r.Field ?? r.field ?? "")));
  const hasLogCol = fieldNames.has(laCol);

  const merged = new Map();
  let scanned = 0;
  const iso = new Date().toISOString();

  if (hasLogCol) {
    const orderCol = pickOrderColumn(colRows);
    const orderSql = orderCol ? `ORDER BY \`${orderCol}\` DESC` : "";
    const sql = `
SELECT CAST(\`${laCol}\` AS STRING) AS la
FROM \`${db}\`.\`${table}\`
WHERE \`${laCol}\` IS NOT NULL
${orderSql}
LIMIT ${Number(limit)}
`;
    try {
      const [rows] = await conn.query(sql);
      const list = Array.isArray(rows) ? rows : [];
      for (const row of list) {
        const la = parseLogAttributes(row.la ?? row.LA);
        if (la == null || typeof la !== "object") continue;
        scanned += 1;
        walk(la, "", merged);
      }
    } catch (e) {
      await conn.end();
      throw e;
    }
  }

  await conn.end();

  const paths = [...merged.entries()]
    .map(([p, v]) => ({
      path: p || "(root)",
      types: v.types,
      samples: v.samples,
    }))
    .filter((x) => x.path !== "(root)")
    .sort((a, b) => a.path.localeCompare(b.path));

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        generatedAt: iso,
        database: db,
        table,
        logColumn: laCol,
        rowsScanned: scanned,
        limit,
        paths: paths.map((p) => ({ path: p.path, types: [...p.types].sort(), samples: p.samples })),
      },
      null,
      2,
    ),
    "utf8",
  );

  let logBlock;
  if (!hasLogCol) {
    logBlock = `## log_attributes（JSON）平铺字段\n\n> 当前表 **无** \`${laCol}\` 列（或列名被 \`CRON_JOBS_COL_LOG_ATTRIBUTES\` 覆盖为其他名且不存在）。跳过扫描。\n\n`;
  } else if (paths.length === 0) {
    logBlock = `## log_attributes（JSON）平铺字段\n\n> 已连接 Doris，但 **${scanned}** 行样本中未解析出可遍历的 JSON 对象（可能均为空或非 JSON）。\n\n`;
  } else {
    logBlock = buildLogMarkdown(paths, scanned, iso, laCol);
  }

  const md =
    `${buildTableColumnsMarkdown(colRows).trimEnd()}\n\n${MARK_START}\n\n` +
    logBlock.trimEnd() +
    `\n\n${MARK_END}\n`;

  if (printOnly) {
    process.stdout.write(md);
    process.stdout.write(`\n(also wrote ${path.relative(REPO_ROOT, JSON_OUT)})\n`);
    return;
  }

  fs.mkdirSync(path.dirname(MD_PATH), { recursive: true });
  fs.writeFileSync(MD_PATH, md, "utf8");
  process.stdout.write(
    `OK: ${path.relative(REPO_ROOT, MD_PATH)} + ${path.relative(REPO_ROOT, JSON_OUT)} (${colRows.length} columns, ${scanned} log rows, ${paths.length} paths)\n`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
