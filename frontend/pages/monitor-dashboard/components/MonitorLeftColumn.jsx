import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { DIGITAL_EMPLOYEE_ROWS } from "../constants.js";
import { getDailyTokenOption, getDailyTokenOptionFromSeries } from "../chartOptions.js";
import { useMonitorDashboard } from "../hooks/MonitorDashboardContext.jsx";
import MonitorPanel from "./MonitorPanel.jsx";

export default function MonitorLeftColumn() {
  const { data } = useMonitorDashboard();
  const rows = data?.digitalEmployees?.length ? data.digitalEmployees : DIGITAL_EMPLOYEE_ROWS;
  const tokenOption = useMemo(() => {
    if (data?.charts?.dailyToken?.length) return getDailyTokenOptionFromSeries(data.charts.dailyToken);
    return getDailyTokenOption();
  }, [data]);

  const renderRows = (suffix = "") =>
    rows.map((agent, i) => (
      <div
        key={`${suffix}-${i}-${agent.name}`}
        className={`flex items-center text-xs py-1 ${agent.active ? "bg-[#004488]/30 rounded" : ""}`}
      >
        <div className="w-[50%] truncate pl-2">
          <div className="text-white truncate flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#00f0ff]/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {agent.name}
          </div>
        </div>
        <div className="w-[20%] flex justify-center items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              agent.status === "在线" ? "bg-[#00f0ff] shadow-[0_0_5px_#00f0ff]" : "bg-[#4b5563]"
            }`}
          />
          <span className={agent.status === "在线" ? "text-[#00f0ff]" : "text-[#6b7280]"}>{agent.status}</span>
        </div>
        <div className="w-[15%] text-right font-mono">{agent.sessions}</div>
        <div className="w-[15%] text-right text-[#00f0ff] font-mono">{agent.token}</div>
      </div>
    ));

  return (
    <div className="flex flex-col gap-3 w-full lg:w-1/4 h-[calc(100%+2.5rem)] lg:-mt-10">
      <MonitorPanel title="每日 Token 消耗" className="shrink-0">
        <ReactECharts option={tokenOption} style={{ height: "100%", width: "100%" }} />
      </MonitorPanel>

      <MonitorPanel title="数字员工列表" className="flex-1 min-h-[250px]">
        <div className="h-full flex flex-col">
          <div className="flex text-[#8fb1c6] text-xs pb-2 border-b border-[#16436e] mb-2 px-2">
            <div className="w-[50%] pl-2">名称</div>
            <div className="w-[20%] text-center">状态</div>
            <div className="w-[15%] text-right">会话</div>
            <div className="w-[15%] text-right">TOKEN</div>
          </div>
          <div className="relative flex-1 overflow-hidden px-2">
            <div className="flex flex-col gap-3 animate-auto-scroll">
              <div className="flex flex-col gap-3">{renderRows("a")}</div>
              <div className="flex flex-col gap-3">{renderRows("b")}</div>
            </div>
          </div>
        </div>
      </MonitorPanel>
    </div>
  );
}
