import { useCallback, useEffect, useRef, useState } from "react";
import { EventType, HttpAgent, WsAgent, uid } from "./agui.js";
import {
  SRE_SESSION_SCOPED_USER_MESSAGES,
  SRE_USE_WEBSOCKET,
  USE_MOCK,
} from "../pages/sre-agent/constants.js";
import { mergeChatWithSessionHistory, runOpenClawSessionFollowUpPoll } from "./sreAgentSessionFollowUp.js";
import { normalizeConfirmPayload, parseAssistantConfirmSources } from "./aguiConfirmBlock.js";
import { extractSreVizWorkQueue } from "./sreMessageVizExtract.js";
import { sreVizModelToPanel } from "./sreVizModelToPanel.js";

/**
 * useAgui — React hook for AG-UI event stream processing.
 *
 * State model:
 * - messages[]       : left panel — chat messages (user / assistant / thinking)
 * - toolCalls{}      : left panel — compact tool call indicators
 * - steps[]          : left panel — agent thinking chain
 * - workspacePanels[]: right panel — dynamic workspace blocks driven by CUSTOM events
 * - confirm          : human-in-the-loop confirmation state
 * - agentState{}     : shared state snapshot / delta
 * - status           : "idle" | "running" | "error"
 */

const mergeToolCall = (prev, id, patch) => ({
  ...prev,
  [id]: { ...(prev[id] ?? {}), ...patch },
});

