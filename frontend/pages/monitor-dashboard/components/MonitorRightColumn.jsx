import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import intl from "react-intl-universal";
import { getAutoScrollDurationSec } from "../constants.js";
import MonitorPanel from "./MonitorPanel.jsx";

/**
 * 大屏列表在 CSS transform 动画下原生 `title` 常不弹出；用 portal + 跟随指针的浮层。
 */
function MonitorHoverTip({ text, className, children }) {
  const full = text != null ? String(text).trim() : "";
  const [tip, setTip] = useState(null);

  if (!full) {
    return <span className={className}>{children}</span>;
  }

  const show = (e) => {
    setTip({ x: e.clientX, y: e.clientY, text: full });
  };
  const move = (e) => {
    setTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  };
  const hide = () => setTip(null);

  const portal =
    tip &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="pointer-events-none fixed z-[9999] max-w-[min(420px,calc(100vw-24px))] whitespace-pre-wrap break-words rounded border border-[#1f547f] bg-[#06182b] px-2 py-1.5 text-[12px] leading-snug text-[#d7ecff] shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
        style={{
          left: `${tip.x}px`,
          top: `${tip.y + 14}px`,
          transform: "translateX(-50%)",
        }}
      >
        {tip.text}
      </div>,
      document.body
    );

  return (
    <>
      <span className={className} onMouseEnter={show} onMouseMove={move} onMouseLeave={hide}>
        {children}
      </span>
      {portal}
    </>
  );
}

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

