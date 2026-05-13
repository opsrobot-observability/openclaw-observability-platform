import { isRunFailureStatus, isRunSuccessStatus } from "./jobStabilityMetrics.js";

const DEFAULT_FAILURE_TOP = 15;

/**
 * @param {object[]} events
 * @returns {{ ok: number, bad: number, neutral: number, denom: number, successRatePct: number | null }}
 */
export function aggregateRunResults(events) {
  const list = Array.isArray(events) ? events : [];
  let ok = 0;
  let bad = 0;
  let neutral = 0;
  for (const ev of list) {
    if (isRunSuccessStatus(ev?.status)) ok += 1;
    else if (isRunFailureStatus(ev?.status)) bad += 1;
    else neutral += 1;
  }
  const denom = ok + bad + neutral;
  const successRatePct = denom > 0 ? Math.round((ok / denom) * 1000) / 10 : null;
  return { ok, bad, neutral, denom, successRatePct };
}

/**
 * 按 runAtMs（无则 ts）倒序的最近若干条，供简表展示。
 * @param {object[]} events
 * @param {number} [limit=30]
 */
export function recentRunRows(events, limit = 30) {
  const list = Array.isArray(events) ? [...events] : [];
  list.sort((a, b) => {
    const ra = Number(a?.runAtMs ?? a?.ts ?? 0);
    const rb = Number(b?.runAtMs ?? b?.ts ?? 0);
    if (rb !== ra) return rb - ra;
    return Number(b?.ts ?? 0) - Number(a?.ts ?? 0);
  });
  return list.slice(0, limit);
}

/**
 * 失败事件按 error 文本聚合（去首尾空白、折叠空白；过长截断作为同一键）。
 * @param {object[]} events
 * @param {number} [topN]
 * @returns {{ reason: string, count: number }[]}
 */
export function analyzeFailureReasons(events, topN = DEFAULT_FAILURE_TOP) {
  const list = Array.isArray(events) ? events : [];
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const ev of list) {
    if (!isRunFailureStatus(ev?.status)) continue;
    const raw = ev?.error;
    if (raw == null) continue;
    let key = String(raw).trim().replace(/\s+/g, " ");
    if (!key) continue;
    if (key.length > 240) key = `${key.slice(0, 237)}…`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
