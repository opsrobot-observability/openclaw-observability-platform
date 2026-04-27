/**
 * 查询 host_metric_sum 和 host_metric_gauge 表结构
 * 用法：node scripts/query-host-metrics-schema.mjs
 */
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

const config = {
  host: process.env.DORIS_HOST || "192.168.40.128",
  port: Number(process.env.DORIS_PORT) || 9030,
  user: process.env.DORIS_USER || "root",
  password: process.env.DORIS_PASSWORD || "",
  database: process.env.DORIS_DATABASE || "opsRobot",
};

async function main() {
  console.log("正在连接数据库:", config.host, config.port);
  
  const conn = await mysql.createConnection({
    ...config,
    connectTimeout: 30000,
  });

  try {
    // 查询表是否存在
    const [tables] = await conn.query(
      `SELECT TABLE_NAME, TABLE_COMMENT 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? 
         AND (TABLE_NAME LIKE 'host_metrics%' OR TABLE_NAME IN ('host_metric_sum', 'host_metric_gauge'))
       ORDER BY TABLE_NAME`,
      [config.database]
    );

    if (tables.length === 0) {
      console.log("⚠️  未找到 host_metric_sum 或 host_metric_gauge 表");
      
      // 列出所有表
      const [allTables] = await conn.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
        [config.database]
      );
      console.log("\n当前数据库中的所有表:");
      allTables.forEach(t => console.log(`  - ${t.TABLE_NAME}`));
      return;
    }

    console.log("\n✅ 找到以下主机监控相关表:");
    
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📋 表名: ${tableName}`);
      if (table.TABLE_COMMENT) {
        console.log(`   注释: ${table.TABLE_COMMENT}`);
      }
      console.log(`${'='.repeat(80)}`);

      // 查询列信息
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
                COLUMN_KEY, EXTRA, COLUMN_COMMENT, ORDINAL_POSITION
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [config.database, tableName]
      );

      console.log("\n📊 字段定义:");
      console.log("| 序号 | 字段名 | 数据类型 | 可空 | 默认值 | 键 | 注释 |");
      console.log("|------|--------|----------|------|--------|-----|------|");

      for (const col of cols) {
        const comment = col.COLUMN_COMMENT || "—";
        console.log(
          `| ${col.ORDINAL_POSITION} | \`${col.COLUMN_NAME}\` | ${col.COLUMN_TYPE} | ${col.IS_NULLABLE} | ${col.COLUMN_DEFAULT ?? "NULL"} | ${col.COLUMN_KEY || ""} | ${comment} |`
        );
      }

      // 查询示例数据（最多5条）
      const [sampleRows] = await conn.query(
        `SELECT * FROM \`${config.database}\`.\`${tableName}\` LIMIT 5`
      );

      if (sampleRows.length > 0) {
        console.log(`\n📝 示例数据 (${Math.min(sampleRows.length, 5)} 条):`);
        
        for (let i = 0; i < sampleRows.length; i++) {
          const row = sampleRows[i];
          console.log(`\n--- 记录 ${i + 1} ---`);
          
          for (const key of Object.keys(row)) {
            let value = row[key];
            
            // 格式化 JSON 字段
            if (key === 'attributes' || key === 'resource_attributes') {
              if (typeof value === 'string') {
                try {
                  value = JSON.parse(value);
                } catch (e) { /* 不是JSON */ }
              }
              
              if (typeof value === 'object' && value !== null) {
                console.log(`\n  🔑 ${key}:`);
                printJsonTree(value, 2);
              } else {
                console.log(`  ${key}: ${value}`);
              }
            } else if (value instanceof Buffer) {
              console.log(`  ${key}: [Buffer]`);
            } else if (typeof value === 'bigint') {
              console.log(`  ${key}: ${value.toString()}`);
            } else {
              console.log(`  ${key}: ${value}`);
            }
          }
        }
      } else {
        console.log("\n⚠️  表中暂无数据");
      }

      // 统计指标名称
      const [metricNames] = await conn.query(
        `SELECT metric_name, COUNT(*) as cnt
         FROM \`${config.database}\`.\`${tableName}\`
         GROUP BY metric_name
         ORDER BY cnt DESC
         LIMIT 20`
      );

      if (metricNames.length > 0) {
        console.log(`\n📈 指标类型分布 (Top 20):`);
        console.log("| 指标名称 | 记录数 |");
        console.log("|----------|--------|");
        for (const m of metricNames) {
          console.log(`| ${m.metric_name} | ${m.cnt} |`);
        }
      }

      // 统计总记录数
      const [[{ cnt }]] = await conn.query(
        `SELECT COUNT(*) as cnt FROM \`${config.database}\`.\`${tableName}\``
      );
      console.log(`\n📊 总记录数: ${cnt}`);
    }

  } finally {
    await conn.end();
  }
}

function printJsonTree(obj, indent = 0) {
  const prefix = " ".repeat(indent);
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      console.log(`${prefix}${key}:`);
      printJsonTree(value, indent + 2);
    } else if (Array.isArray(value)) {
      console.log(`${prefix}${key}: [${value.length} items]`);
      if (value.length > 0 && typeof value[0] === 'object') {
        printJsonTree(value[0], indent + 2);
        if (value.length > 1) {
          console.log(`${" ".repeat(indent + 2)}... (${value.length - 1} more)`);
        }
      } else {
        console.log(`${prefix}  ${JSON.stringify(value.slice(0, 5))}${value.length > 5 ? ', ...' : ''}`);
      }
    } else {
      console.log(`${prefix}${key}: ${value} (${typeof value})`);
    }
  }
}

main().catch((e) => {
  console.error("❌ 错误:", e.message);
  process.exit(1);
});
