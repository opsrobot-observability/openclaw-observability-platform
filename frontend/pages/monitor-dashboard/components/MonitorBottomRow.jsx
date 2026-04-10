import ReactECharts from "echarts-for-react";
import intl from "react-intl-universal";
import {
  IO_DONUT_COLORS,
  MODEL_DONUT_COLORS,
} from "../constants.js";
import { getDonutOption, getTrendOption, getTopAgentOption } from "../chartOptions.js";
import MonitorPanel from "./MonitorPanel.jsx";

/**
 * 底部行：Token Top10 条形图（与数字员工列表同源 merged 行 totalTokens）+ Token 分布双环形图 + 会话趋势折线图
 *
 * @param {{
 *   topInstances?: Array;
 *   tokenDistribution?: object;
 *   sessionTrend?: Array;       会话趋势（来自行为审计概览同源数据，最近一个月）
 *   sessionTrendTotal?: number; 趋势期内会话总数
 *   loadingTop?: boolean;
 *   loadingDistribution?: boolean;
 *   errorTop?: string|null;
 *   loadingTrend?: boolean;
 * }} props
 */
export default function MonitorBottomRow({
  topInstances,
  tokenDistribution,
  sessionTrend,
  sessionTrendTotal,
  loadingTop,
  loadingDistribution,
  errorTop,
  loadingTrend,
}) {
  const topList = Array.isArray(topInstances) ? topInstances : [];
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-1 gap-3 flex-[3] min-h-[220px]">
      <MonitorPanel
        title={intl.get("monitorDashboard.bottom.top10")}
        className="w-full h-full min-w-0"
      >
        {loadingTop ? (
          <div className="h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                <svg className="h-6 w-6 animate-spin text-[#5ba6d6]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <div className="text-sm text-[#8fb1c6]">{intl.get("monitorDashboard.loading")}</div>
            </div>
          </div>
        ) : errorTop ? (
          <div className="h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                <svg className="h-4 w-4 text-[#f59e0b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="text-sm text-[#8fb1c6]">{intl.get("monitorDashboard.loadFailed")}</div>
            </div>
          </div>
        ) : topList.length > 0 ? (
          <ReactECharts
            option={getTopAgentOption(topList)}
            style={{ height: "100%", width: "100%" }}
            notMerge
          />
        ) : (
          <div className="h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                <svg className="h-4 w-4 text-[#5ba6d6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 16V8M12 16V5M17 16v-6" />
                </svg>
              </div>
              <div className="text-sm text-[#8fb1c6]">{intl.get("monitorDashboard.noData")}</div>
            </div>
          </div>
        )}
      </MonitorPanel>

      <MonitorPanel title={intl.get("monitorDashboard.bottom.tokenDistribution")} className="w-full h-full min-w-0 lg:col-span-2">
        {loadingDistribution ? (
          <div className="h-full min-h-[180px] flex items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                <svg className="h-6 w-6 animate-spin text-[#5ba6d6]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <div className="text-sm text-[#8fb1c6]">{intl.get("monitorDashboard.loading")}</div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center">
            <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
              <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">{intl.get("monitorDashboard.bottom.modelDistribution")}</div>
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
              <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">{intl.get("monitorDashboard.bottom.ioDistribution")}</div>
              <div className="w-full h-full pt-4 sm:pt-6">
                <ReactECharts
                  option={getDonutOption(ioDonutData, IO_DONUT_COLORS)}
                  style={{ height: "100%", width: "100%" }}
                  notMerge
                />
              </div>
            </div>
          </div>
        )}
      </MonitorPanel>

      {/* 会话趋势 — 与行为审计概览口径一致，最近一个月（30 日） */}
      <MonitorPanel
        title={intl.get("monitorDashboard.bottom.sessionTrend")}
        className="w-full h-full min-w-0"
      >
        {loadingTrend ? (
          <div className="h-full min-h-[180px] flex items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                <svg className="h-6 w-6 animate-spin text-[#5ba6d6]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <div className="text-sm text-[#8fb1c6]">{intl.get("monitorDashboard.loading")}</div>
            </div>
          </div>
        ) : (
          <ReactECharts
            option={getTrendOption(sessionTrend)}
            style={{ height: "100%", width: "100%" }}
            notMerge
          />
        )}
      </MonitorPanel>
    </div>
  );
}
