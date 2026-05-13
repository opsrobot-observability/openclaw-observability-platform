import CostTimeRangeFilter from "./CostTimeRangeFilter.jsx";
import { RUN_EVENTS_TIME_RANGE_PRESETS } from "../lib/runEventsTimeRange.js";

export { RUN_EVENTS_TIME_RANGE_PRESETS } from "../lib/runEventsTimeRange.js";

/**
 * 任务详情运行事件统计时间（预设 + `datetime-local`），默认用于 Token 成本 / 运行结果 / 运行性能。
 * 状态由父组件或 `useRunEventsTimeRangeFilter` 持有；也可通过 `presets` 覆盖快捷项。
 *
 * @param {{
 *   activeDays: number | null,
 *   activePresetHours: number | null,
 *   onPreset: (p: { days?: number, hours?: number }) => void,
 *   rangeStartLocal: string,
 *   rangeEndLocal: string,
 *   onRangeLocalChange: (start: string, end: string) => void,
 *   highlightPresets: boolean,
 *   presets?: { labelKey: string, days?: number, hours?: number }[],
 *   className?: string,
 * }} props
 */
export default function TaskDetailRunEventsTimeRangeFilter({
  activeDays,
  activePresetHours,
  onPreset,
  rangeStartLocal,
  rangeEndLocal,
  onRangeLocalChange,
  highlightPresets,
  presets = RUN_EVENTS_TIME_RANGE_PRESETS,
  className = "",
}) {
  return (
    <CostTimeRangeFilter
      className={className}
      activeDays={activeDays}
      activePresetHours={activePresetHours}
      presets={presets}
      onPreset={onPreset}
      allowCustomRange
      rangeStartLocal={rangeStartLocal}
      rangeEndLocal={rangeEndLocal}
      onRangeLocalChange={onRangeLocalChange}
      highlightPresets={highlightPresets}
    />
  );
}
