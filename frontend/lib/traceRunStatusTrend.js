import { isRunFailureStatus, isRunSuccessStatus } from "./jobStabilityMetrics.js";
import { parseDateTimeLocalInput, parseRunEventAnchorMs } from "./runEventsTimeRange.js";

/** @param {number} ms */
function dayKeyFromMs(ms) {
  const d = new Date(Number(ms));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 统计时间起止（毫秒）对应的所有本地自然日键，含首尾。
 * @param {number} fromMs
 * @param {number} toMs
 */
function enumerateCalendarDaysInclusive(fromMs, toMs) {
  let a = fromMs;
  let b = toMs;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  const start = new Date(a);
  start.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  const keys = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    keys.push(dayKeyFromMs(cur.getTime()));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

/**
 * @param {unknown} status
 * @returns {"ok" | "fail" | "progress" | "other"}
 */
function bucketRunStatus(status) {
  if (isRunSuccessStatus(status)) return "ok";
  if (isRunFailureStatus(status)) return "fail";
  const s = String(status ?? "").toLowerCase();
  if (s === "running" || s === "pending" || s === "started") return "progress";
  return "other";
}

const emptyBucket = () => ({ ok: 0, fail: 0, progress: 0, other: 0 });

/**
 * 运行溯源：按自然日汇总各状态次数（堆叠柱 X 轴）。
 * 传入统计时间范围时，X 轴为该区间内全部日历日（无数据为 0），与任务详情「统计时间」一致。
 * @param {object[]} events 已按时间范围过滤的运行事件
 * @param {string | null | undefined} [rangeStartLocal] datetime-local 起始
 * @param {string | null | undefined} [rangeEndLocal] datetime-local 结束
 */
export function analyzeTraceStatusTrend(events, rangeStartLocal, rangeEndLocal) {
  const list = Array.isArray(events) ? events : [];
  const fromMs = parseDateTimeLocalInput(rangeStartLocal);
  const toMs = parseDateTimeLocalInput(rangeEndLocal);
  const fillRange = fromMs != null && toMs != null && Number.isFinite(fromMs) && Number.isFinite(toMs);

  /** @type {Map<string, ReturnType<typeof emptyBucket>>} */
  const dayMap = new Map();

  for (const ev of list) {
    const ms = parseRunEventAnchorMs(ev);
    if (!Number.isFinite(ms)) continue;
    const day = dayKeyFromMs(ms);
    if (!dayMap.has(day)) dayMap.set(day, emptyBucket());
    const b = dayMap.get(day);
    if (!b) continue;
    const k = bucketRunStatus(ev?.status);
    b[k] += 1;
  }

  /** @type {string[]} */
  let dates;
  if (fillRange) {
    dates = enumerateCalendarDaysInclusive(fromMs, toMs);
    for (const dk of dates) {
      if (!dayMap.has(dk)) dayMap.set(dk, emptyBucket());
    }
  } else {
    dates = [...dayMap.keys()].sort();
  }

  const daily = dates.map((date) => {
    const x = dayMap.get(date) ?? emptyBucket();
    return {
      date,
      ok: x.ok,
      fail: x.fail,
      progress: x.progress,
      other: x.other,
    };
  });

  return { daily };
}
