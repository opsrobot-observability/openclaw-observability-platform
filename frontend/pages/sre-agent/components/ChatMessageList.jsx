import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stripOpenClawHiddenBlocks } from "../messageDisplayUtils.js";
import AssistantMessageGroup from "./AssistantMessageGroup.jsx";
import ConfirmCard from "./ConfirmCard.jsx";
import UserBubble from "./UserBubble.jsx";

const BOTTOM_THRESHOLD_PX = 80;

function isNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
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
  const followBottomRef = useRef(true);
  const prevConversationKeyRef = useRef(undefined);
  const prevLastUserIdRef = useRef(null);
  const prevContentSigRef = useRef("");
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const showInlineThinking = useMemo(() => {
    const hasVisibleStream = messages.some(
      (m) =>
        m.role === "assistant" &&
        m.streaming &&
        stripOpenClawHiddenBlocks(m.content ?? "").trim().length > 0,
    );
    if (hasVisibleStream || error) return false;
    const hasRunningStep = Array.isArray(steps) && steps.some((s) => s.status === "running");
    const lastMessageIsUser =
      messages.length > 0 && messages[messages.length - 1].role === "user";
    return isRunning || hasRunningStep || lastMessageIsUser;
  }, [messages, steps, isRunning, error]);

  const scrollContainerToBottom = useCallback((behavior) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: behavior === "smooth" ? "smooth" : "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    followBottomRef.current = near;
    setAwayFromBottom(!near);
    if (near) setHasNewBelow(false);
  }, []);

  useEffect(() => {
    const prev = prevConversationKeyRef.current;
    if (prev !== undefined && conversationResetKey === prev) return;
    prevConversationKeyRef.current = conversationResetKey;
    followBottomRef.current = true;
    prevLastUserIdRef.current = null;
    setAwayFromBottom(false);
    setHasNewBelow(false);
    prevContentSigRef.current = "";
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        scrollContainerToBottom("auto");
        handleScroll();
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [conversationResetKey, scrollContainerToBottom, handleScroll]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    if (last.id === prevLastUserIdRef.current) return;
    prevLastUserIdRef.current = last.id;
    followBottomRef.current = true;
    setAwayFromBottom(false);
    setHasNewBelow(false);
    const raf = requestAnimationFrame(() => {
      scrollContainerToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, scrollContainerToBottom]);

  useEffect(() => {
    const sig = buildScrollContentSig(messages, steps, confirm, toolCallList);
    if (!followBottomRef.current) {
      if (prevContentSigRef.current && sig !== prevContentSigRef.current) {
        setHasNewBelow(true);
      }
      prevContentSigRef.current = sig;
      return;
    }
    prevContentSigRef.current = sig;
    const raf = requestAnimationFrame(() => {
      if (!followBottomRef.current) return;
      scrollContainerToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, steps, confirm, toolCallList, scrollContainerToBottom]);

  const handleJumpToBottom = useCallback(() => {
    followBottomRef.current = true;
    setHasNewBelow(false);
    setAwayFromBottom(false);
    scrollContainerToBottom("smooth");
  }, [scrollContainerToBottom]);

  const showJumpFab = awayFromBottom && messages.length > 0;
  const jumpFabLiveReply = isRunning;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            const userVisible = stripOpenClawHiddenBlocks(msg.content);
            if (!userVisible.trim()) return null;
            return <UserBubble key={msg.id} text={userVisible} />;
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

        {showInlineThinking && (
          <div
            className="flex items-center gap-2 px-1 py-2"
            role="status"
            aria-live="polite"
          >
            <span className="text-[11px] text-gray-500 dark:text-gray-400">思考中</span>
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms] dark:bg-gray-500" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms] dark:bg-gray-500" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms] dark:bg-gray-500" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div ref={chatEndRef} />
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
