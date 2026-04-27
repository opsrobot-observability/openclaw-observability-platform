/**
 * 独立 `node backend/*.mjs` 进程默认不会读 `.env`；在入口最早调用一次，合并项目根目录环境变量（不覆盖已有 process.env）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} text */
function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (!key) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let loaded = false;

/**
 * @param {string} entryMetaUrl 入口文件的 `import.meta.url`（用于定位项目根：其所在目录的上一级）
 */
export function loadRootEnvOnce(entryMetaUrl) {
  if (loaded) return;
  loaded = true;
  const dir = path.dirname(fileURLToPath(entryMetaUrl));
  const root = path.resolve(dir, "..");
  const merged = {
    ...parseEnvText(
      fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "",
    ),
    ...parseEnvText(
      fs.existsSync(path.join(root, ".env.local"))
        ? fs.readFileSync(path.join(root, ".env.local"), "utf8")
        : "",
    ),
  };
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
