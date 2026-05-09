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

let _opsRobotThreadSeq = 0;
/** 新建 SRE 会话：应用内临时 threadId（`opsRobot_thread_${ts}_…`），供 /api/sre-agent 与 Gateway 映射 */
export function newOpsRobotThreadId() {
  return `opsRobot_thread_${Date.now()}_${++_opsRobotThreadSeq}`;
}

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

const DEFAULT_SRE_WS_PATH = "/api/sre-agent/ws";

function buildSreAgentWebSocketUrl(path) {
  if (typeof window === "undefined") {
    return `ws://127.0.0.1${path}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

/**
 * opsRobot Agent：WebSocket 传输，AG-UI 事件为 JSON 文本帧。
 * 长连接：先 `connect()`，同一会话内多次 `runAgent` 复用同一 socket；`RUN_FINISHED` 不关闭连接。
 * 会话增量：`startSessionPoll` 每约 3s 发送 `op: "poll_session"`，服务端经 WS 推送 `CUSTOM openclaw_session_detail`。
 */
export class WsAgent {
  constructor({ wsPath = DEFAULT_SRE_WS_PATH, agentId, threadId }) {
    this.wsPath = wsPath;
    this.agentId = agentId;
    this.threadId = threadId;
    this._abortCtrl = null;
    /** @type {WebSocket | null} */
    this._ws = null;
    /** @type {Promise<void> | null} */
    this._connectPromise = null;
    /** @type {{ next: Function, complete?: Function, error?: Function } | null} */
    this._runSubscriber = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this._pollTimer = null;
    /** @type {((event: object) => void) | null} */
    this._sessionPushHandler = null;
  }

  /**
   * 建立长连接（进入会话后调用；未连接时 `runAgent` 也会自动 connect）。
   * @returns {Promise<void>}
   */
  connect() {
    if (typeof WebSocket === "undefined") {
      return Promise.reject(new Error("WebSocket 不可用"));
    }
    if (this._ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this._connectPromise) {
      return this._connectPromise;
    }

    const wsUrl = buildSreAgentWebSocketUrl(this.wsPath);
    const ws = new WebSocket(wsUrl);
    this._ws = ws;

    this._connectPromise = new Promise((resolve, reject) => {
      const fail = () => {
        this._connectPromise = null;
        this._ws = null;
        reject(new Error("WebSocket 连接失败"));
      };

      ws.addEventListener(
        "open",
        () => {
          this._connectPromise = null;
          resolve();
        },
        { once: true },
      );
      ws.addEventListener("error", fail, { once: true });

      ws.onmessage = (ev) => this._onMessage(ev);
      ws.onclose = (ev) => {
        this._connectPromise = null;
        const wasOpen = this._ws === ws;
        this._ws = null;
        if (!wasOpen) return;
        if (this._runSubscriber) {
          const sub = this._runSubscriber;
          this._runSubscriber = null;
          sub.error?.(
            new Error(
              ev.reason ? String(ev.reason) : `WebSocket 已断开（code ${ev.code}）`,
            ),
          );
        }
      };
    });

    return this._connectPromise;
  }

  _onMessage(ev) {
    let event;
    try {
      event = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (this._runSubscriber) {
      const { next, complete } = this._runSubscriber;
      next(event);
      if (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR) {
        this._runSubscriber = null;
        complete?.();
      }
    } else if (this._sessionPushHandler) {
      this._sessionPushHandler(event);
    }
  }

  /**
   * 启动会话轮询（经 WS `poll_session`）；运行中 `runAgent` 占用时不发送 poll。
   * @param {{ intervalMs?: number, onEvent: (event: object) => void }} opts
   */
  startSessionPoll({ intervalMs = 3000, onEvent }) {
    this.stopSessionPoll();
    this._sessionPushHandler = onEvent ?? null;
    const tick = () => {
      if (this._ws?.readyState !== WebSocket.OPEN) return;
      if (this._runSubscriber) return;
      try {
        this._ws.send(
          JSON.stringify({
            op: "poll_session",
            threadId: this.threadId,
            agentId: this.agentId,
          }),
        );
      } catch {
        /* ignore */
      }
    };
    tick();
    this._pollTimer = setInterval(tick, intervalMs);
  }

  /** 停止会话轮询定时器（不断开 WebSocket） */
  stopSessionPoll() {
    if (this._pollTimer != null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /** 离开会话时关闭连接 */
  disconnect() {
    this.stopSessionPoll();
    this._sessionPushHandler = null;
    this._runSubscriber = null;
    this._connectPromise = null;
    try {
      this._ws?.close();
    } catch {
      /* ignore */
    }
    this._ws = null;
  }

  runAgent({ messages = [], tools = [], context = [], state = {} } = {}) {
    const self = this;
    return {
      subscribe({ next, error, complete }) {
        self._abortCtrl = new AbortController();

        const run = async () => {
          try {
            await self.connect();
            if (self._abortCtrl.signal.aborted) return;
            if (self._runSubscriber) {
              error?.(new Error("上一段运行尚未结束"));
              return;
            }
            self._runSubscriber = { next, complete, error };
            const runId = uid("run");
            self._ws.send(
              JSON.stringify({
                op: "run",
                agentId: self.agentId,
                threadId: self.threadId,
                runId,
                messages,
                tools,
                context,
                state,
              }),
            );
          } catch (err) {
            error?.(err);
          }
        };
        void run();

        return {
          unsubscribe: () => {
            self._abortCtrl?.abort();
            if (self._runSubscriber && self._ws?.readyState === WebSocket.OPEN) {
              try {
                self._ws.send(JSON.stringify({ op: "abort" }));
              } catch {
                /* ignore */
              }
            }
            self._runSubscriber = null;
          },
        };
      },
    };
  }

  cancel() {
    this._abortCtrl?.abort();
    if (this._runSubscriber && this._ws?.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify({ op: "abort" }));
      } catch {
        /* ignore */
      }
    }
    this._runSubscriber = null;
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
