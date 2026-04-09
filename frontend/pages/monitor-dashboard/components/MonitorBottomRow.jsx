import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import {
  IO_DONUT_COLORS,
  IO_DONUT_DATA,
  MODEL_DONUT_COLORS,
  MODEL_DONUT_DATA,
} from "../constants.js";
import {
  getDonutOption,
  getSessionTrendOptionFromSeries,
  getTopAgentOption,
  getTopAgentOptionFromBar,
} from "../chartOptions.js";
import { useMonitorDashboard } from "../hooks/MonitorDashboardContext.jsx";
import MonitorPanel from "./MonitorPanel.jsx";

function fmtInt(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString();
}

export default function MonitorBottomRow() {
  const { data } = useMonitorDashboard();
  const trend = data?.charts?.sessionTrend;
  const nDays = trend?.length ?? 0;
  const topBar = data?.charts?.topAgentsBar;

  const topOpt = useMemo(() => {
    if (topBar?.categories?.length) return getTopAgentOptionFromBar(topBar);
    return getTopAgentOption();
  }, [topBar]);

  const trendOpt = useMemo(() => {
    if (trend?.length) return getSessionTrendOptionFromSeries(trend);
    return getSessionTrendOptionFromSeries([]);
  }, [trend]);

  const modelData = data?.charts?.modelDonut?.length ? data.charts.modelDonut : MODEL_DONUT_DATA;
  const ioData = data?.charts?.ioDonut?.length ? data.charts.ioDonut : IO_DONUT_DATA;

  return (
    <div className="flex flex-col lg:flex-row gap-3 flex-[3] min-h-[220px]">
      <MonitorPanel title="Token 消耗 Top10 Agent" className="w-full lg:w-1/4 h-full">
        <ReactECharts option={topOpt} style={{ height: "100%", width: "100%" }} />
      </MonitorPanel>

      <MonitorPanel title="Token 消耗分布" className="w-full lg:w-2/4 h-full">
        <div className="flex h-full items-center">
          <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
            <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">大模型 Token 消耗分布</div>
            <div className="w-full h-full pt-4 sm:pt-6">
              <ReactECharts
                option={getDonutOption(modelData, MODEL_DONUT_COLORS)}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          </div>
          <div className="w-px h-[60%] bg-gradient-to-b from-transparent via-[#16436e] to-transparent" />
          <div className="w-1/2 h-full flex flex-col items-center justify-center relative">
            <div className="text-xs text-[#8fb1c6] absolute top-1 sm:top-2">Input / Output Token 消耗分布</div>
            <div className="w-full h-full pt-4 sm:pt-6">
              <ReactECharts
                option={getDonutOption(ioData, IO_DONUT_COLORS)}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          </div>
        </div>
      </MonitorPanel>

      <MonitorPanel
        title="会话趋势"
        className="w-full lg:w-1/4 h-full"
        headerExtra={
          <div className="flex items-center gap-2 text-[10px] sm:text-xs">
            <div className="text-[#8fb1c6]">
              近{nDays || "—"}天 <span className="text-white font-mono ml-1">{fmtInt(data?.charts?.sessionTrendTotal)}</span>
            </div>
          </div>
        }
      >
        <ReactECharts option={trendOpt} style={{ height: "100%", width: "100%" }} />
      </MonitorPanel>
    </div>
  );
}
