/**
 * 使用 .env 中 DORIS_* 配置连接 Doris，扫描 `cron_runs.log_attributes` 若干行，
 * 递归汇总所有 JSON 路径（平铺），写回 `docs/datamodel/cron_runs.md` 中占位符区间，
 * 并输出 `data/cron_runs_log_attributes_paths.json` 供核对。
 *
 * 用法（仓库根目录）：node scripts/introspect-cron-runs-log-attributes.mjs
 * 可选：--limit=500 --dry-run（只写 JSON 不改 md）
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
const MD_PATH = path.join(REPO_ROOT, "docs", "datamodel", "cron_runs.md");
const JSON_OUT = path.join(REPO_ROOT, "data", "cron_runs_log_attributes_paths.json");

const MARK_START = "<!-- CRON_RUNS_LOG_ATTR_AUTO_START -->";
const MARK_END = "<!-- CRON_RUNS_LOG_ATTR_AUTO_END -->";

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
      const path = prefix ? `${prefix}.${k}` : k;
      if (child !== null && typeof child === "object") {
        walk(child, path, acc);
      } else {
        const e = acc.get(path) ?? { types: new Set(), samples: [] };
        e.types.add(typeLabel(child));
        const s =
          child === null || child === undefined
            ? ""
            : typeof child === "object"
              ? JSON.stringify(child).slice(0, 100)
              : String(child).slice(0, 120);
        if (s && e.samples.length < 2 && !e.samples.includes(s)) e.samples.push(s);
        acc.set(path, e);
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
  const dry = process.argv.includes("--dry-run");
  let limit = 800;
  for (const a of process.argv) {
    const m = /^--limit=(\d+)$/.exec(a);
    if (m) limit = Math.min(5000, Math.max(1, Number(m[1])));
  }
  return { dry, limit };
}

function buildMarkdownTable(paths, rowCount, iso) {
  const lines = [
    "## log_attributes（JSON）平铺字段",
    "",
    `> 以下路径由 **\`scripts/introspect-cron-runs-log-attributes.mjs\`** 连接 Doris 扫描 **${rowCount}** 行 \`log_attributes\` 汇总（UTC **${iso}**）。未出现的键不代表上游永远不会写入。`,
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
  lines.push("与本地 `jsonl` 行语义对照见 [job-run-events-jsonl.md](./job-run-events-jsonl.md)。");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  loadDotEnv();
  const { dry, limit } = parseArgs();
  const cfg = getDorisConfig();
  const db = getCronDatabaseName();
  const tbl = sanitizeIdent(process.env.DORIS_CRON_RUNS_TABLE, "cron_runs");
  const col = sanitizeIdent(process.env.CRON_RUNS_COL_LOG_ATTRIBUTES, "log_attributes");

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  const merged = new Map();
  let scanned = 0;

  try {
    const sql = `
SELECT CAST(\`${col}\` AS STRING) AS la
FROM \`${db}\`.\`${tbl}\`
WHERE \`${col}\` IS NOT NULL
ORDER BY id DESC
LIMIT ${Number(limit)}
`;
    const [rows] = await conn.query(sql);
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      const la = parseLogAttributes(row.la ?? row.LA);
      if (la == null || typeof la !== "object") continue;
      scanned += 1;
      walk(la, "", merged);
    }
  } finally {
    await conn.end();
  }

  const paths = [...merged.entries()]
    .map(([path, v]) => ({
      path: path || "(root)",
      types: v.types,
      samples: v.samples,
    }))
    .filter((x) => x.path !== "(root)")
    .sort((a, b) => a.path.localeCompare(b.path));

  const pathsForJson = paths.map((p) => ({
    path: p.path,
    types: [...p.types].sort(),
    samples: p.samples,
  }));

  const iso = new Date().toISOString();
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        generatedAt: iso,
        database: db,
        table: tbl,
        column: col,
        rowsScanned: scanned,
        limit,
        paths: pathsForJson,
      },
      null,
      2,
    ),
    "utf8",
  );

  const block = buildMarkdownTable(paths, scanned, iso);

  if (dry) {
    process.stdout.write(block);
    process.stdout.write(`\n(Wrote ${JSON_OUT}, dry-run: skipped ${MD_PATH})\n`);
    return;
  }

  let md = fs.readFileSync(MD_PATH, "utf8");
  const i = md.indexOf(MARK_START);
  const j = md.indexOf(MARK_END);
  if (i !== -1 && j !== -1 && j > i) {
    md = `${md.slice(0, i + MARK_START.length)}\n${block}\n${md.slice(j)}`;
  } else {
    md = `${md.trimEnd()}\n\n${MARK_START}\n${block}\n${MARK_END}\n`;
  }
  fs.writeFileSync(MD_PATH, md, "utf8");
  process.stdout.write(`OK: ${JSON_OUT} + ${MD_PATH} (${scanned} rows, ${paths.length} paths)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
