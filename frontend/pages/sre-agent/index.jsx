import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchUserAction } from "../../lib/a2ui.js";
import { MockAgent, HttpAgent, WsAgent, newOpsRobotThreadId } from "../../lib/agui.js";
import { matchScenario } from "../../lib/agui-mock-scenarios.js";
import { readStoredAgentId, STATIC_FALLBACK_CATALOG, writeStoredAgentId } from "../../lib/sreAgentCatalog.js";
import {
  fetchOpenClawSessionDetail,
  groupSessionsByAgent,
  messagesFromOpenClawSessionDetail,
  pickSessionKey,
  sessionListRowStableKey,
} from "../../lib/sreOpenclawSessions.js";
import useAgui from "../../lib/useAgui.js";
import {
  CHAT_SPLIT_HARD_MAX,
  CHAT_SPLIT_MIN,
  CHAT_SPLIT_STORAGE_KEY,
  USE_MOCK,
  SRE_USE_WEBSOCKET,
  WORKSPACE_MIN_WIDTH,
} from "./constants.js";
import { useAgentCatalog } from "./hooks/useAgentCatalog.js";
import { useOpenClawSessionsList } from "./hooks/useOpenClawSessionsList.js";
import { readStoredChatSplitPx } from "./sessionUtils.js";
import OpenClawSessionsAside from "./components/OpenClawSessionsAside.jsx";
import SreAgentChatWorkspace from "./components/SreAgentChatWorkspace.jsx";
import SreAgentLanding from "./components/SreAgentLanding.jsx";

/**
 * SRE Agent — 左侧聊天框(意图层) + 右侧工作区(执行层)
 *
 * 双模式：
 * - OpenClaw 模式（默认）：POST /api/sre-agent → 后端桥接 OpenClaw Chat API
 * - Mock 模式（VITE_SRE_AGENT_MOCK=true）：前端 MockAgent 演示
 */
