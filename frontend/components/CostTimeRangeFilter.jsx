import { useMemo } from "react";
import intl from "react-intl-universal";
import Icon from "./Icon.jsx";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDatetimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseLocalMs(s) {
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.getTime();
}

export function rangeToDayBounds(rangeStart, rangeEnd) {
  const s = parseLocalMs(rangeStart);
  const e = parseLocalMs(rangeEnd);
  if (s == null || e == null || s > e) return null;
  const p = (n) => String(n).padStart(2, "0");
  const sd = new Date(s);
  const ed = new Date(e);
  return {
    startDay: `${sd.getFullYear()}-${p(sd.getMonth() + 1)}-${p(sd.getDate())}`,
    endDay: `${ed.getFullYear()}-${p(ed.getMonth() + 1)}-${p(ed.getDate())}`,
  };
}

export function defaultRangeLastDays(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
}

/** 最近 N 小时（结束为当前时刻，与 defaultRangeLastDays 同格式） */
export function defaultRangeLastHours(hours) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
}

const TIME_PRESETS = [
  { labelKey: "timeFilter.last7Days", days: 7 },
  { labelKey: "timeFilter.last30Days", days: 30 },
  { labelKey: "timeFilter.last90Days", days: 90 },
];

/** @param {{ labelKey: string, days?: number, hours?: number }} p */
function presetButtonActive(p, activeDays, activePresetHours, highlightPresets) {
  if (!highlightPresets) return false;
  if (p.hours != null) return activePresetHours != null && activePresetHours === p.hours;
  return activePresetHours == null && activeDays === p.days;
}

export default function CostTimeRangeFilter({
  activeDays,
  /** 与按天预设互斥：选中「最近 N 小时」类预设时传入 N */
  activePresetHours,
  /** 覆盖默认 7/30/90 日；项为 `{ labelKey, days }` 或 `{ labelKey, hours }` */
  presets = null,
  onPreset,
  rangeStart,
  rangeEnd,
  onRangeChange,
  className = "",
  /** 为 true 时开始/结束为可编辑的 `datetime-local`（`YYYY-MM-DDTHH:mm`），须传入受控的 rangeStartLocal / rangeEndLocal 与 onRangeLocalChange */
  allowCustomRange = false,
  rangeStartLocal = "",
  rangeEndLocal = "",
  onRangeLocalChange,
  /** 为 false 时不高亮快捷天数（例如用户已选自定义区间） */
  highlightPresets = true,
}) {
  const computed = useMemo(() => {
    const now = new Date();
    const end = now;
    const d = activeDays ?? 7;
    const start = new Date(now.getTime() - d * 86400000);
    return { start, end };
  }, [activeDays]);

  const toInputVal = (d) => {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!dt || Number.isNaN(dt.getTime())) return "";
    return toDatetimeLocalValue(dt);
  };

  const startValue = rangeStart ? toInputVal(rangeStart) : toInputVal(computed.start);
  const endValue = rangeEnd ? toInputVal(rangeEnd) : toInputVal(computed.end);
  const startDisplay = startValue ? startValue.replace("T", " ") : "";
  const endDisplay = endValue ? endValue.replace("T", " ") : "";

  const handleStartChange = (e) => {
    if (onRangeChange) {
      onRangeChange(e.target.value, endValue);
    }
  };

  const handleEndChange = (e) => {
    if (onRangeChange) {
      onRangeChange(startValue, e.target.value);
    }
  };

  return (
    <div
      className={[
        "app-card flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("timeFilter.statisticTime")}</span>
        <div className="flex flex-wrap gap-1.5">
          {(presets ?? TIME_PRESETS).map((p) => (
            <button
              key={p.days != null ? `d${p.days}` : `h${p.hours}`}
              type="button"
              onClick={() => {
                if (p.hours != null) onPreset?.({ hours: p.hours });
                else onPreset?.({ days: p.days });
              }}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                presetButtonActive(p, activeDays, activePresetHours, highlightPresets)
                  ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                  : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
              ].join(" ")}
            >
              {intl.get(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{intl.get("timeFilter.startTime")}</span>
          {allowCustomRange ? (
            <input
              type="datetime-local"
              value={rangeStartLocal}
              onChange={(e) => onRangeLocalChange?.(e.target.value, rangeEndLocal)}
              className="app-input min-w-0 flex-1 text-xs sm:min-w-[11rem] sm:flex-none sm:w-44"
            />
          ) : (
            <div className="relative">
              <input
                type="text"
                readOnly
                value={startDisplay}
                className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Icon name="clock" className="h-3.5 w-3.5" />
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{intl.get("timeFilter.endTime")}</span>
          {allowCustomRange ? (
            <input
              type="datetime-local"
              value={rangeEndLocal}
              onChange={(e) => onRangeLocalChange?.(rangeStartLocal, e.target.value)}
              className="app-input min-w-0 flex-1 text-xs sm:min-w-[11rem] sm:flex-none sm:w-44"
            />
          ) : (
            <div className="relative">
              <input
                type="text"
                readOnly
                value={endDisplay}
                className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Icon name="clock" className="h-3.5 w-3.5" />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export function rowInTimeRange(statDateStr, startMs, endMs) {
  const parts = statDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
  const [y, mo, dd] = parts;
  const dayStart = new Date(y, mo - 1, dd, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(y, mo - 1, dd, 23, 59, 59, 999).getTime();
  return dayEnd >= startMs && dayStart <= endMs;
}
