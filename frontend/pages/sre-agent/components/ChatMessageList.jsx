import { stripOpenClawHiddenBlocks } from "../messageDisplayUtils.js";
import AssistantMessageGroup from "./AssistantMessageGroup.jsx";
import ConfirmCard from "./ConfirmCard.jsx";
import ToolCallIndicator from "./ToolCallIndicator.jsx";
import UserBubble from "./UserBubble.jsx";

export default function ChatMessageList({
  messages,
  toolCallList,
  confirm,
  isRunning,
  steps,
  error,
  chatEndRef,
  handleSend,
  setInput,
  inputRef,
  respondConfirm,
  onOpenSreVizItem,
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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

      {toolCallList.length > 0 && (
        <div className="space-y-1.5">
          {toolCallList.map((tc) => (
            <ToolCallIndicator key={tc.id} tc={tc} />
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmCard confirm={confirm} onRespond={respondConfirm} />
      )}

      {isRunning && messages.every((m) => !m.streaming) && steps.every((s) => s.status === "done") && (
        <div className="flex gap-1 px-1 py-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}
