/**
 * 为任务列表从 `data/<jobId>.jsonl` 计算汇总字段（与前端「运行历史」成功/失败口径一致）。
 * 超大文件仅扫描尾部若干行做 ok/fail/耗时/Token 等统计；`totalLines` 仍为文件非空行总数。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertSafeJobId } from "./local-jobs-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(REPO_ROOT, "data");

const MAX_LINES_SCAN = 12_000;

/** @param {unknown} status */
function isRunSuccessStatus(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "success" || s === "succeeded" || s === "ok" || s === "completed";
}

/** @param {unknown} status */
function isRunFailureStatus(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "error" || s === "failed" || s === "failure";
}

/** @param {unknown} ev */
function extractUsageTokens(ev) {
  const u = ev?.usage;
  if (!u || typeof u !== "object") return { in: null, out: null, total: null };
  const rawIn = u.input_tokens ?? u.prompt_tokens ?? u.inputTokens;
  const rawOut = u.output_tokens ?? u.completion_tokens ?? u.outputTokens;
  const rawTot = u.total_tokens ?? u.totalTokens;
  const inn = Number(rawIn);
  const out = Number(rawOut);
  const tot = rawTot != null && rawTot !== "" ? Number(rawTot) : NaN;
  const inN = Number.isFinite(inn) ? inn : null;
  const outN = Number.isFinite(out) ? out : null;
  const totalN = Number.isFinite(tot) ? tot : null;
  if (inN == null && outN == null && totalN == null) return { in: null, out: null, total: null };
  let ai = inN != null ? inN : 0;
  let ao = outN != null ? outN : 0;
  if (inN != null && outN != null) return { in: ai, out: ao, total: ai + ao };
  if (inN != null && outN == null) {
    if (totalN != null) ao = Math.max(0, totalN - ai);
    return { in: ai, out: ao, total: ai + ao };
  }
  if (outN != null && inN == null) {
    if (totalN != null) ai = Math.max(0, totalN - ao);
    return { in: ai, out: ao, total: ai + ao };
  }
  return { in: totalN, out: 0, total: totalN };
}

/**
 * @param {string} jobId
 * @returns {{
 *   totalLines: number,
 *   sampleSize: number,
 *   truncated: boolean,
 *   okCount: number,
 *   failCount: number,
 *   neutralCount: number,
 *   successRatePct: number | null,
 *   avgDurationMs: number | null,
 *   maxDurationMs: number | null,
 *   totalTokensSum: number | null,
 *   lastRunTokensTotal: number | null,
 *   lastSuccessAtMs: number | null,
 * }}
 */
export function summarizeJobRunFileForList(jobId) {
  const empty = {
    totalLines: 0,
    sampleSize: 0,
    truncated: false,
    okCount: 0,
    failCount: 0,
    neutralCount: 0,
    successRatePct: null,
    avgDurationMs: null,
    maxDurationMs: null,
    totalTokensSum: null,
    lastRunTokensTotal: null,
    lastSuccessAtMs: null,
  };
  let id;
  try {
    id = assertSafeJobId(jobId);
  } catch {
    return { ...empty };
  }
  const p = path.join(DATA_DIR, `${id}.jsonl`);
  if (!fs.existsSync(p)) {
    return { ...empty };
  }
  const text = fs.readFileSync(p, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const totalLines = lines.length;
  if (totalLines === 0) {
    return { ...empty, totalLines: 0 };
  }
  const truncated = totalLines > MAX_LINES_SCAN;
  const scanLines = truncated ? lines.slice(-MAX_LINES_SCAN) : lines;
  /** @type {object[]} */
  const events = [];
  for (const line of scanLines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  const sampleSize = events.length;

  let okCount = 0;
  let failCount = 0;
  let neutralCount = 0;
  let sumDur = 0;
  let nDur = 0;
  let maxDurationMs = null;
  let totalTokensSum = 0;
  let nTok = 0;
  /** @type {number | null} */
  let lastSuccessAtMs = null;
  for (const ev of events) {
    if (isRunSuccessStatus(ev?.status)) okCount += 1;
    else if (isRunFailureStatus(ev?.status)) failCount += 1;
    else neutralCount += 1;

    const d = Number(ev?.durationMs);
    if (Number.isFinite(d) && d >= 0) {
      sumDur += d;
      nDur += 1;
      maxDurationMs = maxDurationMs == null ? d : Math.max(maxDurationMs, d);
    }

    const tok = extractUsageTokens(ev);
    if (tok.total != null && Number.isFinite(tok.total)) {
      totalTokensSum += tok.total;
      nTok += 1;
    }

    if (isRunSuccessStatus(ev?.status)) {
      const anchor = Number(ev?.runAtMs ?? ev?.ts ?? 0);
      if (Number.isFinite(anchor) && anchor > 0) {
        lastSuccessAtMs = lastSuccessAtMs == null ? anchor : Math.max(lastSuccessAtMs, anchor);
      }
    }
  }

  const terminal = okCount + failCount;
  const successRatePct = terminal > 0 ? Math.round((okCount / terminal) * 1000) / 10 : null;
  const avgDurationMs = nDur > 0 ? sumDur / nDur : null;

  const byTsDesc = [...events].sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0));
  let lastRunTokensTotal = null;
  for (const ev of byTsDesc) {
    const tok = extractUsageTokens(ev);
    if (tok.total != null && Number.isFinite(tok.total)) {
      lastRunTokensTotal = tok.total;
      break;
    }
  }

  return {
    totalLines,
    sampleSize,
    truncated,
    okCount,
    failCount,
    neutralCount,
    successRatePct,
    avgDurationMs,
    maxDurationMs,
    totalTokensSum: nTok > 0 ? totalTokensSum : null,
    lastRunTokensTotal,
    lastSuccessAtMs,
  };
}

/**
 * @param {unknown[]} jobs
 * @returns {unknown[]}
 */
export function attachListRunSummariesToJobs(jobs) {
  if (!Array.isArray(jobs)) return [];
  return jobs.map((j) => {
    if (!j || typeof j !== "object" || !j.id) return j;
    const listRunSummary = summarizeJobRunFileForList(String(j.id));
    return { ...j, listRunSummary };
  });
}
