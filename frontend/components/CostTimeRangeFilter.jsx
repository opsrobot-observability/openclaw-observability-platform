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

const TIME_PRESETS = [
  { labelKey: "timeFilter.last7Days", days: 7 },
  { labelKey: "timeFilter.last30Days", days: 30 },
  { labelKey: "timeFilter.last90Days", days: 90 },
];

export default function CostTimeRangeFilter({
  activeDays,
  onPreset,
  rangeStart,
  rangeEnd,
  onRangeChange,
  className = "",
}) {
  const computed = useMemo(() => {
    const now = new Date();
    const end = now;
    const start = new Date(now.getTime() - (activeDays ?? 7) * 86400000);
    return { start, end };
  }, [activeDays]);

  const toInputVal = (d) => {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!dt || Number.isNaN(dt.getTime())) return "";
    return toDatetimeLocalValue(dt);
  };

  const startValue = rangeStart ? toInputVal(rangeStart) : toInputVal(computed.start);
  const endValue = rangeEnd ? toInputVal(rangeEnd) : toInputVal(computed.end);

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
        <div className="flex gap-1.5">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => onPreset(p.days)}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeDays === p.days
                  ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                  : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
              ].join(" ")}
            >
              {intl.get(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{intl.get("timeFilter.startTime")}</span>
          <input
            type="datetime-local"
            value={startValue}
            onChange={handleStartChange}
            className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none transition-colors focus:border-primary/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:focus:border-primary/40"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{intl.get("timeFilter.endTime")}</span>
          <input
            type="datetime-local"
            value={endValue}
            onChange={handleEndChange}
            className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none transition-colors focus:border-primary/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:focus:border-primary/40"
          />
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
