import { memo, useCallback, useEffect, useMemo, useState } from "react";

const barShell =
  "rounded-xl border border-gray-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-black/[0.03] dark:border-gray-600/80 dark:bg-gray-950/80 dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] dark:ring-white/[0.05]";

/** 单行右侧标题截断 */
function truncateOneLine(raw, max = 26) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 三点：每点直径 4px（viewBox 与 px 1:1，r=2）；cy 上下缓动 + opacity，负 begin 错相 */
const THINKING_BREATHE_DUR = "1.15s";
const THINKING_SPLINE = "0.42 0 0.58 1;0.42 0 0.58 1";

function ThinkingBreathDotsSvg() {
  const Dot = ({ cx, phaseBegin }) => (
    <circle cx={cx} cy="5" r="2" fill="currentColor">
      <animate
        attributeName="cy"
        values="5;3.35;5"
        keyTimes="0;0.5;1"
        dur={THINKING_BREATHE_DUR}
        repeatCount="indefinite"
        begin={phaseBegin}
        calcMode="spline"
        keySplines={THINKING_SPLINE}
      />
      <animate
        attributeName="opacity"
        values="0.38;1;0.38"
        keyTimes="0;0.5;1"
        dur={THINKING_BREATHE_DUR}
        repeatCount="indefinite"
        begin={phaseBegin}
        calcMode="spline"
        keySplines={THINKING_SPLINE}
      />
    </circle>
  );

  return (
    <>
      <svg
        className="h-2.5 w-5 shrink-0 text-gray-400 dark:text-gray-500 motion-reduce:hidden"
        viewBox="0 0 20 10"
        fill="none"
        aria-hidden
      >
        <Dot cx="2" phaseBegin="0s" />
        <Dot cx="10" phaseBegin="-0.42s" />
        <Dot cx="18" phaseBegin="-0.84s" />
      </svg>
      <svg
        className="hidden h-2.5 w-5 shrink-0 text-gray-400/80 dark:text-gray-500 motion-reduce:block"
        viewBox="0 0 20 10"
        fill="currentColor"
        aria-hidden
      >
        <circle cx="2" cy="5" r="2" />
        <circle cx="10" cy="5" r="2" />
        <circle cx="18" cy="5" r="2" />
      </svg>
    </>
  );
}

function ChevronTiny({ expanded, className = "" }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 motion-reduce:transition-none dark:text-sky-400/90 ${expanded ? "rotate-180" : ""} ${className}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path d="M5.5 7.5 10 12l4.5-4.5H5.5Z" />
    </svg>
  );
}

function LeftThinkingCluster({ active }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      {active ? <ThinkingBreathDotsSvg /> : null}
       <span className="text-[12px] font-semibold tracking-tight text-gray-500 dark:text-gray-100">
        {active ? "思考中" : "已完成"}
      </span>
    </span>
  );
}

function RightStatus({ right, badge, showChevron, expanded }) {
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-2">
      <span className="truncate text-[12px] font-semibold text-gray-500 dark:text-sky-400">{right}</span>
      {showChevron ? <ChevronTiny expanded={expanded} /> : null}
    </span>
  );
}

/**
 * Cursor 风格单行条：左「思考中」+ 动效点，右侧主色状态；可选展开箭头。
 * @param {{ unframed?: boolean }} opts - 为 true 时不加外框（由父级 panel 包一层圆角边框）
 */
