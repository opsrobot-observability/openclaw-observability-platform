import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import intl from "react-intl-universal";
import Icon from "./Icon.jsx";

const INPUT =
  "w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500";

const RELATIVE_TIME_PRESETS = [
  { key: "30s", minutes: 0.5 },
  { key: "1m", minutes: 1 },
  { key: "5m", minutes: 5 },
  { key: "15m", minutes: 15 },
  { key: "30m", minutes: 30 },
  { key: "1h", minutes: 60 },
  { key: "4h", minutes: 240 },
  { key: "6h", minutes: 360 },
  { key: "12h", minutes: 720 },
  { key: "24h", minutes: 1440 },
  { key: "3d", minutes: 4320 },
  { key: "7d", minutes: 10080 },
  { key: "30d", minutes: 43200 },
];

/** 相对时间仅展示「天」粒度：24 小时 + 3/7/30 天（用于日历热力图等按日聚合场景） */
const RELATIVE_PRESET_KEYS_DAY = new Set(["24h", "3d", "7d", "30d"]);

const CALENDAR_TIME_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

function localValueToMs(local) {
  if (!local) return NaN;
  const t = new Date(local).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function startOfWeekMonday(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function resolvePresetRangeMs(timePreset, customStart, customEnd) {
  const now = new Date();
  if (timePreset === "custom") {
    const s = localValueToMs(customStart);
    const e = localValueToMs(customEnd);
    if (Number.isFinite(s) && Number.isFinite(e) && e >= s) return { startMs: s, endMs: e };
    return null;
  }

  if (timePreset === "today") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { startMs: s, endMs: now.getTime() };
  }
  if (timePreset === "yesterday") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
    return { startMs: s, endMs: e };
  }
  if (timePreset === "thisWeek") {
    return { startMs: startOfWeekMonday(now).getTime(), endMs: now.getTime() };
  }
  if (timePreset === "lastWeek") {
    const thisWeekStart = startOfWeekMonday(now);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
    return { startMs: lastWeekStart.getTime(), endMs: lastWeekEnd.getTime() };
  }
  if (timePreset === "thisMonth") {
    return { startMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), endMs: now.getTime() };
  }
  if (timePreset === "lastMonth") {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);
    return { startMs: lastMonthStart.getTime(), endMs: lastMonthEnd.getTime() };
  }
  if (timePreset === "thisYear") {
    return { startMs: new Date(now.getFullYear(), 0, 1).getTime(), endMs: now.getTime() };
  }
  if (timePreset === "lastYear") {
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear(), 0, 1).getTime() - 1;
    return { startMs: lastYearStart.getTime(), endMs: lastYearEnd };
  }

  const def = RELATIVE_TIME_PRESETS.find((x) => x.key === timePreset);
  if (def) {
    return { startMs: now.getTime() - def.minutes * 60_000, endMs: now.getTime() };
  }
  return { startMs: now.getTime() - 24 * 60 * 60_000, endMs: now.getTime() };
}

function presetLabel(preset, customStart, customEnd) {
  if (preset === "custom") {
    if (customStart && customEnd) {
      const s = customStart.length >= 16 ? customStart.slice(0, 16) : customStart;
      const e = customEnd.length >= 16 ? customEnd.slice(0, 16) : customEnd;
      return `${s.replace("T", " ")} → ${e.replace("T", " ")}`;
    }
    return intl.get("logSearch.preset.custom");
  }
  const k = `logSearch.preset.${preset}`;
  const t = intl.get(k);
  return t && t !== k ? t : preset;
}

export default function LogTimeRangePicker({
  timePreset,
  setTimePreset,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  disabled = false,
  onCommit,
  /** `"day"`：相对时间区只显示 24h / 3d / 7d / 30d；日志检索等仍用默认 `"full"` */
  relativePresetsMode = "full",
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState(null);

  const relativePresetsShown = useMemo(() => {
    if (relativePresetsMode === "day") {
      return RELATIVE_TIME_PRESETS.filter((p) => RELATIVE_PRESET_KEYS_DAY.has(p.key));
    }
    return RELATIVE_TIME_PRESETS;
  }, [relativePresetsMode]);

  const updatePanelPos = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(window.innerWidth - 16, 22 * 16);
    let left = r.right - maxW;
    if (left < 8) left = Math.min(8, r.left);
    left = Math.max(8, Math.min(left, window.innerWidth - maxW - 8));
    setPanelPos({ top: r.bottom + 4, left, width: maxW });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => updatePanelPos();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const buttonLabel = useMemo(
    () => presetLabel(timePreset, customStart, customEnd),
    [timePreset, customStart, customEnd],
  );

  const pickPreset = (key) => {
    setTimePreset(key);
    if (key !== "custom") {
      setOpen(false);
      onCommit();
    }
  };

  const applyCustom = () => {
    setTimePreset("custom");
    setOpen(false);
    onCommit();
  };

  return (
    <div className="relative min-h-0 w-auto min-w-[7.5rem] max-w-[15rem] shrink-0 self-stretch">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={intl.get("logSearch.timePickerAria")}
        onClick={() => setOpen((o) => !o)}
        className="box-border flex h-full min-h-9 w-full min-w-0 items-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 py-0 pl-3 pr-2 text-left text-sm text-slate-800 shadow-sm outline-none transition-colors hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:border-slate-500"
      >
        <span className="min-w-0 flex-1 truncate" title={buttonLabel}>
          {buttonLabel}
        </span>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
            className="fixed z-[200] max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200/90 bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-label={intl.get("logSearch.timeRange")}
          >
            <div className="border-b border-slate-100 px-3 pb-2 pt-1 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {intl.get("logSearch.timeGroup.relative")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                {relativePresetsShown.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickPreset(p.key)}
                    className={[
                      "rounded-md px-2 py-1.5 text-left text-xs font-medium transition",
                      timePreset === p.key
                        ? "bg-primary/12 text-primary dark:bg-primary/20"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                    ].join(" ")}
                  >
                    {intl.get(`logSearch.preset.${p.key}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-400 dark:text-slate-500">
                {intl.get("logSearch.timeGroup.calendar")}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-0.5 sm:grid-cols-3">
                {CALENDAR_TIME_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickPreset(key)}
                    className={[
                      "rounded px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition",
                      timePreset === key
                        ? "bg-primary/12 text-primary dark:bg-primary/20"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                    ].join(" ")}
                  >
                    {intl.get(`logSearch.preset.${key}`)}
                  </button>
                ))}
              </div>
            </div>
            <details className="px-3 py-2">
              <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 [&::-webkit-details-marker]:hidden">
                {intl.get("logSearch.timeSection.custom")}
              </summary>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className={`${INPUT} max-w-full py-1.5 text-xs sm:max-w-[11rem]`}
                  />
                  <span className="text-slate-400 dark:text-slate-600">—</span>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className={`${INPUT} max-w-full py-1.5 text-xs sm:max-w-[11rem]`}
                  />
                </div>
                <button
                  type="button"
                  disabled={disabled || !customStart || !customEnd}
                  onClick={applyCustom}
                  className="app-btn-outline w-fit py-1.5 pl-3 pr-4 text-xs"
                >
                  {intl.get("logSearch.timeApply")}
                </button>
              </div>
            </details>
          </div>,
          document.body,
        )}
    </div>
  );
}
