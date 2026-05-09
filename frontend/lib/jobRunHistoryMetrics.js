import { isRunFailureStatus, isRunSuccessStatus } from "./jobStabilityMetrics.js";
import { parseRunEventAnchorMs } from "./runEventsTimeRange.js";

/** @param {number} ms */
function dayKeyFromMs(ms) {
  const d = new Date(Number(ms));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 基于 JSONL 运行事件构建「运行历史」指标与按日序列（用于堆叠柱 + 平均耗时折线）。
 * @param {object[]} events
 */
export function analyzeRunHistory(events) {
  const list = Array.isArray(events) ? events : [];
  let ok = 0;
  let fail = 0;
  let neutral = 0;
  /** @type {Map<string, { ok: number, fail: number, sumMs: number, nDur: number }>} */
  const dayMap = new Map();

  for (const ev of list) {
    const ms = Number(ev?.runAtMs ?? ev?.ts ?? 0);
    const day = Number.isFinite(ms) ? dayKeyFromMs(ms) : null;

    if (isRunSuccessStatus(ev?.status)) ok += 1;
    else if (isRunFailureStatus(ev?.status)) fail += 1;
    else neutral += 1;

    if (day) {
      if (!dayMap.has(day)) {
        dayMap.set(day, { ok: 0, fail: 0, sumMs: 0, nDur: 0 });
      }
      const b = dayMap.get(day);
      if (isRunSuccessStatus(ev?.status)) b.ok += 1;
      else if (isRunFailureStatus(ev?.status)) b.fail += 1;

      const dur = Number(ev?.durationMs);
      if (Number.isFinite(dur) && dur >= 0) {
        b.sumMs += dur;
        b.nDur += 1;
      }
    }
  }

  const dates = [...dayMap.keys()].sort();
  const daily = dates.map((date) => {
    const b = dayMap.get(date);
    const avgMs = b.nDur > 0 ? b.sumMs / b.nDur : null;
    return { date, ok: b.ok, fail: b.fail, avgDurationMs: avgMs };
  });

  const terminal = ok + fail;
  const successRatePct = terminal > 0 ? Math.round((ok / terminal) * 1000) / 10 : null;

  return {
    total: list.length,
    ok,
    fail,
    neutral,
    successRatePct,
    daily,
  };
}

/**
 * 与运行概览接口返回的 `charts.trend` / `charts.range` 对齐，供「每日执行概览」热力图使用。
 * @param {object[]} events 已由父组件按统计时间窗过滤后的运行事件
 * @returns {{ trend: object[], range: { startIso?: string | null, endIso?: string | null } }}
 */
export function buildDailyExecutionChartsFromRunEvents(events) {
  const list = Array.isArray(events) ? events : [];
  /** @type {Map<string, { day: string, successCount: number, failureCount: number, totalCount: number, sumDurationMs: number, durationCount: number }>} */
  const byDay = new Map();
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  for (const ev of list) {
    const anchorMs = Number(ev?.runAtMs ?? ev?.ts);
    if (!Number.isFinite(anchorMs)) continue;
    minMs = Math.min(minMs, anchorMs);
    maxMs = Math.max(maxMs, anchorMs);
    const day = dayKeyFromMs(anchorMs);
    const bucket =
      byDay.get(day) ?? {
        day,
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        sumDurationMs: 0,
        durationCount: 0,
      };
    bucket.totalCount += 1;
    if (isRunSuccessStatus(ev?.status)) bucket.successCount += 1;
    else if (isRunFailureStatus(ev?.status)) bucket.failureCount += 1;
    const dur = Number(ev?.durationMs);
    if (Number.isFinite(dur) && dur >= 0) {
      bucket.sumDurationMs += dur;
      bucket.durationCount += 1;
    }
    byDay.set(day, bucket);
  }

  if (!byDay.size || !Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return { trend: [], range: {} };
  }

  const trend = [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      day: row.day,
      successCount: row.successCount,
      failureCount: row.failureCount,
      totalCount: row.totalCount,
      avgDurationMs: row.durationCount > 0 ? row.sumDurationMs / row.durationCount : null,
    }));

  return {
    trend,
    range: {
      startIso: new Date(minMs).toISOString(),
      endIso: new Date(maxMs).toISOString(),
    },
  };
}