export function ThinkingStreamBar({
  active = true,
  rightTitle,
  badge,
  expandable = false,
  expanded = false,
  onToggle,
  unframed = false,
}) {
  const right = truncateOneLine(rightTitle || (active ? "Agent 正在处理" : "已完成"), 32);
  const showChevron = Boolean(expandable && typeof onToggle === "function");
  const rowClass = `flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left ${
    showChevron
      ? "cursor-pointer transition-colors hover:bg-gray-50/95 dark:hover:bg-gray-800/55"
      : ""
  }`;

  const row = (
    <>
      <LeftThinkingCluster active={active} />
      <RightStatus right={right} badge={badge} showChevron={showChevron} expanded={expanded} />
    </>
  );

  if (showChevron) {
    return (
      <button
        type="button"
        className={`${unframed ? "" : `${barShell} `}${rowClass}`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {row}
      </button>
    );
  }

  const frame = unframed ? rowClass : `${barShell} ${rowClass}`;
  return (
    <div className={frame} role="status" aria-live="polite">
      {row}
    </div>
  );
}

/**
 * Agent 思考过程：步骤列表 + 点击展开查看详情（detail、时间）
 */
const AgentThinkingPanel = memo(function AgentThinkingPanel({ steps, isRunning }) {
  const [expanded, setExpanded] = useState({});
  const [collapsed, setCollapsed] = useState(true);

  const doneStepCount = useMemo(
    () => steps.filter((s) => s.status === "done").length,
    [steps],
  );
  const latestStep = useMemo(
    () => [...steps].reverse().find((s) => s.status === "running") ?? steps[steps.length - 1] ?? null,
    [steps],
  );

  const headerActive = Boolean(isRunning || latestStep?.status === "running");
  const rightTitle = headerActive ? "Agent 正在处理" : truncateOneLine(latestStep?.name || "Agent 思考过程", 26);
  const badge = steps.length > 0 ? `${doneStepCount}/${steps.length} 步` : null;

  useEffect(() => {
    if (steps.length === 0) {
      setExpanded({});
      setCollapsed(true);
    }
  }, [steps.length]);

  useEffect(() => {
    const running = steps.filter((s) => s.status === "running").pop();
    if (running?.id) {
      setExpanded((e) => ({ ...e, [running.id]: true }));
    }
  }, [steps]);

  const toggle = useCallback((id) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  const formatTime = useCallback((ts) => {
    if (ts == null) return "";
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  }, []);

  return (
    <div className={`${barShell} overflow-hidden`}>
      <ThinkingStreamBar
        unframed
        active={headerActive}
        rightTitle={rightTitle}
        badge={badge}
        expandable
        expanded={!collapsed}
        onToggle={toggleCollapsed}
      />
      {!collapsed && (
        <div className="max-h-52 space-y-0.5 overflow-y-auto border-t border-gray-200/80 bg-gradient-to-b from-gray-50/95 to-gray-50/75 px-1 py-1.5 dark:border-gray-700/70 dark:from-gray-950/65 dark:to-gray-950/40">
          {steps.map((step) => {
            const id = step.id ?? step.name;
            const open = !!expanded[id];
            const hasDetail = Boolean(step.detail && String(step.detail).trim());
            return (
              <div
                key={id}
                className="rounded-lg border border-transparent transition hover:border-gray-200/90 dark:hover:border-gray-700/70"
              >
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/95 dark:hover:bg-gray-900/90"
                  aria-expanded={open}
                >
                  {step.status === "running" ? (
                    <svg
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none dark:text-sky-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${step.status === "running" ? "text-primary dark:text-sky-400" : "text-gray-700 dark:text-gray-200"}`}>
                        {step.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">{open ? "▲" : "▼"}</span>
                      {!hasDetail && !open && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">展开</span>
                      )}
                    </div>
                    {!open && hasDetail && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500 dark:text-gray-400">{step.detail}</p>
                    )}
                  </div>
                </button>
                {open && (
                  <div className="border-t border-gray-200/60 px-2 pb-2 pt-1.5 dark:border-gray-700/60">
                    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                      <span>开始 {formatTime(step.ts)}</span>
                      {step.status === "done" && step.finishedAt != null && (
                        <span>结束 {formatTime(step.finishedAt)}</span>
                      )}
                      {step.status === "done" && step.finishedAt != null && step.ts != null && (
                        <span className="tabular-nums">耗时 {Math.max(0, step.finishedAt - step.ts)} ms</span>
                      )}
                    </div>
                    {hasDetail ? (
                      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
                        {step.detail}
                      </p>
                    ) : (
                      <p className="text-[11px] italic text-gray-400 dark:text-gray-500">本步骤暂无详细说明</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default AgentThinkingPanel;
