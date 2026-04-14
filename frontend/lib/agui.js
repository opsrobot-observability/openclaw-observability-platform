/**
 * AG-UI Protocol — 事件类型与客户端实现
 *
 * 基于 AG-UI (Agent User Interaction Protocol) 规范：
 * https://docs.ag-ui.com
 *
 * 事件分为 5 大类：Lifecycle / TextMessage / ToolCall / State / Special
 */

// ─── Event Types ─────────────────────────────────────────────────
export const EventType = {
  // Lifecycle
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  RUN_ERROR: "RUN_ERROR",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",

  // Text Message (streaming)
  TEXT_MESSAGE_START: "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT: "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END: "TEXT_MESSAGE_END",

  // Tool Call (streaming)
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",

  // State Management
  STATE_SNAPSHOT: "STATE_SNAPSHOT",
  STATE_DELTA: "STATE_DELTA",
  MESSAGES_SNAPSHOT: "MESSAGES_SNAPSHOT",

  // Special
  RAW: "RAW",
  CUSTOM: "CUSTOM",
};

// ─── Helpers ─────────────────────────────────────────────────────
let _idCounter = 0;
export const uid = (prefix = "id") => `${prefix}_${Date.now()}_${++_idCounter}`;

// ─── AG-UI HTTP Client (SSE transport) ───────────────────────────
export class HttpAgent {
  constructor({ url, agentId, threadId }) {
    this.url = url;
    this.agentId = agentId;
    this.threadId = threadId;
    this._abortCtrl = null;
  }

  /**
   * Run the agent and return an observable-like object with subscribe().
   * Uses SSE (Server-Sent Events) via fetch + ReadableStream.
   */
  runAgent({ messages = [], tools = [], context = [], state = {} } = {}) {
    const self = this;
    return {
      subscribe({ next, error, complete }) {
        self._abortCtrl = new AbortController();
        const run = async () => {
          try {
            const runId = uid("run");
            const resp = await fetch(self.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
              body: JSON.stringify({
                agentId: self.agentId,
                threadId: self.threadId,
                runId,
                messages,
                tools,
                context,
                state,
              }),
              signal: self._abortCtrl.signal,
            });

            if (!resp.ok) {
              throw new Error(`Agent responded with ${resp.status}: ${resp.statusText}`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":")) continue;
                if (trimmed.startsWith("data: ")) {
                  try {
                    const event = JSON.parse(trimmed.slice(6));
                    next(event);
                  } catch {
                    // skip malformed events
                  }
                }
              }
            }

            if (buffer.trim().startsWith("data: ")) {
              try {
                next(JSON.parse(buffer.trim().slice(6)));
              } catch {
                // skip
              }
            }
            complete?.();
          } catch (err) {
            if (err.name !== "AbortError") {
              error?.(err);
            }
          }
        };
        run();

        return { unsubscribe: () => self._abortCtrl?.abort() };
      },
    };
  }

  cancel() {
    this._abortCtrl?.abort();
  }
}

// ─── Mock Agent (本地模拟 AG-UI 事件流) ──────────────────────────
export class MockAgent {
  constructor({ scenario }) {
    this.scenario = scenario;
    this._cancelled = false;
  }

  runAgent({ messages = [] } = {}) {
    const self = this;
    return {
      subscribe({ next, error, complete }) {
        self._cancelled = false;
        const run = async () => {
          try {
            const events = self.scenario(messages);
            for (const item of events) {
              if (self._cancelled) break;
              if (item._delay) {
                await new Promise((r) => setTimeout(r, item._delay));
                continue;
              }
              next({ ...item, timestamp: item.timestamp ?? Date.now() });
              if (item._pause) {
                await new Promise((r) => setTimeout(r, item._pause));
              }
            }
            complete?.();
          } catch (err) {
            error?.(err);
          }
        };
        run();
        return { unsubscribe: () => { self._cancelled = true; } };
      },
    };
  }

  cancel() {
    this._cancelled = true;
  }
}
