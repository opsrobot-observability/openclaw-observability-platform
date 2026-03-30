import { useMemo } from "react";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 用于 datetime-local 的 value */
export function toDatetimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseLocalMs(s) {
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.getTime();
}

/**
 * datetime-local 区间 → Doris 按日 YYYY-MM-DD（本地日历日，含首尾整日）
 * @returns {{ startDay: string, endDay: string } | null}
 */
export function rangeToDayBounds(rangeStart, rangeEnd) {
  const s = parseLocalMs(rangeStart);
  const e = parseLocalMs(rangeEnd);
  if (s == null || e == null || s > e) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const sd = new Date(s);
  const ed = new Date(e);
  return {
    startDay: `${sd.getFullYear()}-${pad(sd.getMonth() + 1)}-${pad(sd.getDate())}`,
    endDay: `${ed.getFullYear()}-${pad(ed.getMonth() + 1)}-${pad(ed.getDate())}`,
  };
}

export function defaultRangeLastDays(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
}

/**
 * 成本类页面通用：时间范围 + 快捷预设
 */
export default function CostTimeRangeFilter({
  rangeStart,
  rangeEnd,
  onChangeStart,
  onChangeEnd,
  className = "",
}) {
  const presets = useMemo(
    () => [
      { label: "近 7 日", days: 7 },
      { label: "近 30 日", days: 30 },
      { label: "近 90 日", days: 90 },
    ],
    []
  );

  function applyPreset(days) {
    const { start, end } = defaultRangeLastDays(days);
    onChangeStart(start);
    onChangeEnd(end);
  }

  const invalid = useMemo(() => {
    const a = parseLocalMs(rangeStart);
    const b = parseLocalMs(rangeEnd);
    return a == null || b == null || a > b;
  }, [rangeStart, rangeEnd]);

  return (
    <div
      className={[
        "rounded-lg border border-gray-100 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-900/50",
        className,
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-gray-600">统计时间</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-200 transition hover:bg-primary-soft hover:text-primary hover:ring-primary/25 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-primary/20"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">开始时间</span>
            <input
              type="datetime-local"
              value={rangeStart}
              onChange={(e) => onChangeStart(e.target.value)}
              className="app-input min-w-0 flex-1 px-3 sm:min-w-[200px]"
            />
          </label>
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">结束时间</span>
            <input
              type="datetime-local"
              value={rangeEnd}
              onChange={(e) => onChangeEnd(e.target.value)}
              className="app-input min-w-0 flex-1 px-3 sm:min-w-[200px]"
            />
          </label>
        </div>
      </div>
      {invalid && (
        <p className="mt-3 text-xs text-rose-600">请选择有效时间区间（结束时间需不早于开始时间）</p>
      )}
    </div>
  );
}

/** 判断统计归属日（YYYY-MM-DD）是否与 [startMs, endMs] 有交集 */
export function rowInTimeRange(statDateStr, startMs, endMs) {
  const parts = statDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
  const [y, mo, dd] = parts;
  const dayStart = new Date(y, mo - 1, dd, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(y, mo - 1, dd, 23, 59, 59, 999).getTime();
  return dayEnd >= startMs && dayStart <= endMs;
}
