/**
 * 从 Doris（MySQL 协议）读取 otel 库表结构，生成 datamodel/otel/*.md
 * 用法：node scripts/extract-otel-doris-schema.mjs
 * 密码：环境变量 DORIS_PASSWORD（未设置则空字符串）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "datamodel", "otel");

const config = {
  host: process.env.DORIS_HOST ?? "127.0.0.1",
  port: Number(process.env.DORIS_PORT ?? 9030),
  user: process.env.DORIS_USER ?? "root",
  password: process.env.DORIS_PASSWORD ?? "",
  database: process.env.DORIS_DATABASE ?? "otel",
};

function safeFileName(tableName) {
  return tableName.replace(/[/\\?%*:|"<>]/g, "_") + ".md";
}

function mapSqlTypeToTs(dataType, columnType) {
  const t = (dataType || "").toLowerCase();
  if (t.includes("int") && !t.includes("point")) return "number";
  if (t === "bigint") return "bigint";
  if (t === "float" || t === "double" || t === "decimal") return "number";
  if (t === "boolean" || t === "tinyint" && columnType?.match(/\(1\)/)) return "boolean";
  if (t === "date" || t === "datetime" || t === "timestamp") return "string | Date";
  if (t === "json" || t === "variant") return "unknown";
  return "string";
}

async function main() {
  const conn = await mysql.createConnection({
    ...config,
    connectTimeout: 30000,
  });

  const [tables] = await conn.query(
    `SELECT TABLE_NAME, TABLE_TYPE, TABLE_COMMENT, ENGINE
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [config.database]
  );

  if (!tables.length) {
    console.warn(`库 ${config.database} 中未找到表。`);
    await conn.end();
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const row of tables) {
    const tableName = row.TABLE_NAME;
    const tableType = row.TABLE_TYPE;
    const tableComment = row.TABLE_COMMENT || "";

    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
              COLUMN_KEY, EXTRA, COLUMN_COMMENT, ORDINAL_POSITION, NUMERIC_PRECISION, NUMERIC_SCALE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [config.database, tableName]
    );

    const lines = [];
    lines.push(`# 表 \`${tableName}\``);
    lines.push("");
    lines.push("> 本文档由 Doris `information_schema` 自动抽取生成。");
    lines.push("");
    lines.push("## 元信息");
    lines.push("");
    lines.push("| 项目 | 值 |");
    lines.push("|------|-----|");
    lines.push(`| 数据库 | \`${config.database}\` |`);
    lines.push(`| 对象类型 | ${tableType} |`);
    lines.push(`| 存储引擎 | ${row.ENGINE ?? "—"} |`);
    lines.push(`| 表注释 | ${tableComment || "—"} |`);
    lines.push("");
    lines.push("## 列定义");
    lines.push("");
    lines.push(
      "| 序号 | 列名 | 数据类型 | 可空 | 默认值 | 键 | 额外 | 注释 |"
    );
    lines.push("|------|------|----------|------|--------|-----|------|------|");

    for (const c of cols) {
      const def =
        c.COLUMN_DEFAULT === null
          ? "NULL"
          : String(c.COLUMN_DEFAULT).replace(/\|/g, "\\|");
      const comment = (c.COLUMN_COMMENT || "").replace(/\|/g, "\\|");
      lines.push(
        `| ${c.ORDINAL_POSITION} | \`${c.COLUMN_NAME}\` | ${c.COLUMN_TYPE} | ${c.IS_NULLABLE} | ${def} | ${c.COLUMN_KEY || ""} | ${c.EXTRA || ""} | ${comment || "—"} |`
      );
    }

    lines.push("");
    lines.push("## TypeScript 字段参考（推断）");
    lines.push("");
    lines.push("```ts");
    lines.push(`export interface ${toPascalCase(tableName)} {`);
    for (const c of cols) {
      const ts = mapSqlTypeToTs(c.DATA_TYPE, c.COLUMN_TYPE);
      const opt = c.IS_NULLABLE === "YES" ? " | null" : "";
      const lineComment = c.COLUMN_COMMENT
        ? ` // ${String(c.COLUMN_COMMENT).replace(/\*\//g, "")}`
        : "";
      lines.push(`  ${c.COLUMN_NAME}: ${ts}${opt};${lineComment}`);
    }
    lines.push("}");
    lines.push("```");
    lines.push("");

    const outPath = path.join(OUT_DIR, safeFileName(tableName));
    fs.writeFileSync(outPath, lines.join("\n"), "utf8");
    console.log("写入", path.relative(ROOT, outPath));
  }

  const indexLines = [];
  indexLines.push(`# 数据库 \`${config.database}\` 表清单`);
  indexLines.push("");
  indexLines.push("由 `scripts/extract-otel-doris-schema.mjs` 从 Doris 抽取。");
  indexLines.push("");
  indexLines.push("| 表名 | 文档 |");
  indexLines.push("|------|------|");
  for (const row of tables) {
    const name = row.TABLE_NAME;
    indexLines.push(`| \`${name}\` | [${safeFileName(name)}](./${encodeURIComponent(safeFileName(name))}) |`);
  }
  indexLines.push("");
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), indexLines.join("\n"), "utf8");
  console.log("写入", path.relative(ROOT, path.join("datamodel", "otel", "README.md")));

  await conn.end();
}

function toPascalCase(name) {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("") || "Row";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