/** 风险对话时间线卡片：首行 图标+姓名+等级；次行 时间；末行 内容单行省略，悬停 MonitorHoverTip 见全文 */
function RiskDialogueCard({ dialogue }) {
  const level = dialogue.riskLevel || "健康";
  const normalizedLevelMap = {
    high: "高危",
    medium: "中危",
    low: "低危",
    healthy: "健康",
  };
  const normalizedLevel = normalizedLevelMap[String(level).toLowerCase()] || level;
  const riskLevelLabelMap = {
    高危: intl.get("monitorDashboard.right.riskLevel.high"),
    中危: intl.get("monitorDashboard.right.riskLevel.medium"),
    低危: intl.get("monitorDashboard.right.riskLevel.low"),
    健康: intl.get("monitorDashboard.right.riskLevel.healthy"),
    high: intl.get("monitorDashboard.right.riskLevel.high"),
    medium: intl.get("monitorDashboard.right.riskLevel.medium"),
    low: intl.get("monitorDashboard.right.riskLevel.low"),
    healthy: intl.get("monitorDashboard.right.riskLevel.healthy"),
  };
  const levelLabel = riskLevelLabelMap[String(level).toLowerCase()] || riskLevelLabelMap[level] || String(level);
  const style = LEVEL_STYLES[normalizedLevel] || LEVEL_STYLES["健康"];
  const name = dialogue.agentName || dialogue.sessionId?.slice(0, 8) || intl.get("monitorDashboard.right.unknown");
  const rawContent = dialogue.content != null && String(dialogue.content).trim() !== "" ? String(dialogue.content) : "";
  const contentLine = rawContent || "—";

  return (
    <div className={`${style.cardBg} p-2.5 rounded relative ml-6 min-w-0`}>
      <div className={`absolute top-3 -left-[19px] w-2 h-2 rounded-full ${style.node} ring-2 ring-[#010611] z-10`} />
      {/* 第一行：图标、数字员工姓名、等级标签 */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-6 h-6 rounded flex items-center justify-center border ${style.icon} shrink-0`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 19a3 3 0 00-6 0m6 0a3 3 0 013 3H6a3 3 0 013-3m6 0v-1a3 3 0 00-3-3m0 0a3 3 0 00-3 3v1m3-4a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        </div>
        <MonitorHoverTip
          text={name}
          className="min-w-0 flex-1 text-[12px] font-medium text-white truncate cursor-default"
        >
          {name}
        </MonitorHoverTip>
        <span className={`shrink-0 text-[10px] leading-none px-1.5 py-0.5 rounded border ${style.badge}`}>
          {levelLabel}
        </span>
      </div>
      {/* 第二行：对话时间 */}
      <div className="mt-1.5 text-[10px] text-[#8fb1c6] tabular-nums">
        {intl.get("monitorDashboard.right.dialogueTime")} {dialogue.displayTime}
      </div>
      {/* 第三行：对话内容单行省略；悬停显示完整内容 */}
      <MonitorHoverTip
        text={rawContent}
        className="mt-1.5 block min-w-0 cursor-help text-[11px] leading-tight text-[#cbd5e1] truncate"
      >
        {contentLine}
      </MonitorHoverTip>
    </div>
  );
}

/**
 * 右列：会话概览四宫格 + 风险对话时间线
 * 风险对话与溯源同源启发式（extractSessionRisks）；消息级风险项，滚动近30天（与溯源全量列表范围不同）。
 *
 * @param {{
 *   sessionOverview?: object;
 *   riskSessions?: Array;
 *   riskSessionsTotal?: number;
 *   loadingOverview?: boolean;
 *   loadingRisk?: boolean;
 *   errorRisk?: string|null;
 * }} props
 */
export default function MonitorRightColumn({
  sessionOverview,
  riskSessions,
  riskSessionsTotal,
  loadingOverview,
  loadingRisk,
  errorRisk,
}) {
  const listViewportRef = useRef(null);
  const listContentRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const dash = loadingOverview ? "—" : undefined;

  const fmt = (n) =>
    dash ?? (n != null ? Number(n).toLocaleString() : "—");

  const statCards = [
    {
      label: intl.get("monitorDashboard.right.sessionTotal"),
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
      label: intl.get("monitorDashboard.right.highRiskSessions"),
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
      label: intl.get("monitorDashboard.right.mediumRiskSessions"),
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
      label: intl.get("monitorDashboard.right.lowRiskSessions"),
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

  // 风险对话列表：仅使用真实接口数据
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
    <div className="flex flex-col gap-3 w-full h-[calc(100%+2.5rem)] lg:-mt-10 min-w-0">
      {/* 会话概览：四宫格均为滚动近30天（最近一月） */}
      <MonitorPanel
        title={intl.get("monitorDashboard.right.sessionOverview")}
        className="shrink-0"
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

      {/* 风险对话：滚动近30天，与概览同窗口 */}
      <MonitorPanel
        title={intl.get("monitorDashboard.right.riskDialogue")}
        className="flex-1 min-h-[250px]"
        headerExtra={
          <span className="text-[10px] text-[#8fb1c6]">{intl.get("monitorDashboard.right.last24hCount", { count: riskList.length })}</span>
        }
      >
        <div ref={listViewportRef} className="relative h-full overflow-hidden px-2">
          <div className="absolute top-0 bottom-0 left-[18px] w-px bg-[#16436e]" />
          {loadingRisk ? (
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
          ) : errorRisk ? (
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
          ) : riskList.length === 0 ? (
            <div className="h-full flex items-center justify-center px-4">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center">
                  <svg className="h-4 w-4 text-[#5ba6d6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="text-sm text-[#8fb1c6]">{intl.get("monitorDashboard.noData")}</div>
              </div>
            </div>
          ) : (
            <div
              ref={listContentRef}
              className={`flex flex-col gap-4 ${shouldAutoScroll ? "animate-auto-scroll" : ""}`}
              style={
                shouldAutoScroll
                  ? {
                      "--auto-scroll-duration": `${getAutoScrollDurationSec(riskList.length)}s`,
                    }
                  : undefined
              }
            >
              {shouldAutoScroll ? (
                [1, 2].map((listKey) => (
                  <div key={listKey} className="flex flex-col gap-4">
                    {riskList.map((dialogue, idx) => (
                      <RiskDialogueCard key={`${listKey}-${dialogue.sessionId}-${idx}`} dialogue={dialogue} />
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex flex-col gap-4">
                  {riskList.map((dialogue, idx) => (
                    <RiskDialogueCard key={`${dialogue.sessionId}-${idx}`} dialogue={dialogue} />
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
