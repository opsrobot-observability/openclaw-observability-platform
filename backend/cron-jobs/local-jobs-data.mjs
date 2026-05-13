/**
 * 读取仓库 `data/jobs.json` 与 `data/<jobId>.jsonl`（任务运行事件流）。
 * 数据模型见 docs/datamodel/jobs-json.md、docs/datamodel/job-run-events-jsonl.md。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const JOBS_JSON = path.join(DATA_DIR, "jobs.json");

/** UUID v4（宽松匹配 job 文件名片段） */
const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string | undefined | null} jobId
 * @returns {string}
 */
export function assertSafeJobId(jobId) {
  const s = String(jobId ?? "").trim();
  if (!JOB_ID_RE.test(s)) {
    throw new Error("invalid jobId");
  }
  return s;
}

/**
 * @returns {{ version: number, jobs: unknown[], _meta?: { path: string, missingFile?: boolean } }}
 */
export function readLocalJobsDocument() {
  if (!fs.existsSync(JOBS_JSON)) {
    return { version: 0, jobs: [], _meta: { path: JOBS_JSON, missingFile: true } };
  }
  const raw = fs.readFileSync(JOBS_JSON, "utf8");
  const doc = JSON.parse(raw);
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.jobs)) {
    throw new Error("invalid jobs.json: expected { version, jobs[] }");
  }
  return {
    version: Number(doc.version) || 0,
    jobs: doc.jobs,
    _meta: { path: JOBS_JSON },
  };
}

const MAX_TAIL = 200;
const MAX_STABILITY_ALL = 20000;

/**
 * @param {string} jobId
 * @param {{ limit?: number, all?: boolean }} [opts]
 * @returns {{ jobId: string, events: object[], totalLines: number, _meta: { path: string, missingFile?: boolean } }}
 */
export function readJobRunEvents(jobId, opts = {}) {
  const id = assertSafeJobId(jobId);
  const all = Boolean(opts.all);
  const p = path.join(DATA_DIR, `${id}.jsonl`);
  if (!fs.existsSync(p)) {
    return { jobId: id, events: [], totalLines: 0, _meta: { path: p, missingFile: true } };
  }
  const text = fs.readFileSync(p, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const totalLines = lines.length;
  /** @type {string[]} */
  let slice;
  if (all) {
    slice = lines.length > MAX_STABILITY_ALL ? lines.slice(-MAX_STABILITY_ALL) : lines;
  } else {
    const limit = Math.min(MAX_TAIL, Math.max(1, Number(opts.limit) || 50));
    slice = lines.slice(Math.max(0, lines.length - limit));
  }
  /** @type {object[]} */
  const events = [];
  for (const line of slice) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // 跳过坏行
    }
  }
  events.sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0));
  return { jobId: id, events, totalLines, _meta: { path: p } };
}
