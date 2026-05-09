/**
 * 读取 Doris `cron_runs` 表结构，将字段列表写入 `data/cron_runs_columns.json` 与 `data/cron_runs_columns.txt`。
 * 使用与后端一致的库名、表名环境变量：DORIS_*、DORIS_CRON_DATABASE、DORIS_CRON_RUNS_TABLE。
 *
 * 用法（仓库根目录）：node scripts/dump-cron-runs-columns.mjs
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

async function main() {
  loadDotEnv();
  const cfg = getDorisConfig();
  const db = getCronDatabaseName();
  const tbl = sanitizeIdent(process.env.DORIS_CRON_RUNS_TABLE, "cron_runs");
  const outDir = path.join(REPO_ROOT, "data");
  fs.mkdirSync(outDir, { recursive: true });

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });

  try {
    const sql = `SHOW FULL COLUMNS FROM \`${db}\`.\`${tbl}\``;
    const [rows] = await conn.query(sql);
    const list = Array.isArray(rows) ? rows : [];

    const fields = list.map((r) => ({
      Field: r.Field ?? r.field ?? r.COLUMN_NAME ?? null,
      Type: r.Type ?? r.type ?? null,
      Collation: r.Collation ?? r.collation ?? null,
      Null: r.Null ?? r.null ?? null,
      Key: r.Key ?? r.key ?? null,
      Default: r.Default ?? r.default ?? null,
      Extra: r.Extra ?? r.extra ?? null,
      Privileges: r.Privileges ?? r.privileges ?? null,
      Comment: r.Comment ?? r.comment ?? null,
    }));

    const jsonPath = path.join(outDir, "cron_runs_columns.json");
    const txtPath = path.join(outDir, "cron_runs_columns.txt");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          database: db,
          table: tbl,
          columns: fields,
          fieldNames: fields.map((c) => c.Field).filter(Boolean),
        },
        null,
        2,
      ),
      "utf8",
    );

    const lines = [
      `# cron_runs 字段列表`,
      `# database=${db} table=${tbl}`,
      `# generatedAt=${new Date().toISOString()}`,
      "",
      ...fields.map((c) => String(c.Field ?? "")),
      "",
    ];
    fs.writeFileSync(txtPath, lines.join("\n"), "utf8");

    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${txtPath}`);
    console.log(`Columns: ${fields.length}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
