import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { stripOpenClawHiddenBlocks } from "../messageDisplayUtils.js";
import AssistantMessageGroup from "./AssistantMessageGroup.jsx";
import AgentThinkingPanel, { ThinkingStreamBar } from "./AgentThinkingPanel.jsx";
import ConfirmCard from "./ConfirmCard.jsx";
import UserBubble from "./UserBubble.jsx";

const BOTTOM_THRESHOLD_PX = 80;

/** 最后一条「有可见正文」的用户消息下标（与 UserBubble 是否渲染一致）。 */
function findLastRenderableUserMessageIndex(messages) {
  let i = -1;
  if (!Array.isArray(messages)) return -1;
  for (let j = 0; j < messages.length; j++) {
    if (messages[j].role !== "user") continue;
    const visible = stripOpenClawHiddenBlocks(messages[j].content ?? "").trim();
    if (visible) i = j;
  }
  return i;
}

/** 自 lastUserIdx 后起至下一条 user 之前的第一个 assistant（本轮回复占位）。 */
function assistantReplyAfterUser(messages, lastUserIdx) {
  if (!Array.isArray(messages) || lastUserIdx < 0) return null;
  for (let j = lastUserIdx + 1; j < messages.length; j++) {
    if (messages[j].role === "user") return null;
    if (messages[j].role === "assistant") return messages[j];
  }
  return null;
}

/**
 * Cursor 风格：仅在「本条用户消息对应的回复尚无可见正文」阶段展示思考占位；可见输出出现后或本轮空手结束则隐藏。
 * @returns {{ show: false } | { show: true, showPanel: boolean, showDots: boolean }}
 */
function deriveCurrentTurnThinkingUi({ messages, steps, isRunning, error }) {
  if (error) return { show: false };

  const lastUserIdx = findLastRenderableUserMessageIndex(messages);
  if (lastUserIdx < 0) return { show: false };

  const assist = assistantReplyAfterUser(messages, lastUserIdx);
  const visibleOut = Boolean(
    assist && stripOpenClawHiddenBlocks(assist.content ?? "").trim().length > 0,
  );
  if (visibleOut) return { show: false };

  const streamDoneNoOutput =
    assist && !assist.streaming && !visibleOut && !isRunning;
  if (streamDoneNoOutput) return { show: false };

  const hasSteps = Array.isArray(steps) && steps.length > 0;
  if (!isRunning && !hasSteps) return { show: false };

  return {
    show: true,
    showPanel: hasSteps,
    showDots: !hasSteps && isRunning,
  };
}

function isNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
}

function scrollElementToBottom(el, behavior) {
  if (!el) return;
  const top = Math.max(0, el.scrollHeight - el.clientHeight);
  el.scrollTo({ top, behavior: behavior === "smooth" ? "smooth" : "auto" });
}

function buildScrollContentSig(messages, steps, confirm, toolCallList) {
  const last = messages[messages.length - 1];
  const stepTail = Array.isArray(steps)
    ? steps.map((s) => `${s.id ?? ""}:${s.status ?? ""}:${s.name ?? ""}`).join(";")
    : "";
  return [
    messages.length,
    last?.id ?? "",
    last?.role ?? "",
    last?.content?.length ?? 0,
    last?.streaming ? 1 : 0,
    confirm ? "1" : "0",
    Array.isArray(toolCallList) ? toolCallList.length : 0,
    stepTail,
  ].join("|");
}

