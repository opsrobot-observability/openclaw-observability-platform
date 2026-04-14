/**
 * 独立 `node backend/*.mjs` 启动时不会经过 Vite，需手动读取项目根目录 `.env`。
 * 仅当 `process.env[key]` 尚未设置时写入（与 dotenv 行为一致，便于 shell 覆盖）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadDotenvFromCwd() {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf-8");
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
