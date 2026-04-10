import centerBg from "../images/centerpic6.png";
import centerTopBg from "../images/centertopbg1.png";
import intl from "react-intl-universal";

export default function MonitorCenterPanorama({ kpis, loading }) {
  const agentTotal = Number(kpis?.agentTotal) || 0;
  const userTotal = Number(kpis?.userTotal) || 0;
  const onlineEmployeeCount = Number(kpis?.onlineEmployeeCount) || 0;
  const tokenTotal = kpis?.tokenTotal || "--";

  const cards = [
    {
      name: intl.get("monitorDashboard.kpi.agentTotal"),
      value: loading ? "--" : String(agentTotal),
    },
    {
      name: intl.get("monitorDashboard.kpi.onlineEmployeeCount"),
      value: loading ? "--" : String(onlineEmployeeCount),
    },
    { name: intl.get("monitorDashboard.kpi.userTotal"), value: loading ? "--" : String(userTotal) },
    { name: intl.get("monitorDashboard.kpi.tokenConsumption"), value: loading ? "--" : tokenTotal }
  ];

  return (
    <div className="flex h-full w-full min-w-0 flex-col lg:col-span-2">
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
                  {/* 底座：指标名 + 可选统计口径 */}
                  <div className="absolute bottom-[8%] flex flex-col items-center gap-0.5 px-1">
                    <span className="text-[13px] text-[#e2f1fa] font-medium tracking-widest opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {card.name}
                    </span>
                    {card.sub ? (
                      <span className="text-[10px] text-[#8fb1c6]/90 tracking-wide">{card.sub}</span>
                    ) : null}
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
