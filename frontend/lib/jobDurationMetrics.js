/**
 * @param {object[]} events
 * @returns {{ t: number, ts: number, d: number }[]}
 */
function collectDurationPoints(events) {
  const list = Array.isArray(events) ? events : [];
  /** @type {{ t: number, ts: number, d: number }[]} */
  const pts = [];
  for (const ev of list) {
    const d = Number(ev?.durationMs);
    if (!Number.isFinite(d) || d < 0) continue;
    const t = Number(ev?.runAtMs ?? ev?.ts ?? 0);
    const ts = Number(ev?.ts ?? 0);
    pts.push({
      t: Number.isFinite(t) ? t : 0,
      ts: Number.isFinite(ts) ? ts : 0,
      d,
    });
  }
  return pts;
}

/**
 * @param {object[]} events
 * @returns {{ avg: number | null, max: number | null, min: number | null, last: number | null, count: number }}
 */
export function aggregateDurationStats(events) {
  const pts = collectDurationPoints(events);
  if (!pts.length) return { avg: null, max: null, min: null, last: null, count: 0 };
  const ds = pts.map((p) => p.d);
  const sum = ds.reduce((a, b) => a + b, 0);
  let best = pts[0];
  for (const p of pts) {
    if (p.t > best.t || (p.t === best.t && p.ts >= best.ts)) best = p;
  }
  return {
    avg: sum / ds.length,
    max: Math.max(...ds),
    min: Math.min(...ds),
    last: best.d,
    count: ds.length,
  };
}

/**
 * 折线图：按 runAtMs（同刻用 ts）升序，每点 [时间戳 ms, 耗时 ms]。
 * @param {object[]} events
 * @returns {[number, number][]}
 */
export function buildDurationTrendPairs(events) {
  const pts = collectDurationPoints(events);
  pts.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.ts - b.ts));
  return pts.map((p) => [p.t, p.d]);
}

/** i18n 键：与 `buildDurationHistogram` 返回顺序一致（固定 7 档） */
export const DURATION_HISTOGRAM_LABEL_KEYS = [
  "scheduledTasks.taskDetail.performance.histBin0to15s",
  "scheduledTasks.taskDetail.performance.histBin15sto1m",
  "scheduledTasks.taskDetail.performance.histBin1to5m",
  "scheduledTasks.taskDetail.performance.histBin5to10m",
  "scheduledTasks.taskDetail.performance.histBin10to30m",
  "scheduledTasks.taskDetail.performance.histBin30mto2h",
  "scheduledTasks.taskDetail.performance.histBinOver2h",
];

/** @param {number} d duration ms */
function durationHistogramBucketIndex(d) {
  if (d < 15_000) return 0;
  if (d < 60_000) return 1;
  if (d < 300_000) return 2;
  if (d < 600_000) return 3;
  if (d < 1_800_000) return 4;
  if (d <= 7_200_000) return 5;
  return 6;
}

/**
 * 耗时直方图：固定区间分桶（与产品口径一致）。
 * 边界：左闭；「30分钟～2小时」含 2 小时整；「2小时以上」为大于 2 小时。
 * @param {object[]} events
 * @returns {{ labelKeys: string[], values: number[] }}
 */
export function buildDurationHistogram(events) {
  const pts = collectDurationPoints(events);
  const ds = pts.map((p) => p.d);
  if (!ds.length) return { labelKeys: [], values: [] };
  const counts = new Array(7).fill(0);
  for (const d of ds) {
    counts[durationHistogramBucketIndex(d)] += 1;
  }
  return { labelKeys: [...DURATION_HISTOGRAM_LABEL_KEYS], values: counts };
}

const DEFAULT_TOP_DURATION = 10;

/**
 * 含有效 `durationMs` 的记录全部按耗时降序排列（同耗时则按 runAtMs、ts 较新在前）。
 * @param {object[]} events
 * @returns {{ durationMs: number, runAtMs: unknown, ts: unknown, status: unknown, model: unknown }[]}
 */
export function listRunsByDurationMsDesc(events) {
  const list = Array.isArray(events) ? events : [];
  /** @type {{ d: number, runAtMs: number, ts: number, ev: object }[]} */
  const scored = [];
  for (const ev of list) {
    const d = Number(ev?.durationMs);
    if (!Number.isFinite(d) || d < 0) continue;
    const runAtMs = Number(ev?.runAtMs ?? 0);
    const ts = Number(ev?.ts ?? 0);
    scored.push({
      d,
      runAtMs: Number.isFinite(runAtMs) ? runAtMs : 0,
      ts: Number.isFinite(ts) ? ts : 0,
      ev,
    });
  }
  scored.sort((a, b) => {
    if (b.d !== a.d) return b.d - a.d;
    if (b.runAtMs !== a.runAtMs) return b.runAtMs - a.runAtMs;
    return b.ts - a.ts;
  });
  return scored.map(({ d, ev }) => ({
    durationMs: d,
    runAtMs: ev?.runAtMs,
    ts: ev?.ts,
    status: ev?.status,
    model: ev?.model,
  }));
}

/**
 * 含有效 `durationMs` 的记录中，按耗时降序取前若干条（同耗时则按 runAtMs、ts 较新在前）。
 * @param {object[]} events
 * @param {number} [limit=10]
 * @returns {{ durationMs: number, runAtMs: unknown, ts: unknown, status: unknown, model: unknown }[]}
 */
export function topRunsByDurationMs(events, limit = DEFAULT_TOP_DURATION) {
  const all = listRunsByDurationMsDesc(events);
  const n = Math.max(0, Math.min(Number(limit) || DEFAULT_TOP_DURATION, 50));
  return all.slice(0, n);
}

/** @param {number | null | undefined} ms */
export function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}