const applyJsonPatch = (obj, patches) => {
  const copy = structuredClone(obj);
  for (const op of patches) {
    const parts = op.path.replace(/^\//, "").split("/");
    if (op.op === "replace" || op.op === "add") {
      let target = copy;
      for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
      target[parts[parts.length - 1]] = op.value;
    } else if (op.op === "remove") {
      let target = copy;
      for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
      delete target[parts[parts.length - 1]];
    }
  }
  return copy;
};

/**
 * 后端已保证幂等增量发送；前端仅做空增量过滤，避免对结构化文本二次裁剪。
 */
const appendDeltaNoDup = (prevText, delta) => {
  const base = String(prevText ?? "");
  const inc = String(delta ?? "");
  if (!inc) return base;
  return base + inc;
};

/**
 * @param {import("./agui.js").HttpAgent | import("./agui.js").WsAgent | import("./agui.js").MockAgent} agent
 * @param {{ openClawSessionKey?: string | null }} [options] - 侧边栏打开的 OpenClaw 会话 key；与本地 messages 共同决定是否处于「会话界面」以建立 WS 长连接并轮询
 */
export default function useAgui(agent, options = {}) {
  const { openClawSessionKey = null } = options;
  const [messages, setMessages] = useState([]);
  const [toolCalls, setToolCalls] = useState({});
  const [steps, setSteps] = useState([]);
  const [agentState, setAgentState] = useState({});
  const [workspacePanels, setWorkspacePanels] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const chatSurfaceActive =
    SRE_USE_WEBSOCKET &&
    !USE_MOCK &&
    agent instanceof WsAgent &&
    (messages.length > 0 || Boolean(openClawSessionKey));

  const subRef = useRef(null);
  const msgBufRef = useRef({});
  /** 服务端 messageId -> 合并后的气泡 id（主 session + 子 session 多路流式共用一条助手气泡） */
  const streamMergeMapRef = useRef({});
  /** canonicalId -> Set<serverMessageId>，非空即该气泡仍视为流式，全部 END 后才收尾 */
  const activeStreamSetRef = useRef({});
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const confirmResolveRef = useRef(null);
  const sessionFollowUpAbortRef = useRef(null);

  const abortSessionFollowUp = useCallback(() => {
    sessionFollowUpAbortRef.current?.abort();
    sessionFollowUpAbortRef.current = null;
  }, []);

  useEffect(() => () => abortSessionFollowUp(), [abortSessionFollowUp]);

  const processEvent = useCallback((event) => {
    switch (event.type) {
      // ── Lifecycle ────────────────────────────────────────
      case EventType.RUN_STARTED:
        setStatus("running");
        setError(null);
        setSteps([]);
        break;
      case EventType.RUN_FINISHED:
        setStatus("idle");
        break;
      case EventType.RUN_ERROR:
        setStatus("error");
        setError(event.message ?? "Unknown error");
        break;
      case EventType.STEP_STARTED:
        setSteps((s) => [...s, {
          id: event.stepId ?? uid("step"),
          name: event.stepName,
          detail: event.detail ?? null,
          status: "running",
          ts: Date.now(),
        }]);
        break;
      case EventType.STEP_FINISHED:
        setSteps((s) => {
          let target = -1;
          for (let i = s.length - 1; i >= 0; i--) {
            if (s[i].status === "running" && s[i].name === event.stepName) {
              target = i;
              break;
            }
          }
          if (target < 0) return s;
          return s.map((st, i) =>
            i === target ? { ...st, status: "done", finishedAt: Date.now() } : st,
          );
        });
        break;

      // ── Text Message（多路流合并为同一条助手气泡）────────────────
      case EventType.TEXT_MESSAGE_START: {
        const id = event.messageId;
        // 每个服务端 stream 独立成泡，避免主/子 agent 跨来源混流导致内容重复
        streamMergeMapRef.current[id] = id;
        activeStreamSetRef.current[id] = new Set([id]);
        msgBufRef.current[id] = "";
        setMessages((prev) => [
          ...prev,
          {
            id,
            role: event.role ?? "assistant",
            content: "",
            streaming: true,
            streamKey: event.streamKey ?? null,
          },
        ]);
        break;
      }
      case EventType.TEXT_MESSAGE_CONTENT: {
        const id = event.messageId;
        const canonical = streamMergeMapRef.current[id] || id;
        msgBufRef.current[canonical] = appendDeltaNoDup(
          msgBufRef.current[canonical] ?? "",
          event.delta,
        );
        const snap = msgBufRef.current[canonical];
        setMessages((prev) =>
          prev.map((m) => (m.id === canonical ? { ...m, content: snap } : m)),
        );
        break;
      }
      case EventType.TEXT_MESSAGE_END: {
        const id = event.messageId;
        const canonical = streamMergeMapRef.current[id] || id;
        const set = activeStreamSetRef.current[canonical];
        if (set) set.delete(id);
        const still = set && set.size > 0;
        if (still) break;
        delete activeStreamSetRef.current[canonical];
        const raw = msgBufRef.current[canonical] ?? "";
        const { cleanText, confirmPayload } = parseAssistantConfirmSources(raw, () => uid("cfm"));
        msgBufRef.current[canonical] = cleanText;
        setMessages((prev) =>
          prev.map((m) => (m.id === canonical ? { ...m, content: cleanText, streaming: false } : m)),
        );
        if (confirmPayload) setConfirm(confirmPayload);
        break;
      }

      // ── Tool Call ────────────────────────────────────────
      case EventType.TOOL_CALL_START:
        setToolCalls((prev) =>
          mergeToolCall(prev, event.toolCallId, {
            id: event.toolCallId,
            name: event.toolCallName,
            args: "",
            status: "running",
            result: null,
            parentMessageId: event.parentMessageId,
          }),
        );
        break;
      case EventType.TOOL_CALL_ARGS:
        setToolCalls((prev) =>
          mergeToolCall(prev, event.toolCallId, {
            args: (prev[event.toolCallId]?.args ?? "") + event.delta,
          }),
        );
        break;
      case EventType.TOOL_CALL_END:
        setToolCalls((prev) =>
          mergeToolCall(prev, event.toolCallId, { status: "completed" }),
        );
        break;
      case EventType.TOOL_CALL_RESULT:
        setToolCalls((prev) =>
          mergeToolCall(prev, event.toolCallId, { result: event.content }),
        );
        break;

      // ── State ────────────────────────────────────────────
      case EventType.STATE_SNAPSHOT:
        setAgentState(event.snapshot);
        break;
      case EventType.STATE_DELTA:
        setAgentState((prev) => applyJsonPatch(prev, event.delta));
        break;
      case EventType.MESSAGES_SNAPSHOT:
        setMessages(
          event.messages.map((m) => {
            const base = { ...m, streaming: false };
            if (m.role === "assistant" && typeof m.content === "string") {
              return { ...base, content: parseAssistantConfirmSources(m.content, () => uid("hist")).cleanText };
            }
            return base;
          }),
        );
        break;

      // ── Custom: workspace + confirm + A2UI ─────────────────
      case EventType.CUSTOM:
        if (event.name === "openclaw_session_detail") {
          const v = event.value;
          if (v) {
            const isIncremental =
              v.incremental === true ||
              (Array.isArray(v.tailMessages) && v.tailMessages.length > 0);
            setMessages((prev) => {
              // 有消息正在流式输出时，跳过增量 tail 追加：
              // 此时 TEXT_MESSAGE_* 通道已在实时输出，session.message 推来的完整版
              // 与流式 delta 内容相同，强行合并会导致文本重复。
              if (isIncremental && prev.some((m) => m.streaming)) return prev;
              if (!isIncremental && !v.detail) return prev;
              return mergeChatWithSessionHistory(prev, v);
            });
          }
        } else if (event.name === "workspace") {
          handleWorkspaceEvent(event.value);
        } else if (event.name === "confirm") {
          const normalized = normalizeConfirmPayload(event.value, () => uid("cfm"));
          if (normalized) setConfirm(normalized);
        } else if (event.name === "surfaceUpdate") {
          handleSurfaceUpdate(event.value);
        } else if (event.name === "dataModelUpdate") {
          setAgentState((prev) => ({ ...prev, ...event.value }));
        }
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (!chatSurfaceActive) return undefined;
    let cancelled = false;
    void agent
      .connect()
      .then(() => {
        if (cancelled) return;
        if (agent instanceof WsAgent) {
          agent.startSessionPoll({
            intervalMs: 3000,
            onEvent: processEvent,
          });
        }
      })
      .catch(() => {
        /* 建连失败时无 WS 降级 */
      });
    return () => {
      cancelled = true;
      if (agent instanceof WsAgent) {
        agent.stopSessionPoll();
        agent.disconnect();
      }
    };
  }, [chatSurfaceActive, agent, processEvent]);

  const handleWorkspaceEvent = (payload) => {
    const { action } = payload;
    if (action === "add_panel") {
      setWorkspacePanels((prev) => [...prev, payload.panel]);
    } else if (action === "update_panel") {
      setWorkspacePanels((prev) =>
        prev.map((p) => (p.id === payload.panel.id ? { ...p, ...payload.panel } : p)),
      );
    } else if (action === "clear") {
      setWorkspacePanels([]);
    }
  };

  // A2UI: update a specific surface (panel) by id, merging props
  const handleSurfaceUpdate = (payload) => {
    const { id, ...patch } = payload;
    if (!id) return;
    setWorkspacePanels((prev) => {
      const exists = prev.some((p) => p.id === id);
      if (exists) {
        return prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      }
      return [...prev, { id, ...patch }];
    });
  };

  const respondConfirm = useCallback((accepted) => {
    setConfirm(null);
    confirmResolveRef.current?.(accepted);
  }, []);

  const sendMessage = useCallback(
    (text) => {
      if (!agent || !text.trim()) return;
      const userMsg = { id: uid("usr"), role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setSteps([]);
      setToolCalls({});
      setWorkspacePanels([]);
      setConfirm(null);
      setStatus("running");

      const sendFullHistory = USE_MOCK || !SRE_SESSION_SCOPED_USER_MESSAGES;
      const payloadMessages = sendFullHistory
        ? [...messagesRef.current, userMsg].map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))
        : [{ id: userMsg.id, role: "user", content: userMsg.content }];

      if (agent instanceof WsAgent) {
        agent.stopSessionPoll();
      } else {
        abortSessionFollowUp();
      }

      subRef.current?.unsubscribe();
      subRef.current = agent.runAgent({ messages: payloadMessages }).subscribe({
        next: processEvent,
        error: (err) => {
          setStatus("error");
          setError(err.message ?? String(err));
        },
        complete: () => {
          setStatus((prev) => (prev === "error" ? "error" : "idle"));
          abortSessionFollowUp();
          if (agent instanceof HttpAgent) {
            const ac = new AbortController();
            sessionFollowUpAbortRef.current = ac;
            void runOpenClawSessionFollowUpPoll({
              threadId: agent.threadId,
              agentId: agent.agentId,
              getMessages: () => messagesRef.current,
              setMessages,
              signal: ac.signal,
            });
          } else if (agent instanceof WsAgent && chatSurfaceActive) {
            agent.startSessionPoll({
              intervalMs: 3000,
              onEvent: processEvent,
            });
          }
        },
      });
    },
    [agent, processEvent, abortSessionFollowUp, chatSurfaceActive],
  );

  const cancel = useCallback(() => {
    if (agent instanceof WsAgent) {
      agent.stopSessionPoll();
    }
    abortSessionFollowUp();
    subRef.current?.unsubscribe();
    setStatus("idle");
  }, [abortSessionFollowUp, agent]);

  const reset = useCallback(() => {
    abortSessionFollowUp();
    if (agent instanceof WsAgent) {
      agent.stopSessionPoll();
      agent.disconnect();
    }
    subRef.current?.unsubscribe();
    setMessages([]);
    setToolCalls({});
    setSteps([]);
    setAgentState({});
    setWorkspacePanels([]);
    setConfirm(null);
    setStatus("idle");
    setError(null);
    msgBufRef.current = {};
    streamMergeMapRef.current = {};
    activeStreamSetRef.current = {};
  }, [abortSessionFollowUp, agent]);

  const stripMsgVizPanels = (prev) => prev.filter((p) => !String(p.id).startsWith("msg-viz-"));

  const resolveFinalReportPathToPanel = useCallback(async (filePath) => {
    const p = String(filePath || "").trim();
    if (!p) return null;
    try {
      const r = await fetch(`/api/sre-agent/report-md?path=${encodeURIComponent(p)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (!data || typeof data !== "object" || typeof data.markdown !== "string") return null;
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "最终报告";
      return {
        id: `msg-report-${uid("p")}`,
        type: "sre_message_markdown",
        title,
        markdown: data.markdown,
      };
    } catch {
      return null;
    }
  }, []);

  const resolveSreVizQueueItemToPanel = useCallback(async (item) => {
    let model = item.kind === "inline" ? item.model : null;
    if (item.kind === "path") {
      try {
        const r = await fetch(`/api/sre-agent/viz-json?path=${encodeURIComponent(item.path)}`);
        if (!r.ok) return null;
        const data = await r.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) return null;
        model = data;
      } catch {
        return null;
      }
    }
    return model ? sreVizModelToPanel(model) : null;
  }, []);

  /** 打开单条 viz（内联 model 或 ~/.openclaw 路径拉取 JSON），或 final_report.md 报告预览面板 */
  const openSreVizQueueItem = useCallback(
    async (item) => {
      if (item?.kind === "final_report") {
        const p = await resolveFinalReportPathToPanel(item.path);
        if (!p) return;
        setWorkspacePanels((prev) => [...stripMsgVizPanels(prev), p]);
        return;
      }
      const p = await resolveSreVizQueueItemToPanel(item);
      if (!p) return;
      setWorkspacePanels((prev) => [...stripMsgVizPanels(prev), p]);
    },
    [resolveFinalReportPathToPanel, resolveSreVizQueueItemToPanel],
  );

  /** 一次打开消息中全部 viz（批量追加，避免 strip 互相覆盖） */
  const openAssistantMessageInWorkspace = useCallback(
    async (markdown) => {
      const queue = extractSreVizWorkQueue(String(markdown ?? ""));
      if (queue.length === 0) return;
      const panels = [];
      for (const item of queue) {
        const p = await resolveSreVizQueueItemToPanel(item);
        if (p) panels.push(p);
      }
      if (panels.length === 0) return;
      setWorkspacePanels((prev) => [...stripMsgVizPanels(prev), ...panels]);
    },
    [resolveSreVizQueueItemToPanel],
  );

  /** 从历史会话载入消息（不触发 Agent 运行） */
  const hydrateMessages = useCallback((list) => {
    abortSessionFollowUp();
    if (agent instanceof WsAgent) {
      agent.disconnect();
    }
    subRef.current?.unsubscribe();
    msgBufRef.current = {};
    streamMergeMapRef.current = {};
    activeStreamSetRef.current = {};
    setToolCalls({});
    setSteps([]);
    setAgentState({});
    setWorkspacePanels([]);
    setConfirm(null);
    setError(null);
    setStatus("idle");
    setMessages(
      (list || []).map((m) => {
        const role = m.role === "user" || m.role === "assistant" ? m.role : "user";
        let content = String(m.content ?? "");
        if (role === "assistant") {
          content = parseAssistantConfirmSources(content, () => uid("hist")).cleanText;
        }
        return {
          id: m.id ?? uid("hist"),
          role,
          content,
          streaming: false,
        };
      }),
    );
  }, [abortSessionFollowUp, agent]);

  return {
    messages,
    toolCalls,
    steps,
    agentState,
    workspacePanels,
    confirm,
    status,
    error,
    sendMessage,
    respondConfirm,
    cancel,
    reset,
    hydrateMessages,
    abortSessionFollowUp,
    openAssistantMessageInWorkspace,
    openSreVizQueueItem,
  };
}
