/**
 * 已合并到 `scripts/write-cron-jobs-md.mjs`（生成 `docs/datamodel/cron_jobs.md`）。
 * 保留本入口以便旧命令习惯：`node scripts/introspect-cron-jobs.mjs` 等价于写文档脚本。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, "write-cron-jobs-md.mjs");
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
