import MonitorBottomRow from "./components/MonitorBottomRow.jsx";
import MonitorCenterPanorama from "./components/MonitorCenterPanorama.jsx";
import MonitorLeftColumn from "./components/MonitorLeftColumn.jsx";
import MonitorRightColumn from "./components/MonitorRightColumn.jsx";
import intl from "react-intl-universal";
import { useMonitorFullscreen } from "./hooks/useMonitorFullscreen.js";
import { useMonitorDashboard } from "./hooks/useMonitorDashboard.js";
import { useMonitorSession } from "./hooks/useMonitorSession.js";
import bgImage from "./images/opsRobotbg3.png";
import topBg from "./images/centertopbg3.png";
import topLineBg from "./images/toplinebg1.png";

export default function MonitorDashboard() {
  const { containerRef, isFullscreen, toggleFullscreen } = useMonitorFullscreen();

  // OTel 指标数据（实例、Token、成本等）
  const { data: otelData, loading: otelLoading, error: otelError } = useMonitorDashboard({
    trendDays: 14,
    topLimit: 10,
  });

  // 会话模块数据（与行为审计概览口径一致）
  const { data: sessionData, loading: sessionLoading, error: sessionError } = useMonitorSession({
    trendDays: 30,
    riskLimit: 0,
  });

  return (
    <div
      ref={containerRef}
      className={`w-full bg-[#010611] flex-1 text-white p-2 pt-0 font-sans selection:bg-[#00f0ff]/30 flex flex-col gap-0 relative overflow-y-auto lg:overflow-hidden ${
        isFullscreen ? "h-screen" : "min-h-[750px]"
      }`}
      // style={{
      //   backgroundImage: `url(${bgImage})`,
      //   backgroundSize: "cover",
      //   backgroundPosition: "center",
      //   backgroundRepeat: "no-repeat",
      //   backgroundColor: "#010611"
      // }}
    >
      {/* 顶部贯穿背景线 */}
      <div 
        className="absolute top-0 left-0 w-full h-[24px] z-9 pointer-events-none"
        style={{
          backgroundImage: `url(${topLineBg})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 100%"
        }}
      />

      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-50 bg-[#020b1a]/80 border-0 border-[#00f0ff]/50 text-[#00f0ff] p-1.5 rounded hover:bg-[#00f0ff]/20 transition-colors shadow-[0_0_10px_rgba(0,240,255,0.2)]"
        title={isFullscreen ? intl.get("monitorDashboard.fullscreen.exit") : intl.get("monitorDashboard.fullscreen.enter")}
      >
        {isFullscreen ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20V15H4M15 4v5h5M9 4v5H4M15 20v-5h5" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 15v5h5M20 9V4h-5M4 9V4h5M20 15v5h-5" />
          </svg>
        )}
      </button>

      {/* 大屏顶部标题 */}
      <div className="relative w-full h-[80px] flex shrink-0 justify-center overflow-hidden">
        <div className="flex-1 relative">
          <div className="absolute top-[35px] left-0 w-full h-[1px]"></div>
          <div className="absolute top-[35px] right-0 w-1/2 h-[1px]"></div>
        </div>

        <div className="w-[800px] h-full relative z-20">
          <div className="absolute inset-0 flex items-center justify-center pb-2" style={{ backgroundImage: `url(${topBg})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}>
            <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-[#ffffff] to-[#00f0ff] tracking-[0.2em] drop-shadow-[0_0_15px_rgba(0,240,255,0.8)]">
              {intl.get("monitorDashboard.title")}
            </h1>
          </div>
        </div>

        <div className="flex-1 relative">
          <div className="absolute top-[35px] left-0 w-full h-[1px]"></div>
          <div className="absolute top-[35px] left-0 w-1/2 h-[1px]"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-1 gap-3 flex-[7] min-h-[450px] z-50">
        <MonitorLeftColumn
          dailyTokens={otelData?.dailyTokens}
          instanceList={otelData?.instanceList}
          loading={otelLoading}
          error={otelError}
        />
        <MonitorCenterPanorama kpis={otelData?.kpis} loading={otelLoading} />
        {/* 右列：会话概览 + 风险对话（均为滚动近30天） */}
        <MonitorRightColumn
          sessionOverview={sessionData?.overview}
          riskSessions={sessionData?.riskSessions}
          riskSessionsTotal={sessionData?.riskSessionsTotal}
          loadingOverview={sessionLoading?.overview}
          loadingRisk={sessionLoading?.risk}
          errorRisk={sessionError?.risk}
        />
      </div>

      <div className="mt-3 flex min-h-0 flex-[3] flex-col">
        <MonitorBottomRow
          topInstances={otelData?.topInstances}
          tokenDistribution={otelData?.tokenDistribution}
          sessionTrend={sessionData?.sessionTrend}
          sessionTrendTotal={sessionData?.sessionTrendTotal}
          loadingTop={otelLoading}
          loadingDistribution={otelLoading}
          loadingTrend={sessionLoading?.trend}
          errorTop={otelError}
        />
      </div>
    </div>
  );
}
