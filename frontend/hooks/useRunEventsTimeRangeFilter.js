import { useCallback, useMemo, useState } from "react";
import { defaultRangeLastDays, defaultRangeLastHours } from "../components/CostTimeRangeFilter.jsx";

/**
 * 任务详情「运行结果 / 运行性能 / Token 成本」共用统计时间状态（与 `TaskDetailRunEventsTimeRangeFilter` 搭配）。
 * @returns {{
 *   activeDays: number | null,
 *   activePresetHours: number | null,
 *   rangeStartLocal: string,
 *   rangeEndLocal: string,
 *   useCustomRange: boolean,
 *   highlightPresets: boolean,
 *   onPreset: (p: { days?: number, hours?: number }) => void,
 *   onRangeLocalChange: (start: string, end: string) => void,
 *   setByBrushInclusiveDays: (startDay: string, endDay: string) => void,
 *   resetToDefault: () => void,
 * }}
 */
export function useRunEventsTimeRangeFilter() {
  const init = useMemo(() => defaultRangeLastDays(7), []);
  const [activeDays, setActiveDays] = useState(7);
  const [activePresetHours, setActivePresetHours] = useState(/** @type {number | null} */ (null));
  const [rangeStartLocal, setRangeStartLocal] = useState(init.start);
  const [rangeEndLocal, setRangeEndLocal] = useState(init.end);
  const [useCustomRange, setUseCustomRange] = useState(false);

  const resetToDefault = useCallback(() => {
    const r = defaultRangeLastDays(7);
    setActiveDays(7);
    setActivePresetHours(null);
    setRangeStartLocal(r.start);
    setRangeEndLocal(r.end);
    setUseCustomRange(false);
  }, []);

  const onPreset = useCallback((p) => {
    setUseCustomRange(false);
    if (p.hours != null) {
      setActivePresetHours(p.hours);
      setActiveDays(null);
      const r = defaultRangeLastHours(p.hours);
      setRangeStartLocal(r.start);
      setRangeEndLocal(r.end);
      return;
    }
    const d = p.days ?? 7;
    setActivePresetHours(null);
    setActiveDays(d);
    const r = defaultRangeLastDays(d);
    setRangeStartLocal(r.start);
    setRangeEndLocal(r.end);
  }, []);

  const onRangeLocalChange = useCallback((start, end) => {
    setUseCustomRange(true);
    setRangeStartLocal(start);
    setRangeEndLocal(end);
  }, []);

  const setByBrushInclusiveDays = useCallback((startDay, endDay) => {
    const a = String(startDay || "").trim();
    const b = String(endDay || "").trim();
    if (!a || !b) return;
    const [s, e] = a <= b ? [a, b] : [b, a];
    setUseCustomRange(true);
    setActivePresetHours(null);
    setActiveDays(null);
    setRangeStartLocal(`${s}T00:00`);
    setRangeEndLocal(`${e}T23:59`);
  }, []);

  return {
    activeDays,
    activePresetHours,
    rangeStartLocal,
    rangeEndLocal,
    useCustomRange,
    highlightPresets: !useCustomRange,
    onPreset,
    onRangeLocalChange,
    setByBrushInclusiveDays,
    resetToDefault,
  };
}
