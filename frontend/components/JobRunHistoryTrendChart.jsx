import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import { analyzeRunHistory } from "../lib/jobRunHistoryMetrics.js";

/**
 * 与任务概要「运行历史」中的历史执行趋势图一致（堆叠柱 + 平均耗时折线）。
 * @param {object} props
 * @param {object[]} props.events
 * @param {boolean} [props.compact] 执行结果页等场景：不展示说明文案、不展示左侧 Y 轴「次数」名称
 * @param {number} [props.chartHeightPx] 图表区域高度（像素），默认 320
 * @param {boolean} [props.showTitle=true] 为 false 时由外层卡片提供标题
 */
export default function JobRunHistoryTrendChart({ events, compact = false, chartHeightPx, showTitle = true }) {
  const h = useMemo(() => analyzeRunHistory(events), [events]);
  const chartH = chartHeightPx != null && Number.isFinite(Number(chartHeightPx)) ? Math.max(120, Math.round(Number(chartHeightPx))) : 320;
  const tightChart = compact && chartH < 280;

  const chartOption = useMemo(() => {
    const daily = h.daily;
    if (!daily.length) return null;
    const dates = daily.map((d) => d.date);
    const okData = daily.map((d) => d.ok);
    const failData = daily.map((d) => d.fail);
    const avgSec = daily.map((d) => (d.avgDurationMs != null && Number.isFinite(d.avgDurationMs) ? Math.round((d.avgDurationMs / 1000) * 10) / 10 : null));

    const okName = intl.get("scheduledTasks.taskDetail.runHistory.legendSuccess");
    const failName = intl.get("scheduledTasks.taskDetail.runHistory.legendFail");
    const lineName = intl.get("scheduledTasks.taskDetail.runHistory.legendAvgDuration");

    return {
      tooltip: { trigger: "axis", textStyle: { fontSize: 12 } },
      legend: {
        data: [okName, failName, lineName],
        bottom: 0,
        textStyle: { fontSize: 11, color: "#64748b" },
      },
      grid: { left: compact ? 44 : 52, right: 52, top: tightChart ? 8 : compact ? 12 : 28, bottom: tightChart ? 44 : 56 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: dates.length > 14 ? 40 : 0 },
      },
      yAxis: [
        {
          type: "value",
          ...(compact ? {} : { name: intl.get("scheduledTasks.taskDetail.runHistory.axisCount") }),
          minInterval: 1,
          axisLabel: { fontSize: 10, color: "#64748b" },
          splitLine: { lineStyle: { color: "#f1f5f9" } },
        },
        {
          type: "value",
          name: intl.get("scheduledTasks.taskDetail.runHistory.axisAvgDuration"),
          axisLabel: {
            fontSize: 10,
            color: "#64748b",
            formatter: (v) => `${v}s`,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: okName,
          type: "bar",
          stack: "runs",
          barMaxWidth: 28,
          itemStyle: { color: "#22c55e" },
          data: okData,
        },
        {
          name: failName,
          type: "bar",
          stack: "runs",
          barMaxWidth: 28,
          itemStyle: { color: "#ef4444" },
          data: failData,
        },
        {
          name: lineName,
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { width: 2, color: "#6366f1" },
          itemStyle: { color: "#6366f1" },
          data: avgSec,
        },
      ],
    };
  }, [h.daily, compact, tightChart]);

  return (
    <div>
      {showTitle ? (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("scheduledTasks.taskDetail.runHistory.chartTitle")}</h3>
      ) : null}
      {chartOption ? (
        <div className={`w-full min-w-0 ${showTitle ? (compact ? "mt-2" : "mt-3") : "mt-2"}`} style={{ height: chartH }}>
          <ReactECharts option={chartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
        </div>
      ) : (
        <p className="mt-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("common.noData")}</p>
      )}
    </div>
  );
}
