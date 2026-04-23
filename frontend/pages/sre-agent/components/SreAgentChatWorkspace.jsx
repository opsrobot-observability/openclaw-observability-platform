import WorkspaceRenderer from "../../../components/agui/WorkspaceRenderer.jsx";
import { CHAT_SPLIT_MIN, USE_MOCK } from "../constants.js";
import AgentPicker from "./AgentPicker.jsx";
import AgentThinkingPanel from "./AgentThinkingPanel.jsx";
import ChatMessageList from "./ChatMessageList.jsx";
import InputBar from "./InputBar.jsx";
import { RobotIcon } from "./SreAgentIcons.jsx";

export default function SreAgentChatWorkspace({
  chatSplitContainerRef,
  splitLeftPx,
  splitDragging,
  handleChatSplitMouseDown,
  resetConversation,
  isRunning,
  selectedAgentMeta,
  selectedAgentId,
  sessionThreadId,
  activeOpenClawSessionKey,
  steps,
  messages,
  toolCallList,
  confirm,
  error,
  chatEndRef,
  input,
  handleSend,
  setInput,
  handleKeyDown,
  cancel,
  catalog,
  handleAgentChange,
  catalogLoading,
  catalogError,
  workspacePanels,
  handleAction,
  inputRef,
  respondConfirm,
  onOpenSreVizItem,
}) {
  const latestStep =
    [...steps].reverse().find((s) => s.status === "running") ??
    steps[steps.length - 1] ??
    null;

  return (
    <div
      ref={chatSplitContainerRef}
      className="flex min-w-0 gap-0 -m-6"
      style={{ height: "calc(100% + 48px)" }}
    >
      <div
        className="flex shrink-0 flex-col border-r border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-950/30"
        style={{ width: splitLeftPx, minWidth: CHAT_SPLIT_MIN }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
          <div className="min-w-0 flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetConversation}
                className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                title="返回会话列表"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <RobotIcon className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">SRE Agent</span>
            </div>
            {!USE_MOCK && (
              <p className="truncate text-[10px] text-gray-400 dark:text-gray-500" title={selectedAgentId}>
                Agent: <span className="font-mono">{selectedAgentMeta?.label || selectedAgentId}</span>
                {activeOpenClawSessionKey && (
                  <>
                    {" · "}
                    <span className="font-mono" title={activeOpenClawSessionKey}>
                      会话 {activeOpenClawSessionKey.length > 20 ? `${activeOpenClawSessionKey}` : activeOpenClawSessionKey}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={resetConversation} className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300" title="新对话">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {steps.length > 0 && (
          <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
            <AgentThinkingPanel steps={steps} isRunning={isRunning} />
          </div>
        )}

        <ChatMessageList
          messages={messages}
          toolCallList={toolCallList}
          confirm={confirm}
          isRunning={isRunning}
          steps={steps}
          error={error}
          chatEndRef={chatEndRef}
          conversationResetKey={activeOpenClawSessionKey ?? sessionThreadId}
          handleSend={handleSend}
          setInput={setInput}
          inputRef={inputRef}
          respondConfirm={respondConfirm}
          onOpenSreVizItem={onOpenSreVizItem}
        />

        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <div className="flex items-end gap-2">
            {!USE_MOCK && (
              <AgentPicker
                value={selectedAgentId}
                onChange={handleAgentChange}
                disabled={isRunning}
                catalog={catalog}
                loading={catalogLoading}
                error={catalogError}
                compact
              />
            )}
            <div className="flex-1">
              <InputBar
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
                isRunning={isRunning}
                onCancel={cancel}
                inputRef={inputRef}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右分栏宽度"
        onMouseDown={handleChatSplitMouseDown}
        className={`group relative z-10 w-2 shrink-0 cursor-col-resize select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-gray-200 after:transition-colors dark:after:bg-gray-600 ${splitDragging ? "after:bg-primary" : "hover:after:bg-primary/60"}`}
      />

      <div className="min-w-0 flex-1 overflow-y-auto bg-gray-100/50 p-5 dark:bg-gray-950/50">
        <WorkspaceRenderer panels={workspacePanels} onAction={handleAction} />
      </div>
    </div>
  );
}
