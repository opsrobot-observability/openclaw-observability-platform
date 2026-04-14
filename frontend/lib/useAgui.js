import { useCallback, useRef, useState } from "react";
import { EventType, uid } from "./agui.js";

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

export default function useAgui(agent) {
  const [messages, setMessages] = useState([]);
  const [toolCalls, setToolCalls] = useState({});
  const [steps, setSteps] = useState([]);
  const [agentState, setAgentState] = useState({});
  const [workspacePanels, setWorkspacePanels] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const subRef = useRef(null);
  const msgBufRef = useRef({});
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const confirmResolveRef = useRef(null);

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

      // ── Text Message ─────────────────────────────────────
      case EventType.TEXT_MESSAGE_START: {
        const id = event.messageId;
        msgBufRef.current[id] = "";
        setMessages((prev) => [
          ...prev,
          { id, role: event.role ?? "assistant", content: "", streaming: true },
        ]);
        break;
      }
      case EventType.TEXT_MESSAGE_CONTENT: {
        const id = event.messageId;
        msgBufRef.current[id] = (msgBufRef.current[id] ?? "") + event.delta;
        const snap = msgBufRef.current[id];
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: snap } : m)),
        );
        break;
      }
      case EventType.TEXT_MESSAGE_END: {
        const id = event.messageId;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
        );
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
        setMessages(event.messages.map((m) => ({ ...m, streaming: false })));
        break;

      // ── Custom: workspace + confirm + A2UI ─────────────────
      case EventType.CUSTOM:
        if (event.name === "workspace") {
          handleWorkspaceEvent(event.value);
        } else if (event.name === "confirm") {
          setConfirm(event.value);
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

      // Send full conversation history (not just latest message) for multi-turn agents
      const allMessages = [...messagesRef.current, userMsg].map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }));

      subRef.current?.unsubscribe();
      subRef.current = agent.runAgent({ messages: allMessages }).subscribe({
        next: processEvent,
        error: (err) => {
          setStatus("error");
          setError(err.message ?? String(err));
        },
        complete: () => {
          setStatus((prev) => (prev === "error" ? "error" : "idle"));
        },
      });
    },
    [agent, processEvent],
  );

  const cancel = useCallback(() => {
    subRef.current?.unsubscribe();
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
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
  }, []);

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
  };
}
