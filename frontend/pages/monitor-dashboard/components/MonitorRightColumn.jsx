import { useEffect, useRef, useState } from "react";
import MonitorPanel from "./MonitorPanel.jsx";

const LEVEL_STYLES = {
  高危: {
    cardBg: "bg-[#1a0f14]/80 border border-red-500/30",
    node: "bg-red-500 shadow-[0_0_5px_#ef4444]",
    badge: "border-red-500 text-red-500 bg-red-500/10",
    icon: "text-red-400 bg-red-900/50 border-red-500/30",
  },
  中危: {
    cardBg: "bg-[#1a180f]/80 border border-yellow-500/30",
    node: "bg-yellow-500 shadow-[0_0_5px_#eab308]",
    badge: "border-yellow-500 text-yellow-500 bg-yellow-500/10",
    icon: "text-yellow-400 bg-yellow-900/50 border-yellow-500/30",
  },
  低危: {
    cardBg: "bg-[#0f151a]/80 border border-[#00f0ff]/30",
    node: "bg-blue-400 shadow-[0_0_5px_#3b82f6]",
    badge: "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/10",
    icon: "text-[#00f0ff] bg-[#00f0ff]/20 border-[#00f0ff]/30",
  },
  健康: {
    cardBg: "bg-[#0a1a12]/80 border border-green-500/20",
    node: "bg-green-500 shadow-[0_0_4px_#22c55e]",
    badge: "border-green-500 text-green-400 bg-green-500/10",
    icon: "text-green-400 bg-green-900/40 border-green-500/30",
  },
};

