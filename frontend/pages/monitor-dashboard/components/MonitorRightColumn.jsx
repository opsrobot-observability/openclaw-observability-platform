import MonitorPanel from "./MonitorPanel.jsx";
import { useMonitorDashboard } from "../hooks/MonitorDashboardContext.jsx";

function fmtInt(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString();
}

const RISK_STYLES = [
  {
    wrap: "bg-[#1a0f14]/80 border-red-500/30",
    dot: "bg-red-500",
    ring: "ring-red-500",
    badge: "border-red-500 text-red-500 bg-red-500/10",
    label: "高危",
    iconBg: "bg-red-900/50 text-red-400 border-red-500/30",
  },
  {
    wrap: "bg-[#1a180f]/80 border-yellow-500/30",
    dot: "bg-yellow-500",
    ring: "ring-yellow-500",
    badge: "border-yellow-500 text-yellow-500 bg-yellow-500/10",
    label: "中危",
    iconBg: "bg-yellow-900/50 text-yellow-400 border-yellow-500/30",
  },
  {
    wrap: "bg-[#0f151a]/80 border-[#00f0ff]/30",
    dot: "bg-blue-400",
    ring: "ring-[#00f0ff]",
    badge: "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/10",
    label: "低危",
    iconBg: "bg-[#00f0ff]/20 text-[#00f0ff] border-[#00f0ff]/30",
  },
];

export default function MonitorRightColumn() {
  const { data } = useMonitorDashboard();
  const s = data?.sessionOverview;
  const riskOps = data?.audit?.tops?.riskOps;

  return (
    <div className="flex flex-col gap-3 w-full lg:w-1/4 h-[calc(100%+2.5rem)] lg:-mt-10">
      <MonitorPanel title="会话概览" className="shrink-0">
        <div className="grid grid-cols-2 gap-3 px-1 py-2">
          {/* 总会话数 */}
          <div className="relative p-3 bg-[#011428]/80 border border-[#16436e] rounded border-t-[#3b82f6] border-t-2 shadow-[inset_0_15px_30px_rgba(59,130,246,0.05)] flex flex-col justify-center transition-all hover:bg-[#011a33] hover:border-[#3b82f6]/50">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <span className="text-[#8fb1c6] text-[12px] font-medium tracking-wide">总会话数</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-bold text-white font-mono leading-none">
                {s ? fmtInt(s.todaySessionTotal) : "—"}
              </span>
            </div>
          </div>

          {/* 高危会话数 */}
          <div className="relative p-3 bg-[#011428]/80 border border-[#16436e] rounded border-t-[#ef4444] border-t-2 shadow-[inset_0_15px_30px_rgba(239,68,68,0.05)] flex flex-col justify-center transition-all hover:bg-[#011a33] hover:border-[#ef4444]/50">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-[#ef4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-[#8fb1c6] text-[12px] font-medium tracking-wide">高风险操作</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-bold text-white font-mono leading-none">
                {s ? fmtInt(s.riskHigh) : "—"}
              </span>
            </div>
          </div>

          {/* 中危会话数 */}
          <div className="relative p-3 bg-[#011428]/80 border border-[#16436e] rounded border-t-[#eab308] border-t-2 shadow-[inset_0_15px_30px_rgba(234,179,8,0.05)] flex flex-col justify-center transition-all hover:bg-[#011a33] hover:border-[#eab308]/50">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-[#eab308]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[#8fb1c6] text-[12px] font-medium tracking-wide">中风险操作</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-bold text-white font-mono leading-none">
                {s ? fmtInt(s.riskMedium) : "—"}
              </span>
            </div>
          </div>

          {/* 低危会话数 */}
          <div className="relative p-3 bg-[#011428]/80 border border-[#16436e] rounded border-t-[#00f0ff] border-t-2 shadow-[inset_0_15px_30px_rgba(0,240,255,0.05)] flex flex-col justify-center transition-all hover:bg-[#011a33] hover:border-[#00f0ff]/50">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-[#00f0ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[#8fb1c6] text-[12px] font-medium tracking-wide">低风险操作</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-bold text-white font-mono leading-none">
                {s ? fmtInt(s.riskLow) : "—"}
              </span>
            </div>
          </div>
        </div>
      </MonitorPanel>

      <MonitorPanel
        title="风险会话"
        className="flex-1 min-h-[250px]"
      >
        <div className="relative h-full overflow-hidden px-2">
          {/* 左侧时间线主轴 */}
          <div className="absolute top-0 bottom-0 left-[18px] w-px bg-[#16436e]" />
          
          <div className="flex flex-col gap-4 animate-auto-scroll">
            {[1, 2].map((listKey) => (
              <div key={listKey} className="flex flex-col gap-4">
                {(riskOps?.length
                  ? riskOps.slice(0, 6)
                  : [
                      { name: "（暂无风险操作样本）", cnt: 0 },
                    ]
                ).map((op, idx) => {
                  const st = RISK_STYLES[idx % RISK_STYLES.length];
                  return (
                    <div key={`${listKey}-${idx}-${op.name}`} className={`${st.wrap} border p-2 rounded relative ml-6`}>
                      <div
                        className={`absolute top-4 -left-[19px] w-2 h-2 rounded-full ${st.dot} ring-2 ${st.ring} ring-[#010611] z-10`}
                      />
                      <div className={`absolute top-2 right-2 border text-[10px] px-1 rounded ${st.badge}`}>{st.label}</div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-6 h-6 rounded flex items-center justify-center border ${st.iconBg}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.8}
                              d="M15 19a3 3 0 00-6 0m6 0a3 3 0 013 3H6a3 3 0 013-3m6 0v-1a3 3 0 00-3-3m0 0a3 3 0 00-3 3v1m3-4a3 3 0 100-6 3 3 0 000 6z"
                            />
                          </svg>
                        </div>
                        <div className="text-sm font-medium text-[12px] pr-8 truncate">{op.name}</div>
                      </div>
                      <div className="text-[#8fb1c6] text-[10px] mb-1">次数: {fmtInt(op.cnt)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </MonitorPanel>
    </div>
  );
}
