import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import { analyzeTraceStatusTrend } from "../lib/traceRunStatusTrend.js";

const CHART_H = 130;

/**
 * 运行追溯 Tab：按日的运行状态堆叠柱状图（X 轴与统计时间范围的日历日一致）。
 * @param {{ events: object[], loading?: boolean, rangeStartLocal?: string, rangeEndLocal?: string }} props
 */
export default function JobRunTraceStatusTrendChart({ events, loading = false, rangeStartLocal, rangeEndLocal }) {
  const { daily } = useMemo(
    () => analyzeTraceStatusTrend(events, rangeStartLocal, rangeEndLocal),
    [events, rangeStartLocal, rangeEndLocal],
  );

  const chartOption = useMemo(() => {
    if (!daily.length) return null;
    const dates = daily.map((d) => d.date);
    const okData = daily.map((d) => d.ok);
    const failData = daily.map((d) => d.fail);
    const progressData = daily.map((d) => d.progress);
    const otherData = daily.map((d) => d.other);

    const okName = intl.get("scheduledTasks.execution.filterStatusSuccess");
    const failName = intl.get("scheduledTasks.execution.filterStatusFailure");
    const progressName = intl.get("scheduledTasks.taskDetail.runStatus.inProgress");
    const otherName = intl.get("scheduledTasks.taskDetail.trace.legendOther");

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        textStyle: { fontSize: 12 },
        confine: false,
        extraCssText: "max-width:min(320px,90vw); z-index:120; box-shadow:0 4px 14px rgba(15,23,42,0.12);",
      },
      legend: {
        data: [okName, failName, progressName, otherName],
        bottom: 0,
        itemWidth: 10,
        itemHeight: 8,
        textStyle: { fontSize: 10, color: "#64748b" },
      },
      grid: { left: 40, right: 4, top: 4, bottom: 34 },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { fontSize: 10, color: "#64748b", rotate: dates.length > 14 ? 40 : 0 },
      },
      yAxis: {
        type: "value",
        name: intl.get("scheduledTasks.taskDetail.trace.statusTrendAxisCount"),
        nameTextStyle: { fontSize: 10, padding: [0, 0, 0, 4] },
        minInterval: 1,
        axisLabel: { fontSize: 9, color: "#64748b" },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [
        {
          name: okName,
          type: "bar",
          stack: "status",
          barMaxWidth: 28,
          itemStyle: { color: "#22c55e" },
          data: okData,
        },
        {
          name: failName,
          type: "bar",
          stack: "status",
          barMaxWidth: 28,
          itemStyle: { color: "#ef4444" },
          data: failData,
        },
        {
          name: progressName,
          type: "bar",
          stack: "status",
          barMaxWidth: 28,
          itemStyle: { color: "#f59e0b" },
          data: progressData,
        },
        {
          name: otherName,
          type: "bar",
          stack: "status",
          barMaxWidth: 28,
          itemStyle: { color: "#94a3b8" },
          data: otherData,
        },
      ],
    };
  }, [daily]);

  return (
    <div className={`min-w-0 ${loading ? "opacity-60" : ""}`}>
      {chartOption ? (
        <div className="w-full overflow-visible" style={{ height: CHART_H }}>
          <ReactECharts option={chartOption} style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} notMerge lazyUpdate />
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("common.noData")}</p>
      )}
    </div>
  );
}