/** 风险会话时间线卡片 */
function RiskSessionCard({ session }) {
  const level = session.riskLevel || "健康";
  const style = LEVEL_STYLES[level] || LEVEL_STYLES["健康"];
  const name = session.agentName || session.accountName || session.sessionId?.slice(0, 8) || "未知Agent";

  return (
    <div className={`${style.cardBg} p-2 rounded relative ml-6`}>
      <div className={`absolute top-4 -left-[19px] w-2 h-2 rounded-full ${style.node} ring-2 ring-[#010611] z-10`} />
      <div className={`absolute top-2 right-2 border ${style.badge} text-[10px] px-1 rounded`}>
        {level}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-6 h-6 rounded flex items-center justify-center border ${style.icon} shrink-0`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 19a3 3 0 00-6 0m6 0a3 3 0 013 3H6a3 3 0 013-3m6 0v-1a3 3 0 00-3-3m0 0a3 3 0 00-3 3v1m3-4a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        </div>
        <div className="text-[12px] font-medium pr-8 truncate max-w-[140px]" title={name}>{name}</div>
      </div>
      {session.channel && (
        <div className="text-[#8fb1c6] text-[10px] mb-0.5">渠道: {session.channel}</div>
      )}
      <div className="text-[#8fb1c6] text-[10px]">会话时间: {session.displayTime}</div>
    </div>
  );
}

/**
 * 右列：会话概览四宫格（来自 agent_sessions）+ 风险会话时间线（来自 agent_sessions_logs）
 * 数据口径与行为审计概览页一致，统计维度：最近30天
 *
 * @param {{
 *   sessionOverview?: object;
 *   riskSessions?: Array;
 *   riskSessionsTotal?: number;
 *   loadingOverview?: boolean;
 *   loadingRisk?: boolean;
 * }} props
 */
export default function MonitorRightColumn({
  sessionOverview,
  riskSessions,
  riskSessionsTotal,
  loadingOverview,
  loadingRisk,
}) {
  const listViewportRef = useRef(null);
  const listContentRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const dash = loadingOverview ? "—" : undefined;

  const fmt = (n) =>
    dash ?? (n != null ? Number(n).toLocaleString() : "—");

  const statCards = [
    {
      label: "会话总数",
      value: fmt(sessionOverview?.sessionTotal),
      color: "#3b82f6",
      topBorder: "border-t-[#3b82f6]",
      shadow: "shadow-[inset_0_15px_30px_rgba(59,130,246,0.05)]",
      hover: "hover:border-[#3b82f6]/50",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      ),
    },
    {
      label: "高危会话",
      value: fmt(sessionOverview?.highRiskSessions),
      color: "#ef4444",
      topBorder: "border-t-[#ef4444]",
      shadow: "shadow-[inset_0_15px_30px_rgba(239,68,68,0.05)]",
      hover: "hover:border-[#ef4444]/50",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      ),
    },
    {
      label: "中危会话",
      value: fmt(sessionOverview?.mediumRiskSessions),
      color: "#eab308",
      topBorder: "border-t-[#eab308]",
      shadow: "shadow-[inset_0_15px_30px_rgba(234,179,8,0.05)]",
      hover: "hover:border-[#eab308]/50",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      ),
    },
    {
      label: "低危会话",
      value: fmt(sessionOverview?.lowRiskSessions),
      color: "#00f0ff",
      topBorder: "border-t-[#00f0ff]",
      shadow: "shadow-[inset_0_15px_30px_rgba(0,240,255,0.05)]",
      hover: "hover:border-[#00f0ff]/50",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      ),
    },
  ];

  // 风险会话列表：仅使用真实接口数据
  const riskList = Array.isArray(riskSessions) ? riskSessions : [];

  useEffect(() => {
    const viewportEl = listViewportRef.current;
    const contentEl = listContentRef.current;
    if (!viewportEl || !contentEl || loadingRisk || riskList.length === 0) {
      setShouldAutoScroll(false);
      return;
    }

    const measure = () => {
      // 内容高度超出容器高度时，才启用自动滚动动画
      setShouldAutoScroll(contentEl.scrollHeight > viewportEl.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewportEl);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [loadingRisk, riskList]);

  return (
    <div className="flex flex-col gap-3 w-full lg:w-1/4 h-[calc(100%+2.5rem)] lg:-mt-10">
      {/* 会话概览四宫格 — 最近30天统计，与行为审计概览同源 */}
      <MonitorPanel
        title="会话概览"
        className="shrink-0"
        headerExtra={
          <span className="text-[10px] text-[#8fb1c6]">近30天</span>
        }
      >
        <div className="grid grid-cols-2 gap-3 px-1 py-2">
          {statCards.map((card) => (
            <div
              key={card.label}
              className={`relative p-3 bg-[#011428]/80 border border-[#16436e] rounded ${card.topBorder} border-t-2 ${card.shadow} flex flex-col justify-center transition-all hover:bg-[#011a33] ${card.hover}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={card.color}>
                  {card.icon}
                </svg>
                <span className="text-[#8fb1c6] text-[11px] font-medium tracking-wide">{card.label}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-white font-mono leading-none">{card.value}</span>
              </div>
            </div>
          ))}
        </div>
      </MonitorPanel>

      {/* 风险会话时间线 — 最近30天风险会话，按时间倒序 */}
      <MonitorPanel
        title="风险会话"
        className="flex-1 min-h-[250px]"
        headerExtra={
          <span className="text-[10px] text-[#8fb1c6]">
            近30天 · 最新 {loadingRisk ? "" : `(${riskSessionsTotal ?? riskList.length})`}
          </span>
        }
      >
        <div ref={listViewportRef} className="relative h-full overflow-hidden px-2">
          <div className="absolute top-0 bottom-0 left-[18px] w-px bg-[#16436e]" />
          {loadingRisk ? (
            <div className="text-[#8fb1c6] text-xs text-center pt-4">加载中…</div>
          ) : riskList.length === 0 ? (
            <div className="text-[#8fb1c6] text-xs text-center pt-4">暂无风险会话数据</div>
          ) : (
            <div
              ref={listContentRef}
              className={`flex flex-col gap-4 ${shouldAutoScroll ? "animate-auto-scroll" : ""}`}
            >
              {shouldAutoScroll ? (
                [1, 2].map((listKey) => (
                  <div key={listKey} className="flex flex-col gap-4">
                    {riskList.map((session, idx) => (
                      <RiskSessionCard key={`${listKey}-${idx}`} session={session} />
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex flex-col gap-4">
                  {riskList.map((session, idx) => (
                    <RiskSessionCard key={idx} session={session} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </MonitorPanel>
    </div>
  );
}
