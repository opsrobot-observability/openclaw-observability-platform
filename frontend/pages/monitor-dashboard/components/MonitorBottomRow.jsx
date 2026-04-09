import ReactECharts from "echarts-for-react";
import {
  IO_DONUT_COLORS,
  MODEL_DONUT_COLORS,
} from "../constants.js";
import { getDonutOption, getTrendOption, getTopAgentOption } from "../chartOptions.js";
import MonitorPanel from "./MonitorPanel.jsx";

/**
 * 底部行：Token Top10 条形图 + Token 分布双环形图 + 会话趋势折线图
 *
 * @param {{
 *   topInstances?: Array;
 *   tokenDistribution?: object;
 *   sessionTrend?: Array;       会话趋势（来自行为审计概览同源数据，最近7天）
 *   sessionTrendTotal?: number; 趋势期内会话总数
 *   loadingTrend?: boolean;
 * }} props
 */
export default function MonitorBottomRow({
  topInstances,
  tokenDistribution,
  sessionTrend,
  sessionTrendTotal,
  loadingTrend,
}) {
  // Token 分布：仅使用真实数据，不做兜底
  const modelDonutData = Array.isArray(tokenDistribution?.byModel)
    ? tokenDistribution.byModel.map((d) => ({ name: d.name, value: d.value }))
    : [];

  // Token 分布：IO 环形图数据（对齐算力成本概览，按 Input / Output）
  let ioDonutData = [];
  if (Array.isArray(tokenDistribution?.byType) && tokenDistribution.byType.length > 0) {
    const inputVal = tokenDistribution.byType
      .filter((d) => ["input", "prompt"].includes(d.name))
      .reduce((a, d) => a + d.value, 0);
    const outputVal = tokenDistribution.byType
      .filter((d) => d.name === "output")
      .reduce((a, d) => a + d.value, 0);
    const parts = [
      inputVal > 0 && { name: "Input", value: inputVal },
      outputVal > 0 && { name: "Output", value: outputVal },
    ].filter(Boolean);
    ioDonutData = parts;
  }

  // 会话趋势总数标签
  const trendTotal = sessionTrendTotal ?? (
    Array.isArray(sessionTrend) ? sessionTrend.reduce((a, r) => a + (r.value || 0), 0) : null
  );
  const sessionTotalLabel =
    trendTotal != null
      ? trendTotal >= 10_000
        ? (trendTotal / 10_000).toFixed(1) + "W"
        : trendTotal.toLocaleString()
      : "—";

  return (
    <div className="flex flex-col lg:flex-row gap-3 flex-[3] min-h-[220px]">
      <MonitorPanel title="Token 消耗 Top10" className="w-full lg:w-1/4 h-full">
        <ReactECharts
          option={getTopAgentOption(topInstances)}
          style={{ height: "100%", width: "100%" }}
          notMerge
        />
      </MonitorPanel>

      <MonitorPanel title="Token 消耗分布" className="w-full lg:w-2/4 h-full">
        <div className="flex h-full items-center">
          <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
            <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">大模型 Token 消耗分布</div>
            <div className="w-full h-full pt-4 sm:pt-6">
              <ReactECharts
                option={getDonutOption(modelDonutData, MODEL_DONUT_COLORS)}
                style={{ height: "100%", width: "100%" }}
                notMerge
              />
            </div>
          </div>
          <div className="w-px h-[60%] bg-gradient-to-b from-transparent via-[#16436e] to-transparent" />
          <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
            <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">Input / Output Token 消耗分布</div>
            <div className="w-full h-full pt-4 sm:pt-6">
              <ReactECharts
                option={getDonutOption(ioDonutData, IO_DONUT_COLORS)}
                style={{ height: "100%", width: "100%" }}
                notMerge
              />
            </div>
          </div>
        </div>
      </MonitorPanel>

      {/* 会话趋势 — 与行为审计概览口径一致，最近7天 */}
      <MonitorPanel
        title="会话趋势"
        className="w-full lg:w-1/4 h-full"
        headerExtra={
          <div className="flex items-center gap-2 text-[10px] sm:text-xs">
            <div className="text-[#8fb1c6]">
              近7天{" "}
              <span className="text-white font-mono ml-1">
                {loadingTrend ? "…" : sessionTotalLabel}
              </span>
            </div>
          </div>
        }
      >
        <ReactECharts
          option={getTrendOption(sessionTrend)}
          style={{ height: "100%", width: "100%" }}
          notMerge
        />
      </MonitorPanel>
    </div>
  );
}
