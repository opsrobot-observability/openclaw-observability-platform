/** @param {number} ms */
function dayKeyFromMs(ms) {
  const d = new Date(Number(ms));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {unknown} ev */
export function extractUsageTokens(ev) {
  const u = ev?.usage;
  if (!u || typeof u !== "object") return { in: null, out: null, total: null };
  const rawIn = /** @type {any} */ (u).input_tokens ?? /** @type {any} */ (u).prompt_tokens ?? /** @type {any} */ (u).inputTokens;
  const rawOut = /** @type {any} */ (u).output_tokens ?? /** @type {any} */ (u).completion_tokens ?? /** @type {any} */ (u).outputTokens;
  const rawTot = /** @type {any} */ (u).total_tokens ?? /** @type {any} */ (u).totalTokens;
  const inn = Number(rawIn);
  const out = Number(rawOut);
  const tot = rawTot != null && rawTot !== "" ? Number(rawTot) : NaN;
  const inN = Number.isFinite(inn) ? inn : null;
  const outN = Number.isFinite(out) ? out : null;
  const totalN = Number.isFinite(tot) ? tot : null;

  if (inN == null && outN == null && totalN == null) return { in: null, out: null, total: null };

  /** 统一为 in + out === total，便于汇总卡与图表一致（写入方 total 可能与分项和不一致时，以可拆分为准） */
  let ai = inN != null ? inN : 0;
  let ao = outN != null ? outN : 0;

  if (inN != null && outN != null) {
    // 两项齐全：分项和为权威 total
    return { in: ai, out: ao, total: ai + ao };
  }
  if (inN != null && outN == null) {
    if (totalN != null) ao = Math.max(0, totalN - ai);
    return { in: ai, out: ao, total: ai + ao };
  }
  if (outN != null && inN == null) {
    if (totalN != null) ai = Math.max(0, totalN - ao);
    return { in: ai, out: ao, total: ai + ao };
  }
  // 仅有 total（分项均未给；行 24 已排除全空，此处 totalN 必存在）
  return { in: totalN, out: 0, total: totalN };
}

/** @param {object[]} events */
export function aggregateTokenUsage(events) {
  const list = Array.isArray(events) ? events : [];
  let sumIn = 0;
  let sumOut = 0;
  let sumTotal = 0;
  let rowsWithUsage = 0;
  let maxSingleRunTotal = 0;
  let sawUsage = false;
  for (const ev of list) {
    const t = extractUsageTokens(ev);
    if (t.in == null && t.out == null && t.total == null) continue;
    rowsWithUsage += 1;
    sumIn += t.in ?? 0;
    sumOut += t.out ?? 0;
    const rowTot = t.total ?? (t.in ?? 0) + (t.out ?? 0);
    sumTotal += t.total ?? 0;
    if (Number.isFinite(rowTot)) {
      sawUsage = true;
      if (rowTot > maxSingleRunTotal) maxSingleRunTotal = rowTot;
    }
  }
  return {
    sumIn,
    sumOut,
    sumTotal,
    rowsWithUsage,
    maxSingleRunTotal: sawUsage ? maxSingleRunTotal : null,
  };
}

/** @param {number | null} n */
export function formatTokenInt(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

/** @param {object[]} events */
export function uniqueModelsFromEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const s = new Set();
  for (const ev of list) {
    const m = ev?.model;
    if (m != null && String(m).trim()) s.add(String(m).trim());
  }
  return [...s].sort();
}

/**
 * 按日历日汇总 Input / Output token（用于堆叠柱）。
 * @param {object[]} events
 */
export function buildDailyTokenStack(events) {
  const list = Array.isArray(events) ? events : [];
  /** @type {Map<string, { in: number, out: number }>} */
  const map = new Map();
  for (const ev of list) {
    const t = extractUsageTokens(ev);
    if (t.in == null && t.out == null) continue;
    const ms = Number(ev?.runAtMs ?? ev?.ts ?? 0);
    if (!Number.isFinite(ms)) continue;
    const day = dayKeyFromMs(ms);
    const inV = t.in != null ? t.in : 0;
    const outV = t.out != null ? t.out : 0;
    const cur = map.get(day) ?? { in: 0, out: 0 };
    cur.in += inV;
    cur.out += outV;
    map.set(day, cur);
  }
  const dates = [...map.keys()].sort();
  return {
    dates,
    inputData: dates.map((d) => map.get(d).in),
    outputData: dates.map((d) => map.get(d).out),
  };
}

/**
 * 汇总 Input / Output（用于饼图）。
 * @param {object[]} events
 */
export function sumInputOutputTokens(events) {
  const list = Array.isArray(events) ? events : [];
  let inSum = 0;
  let outSum = 0;
  for (const ev of list) {
    const t = extractUsageTokens(ev);
    if (t.in != null) inSum += t.in;
    if (t.out != null) outSum += t.out;
  }
  return { inSum, outSum };
}

const EMPTY_MODEL_KEY = "__empty_model__";

/**
 * 按模型汇总 total token（饼图）。无 model 的行归入 EMPTY_MODEL_KEY，由展示层映射为「未标注」等文案。
 * @param {object[]} events
 * @returns {{ key: string, tokens: number }[]}
 */
export function sumTokensByModel(events) {
  const list = Array.isArray(events) ? events : [];
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const ev of list) {
    const t = extractUsageTokens(ev);
    if (t.in == null && t.out == null && t.total == null) continue;
    const rowTotal = t.total ?? (t.in ?? 0) + (t.out ?? 0);
    if (!Number.isFinite(rowTotal) || rowTotal <= 0) continue;
    const raw = ev?.model;
    const key = raw != null && String(raw).trim() !== "" ? String(raw).trim() : EMPTY_MODEL_KEY;
    map.set(key, (map.get(key) ?? 0) + rowTotal);
  }
  return [...map.entries()]
    .map(([key, tokens]) => ({ key, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
}

export { EMPTY_MODEL_KEY };
