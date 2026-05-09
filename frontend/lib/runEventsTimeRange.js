/** 任务详情运行事件：统计时间快捷（24h / 7 / 30 / 日），与 `TaskDetailRunEventsTimeRangeFilter` 默认一致 */
export const RUN_EVENTS_TIME_RANGE_PRESETS = [
  { labelKey: "timeFilter.last24Hours", hours: 24 },
  { labelKey: "timeFilter.last7Days", days: 7 },
  { labelKey: "timeFilter.last30Days", days: 30 },
  { labelKey: "timeFilter.last90Days", days: 90 },
];

/** @param {string | null | undefined} s datetime-local 值 `YYYY-MM-DDTHH:mm` */
export function parseDateTimeLocalInput(s) {
  if (s == null || String(s).trim() === "") return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : null;
}

/**
 * 单次运行事件的时间锚点（毫秒），用于按日聚合与时间窗过滤。
 * 兼容 number、数字字符串、ISO / 常见日期字符串（与 Doris / JSON 序列化一致）。
 * @param {object | null | undefined} ev
 * @returns {number} 无法解析时为 NaN
 */
export function parseRunEventAnchorMs(ev) {
  if (ev == null || typeof ev !== "object") return NaN;
  const v = ev.runAtMs ?? ev.ts;
  if (v == null) return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (s === "") return NaN;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const p = Date.parse(s);
  return Number.isFinite(p) ? p : NaN;
}

/**
 * 按 `runAtMs` / `ts` 落在 [fromMs, toMs] 内过滤（与任务详情「统计时间」窗口一致）。
 * @param {object[]} events
 * @param {string} rangeStartLocal
 * @param {string} rangeEndLocal
 */
export function filterRunEventsByTimeRange(events, rangeStartLocal, rangeEndLocal) {
  const list = Array.isArray(events) ? events : [];
  const fromMs = parseDateTimeLocalInput(rangeStartLocal);
  const toMs = parseDateTimeLocalInput(rangeEndLocal);
  if (fromMs == null && toMs == null) return list;
  return list.filter((ev) => {
    const anchor = parseRunEventAnchorMs(ev);
    if (fromMs != null && (!Number.isFinite(anchor) || anchor < fromMs)) return false;
    if (toMs != null && (!Number.isFinite(anchor) || anchor > toMs)) return false;
    return true;
  });
}
