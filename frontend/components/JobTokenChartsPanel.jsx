import { useCallback, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import {
  buildDailyTokenStack,
  EMPTY_MODEL_KEY,
  sumInputOutputTokens,
  sumTokensByModel,
  uniqueModelsFromEvents,
} from "../lib/jobTokenMetrics.js";

/** @type {string[]} */
const MODEL_PIE_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/**
 * @param {object} props
 * @param {object[]} props.events
 * @param {(startDay: string, endDay: string) => void} [props.onBrushDateRange] 框选柱图后按日键 YYYY-MM-DD 回调，用于同步统计时间
 * @param {'full' | 'trendOnly'} [props.mode='full'] trendOnly：仅展示按日 Token 堆叠趋势（任务概览等）
 */
export default function JobTokenChartsPanel({ events, onBrushDateRange, mode = "full" }) {
  const list = Array.isArray(events) ? events : [];
  const [modelFilter, setModelFilter] = useState("");
  const datesRef = useRef(/** @type {string[]} */ ([]));

  const models = useMemo(() => uniqueModelsFromEvents(list), [list]);

  const filtered = useMemo(() => {
    if (!modelFilter) return list;
    return list.filter((e) => String(e?.model ?? "") === modelFilter);
  }, [list, modelFilter]);

  const daily = useMemo(() => buildDailyTokenStack(filtered), [filtered]);
  datesRef.current = daily.dates;

  const handleBrushSelected = useCallback(
    (params) => {
      if (!onBrushDateRange) return;
      const batch = params?.batch?.[0];
      if (!batch?.selected?.length) return;
      const idxSet = new Set();
      for (const sel of batch.selected) {
        const arr = sel.dataIndex;
        if (!Array.isArray(arr)) continue;
        for (const i of arr) idxSet.add(i);
      }
      if (idxSet.size === 0) return;
      const sorted = [...idxSet].sort((x, y) => x - y);
      const i0 = sorted[0];
      const i1 = sorted[sorted.length - 1];
      const dates = datesRef.current;
      if (!dates.length || i0 < 0 || i1 < 0 || i0 >= dates.length || i1 >= dates.length) return;
      const startDay = dates[i0];
      const endDay = dates[i1];
      if (startDay && endDay) onBrushDateRange(startDay, endDay);
    },
    [onBrushDateRange],
  );

  const barChartEvents = useMemo(() => {
    if (!onBrushDateRange) return undefined;
    return { brushselected: handleBrushSelected };
  }, [onBrushDateRange, handleBrushSelected]);

  const { inSum, outSum } = useMemo(() => sumInputOutputTokens(filtered), [filtered]);
  const byModel = useMemo(() => sumTokensByModel(list), [list]);

  const inputLabel = intl.get("scheduledTasks.taskDetail.tokensChartLegendInput");
  const outputLabel = intl.get("scheduledTasks.taskDetail.tokensChartLegendOutput");

  const brushLineXTitle = intl.get("scheduledTasks.taskDetail.tokensChartBrushLineX");
  const brushClearTitle = intl.get("scheduledTasks.taskDetail.tokensChartBrushClear");

  const barOption = useMemo(() => {
    if (!daily.dates.length) return null;
    return {
      tooltip: { trigger: "axis", textStyle: { fontSize: 12 } },
      ...(onBrushDateRange
        ? {
            toolbox: {
              right: 8,
              top: 4,
              itemSize: 14,
              feature: {
                brush: {
                  type: ["lineX", "clear"],
                  title: { lineX: brushLineXTitle, clear: brushClearTitle },
                },
              },
            },
            brush: {
              xAxisIndex: 0,
              brushLink: "none",
              throttleType: "debounce",
              throttleDelay: 120,
              transformable: false,
              brushStyle: {
                borderWidth: 1,
                color: "rgba(59, 130, 246, 0.14)",
                borderColor: "#3b82f6",
              },
              outOfBrush: { colorAlpha: 0.22 },
            },
          }
        : {}),
      legend: {
        data: [inputLabel, outputLabel],
        top: 8,
        right: onBrushDateRange ? 120 : 8,
        itemGap: 14,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      grid: { left: 48, right: 16, top: 44, bottom: 36 },
      xAxis: {
        type: "category",
        data: daily.dates,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: daily.dates.length > 12 ? 35 : 0 },
      },
      yAxis: {
        type: "value",
        name: intl.get("scheduledTasks.taskDetail.tokensChartAxisTokens"),
        minInterval: 1,
        axisLabel: { fontSize: 10, color: "#64748b" },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [
        {
          name: inputLabel,
          type: "bar",
          stack: "usage",
          barMaxWidth: 36,
          itemStyle: { color: "#3b82f6" },
          data: daily.inputData,
        },
        {
          name: outputLabel,
          type: "bar",
          stack: "usage",
          barMaxWidth: 36,
          itemStyle: { color: "#a855f7" },
          data: daily.outputData,
        },
      ],
    };
  }, [daily, inputLabel, outputLabel, onBrushDateRange, brushLineXTitle, brushClearTitle]);

  const pieOption = useMemo(() => {
    const total = inSum + outSum;
    if (total <= 0) return null;
    return {
      tooltip: { trigger: "item", textStyle: { fontSize: 12 } },
      legend: {
        left: 8,
        top: "18%",
        bottom: "14%",
        orient: "vertical",
        align: "left",
        itemGap: 10,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      series: [
        {
          type: "pie",
          radius: ["38%", "68%"],
          center: ["60%", "50%"],
          label: { formatter: "{b}\n{d}%" },
          data: [
            { name: inputLabel, value: inSum, itemStyle: { color: "#3b82f6" } },
            { name: outputLabel, value: outSum, itemStyle: { color: "#a855f7" } },
          ],
        },
      ],
    };
  }, [inSum, outSum, inputLabel, outputLabel]);

  const unknownModelLabel = intl.get("scheduledTasks.taskDetail.tokensModelUnknown");

  const modelPieOption = useMemo(() => {
    const total = byModel.reduce((s, x) => s + x.tokens, 0);
    if (total <= 0) return null;
    const data = byModel.map((x, i) => ({
      name: x.key === EMPTY_MODEL_KEY ? unknownModelLabel : x.key,
      value: x.tokens,
      itemStyle: { color: MODEL_PIE_COLORS[i % MODEL_PIE_COLORS.length] },
    }));
    return {
      tooltip: { trigger: "item", textStyle: { fontSize: 12 } },
      legend: {
        type: "scroll",
        left: 8,
        top: "18%",
        bottom: "12%",
        orient: "vertical",
        align: "left",
        itemGap: 8,
        itemWidth: 10,
        itemHeight: 10,
        pageButtonPosition: "end",
        pageIconSize: 10,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      series: [
        {
          type: "pie",
          radius: ["38%", "68%"],
          center: ["62%", "50%"],
          label: { formatter: "{b}\n{d}%", fontSize: 10 },
          data,
        },
      ],
    };
  }, [byModel, unknownModelLabel]);

  const trendCard = (
    <div className="flex min-h-[300px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.tokensChartTrendTitle")}</h3>
      <div className="mt-2 min-h-0 flex-1">
        {barOption ? (
          <ReactECharts
            option={barOption}
            style={{ height: "100%", minHeight: "260px", width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge
            lazyUpdate
            onEvents={barChartEvents}
          />
        ) : (
          <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            {intl.get("common.noData")}
          </p>
        )}
      </div>
    </div>
  );

  if (mode === "trendOnly") {
    return <div className="min-w-0">{trendCard}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="token-model-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {intl.get("scheduledTasks.taskDetail.tokensFilterModel")}
        </label>
        <select
          id="token-model-filter"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">{intl.get("scheduledTasks.taskDetail.tokensFilterAll")}</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {trendCard}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-h-[280px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.tokensPieTitle")}</h3>
          <div className="mt-2 min-h-0 flex-1">
            {pieOption ? (
              <ReactECharts option={pieOption} style={{ height: "100%", minHeight: "240px", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
            ) : (
              <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                {intl.get("common.noData")}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-[280px] min-w-0 flex-col rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/40">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.tokensModelPieTitle")}</h3>
          <div className="mt-2 min-h-0 flex-1">
            {modelPieOption ? (
              <ReactECharts option={modelPieOption} style={{ height: "100%", minHeight: "240px", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
            ) : (
              <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                {intl.get("common.noData")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