export default function ChatMessageList({
  messages,
  toolCallList,
  confirm,
  isRunning,
  steps,
  error,
  chatEndRef,
  conversationResetKey,
  handleSend,
  setInput,
  inputRef,
  respondConfirm,
  onOpenSreVizItem,
}) {
  const scrollRef = useRef(null);
  /** 包住列表根节点：ResizeObserver / MutationObserver 捕获 Markdown 内部 DOM 变化 */
  const scrollContentMeasureRef = useRef(null);
  /** 用户希望「粘底」：会话切换 / 自己发消息 / 点回到底部。勿用几何 near 替代，否则中间态 scroll 事件会关掉粘底，Resize 回调不再滚到底 */
  const stickBottomRef = useRef(true);
  /** 本次滚动事件是否为程序化设置 scrollTop（避免误判为用户上滑） */
  const programmaticScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const prevConversationKeyRef = useRef(undefined);
  const prevLastUserIdRef = useRef(null);
  const prevContentSigRef = useRef("");
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const turnThinking = useMemo(
    () => deriveCurrentTurnThinkingUi({ messages, steps, isRunning, error }),
    [messages, steps, isRunning, error],
  );

  const lastRenderableUserIdx = useMemo(() => findLastRenderableUserMessageIndex(messages), [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    const st = el.scrollTop;
    const prevTop = lastScrollTopRef.current;
    lastScrollTopRef.current = st;

    if (!programmaticScrollRef.current) {
      if (near) {
        stickBottomRef.current = true;
      } else if (prevTop - st > 6) {
        /** 明确向上滚动（非布局抖动），解除粘底 */
        stickBottomRef.current = false;
      }
    }

    setAwayFromBottom(!near);
    if (near) setHasNewBelow(false);
  }, []);

  const scrollContainerToBottom = useCallback((behavior) => {
    const el = scrollRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    scrollElementToBottom(el, behavior);
    lastScrollTopRef.current = el.scrollTop;
    requestAnimationFrame(() => {
      const box = scrollRef.current;
      if (!box) {
        programmaticScrollRef.current = false;
        return;
      }
      lastScrollTopRef.current = box.scrollTop;
      programmaticScrollRef.current = false;
      handleScroll();
    });
  }, [handleScroll]);

  /** 切换会话 / 新会话 id：在布局提交后立即滚到底，避免 flex 未结算时 scrollHeight 偏小（历史会话从列表打开） */
  useLayoutEffect(() => {
    const prev = prevConversationKeyRef.current;
    if (prev !== undefined && conversationResetKey === prev) return;
    prevConversationKeyRef.current = conversationResetKey;
    stickBottomRef.current = true;
    prevLastUserIdRef.current = null;
    setAwayFromBottom(false);
    setHasNewBelow(false);
    prevContentSigRef.current = "";

    const snapToBottom = () => {
      scrollContainerToBottom("auto");
    };

    snapToBottom();
    const raf = requestAnimationFrame(() => {
      snapToBottom();
    });
    return () => cancelAnimationFrame(raf);
  }, [conversationResetKey, scrollContainerToBottom]);

  /** 滚轮向上：明确的「离开底部」意图（避免仅靠几何误判关掉粘底） */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY < -4) stickBottomRef.current = false;
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** Markdown 排版 / 内部 DOM 更新：粘底时持续对齐（几何 near 与 stick 解耦） */
  useLayoutEffect(() => {
    const measureEl = scrollContentMeasureRef.current;
    if (!measureEl) return;

    let moRaf = 0;
    const scheduleSnap = () => {
      if (!stickBottomRef.current) return;
      cancelAnimationFrame(moRaf);
      moRaf = requestAnimationFrame(() => {
        moRaf = 0;
        if (!stickBottomRef.current) return;
        scrollContainerToBottom("auto");
      });
    };

    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(scheduleSnap);
      ro.observe(measureEl);
    }

    let mo = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(scheduleSnap);
      mo.observe(measureEl, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }

    scheduleSnap();
    return () => {
      cancelAnimationFrame(moRaf);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [conversationResetKey, scrollContainerToBottom]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    if (last.id === prevLastUserIdRef.current) return;
    prevLastUserIdRef.current = last.id;
    stickBottomRef.current = true;
    setAwayFromBottom(false);
    setHasNewBelow(false);
    const raf = requestAnimationFrame(() => {
      scrollContainerToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, scrollContainerToBottom]);

  useEffect(() => {
    const sig = buildScrollContentSig(messages, steps, confirm, toolCallList);
    if (!stickBottomRef.current) {
      if (prevContentSigRef.current && sig !== prevContentSigRef.current) {
        setHasNewBelow(true);
      }
      prevContentSigRef.current = sig;
      return;
    }
    prevContentSigRef.current = sig;
    const raf = requestAnimationFrame(() => {
      if (!stickBottomRef.current) return;
      scrollContainerToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, steps, confirm, toolCallList, scrollContainerToBottom]);

  const handleJumpToBottom = useCallback(() => {
    stickBottomRef.current = true;
    setHasNewBelow(false);
    setAwayFromBottom(false);
    scrollContainerToBottom("auto");
  }, [scrollContainerToBottom]);

  /** 粘底会话载入过程中几何上可能暂时不在底部，不弹出 FAB */
  const showJumpFab = awayFromBottom && !stickBottomRef.current && messages.length > 0;
  const jumpFabLiveReply = isRunning;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        <div ref={scrollContentMeasureRef} className="space-y-3">
          {messages.map((msg, idx) => {
          if (msg.role === "user") {
            const userVisible = stripOpenClawHiddenBlocks(msg.content);
            if (!userVisible.trim()) return null;
            const injectThinking = turnThinking.show && idx === lastRenderableUserIdx;
            return (
              <Fragment key={msg.id}>
                <UserBubble text={userVisible} />
                {injectThinking ? (
                  <div className="px-1">
                    {turnThinking.showPanel ? (
                      <AgentThinkingPanel steps={steps} isRunning={isRunning} />
                    ) : (
                      <ThinkingStreamBar active />
                    )}
                  </div>
                ) : null}
              </Fragment>
            );
          }
          if (msg.role !== "assistant") return null;
          return (
            <AssistantMessageGroup
              key={msg.id}
              msg={msg}
              isLast={idx === messages.length - 1}
              isRunning={isRunning}
              onSelect={handleSend}
              setInput={setInput}
              inputRef={inputRef}
              onOpenSreVizItem={onOpenSreVizItem}
            />
          );
          })}

          {confirm && (
            <ConfirmCard confirm={confirm} onRespond={respondConfirm} />
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {showJumpFab && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center justify-end">
          {jumpFabLiveReply ? (
            <div className="pointer-events-auto relative h-[43px] w-[43px] shrink-0 overflow-hidden rounded-full shadow-[0_4px_18px_rgba(22,93,255,0.32)] dark:shadow-[0_4px_22px_rgba(56,189,248,0.26)]">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-[spin_3.2s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_228deg,rgba(91,157,255,0.45)_258deg,#165DFF_286deg,#93C5FD_308deg,transparent_332deg,transparent_360deg)] dark:bg-[conic-gradient(from_0deg,transparent_0deg,transparent_228deg,rgba(56,189,248,0.4)_258deg,#38bdf8_288deg,#bae6fd_310deg,transparent_332deg,transparent_360deg)]"
              />
              <button
                type="button"
                onClick={handleJumpToBottom}
                title={hasNewBelow ? "回到底部（下方有新内容）" : "回到底部"}
                aria-label={hasNewBelow ? "回到底部，下方有新内容" : "回到底部"}
                className="absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-900 transition hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
              >
                <svg
                  className="h-[22px] w-[22px] shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 5v12" />
                  <path d="M8 14l4 4 4-4" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleJumpToBottom}
              title="回到底部"
              aria-label="回到底部"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-[0_2px_12px_rgba(15,23,42,0.1)] transition hover:bg-gray-50 hover:shadow-[0_3px_14px_rgba(15,23,42,0.12)] dark:bg-gray-800 dark:text-gray-100 dark:shadow-[0_2px_14px_rgba(0,0,0,0.45)] dark:hover:bg-gray-700"
            >
              <svg
                className="h-[22px] w-[22px] shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 5v12" />
                <path d="M8 14l4 4 4-4" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
