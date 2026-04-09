import centerBg from "../images/centerpic4.png";
import centerTopBg from "../images/centertopbg1.png";
import { useMonitorDashboard } from "../hooks/MonitorDashboardContext.jsx";

function fmtInt(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString();
}

export default function MonitorCenterPanorama() {
  const { data } = useMonitorDashboard();
  const k = data?.centerKpis;
  const cards = [
    { name: "Agent总数", value: k ? fmtInt(k.agentTotal) : "—" },
    { name: "用户总数", value: k ? fmtInt(k.userTotal) : "—" },
    { name: "来源终端", value: k ? fmtInt(k.terminalCount) : "—" },
    { name: "Token消耗", value: k?.tokenDisplay ?? "—" },
  ];

  return (
    <div className="flex h-full w-full min-w-0 flex-col lg:w-2/4">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden relative">
        <div className="box-border min-h-0 w-full min-w-full flex-1 self-stretch flex flex-col">
          {/* 指标卡区域 */}
          <div className="z-10 flex gap-2 justify-between lg:justify-start mb-4 h-[110px] px-2">
            {cards.map((card, index) => (
              <div 
                key={index}
                className="relative flex-1 flex flex-col items-center bg-center bg-[length:100%_100%] bg-no-repeat transition-transform hover:scale-105 duration-300 mx-1"
                style={{ backgroundImage: `url(${centerTopBg})` }}
              >
                {/* 数量与标题 */}
                <div className="flex flex-col items-center w-full h-full relative">
                  {/* 发光的点阵与数值部分 */}
                  <div className="absolute top-[32%] text-[28px] font-bold text-white font-sans drop-shadow-[0_0_10px_rgba(0,150,255,1)] tracking-wide">
                    {card.value}
                  </div>
                  {/* 底座单位（保持原本指标名称） */}
                  <div className="absolute bottom-[10%] text-[13px] text-[#e2f1fa] font-medium tracking-widest opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {card.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* 全景图片内容区域 */}
          <div
            className="w-full flex-1 min-h-0 bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${centerBg})` }}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