export default function SreAgent() {
  const [input, setInput] = useState("");
  const { catalog, loading: catalogLoading, error: catalogError } = useAgentCatalog();
  const { rows: sessionRows, loading: sessionsLoading, error: sessionsError, reload: reloadSessions } = useOpenClawSessionsList();
  // 只展示 key 以 "agent:sre:" 开头的 SRE 智能体会话
  const sreSessionRows = useMemo(
    () => sessionRows.filter((row) => pickSessionKey(row).startsWith("agent:sre:")),
    [sessionRows],
  );
  const sessionGroups = useMemo(() => groupSessionsByAgent(sreSessionRows), [sreSessionRows]);
  const [collapsedSessionGroups, setCollapsedSessionGroups] = useState(() => new Set());
  const toggleSessionGroupCollapse = useCallback((groupId) => {
    setCollapsedSessionGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);
  const [selectedAgentId, setSelectedAgentId] = useState(() => readStoredAgentId(STATIC_FALLBACK_CATALOG));
  const [sessionThreadId, setSessionThreadId] = useState(() => newOpsRobotThreadId());
  const [activeOpenClawSessionKey, setActiveOpenClawSessionKey] = useState(null);
  const [openingSessionKey, setOpeningSessionKey] = useState(null);
  const [sessionOpenError, setSessionOpenError] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const prevAgentIdRef = useRef(null);
  const chatSplitContainerRef = useRef(null);
  const splitLeftPxRef = useRef(readStoredChatSplitPx());
  const [splitLeftPx, setSplitLeftPx] = useState(() => splitLeftPxRef.current);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitDragStartRef = useRef(null);

  useEffect(() => {
    splitLeftPxRef.current = splitLeftPx;
  }, [splitLeftPx]);

  const clampChatSplitPx = useCallback((raw) => {
    const el = chatSplitContainerRef.current;
    const maxFromContainer = el
      ? el.getBoundingClientRect().width - WORKSPACE_MIN_WIDTH
      : CHAT_SPLIT_HARD_MAX;
    const cap = Math.min(CHAT_SPLIT_HARD_MAX, Math.max(CHAT_SPLIT_MIN, maxFromContainer));
    return Math.min(cap, Math.max(CHAT_SPLIT_MIN, Math.round(raw)));
  }, []);

  const handleChatSplitMouseDown = useCallback((e) => {
    e.preventDefault();
    splitDragStartRef.current = { startX: e.clientX, startW: splitLeftPxRef.current };
    setSplitDragging(true);
  }, []);

  useEffect(() => {
    if (!splitDragging) return;
    const onMove = (e) => {
      const d = splitDragStartRef.current;
      if (!d) return;
      const next = clampChatSplitPx(d.startW + e.clientX - d.startX);
      splitLeftPxRef.current = next;
      setSplitLeftPx(next);
    };
    const onUp = () => {
      splitDragStartRef.current = null;
      setSplitDragging(false);
      try {
        localStorage.setItem(CHAT_SPLIT_STORAGE_KEY, String(splitLeftPxRef.current));
      } catch {
        /* ignore */
      }
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [splitDragging, clampChatSplitPx]);

  const agent = useMemo(() => {
    if (USE_MOCK) {
      return new MockAgent({
        scenario: (msgs) => {
          const userText = msgs[msgs.length - 1]?.content ?? "";
          return matchScenario(userText)(msgs);
        },
      });
    }
    if (SRE_USE_WEBSOCKET) {
      return new WsAgent({
        agentId: selectedAgentId,
        threadId: sessionThreadId,
      });
    }
    return new HttpAgent({
      url: "/api/sre-agent",
      agentId: selectedAgentId,
      threadId: sessionThreadId,
    });
  }, [selectedAgentId, sessionThreadId]);

  const {
    messages, toolCalls, steps, workspacePanels, confirm,
    status, error, sendMessage, respondConfirm, cancel, reset: resetAgui, hydrateMessages,
    abortSessionFollowUp,
    openSreVizQueueItem,
  } = useAgui(agent, { openClawSessionKey: activeOpenClawSessionKey });

  const resetConversation = useCallback(() => {
    setActiveOpenClawSessionKey(null);
    setSessionOpenError(null);
    setOpeningSessionKey(null);
    setSessionThreadId(newOpsRobotThreadId());
    resetAgui();
  }, [resetAgui]);

  useEffect(() => {
    if (catalog.length > 0 && !catalog.some((a) => a.id === selectedAgentId)) {
      const fallbackId = readStoredAgentId(catalog);
      setSelectedAgentId(fallbackId);
      writeStoredAgentId(fallbackId);
    }
  }, [catalog, selectedAgentId]);

  useEffect(() => {
    if (prevAgentIdRef.current === null) {
      prevAgentIdRef.current = selectedAgentId;
      return;
    }
    if (prevAgentIdRef.current === selectedAgentId) return;
    prevAgentIdRef.current = selectedAgentId;
    setActiveOpenClawSessionKey(null);
    setSessionThreadId(newOpsRobotThreadId());
    resetAgui();
  }, [selectedAgentId, resetAgui]);

  const handleAgentChange = useCallback((id) => {
    setSelectedAgentId(id);
    writeStoredAgentId(id);
  }, []);

  const isRunning = status === "running";
  const showChatWorkspace = messages.length > 0 || activeOpenClawSessionKey != null;

  /** 关闭会话窗口（返回落地页 / 无聊天区）时中止 OpenClaw 会话历史轮询 */
  useEffect(() => {
    if (!showChatWorkspace) {
      abortSessionFollowUp();
    }
  }, [showChatWorkspace, abortSessionFollowUp]);
  const toolCallList = useMemo(() => Object.values(toolCalls), [toolCalls]);
  const selectedAgentMeta = useMemo(
    () => catalog.find((a) => a.id === selectedAgentId),
    [catalog, selectedAgentId],
  );

  useEffect(() => {
    if (!showChatWorkspace) return;
    const id = requestAnimationFrame(() => {
      setSplitLeftPx((w) => clampChatSplitPx(w));
    });
    return () => cancelAnimationFrame(id);
  }, [showChatWorkspace, clampChatSplitPx]);

  useEffect(() => {
    if (!showChatWorkspace) return;
    const onResize = () => {
      setSplitLeftPx((w) => clampChatSplitPx(w));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [showChatWorkspace, clampChatSplitPx]);

  const openHistorySession = useCallback(
    async (row) => {
      const key = pickSessionKey(row);
      if (!key || isRunning) return;
      const rowBusy = sessionListRowStableKey(row) || key;
      setSessionOpenError(null);
      setOpeningSessionKey(rowBusy);
      try {
        const detail = await fetchOpenClawSessionDetail(key);
        const msgs = messagesFromOpenClawSessionDetail(detail);
        setSessionThreadId(key);
        hydrateMessages(msgs);
        setActiveOpenClawSessionKey(key);
        void reloadSessions();
      } catch (err) {
        setSessionOpenError(err.message || String(err));
      } finally {
        setOpeningSessionKey(null);
      }
    },
    [hydrateMessages, isRunning, reloadSessions],
  );

  const handleAction = useCallback((action) => {
    dispatchUserAction(action);
    sendMessage(`[用户操作] ${action.type}: ${action.action || action.label || action.actionId || JSON.stringify(action)}`);
  }, [sendMessage]);

  const handleSend = useCallback(
    (maybeText) => {
      const raw = typeof maybeText === "string" ? maybeText : input;
      const t = String(raw ?? "").trim();
      if (!t || isRunning) return;
      setInput("");
      sendMessage(t);
    },
    [input, isRunning, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!showChatWorkspace) {
    return (
      <div className="flex gap-0 -m-6" style={{ height: "calc(100% + 48px)" }}>
        <OpenClawSessionsAside
          sessionGroups={sessionGroups}
          collapsedSessionGroups={collapsedSessionGroups}
          toggleSessionGroupCollapse={toggleSessionGroupCollapse}
          sessionRows={sreSessionRows}
          sessionsLoading={sessionsLoading}
          sessionsError={sessionsError}
          openingSessionKey={openingSessionKey}
          isRunning={isRunning}
          openHistorySession={openHistorySession}
          reloadSessions={reloadSessions}
        />
        <SreAgentLanding
          sessionOpenError={sessionOpenError}
          handleSend={handleSend}
          selectedAgentId={selectedAgentId}
          handleAgentChange={handleAgentChange}
          catalog={catalog}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          input={input}
          setInput={setInput}
          handleKeyDown={handleKeyDown}
          isRunning={isRunning}
          cancel={cancel}
          inputRef={inputRef}
        />
      </div>
    );
  }

  return (
    <SreAgentChatWorkspace
      chatSplitContainerRef={chatSplitContainerRef}
      splitLeftPx={splitLeftPx}
      splitDragging={splitDragging}
      handleChatSplitMouseDown={handleChatSplitMouseDown}
      resetConversation={resetConversation}
      isRunning={isRunning}
      selectedAgentMeta={selectedAgentMeta}
      selectedAgentId={selectedAgentId}
      sessionThreadId={sessionThreadId}
      activeOpenClawSessionKey={activeOpenClawSessionKey}
      steps={steps}
      messages={messages}
      toolCallList={toolCallList}
      confirm={confirm}
      error={error}
      chatEndRef={chatEndRef}
      input={input}
      handleSend={handleSend}
      setInput={setInput}
      handleKeyDown={handleKeyDown}
      cancel={cancel}
      catalog={catalog}
      handleAgentChange={handleAgentChange}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      workspacePanels={workspacePanels}
      handleAction={handleAction}
      inputRef={inputRef}
      respondConfirm={respondConfirm}
      onOpenSreVizItem={openSreVizQueueItem}
    />
  );
}
