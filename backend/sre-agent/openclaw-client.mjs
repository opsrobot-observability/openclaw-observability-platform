/**
 * OpenClaw Client — 调用 OpenClaw Agent API 的 WS / SSE 客户端
 *
 * Gateway 模式（默认）：通过 OpenClaw Gateway /ws WebSocket 接口调用；
 *   - `chat.send` 发送用户消息
 *   - `agent { stream: "assistant", data: { delta } }` 接收流式响应
 *   - `agent { stream: "tool" }` 接收工具调用事件
 *   - `agent { stream: "lifecycle", phase: "end" }` 接收运行完成事件
 *
 * 直连模式（OPENCLAW_GATEWAY=false 或非 18789 端口）：回退到 HTTP POST + SSE（/v1/chat/completions）。
 */

// ─── SRE Agent System Prompt ─────────────────────────────────────
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAssistantConfirmSources } from "../../frontend/lib/aguiConfirmBlock.js";
import { getGatewayWsClient } from "./openclaw-gateway-ws.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function loadSkill(filename) {
  try {
    return readFileSync(join(ROOT, "skills", "agent", filename), "utf-8");
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `${loadSkill("Soul.md")}

## 可用工具技能
${loadSkill("k8s-inspect.md")}

${loadSkill("prom-query.md")}

## 输出规范
1. 先说明你要做什么（思考过程）
2. 调用工具获取数据
3. 用结构化格式（Markdown 表格、列表）呈现结果
4. 给出明确的建议和下一步操作
5. 高危操作必须先提示风险，等待用户确认
6. **人机确认（必须遵守格式）**：当需要用户明确批准再执行变更类操作（扩缩容、删除资源、执行写命令等）时，在正常 Markdown 说明之后，**单独追加**一个 fenced 代码块，语言标记为 \`confirm\`，块内为 **单行或格式化的 JSON**（字段用双引号），且必须包含 \`title\` 与 \`message\`。可选 \`command\`（将展示在确认卡片中）、\`actions\`（按钮数组，每项含 \`id\` / \`label\` / \`variant\`，其中同意按钮的 \`id\` 必须为 \`approve\`）。示例：

\`\`\`confirm
{"title":"确认执行扩容","message":"将 memory limit 调整为 1Gi","command":"kubectl set resources ...","actions":[{"id":"approve","label":"确认执行","variant":"primary"},{"id":"reject","label":"暂不执行","variant":"secondary"}]}
\`\`\`

平台会解析该块并弹出左侧确认卡片，同时从用户可见正文中移除该块；不要在 JSON 外夹杂说明文字。
7. **自然语言邀约确认**：若用中文在回复**末尾**表达「如需…（可含下一步建议，如调用某能力）…请告知 / 请告知。」或「若需…请告知」，平台会将**紧贴文末的整段**识别为同等人机确认（正文保留前半部分，尾部整段进入确认卡片）。`;

// ─── Tool Definitions (OpenAI function calling format) ────────────
const SRE_TOOLS = [
  {
    type: "function",
    function: {
      name: "kubectl",
      description: "执行 kubectl 命令查询 Kubernetes 集群状态，只读操作。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "kubectl 子命令（不含 kubectl 前缀），如 'get nodes -o wide'",
          },
          namespace: {
            type: "string",
            description: "目标命名空间，不填则为默认或所有（-A）",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prometheus_query",
      description: "执行 PromQL 查询 Prometheus 监控指标。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "PromQL 表达式",
          },
          range: {
            type: "string",
            description: "查询时间范围，如 '5m', '1h', '24h'",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_search",
      description: "在 OpenClaw 可观测性平台中搜索 Agent 会话日志。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "搜索关键词",
          },
          level: {
            type: "string",
            enum: ["error", "warn", "info", "all"],
            description: "日志级别过滤",
          },
          timeRange: {
            type: "string",
            description: "时间范围，如 '1h', '24h', '7d'",
          },
        },
        required: ["keyword"],
      },
    },
  },
];

// ─── OpenClaw Config ─────────────────────────────────────────────
/** 可选：未设置或空字符串时不传 model，由 OpenClaw/Ollama 使用服务端默认模型 */
function optionalModelFromEnv() {
  const v = process.env.OPENCLAW_MODEL;
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

function getConfig() {
  const raw = process.env.OPENCLAW_API_URL || "http://localhost:11434";
  const customChatPathRaw = process.env.OPENCLAW_CHAT_PATH;
  const chatPath =
    customChatPathRaw && String(customChatPathRaw).trim()
      ? `/${String(customChatPathRaw).trim().replace(/^\/+/, "")}`
      : undefined;
  return {
    baseUrl: raw.replace(/\/+$/, ""),
    agentId: process.env.OPENCLAW_AGENT_ID || "sre",
    apiKey: process.env.OPENCLAW_API_KEY || "",
    model: optionalModelFromEnv(),
    chatPath,
  };
}

/**
 * 是否按「OpenClaw Gateway」方式解析 model（与直连 Ollama/OpenAI 区分）。
 * - 显式：`OPENCLAW_GATEWAY=1|true` 或 `OPENCLAW_GATEWAY=0|false`
 * - 启发：默认端口 18789 视为 Gateway（与官方文档示例一致）
 */
function isOpenClawGatewayBaseUrl(baseUrl) {
  const g = process.env.OPENCLAW_GATEWAY;
  if (g === "0" || g === "false" || g === "no") return false;
  if (g === "1" || g === "true" || g === "yes") return true;
  try {
    const u = new URL(baseUrl);
    if (u.port === "18789") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 前端新建对话使用 `opsRobot_thread_${Date.now()}_…`（或兼容旧版 `thread_${ts}_…`）作为 threadId；
 * 续接 OpenClaw 列表会话时为 Gateway 的 session key。
 * @see https://docs.openclaw.ai/tools/thinking — `/think:`、`/reasoning:` 行内指令
 */
export function isEphemeralAppThreadId(sessionKey) {
  const s = String(sessionKey ?? "").trim();
  return /^thread_\d+_/i.test(s) || /^opsRobot_thread_\d+_/i.test(s);
}

/**
 * 新建对话时前端用 `opsRobot_thread_${ts}_…`（或兼容 `thread_${ts}_…`）作为 threadId；发往 Gateway 时映射为
 * `agent:<agentId>:<原 thread 串>`，既绑定所选 agent，又为每条新会话保留独立 thread 段。
 */
export function resolveGatewaySessionKeyForChat(sessionKey, agentId) {
  const sk = sessionKey != null ? String(sessionKey).trim() : "";
  if (!sk) return "";
  if (!isEphemeralAppThreadId(sk)) return sk;
  const aid = agentId != null ? String(agentId).trim() : "";
  if (!aid) return sk;
  return `agent:${aid}:${sk}`;
}

/**
 * 是否对当前请求注入 OpenClaw 思考 / 推理可见性指令（仅改发往 Gateway 的副本，不写回 AG-UI）。
 * - 默认：**不注入**（与 OpenClaw UI 中用户原文一致）。
 * - `OPENCLAW_SESSION_THINKING_SCOPE=openclaw_session`：仅对「非应用内临时 thread」会话（如从 OpenClaw 打开的历史）注入。
 * - `OPENCLAW_SESSION_THINKING_SCOPE=all`：任意非空 sessionKey（含新建 thread）也注入。
 */
function shouldInjectOpenClawSessionDirectives(sessionKey) {
  const sk = String(sessionKey ?? "").trim();
  const scope = String(process.env.OPENCLAW_SESSION_THINKING_SCOPE ?? "off")
    .trim()
    .toLowerCase();
  if (scope === "off" || scope === "false" || scope === "0") return false;
  if (!sk) return false;
  if (scope === "all" || scope === "always") return true;
  return !isEphemeralAppThreadId(sk);
}

/** @returns {{ level: string | null }} level 为 null 表示关闭「思考档位」注入 */
function resolveSessionThinkingLevel() {
  const raw = process.env.OPENCLAW_SESSION_THINKING_LEVEL;
  if (raw == null || String(raw).trim() === "") return { level: "high" };
  const t = String(raw).trim().toLowerCase();
  if (t === "off" || t === "false" || t === "0" || t === "none") return { level: null };
  return { level: String(raw).trim() };
}

/** @returns {{ level: string | null }} on|off|stream；null 表示不注入 /reasoning */
function resolveSessionReasoningLevel() {
  const raw = process.env.OPENCLAW_SESSION_REASONING_LEVEL;
  if (raw == null || String(raw).trim() === "") return { level: "on" };
  const t = String(raw).trim().toLowerCase();
  if (t === "off" || t === "false" || t === "0" || t === "none") return { level: null };
  return { level: String(raw).trim() };
}

/**
 * 在发往 OpenClaw Gateway 的 messages 副本上注入 `/think:`、`/reasoning:`（仅最后一条 user，且 tool 续写轮次不注入）。
 */
/**
 * OpenClaw Gateway：历史由 `X-OpenClaw-Session-Key` 绑定，请求体只需本轮 user（与官方 `chat.send` 行为一致）。
 * 非 Gateway（如直连 Ollama）无会话恢复语义，须保留 input 中的完整多轮 messages。
 * 设置 `OPENCLAW_SEND_FULL_MESSAGES=1` 可强制不折叠（调试或与旧客户端对齐）。
 */
function collapseToLatestUserForGatewaySession(config, threadId, userMessages) {
  const full =
    process.env.OPENCLAW_SEND_FULL_MESSAGES === "1" ||
    process.env.OPENCLAW_SEND_FULL_MESSAGES === "true";
  if (full) return userMessages;
  if (!isOpenClawGatewayBaseUrl(config.baseUrl)) return userMessages;
  const sk = resolveGatewaySessionKeyForChat(String(threadId ?? ""), config.agentId);
  if (!sk) return userMessages;
  const users = userMessages.filter((m) => m.role === "user");
  if (users.length === 0) return userMessages;
  return [users[users.length - 1]];
}

function injectOpenClawSessionChatDirectives(messages, sessionKey, baseUrl) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  if (!isOpenClawGatewayBaseUrl(baseUrl) || !shouldInjectOpenClawSessionDirectives(sessionKey)) {
    return messages;
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;

  const content = typeof last.content === "string" ? last.content : "";
  if (/^\s*\/(think|t|thinking)\b/i.test(content) || /^\s*\/reasoning\b/i.test(content)) {
    return messages;
  }

  const { level: thinkLevel } = resolveSessionThinkingLevel();
  const { level: reasonLevel } = resolveSessionReasoningLevel();
  if (!thinkLevel && !reasonLevel) return messages;

  const lines = [];
  if (thinkLevel) lines.push(`/think:${thinkLevel}`);
  if (reasonLevel) lines.push(`/reasoning ${reasonLevel}`);
  const prefix = `${lines.join("\n")}\n\n`;

  const idx = messages.length - 1;
  const next = [...messages];
  next[idx] = { ...last, content: `${prefix}${content}` };
  return next;
}

/**
 * HTTP 请求体里的 `model` 字段：
 * - Gateway：官方约定为 `openclaw/<agentId>`（如 `openclaw/sre`、`openclaw/default`），
 *   见 https://docs.openclaw.ai/gateway/openai-http-api ；勿把 Ollama 模型名误作 OpenAI model。
 *   若误发旧式 `openclaw:<id>`（冒号），网关可能无法识别并回退到默认 `main`。
 * - 直连：使用 `OPENCLAW_MODEL`（如 Ollama 模型名）。
 * 覆盖：`OPENCLAW_HTTP_MODEL`（非空则优先）。
 *
 * 当 `config.agentId` 非空时，会把路由型 model（`openclaw`、`openclaw/…`、`openclaw:…`、`agent/…` 等）
 * 重写为当前选中的 Agent（仍用斜杠形式）。
 */
function resolveHttpModel(config) {
  const gateway = isOpenClawGatewayBaseUrl(config.baseUrl);
  const aid = (config.agentId && String(config.agentId).trim()) || "";

  /** Gateway 下把 agent 路由型 model 与当前 agent 对齐（输出统一为 openclaw/<id>） */
  const alignGatewayAgentRoute = (modelStr) => {
    const s = String(modelStr ?? "").trim();
    if (!gateway || !aid) return s;
    if (/^openclaw$/i.test(s)) return `openclaw/${aid}`;
    if (/^openclaw(?:[:/])/i.test(s)) return `openclaw/${aid}`;
    if (/^agent(?:[:/])/i.test(s)) return `agent/${aid}`;
    return s;
  };

  const override = process.env.OPENCLAW_HTTP_MODEL;
  if (override != null && String(override).trim() !== "") {
    const o = String(override).trim();
    const out = alignGatewayAgentRoute(o);
    return out === "" ? undefined : out;
  }

  const raw = process.env.OPENCLAW_MODEL;
  const m = raw == null ? "" : String(raw).trim();

  if (gateway) {
    if (/^openclaw$/i.test(m) || /^openclaw(?:[:/])/i.test(m) || /^agent(?:[:/])/i.test(m)) {
      const out = alignGatewayAgentRoute(m);
      return out === "" ? undefined : out;
    }
    const fallbackAid = aid || "main";
    return `openclaw/${fallbackAid}`;
  }

  return m === "" ? undefined : m;
}

function chatCompletionsDisabledHint() {
  return (
    " OpenClaw Gateway 默认关闭 HTTP Chat Completions（POST /v1/chat/completions），因此会返回 404。" +
    "请在 Gateway 配置中启用：gateway.http.endpoints.chatCompletions.enabled = true，并重启 Gateway。" +
    " 若仅想直连 Ollama，请将 OPENCLAW_API_URL 指向 Ollama（如 http://127.0.0.1:11434）并设置 OPENCLAW_GATEWAY=false。"
  );
}

// ─── AG-UI Event Types ───────────────────────────────────────────
const EventType = {
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  RUN_ERROR: "RUN_ERROR",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",
  TEXT_MESSAGE_START: "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT: "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END: "TEXT_MESSAGE_END",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
  CUSTOM: "CUSTOM",
};

let _counter = 0;
const uid = (prefix = "id") => `${prefix}_${Date.now()}_${++_counter}`;
/** 成功使用过的 Chat Completions 路径，避免重复探测 */
let _chatCompletionsPath = null;

/**
 * 核心：将用户消息发给 OpenClaw，流式返回 AG-UI 事件
 *
 * Gateway 模式（默认）：通过 OpenClaw WS `chat.send` 发送，监听 `agent` / `session.message` 事件翻译为 AG-UI 事件流。
 * 直连模式（OPENCLAW_GATEWAY=false）：回退到 HTTP POST + SSE。
 *
 * @param {object} input - AG-UI RunAgentInput
 * @param {(event: object) => void} emit - 发送 AG-UI SSE 事件
 * @param {AbortSignal} [signal] - 用于取消请求
 * @param {{ suppressRunFinished?: boolean }} [opts]
 */
export async function runSreAgent(input, emit, signal, opts = {}) {
  const envConfig = getConfig();
  const reqAgent =
    input?.agentId != null && String(input.agentId).trim() !== ""
      ? String(input.agentId).trim()
      : "";
  const config = { ...envConfig, agentId: reqAgent || envConfig.agentId };
  const clientRunId = uid("run");
  const threadId = input.threadId || uid("opsRobot_thread");

  // Gateway 模式走 WS；直连 Ollama 等走原 HTTP+SSE
  if (isOpenClawGatewayBaseUrl(config.baseUrl)) {
    return runSreAgentViaWs(input, emit, signal, opts, config, clientRunId, threadId);
  }
  return runSreAgentViaHttp(input, emit, signal, opts, config, clientRunId, threadId);
}

/**
 * Gateway 模式：通过 OpenClaw WS `chat.send` + 事件订阅实现流式对话。
 *
 * 事件映射（OpenClaw WS → AG-UI）：
 *   agent { stream: "lifecycle", phase: "start" }  → STEP_STARTED("生成回复")
 *   agent { stream: "assistant", data.delta }       → TEXT_MESSAGE_START/CONTENT（流式）
 *   agent { stream: "tool", phase: "start" }        → TOOL_CALL_START + STEP_STARTED
 *   agent { stream: "tool", phase: "result" }       → TOOL_CALL_END + TOOL_CALL_RESULT + STEP_FINISHED
 *   agent { stream: "lifecycle", phase: "end" }     → TEXT_MESSAGE_END + STEP_FINISHED + cleanup
 */
async function runSreAgentViaWs(input, emit, signal, opts, config, clientRunId, threadId) {
  let hasWorkspacePanel = false;
  const trackedEmit = (event) => {
    if (event.type === EventType.CUSTOM && event.name === "workspace") hasWorkspacePanel = true;
    emit(event);
  };

  trackedEmit({ type: EventType.RUN_STARTED, threadId, runId: clientRunId });
  trackedEmit({ type: EventType.STEP_STARTED, stepName: "发送消息", detail: "通过 OpenClaw WS 发送用户消息" });

  // 获取最新用户消息文本
  const userMessages = (input.messages || []).filter((m) => m.role === "user");
  const latestUser = userMessages.at(-1);
  const latestUserText = latestUser
    ? (typeof latestUser.content === "string"
        ? latestUser.content
        : extractTextFromContent(latestUser.content))
    : "";

  const sessionKey = resolveGatewaySessionKeyForChat(threadId, config.agentId);

  console.log(
    `[sre-ws] → Gateway WS | agent=${config.agentId} | session=${sessionKey} | msgLen=${latestUserText.length}`
  );

  let serverRunId = null;
  let msgId = uid("msg");
  let messageStarted = false;
  let assistantContent = "";
  // track active tool calls: toolCallId → { name, argsStr }
  const activeTools = {};

  const gwWs = getGatewayWsClient();

  // 等待 run 完成的 Promise
  let resolveRun, rejectRun;
  const runDone = new Promise((res, rej) => {
    resolveRun = res;
    rejectRun = rej;
  });

  // 超时：多阶段编排器（4 个子 Agent）可能需要 10~20 分钟，给足时间
  const TOTAL_TIMEOUT_MS = 20 * 60_000; // 20 分钟
  const timeoutTimer = setTimeout(
    () => rejectRun(new Error("Agent 执行超时（20min）")),
    TOTAL_TIMEOUT_MS
  );

  // ── Agent 事件处理器 ───────────────────────────────────────────────────────

  const agentHandler = (payload) => {
    // 按 runId 过滤：仅处理本次 chat.send 发起的 run 的事件
    if (!serverRunId || payload?.runId !== serverRunId) return;

    const stream = payload?.stream;
    const data = payload?.data ?? {};

    // 流式文本 delta
    if (stream === "assistant" && data.delta) {
      if (!messageStarted) {
        trackedEmit({ type: EventType.TEXT_MESSAGE_START, messageId: msgId, role: "assistant" });
        messageStarted = true;
      }
      assistantContent += data.delta;
      trackedEmit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: msgId, delta: data.delta });
      return;
    }

    // 工具调用 start
    if (stream === "tool" && data.phase === "start") {
      const tcId = data.toolCallId || uid("tc");
      activeTools[tcId] = { name: data.name || "tool", args: JSON.stringify(data.args ?? {}) };
      trackedEmit({
        type: EventType.TOOL_CALL_START,
        toolCallId: tcId,
        toolCallName: data.name || "tool",
        parentMessageId: msgId,
      });
      trackedEmit({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: tcId,
        delta: JSON.stringify(data.args ?? {}),
      });
      trackedEmit({
        type: EventType.STEP_STARTED,
        stepName: `调用 ${data.name || "tool"}`,
        detail: `执行工具: ${data.name || "tool"}`,
      });
      return;
    }

    // 工具调用 result
    if (stream === "tool" && data.phase === "result") {
      const tcId = data.toolCallId || Object.keys(activeTools).at(-1) || uid("tc");
      const toolName = activeTools[tcId]?.name || data.name || "tool";
      delete activeTools[tcId];
      trackedEmit({ type: EventType.TOOL_CALL_END, toolCallId: tcId });
      trackedEmit({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: tcId,
        messageId: uid("tool"),
        content: data.isError ? `[ERROR] ${data.meta || ""}` : (data.meta || "completed"),
      });
      trackedEmit({ type: EventType.STEP_FINISHED, stepName: `调用 ${toolName}` });
      return;
    }

    // 生命周期：start
    if (stream === "lifecycle" && data.phase === "start") {
      trackedEmit({ type: EventType.STEP_STARTED, stepName: "生成回复", detail: "Agent 正在处理" });
      return;
    }

    // 生命周期：end（运行结束）
    if (stream === "lifecycle" && data.phase === "end") {
      resolveRun({ ok: true });
    }
  };

  gwWs.addEventHandler("agent", agentHandler);

  try {
    // 发送消息
    const sendResult = await gwWs.request("chat.send", {
      sessionKey,
      message: latestUserText,
      deliver: false,
      idempotencyKey: clientRunId,
    });
    serverRunId = sendResult?.runId;
    trackedEmit({ type: EventType.STEP_FINISHED, stepName: "发送消息" });

    let abortListener;
    if (signal) {
      abortListener = () => {
        clearTimeout(timeoutTimer);
        if (serverRunId) {
          gwWs.request("chat.abort", { runId: serverRunId }).catch(() => {});
        }
        resolveRun({ ok: false, aborted: true });
      };
      signal.addEventListener("abort", abortListener, { once: true });
    }

    // 等待 agent 完成
    const result = await runDone;
    clearTimeout(timeoutTimer);
    if (abortListener) signal?.removeEventListener("abort", abortListener);

    // 清理
    gwWs.removeEventHandler("agent", agentHandler);
    // 不调用 unsubscribe：session.message 订阅由 _sreSessionMsgHandler（sre-agent-ws.mjs）独立管理
    // 若此处 unsubscribe，会终止 _sreSessionMsgHandler 的实时推送，导致 RUN_FINISHED 后会话停止更新

    if (result?.aborted) {
      return { ok: false, aborted: true };
    }

    // 收尾文本消息
    if (messageStarted) {
      const { cleanText, confirmPayload } = parseAssistantConfirmSources(
        assistantContent,
        () => uid("cfm")
      );
      if (confirmPayload) {
        trackedEmit({ type: EventType.CUSTOM, name: "confirm", value: confirmPayload });
      }
      trackedEmit({ type: EventType.TEXT_MESSAGE_END, messageId: msgId });
      trackedEmit({ type: EventType.STEP_FINISHED, stepName: "生成回复" });
      _lastContentBuffer = cleanText;
    }

    // if (!hasWorkspacePanel) {
    //   emitFallbackWorkspacePanel(trackedEmit);
    // }

    if (!opts?.suppressRunFinished) {
      trackedEmit({ type: EventType.RUN_FINISHED, threadId, runId: clientRunId });
    }
    return { ok: true, threadId, runId: clientRunId };
  } catch (err) {
    clearTimeout(timeoutTimer);
    gwWs.removeEventHandler("agent", agentHandler);
    // 同上：不调用 unsubscribe

    if (err.name === "AbortError") return { ok: false, aborted: true };
    console.error("[sre-ws] Error:", err.message);
    trackedEmit({ type: EventType.RUN_ERROR, message: err.message || String(err) });
    return { ok: false };
  }
}

/** 从 OpenAI content 数组或字符串中提取纯文本 */
function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text")
    .map((b) => b.text || "")
    .join("");
}

/**
 * 直连模式（非 Gateway）：通过 HTTP POST + SSE 调用 OpenClaw Chat Completion API。
 * 保留原有实现，仅在 OPENCLAW_GATEWAY=false 或直连 Ollama 时使用。
 */
async function runSreAgentViaHttp(input, emit, signal, opts, config, runId, threadId) {
  // 如果 agentId 为非默认值，说明连接的是外部 OpenClaw Agent，
  // 不注入本地 SYSTEM_PROMPT / SRE_TOOLS，让 Agent 使用自身技能。
  const isExternalAgent = config.agentId && config.agentId !== "sre";

  let hasWorkspacePanel = false;
  const trackedEmit = (event) => {
    if (event.type === EventType.CUSTOM && event.name === "workspace") {
      hasWorkspacePanel = true;
    }
    emit(event);
  };

  trackedEmit({ type: EventType.RUN_STARTED, threadId, runId });
  trackedEmit({ type: EventType.STEP_STARTED, stepName: "理解意图", detail: "解析用户指令，规划执行步骤" });

  try {
    const userMessagesRaw = (input.messages || []).map((m) => ({
      role: m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    const userMessages = collapseToLatestUserForGatewaySession(config, threadId, userMessagesRaw);

    const chatMessages = isExternalAgent
      ? userMessages
      : [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];

    const tools = isExternalAgent ? [] : SRE_TOOLS;

    const httpModel = resolveHttpModel(config);
    console.log(
      `[sre-http] → ${config.baseUrl} | agent=${config.agentId} | httpModel=${httpModel || "(omit)"} | external=${isExternalAgent} | msgs=${chatMessages.length} | tools=${tools.length}`
    );

    const response = await callOpenClawStream(config, chatMessages, signal, tools, threadId);
    trackedEmit({ type: EventType.STEP_FINISHED, stepName: "理解意图" });

    await processStreamResponse(response, trackedEmit, config, chatMessages, signal, threadId);

    // if (!hasWorkspacePanel) {
    //   emitFallbackWorkspacePanel(trackedEmit);
    // }

    if (!opts?.suppressRunFinished) {
      trackedEmit({ type: EventType.RUN_FINISHED, threadId, runId });
    }
    return { ok: true, threadId, runId };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, aborted: true };
    }
    console.error("[sre-http] Error:", err.message);
    trackedEmit({ type: EventType.RUN_ERROR, message: err.message || String(err) });
    return { ok: false };
  }
}

/**
 * 调用 OpenClaw Chat Completion API (SSE streaming)
 */
async function callOpenClawStream(config, messages, signal, tools = SRE_TOOLS, sessionKey) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  if (config.agentId) {
    headers["X-OpenClaw-Agent-Id"] = config.agentId;
  }
  const rawSk = sessionKey != null ? String(sessionKey).trim() : "";
  const gatewaySk =
    rawSk && isOpenClawGatewayBaseUrl(config.baseUrl)
      ? resolveGatewaySessionKeyForChat(rawSk, config.agentId)
      : rawSk;
  if (gatewaySk) {
    headers["X-OpenClaw-Session-Key"] = gatewaySk;
  }
  const ch = process.env.OPENCLAW_MESSAGE_CHANNEL;
  if (ch != null && String(ch).trim() !== "") {
    headers["X-OpenClaw-Message-Channel"] = String(ch).trim();
  }

  const httpModel = resolveHttpModel(config);
  const messagesOut = injectOpenClawSessionChatDirectives(messages, rawSk, config.baseUrl);
  const useParallelTools = tools.length > 0 && isOpenClawGatewayBaseUrl(config.baseUrl);
  const body = {
    ...(httpModel ? { model: httpModel } : {}),
    ...(config.agentId ? { agent_id: config.agentId } : {}),
    messages: messagesOut,
    stream: true,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    ...(useParallelTools ? { parallel_tool_calls: true } : {}),
  };

  const pathCandidates = config.chatPath
    ? [config.chatPath]
    : _chatCompletionsPath
      ? [_chatCompletionsPath]
      : ["/v1/chat/completions", "/api/v1/chat/completions"];

  let resp = null;
  let lastError = null;
  for (const path of pathCandidates) {
    const url = `${config.baseUrl}${path}`;
    try {
      const currentResp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (currentResp.status === 404 && pathCandidates.length > 1) {
        lastError = new Error(`OpenClaw API 响应 404: ${url}`);
        continue;
      }

      resp = currentResp;
      _chatCompletionsPath = path;
      break;
    } catch (fetchErr) {
      lastError = new Error(
        `无法连接 OpenClaw API (${url})：${fetchErr.cause?.message || fetchErr.message}。请确认 OPENCLAW_API_URL 地址正确且服务已启动。`
      );
    }
  }

  if (!resp) {
    throw lastError || new Error("无法连接 OpenClaw API：未知错误");
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    let hint = "";
    if (resp.status === 404) {
      hint = chatCompletionsDisabledHint();
      if (!config.chatPath) {
        hint += " 也可在 .env 设置 OPENCLAW_CHAT_PATH 指向已启用的兼容端点。";
      }
    }
    throw new Error(`OpenClaw API 响应 ${resp.status}: ${text || resp.statusText}.${hint}`);
  }

  return resp;
}

let _lastContentBuffer = "";

/**
 * 解析 OpenClaw SSE 流，翻译为 AG-UI 事件
 */
async function processStreamResponse(response, emit, config, chatMessages, signal, sessionKey) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const msgId = uid("msg");
  let messageStarted = false;
  let contentBuffer = "";

  // Tool call aggregation
  const toolCallBuffers = {};  // id -> { name, args }
  let hasToolCalls = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      let chunk;
      try {
        chunk = JSON.parse(trimmed.slice(6));
      } catch {
        continue;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        if (!messageStarted) {
          emit({ type: EventType.STEP_STARTED, stepName: "生成回复", detail: "Agent 正在组织回答" });
          emit({ type: EventType.TEXT_MESSAGE_START, messageId: msgId, role: "assistant" });
          messageStarted = true;
        }
        contentBuffer += delta.content;
        emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: msgId, delta: delta.content });
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallBuffers[idx]) {
            toolCallBuffers[idx] = { id: tc.id || uid("tc"), name: "", args: "" };
          }
          const buf = toolCallBuffers[idx];
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) {
            buf.name += tc.function.name;
            hasToolCalls = true;
            emit({
              type: EventType.TOOL_CALL_START,
              toolCallId: buf.id,
              toolCallName: buf.name,
              parentMessageId: msgId,
            });
            emit({
              type: EventType.STEP_STARTED,
              stepName: `调用 ${buf.name}`,
              detail: `执行工具: ${buf.name}`,
            });
          }
          if (tc.function?.arguments) {
            buf.args += tc.function.arguments;
            emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: buf.id, delta: tc.function.arguments });
          }
        }
      }
    }
  }

  // Finalize text message + optional ```confirm``` → AG-UI CUSTOM confirm
  let strippedContent = contentBuffer;
  if (messageStarted) {
    const { cleanText, confirmPayload } = parseAssistantConfirmSources(contentBuffer, () => uid("cfm"));
    strippedContent = cleanText;
    if (confirmPayload) {
      emit({
        type: EventType.CUSTOM,
        name: "confirm",
        value: confirmPayload,
      });
    }
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: msgId });
    emit({ type: EventType.STEP_FINISHED, stepName: "生成回复" });
  }
  _lastContentBuffer = strippedContent;

  console.log(
    `[sre] ← stream ended | content=${contentBuffer.length} chars | toolCalls=${hasToolCalls} | preview="${contentBuffer.slice(0, 80).replace(/\n/g, "\\n")}…"`
  );

  // Finalize tool calls & execute them
  if (hasToolCalls) {
    for (const idx of Object.keys(toolCallBuffers)) {
      const buf = toolCallBuffers[idx];
      emit({ type: EventType.TOOL_CALL_END, toolCallId: buf.id });

      // Execute tool and get result
      const result = await executeTool(buf.name, buf.args, emit);
      emit({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: buf.id,
        messageId: uid("tool"),
        content: result,
      });
      emit({ type: EventType.STEP_FINISHED, stepName: `调用 ${buf.name}` });

      // Push workspace panel based on tool result
      emitWorkspacePanel(buf.name, buf.args, result, emit);
    }

    // Continue conversation with tool results
    const toolResultMessages = Object.values(toolCallBuffers).map((buf) => ({
      role: "tool",
      tool_call_id: buf.id,
      content: buf.result || "completed",
    }));

    const assistText = messageStarted
      ? (strippedContent.trim() ? strippedContent : null)
      : (contentBuffer.trim() ? contentBuffer : null);
    const assistantMsg = {
      role: "assistant",
      content: assistText,
      tool_calls: Object.values(toolCallBuffers).map((buf) => ({
        id: buf.id,
        type: "function",
        function: { name: buf.name, arguments: buf.args },
      })),
    };

    const followUpMessages = [...chatMessages, assistantMsg, ...toolResultMessages];

    emit({ type: EventType.STEP_STARTED, stepName: "分析结果", detail: "综合工具输出生成最终回复" });

    const followUpResponse = await callOpenClawStream(config, followUpMessages, signal, [], sessionKey);
    await processStreamResponse(followUpResponse, emit, config, followUpMessages, signal, sessionKey);

    emit({ type: EventType.STEP_FINISHED, stepName: "分析结果" });
  }
}

/**
 * 执行工具调用 — 实际环境中可调用真实 K8s / Prometheus
 * 当前返回占位结果，接入时替换为实际实现
 */
async function executeTool(name, argsJson, emit) {
  let args;
  try {
    args = JSON.parse(argsJson);
  } catch {
    args = {};
  }

  switch (name) {
    case "kubectl": {
      const cmd = args.command || "";
      const ns = args.namespace ? `-n ${args.namespace}` : "";
      return `[kubectl] 执行: kubectl ${cmd} ${ns}\n（实际部署后将连接 K8s 集群执行命令）`;
    }
    case "prometheus_query": {
      return `[prometheus] 查询: ${args.query || "N/A"}\n范围: ${args.range || "5m"}\n（实际部署后将连接 Prometheus 执行 PromQL 查询）`;
    }
    case "log_search": {
      return `[log_search] 关键词: ${args.keyword || "N/A"}\n级别: ${args.level || "all"}\n（实际部署后将查询 Doris 中的 Agent 会话日志）`;
    }
    default:
      return `[${name}] 未知工具`;
  }
}

/**
 * 根据工具调用结果生成右侧工作区面板
 */
function emitWorkspacePanel(toolName, argsJson, result, emit) {
  let args;
  try { args = JSON.parse(argsJson); } catch { args = {}; }

  const panelId = uid("wp");
  let panel = null;

  switch (toolName) {
    case "kubectl":
      panel = {
        id: panelId,
        type: "terminal",
        title: `$ kubectl ${args.command || ""}`,
        lines: result.split("\n").map((text) => ({
          text,
          cls: text.includes("Error") || text.includes("NotReady") || text.includes("OOM")
            ? "error"
            : text.includes("WARN") || text.includes("warning") || text.includes("Pending")
            ? "warn"
            : text.startsWith("[") || text.startsWith("#")
            ? "comment"
            : "ok",
        })),
      };
      break;
    case "prometheus_query":
      panel = {
        id: panelId,
        type: "terminal",
        title: `$ PromQL: ${args.query || ""}`,
        lines: result.split("\n").map((text) => ({
          text,
          cls: text.includes("⚠") ? "warn" : text.startsWith("[") ? "comment" : "ok",
        })),
      };
      break;
    case "log_search":
      panel = {
        id: panelId,
        type: "terminal",
        title: `日志搜索: ${args.keyword || ""}`,
        lines: result.split("\n").map((text) => ({
          text,
          cls: text.includes("error") ? "error" : text.includes("warn") ? "warn" : "dim",
        })),
      };
      break;
  }

  if (panel) {
    emit({
      type: EventType.CUSTOM,
      name: "workspace",
      value: { action: "add_panel", panel },
    });
  }
}

/**
 * Fallback：当 OpenClaw 未返回结构化 tool_calls（纯文本响应）时，
 * 从 Agent 回复文本中提取结构化工作区面板，保证右侧工作区不为空。
 *
 * 支持 A2UI 混合格式：```a2ui JSON ``` 块会被解析为 live 面板
 * （metrics_live / pods_live / actions_live），其余内容走静态面板逻辑。
 */
function emitFallbackWorkspacePanel(emit) {
  const text = _lastContentBuffer.trim();
  if (!text) return;

  // ── 1. 提取 A2UI blocks ────────────────────────────────────
  const a2uiRe = /```a2ui\n([\s\S]*?)```/g;
  let m;
  let hasA2ui = false;
  while ((m = a2uiRe.exec(text)) !== null) {
    try {
      const surface = JSON.parse(m[1]);
      hasA2ui = true;
      const panel = a2uiSurfaceToPanel(surface);
      if (panel) {
        emit({
          type: EventType.CUSTOM,
          name: "workspace",
          value: { action: "add_panel", panel },
        });
      }
    } catch { /* not valid JSON, skip */ }
  }

  // ── 2. 去除 A2UI 块后的纯文本部分 → 静态面板 ──────────────
  const plainText = text.replace(/```a2ui\n[\s\S]*?```/g, "").trim();
  const textForPanels = plainText || (!hasA2ui ? text : "");

  if (textForPanels) {
    // 2a. 自动检测 CPU/内存指标 → 生成 metrics_live 面板
    const liveChart = tryBuildMetricsLivePanel(textForPanels);
    if (liveChart) {
      emit({ type: EventType.CUSTOM, name: "workspace", value: { action: "add_panel", panel: liveChart } });
    }

    // 2b. 自动检测异常 Pod → 生成 pods_live 面板
    const podPanel = tryBuildPodsLivePanel(textForPanels);
    if (podPanel) {
      emit({ type: EventType.CUSTOM, name: "workspace", value: { action: "add_panel", panel: podPanel } });
    }

    // 2c. 静态面板（表格 / 终端等）
    const panels = parseTextIntoPanels(textForPanels);
    for (const panel of panels) {
      emit({ type: EventType.CUSTOM, name: "workspace", value: { action: "add_panel", panel } });
    }
  }
}

// ─── Auto-detect metrics from plain text ─────────────────────────
/**
 * 从 Agent 纯文本回复中识别 CPU / 内存等数值指标，自动生成 metrics_live 面板。
 * 匹配模式：
 *   当前 CPU: 61.9%   /   CPU 使用率 55.4%   /   内存 72.3%
 *   | 当前 CPU | 61.9% |  （Markdown 表格行）
 */
function tryBuildMetricsLivePanel(text) {
  const metricRe = /(?:当前|平均|最大|最小|current|avg|max|min)?\s*(?:CPU|cpu|内存|Memory|memory|mem)[^0-9]*?([\d.]+)\s*%/gi;
  const hits = [];
  let m;
  while ((m = metricRe.exec(text)) !== null) {
    hits.push(parseFloat(m[1]));
  }
  if (hits.length === 0) return null;

  const avg = hits.reduce((a, b) => a + b, 0) / hits.length;
  const isCpu = /cpu/i.test(text);
  const isMem = /内存|memory|mem/i.test(text);

  const series = [];
  if (isCpu) series.push({ label: "CPU", color: "#3b82f6", base: Math.round(avg) });
  if (isMem) series.push({ label: "内存", color: "#10b981", base: Math.round(avg) });
  if (series.length === 0) series.push({ label: "CPU", color: "#3b82f6", base: Math.round(avg) });

  const cards = [];
  const labels = ["当前", "平均", "最大", "最小"];
  for (let i = 0; i < Math.min(hits.length, 4); i++) {
    const v = hits[i];
    cards.push({
      label: `${labels[i] || ""} ${series[0].label}`,
      value: `${v}%`,
      status: v > 85 ? "danger" : v > 70 ? "warning" : "normal",
    });
  }

  return {
    id: uid("ml"),
    type: "metrics_live",
    title: `${series.map((s) => s.label).join(" / ")} 实时监控`,
    series,
    cards: cards.length > 0 ? cards : undefined,
    interval: 2000,
    maxPoints: 30,
    yLabel: "%",
    height: 200,
    dataSource: "live_mock",
  };
}

/**
 * 从文本中识别异常 Pod 信息，自动生成 pods_live 面板。
 * 匹配 Pod 名 + 非 Running 状态。
 */
function tryBuildPodsLivePanel(text) {
  const podRe = /([a-z][\w.-]*-[a-z0-9]{4,})\s+.{0,30}?(CrashLoopBackOff|Error|ImagePullBackOff|OOMKilled|Pending|ContainerCreating|Terminating|Failed)/gi;
  const pods = [];
  const seen = new Set();
  let m;
  while ((m = podRe.exec(text)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const restartMatch = text.slice(m.index, m.index + 120).match(/(?:重启|restart)[^\d]*(\d+)/i);
    pods.push({
      name,
      namespace: "default",
      status: m[2],
      restarts: restartMatch ? parseInt(restartMatch[1], 10) : 0,
      actions: ["logs", "describe", "restart"],
    });
  }
  if (pods.length === 0) return null;
  return {
    id: uid("pl"),
    type: "pods_live",
    title: `异常 Pod (${pods.length})`,
    pods,
  };
}

/**
 * 将 A2UI surface JSON 转换为 WorkspaceRenderer 可渲染的 panel 对象。
 *
 * 支持的 surface.type:
 *   line_chart  → metrics_live
 *   pod_grid    → pods_live
 *   action_bar  → actions_live
 *   metric_cards → metrics (静态卡片)
 *   table / terminal → 透传
 */
function a2uiSurfaceToPanel(surface) {
  if (!surface || !surface.type) return null;
  const id = surface.id || uid("a2ui");

  switch (surface.type) {
    case "line_chart":
      return {
        id,
        type: "metrics_live",
        title: surface.title || "实时指标",
        series: surface.series || [],
        cards: surface.cards,
        interval: surface.interval || 2000,
        maxPoints: surface.maxPoints || 30,
        yLabel: surface.yLabel || "%",
        height: surface.height || 180,
        dataSource: surface.dataSource || "live_mock",
      };
    case "pod_grid":
      return {
        id,
        type: "pods_live",
        title: surface.title || "Pod 状态",
        pods: (surface.pods || []).map((p) => ({
          name: p.name,
          namespace: p.namespace || "default",
          status: p.status || "Running",
          restarts: p.restarts || 0,
          node: p.node || "",
          actions: p.actions || ["logs", "describe", "restart"],
        })),
      };
    case "action_bar":
      return {
        id,
        type: "actions_live",
        title: surface.title || "快捷操作",
        actions: (surface.actions || []).map((a, i) => ({
          id: a.id || `act_${i}`,
          label: a.label,
          command: a.command || "",
          variant: a.variant || "secondary",
        })),
        hint: surface.hint,
      };
    case "metric_cards":
      return {
        id,
        type: "metrics",
        title: surface.title || "关键指标",
        items: surface.items || surface.cards || [],
      };
    case "table":
    case "terminal":
      return { id, ...surface };
    default:
      return { id, type: "terminal", title: surface.title || surface.type, lines: [{ text: JSON.stringify(surface, null, 2), cls: "dim" }] };
  }
}

function parseTextIntoPanels(text) {
  // Split by ## or ### headings; each heading starts a new section
  const sectionRe = /(?=^#{2,3}\s)/m;
  const rawSections = text.split(sectionRe).filter((s) => s.trim());

  // If there are clear sections, parse each one into a panel
  if (rawSections.length >= 2) {
    const panels = [];
    for (const section of rawSections) {
      const headingMatch = section.match(/^#{2,3}\s+(.+)/m);
      const title = headingMatch
        ? headingMatch[1].replace(/[*#]/g, "").trim()
        : "执行结果";
      const body = headingMatch
        ? section.slice(headingMatch[0].length).trim()
        : section.trim();
      if (!body) continue;

      const tablePanel = tryParseTable(body, title);
      if (tablePanel) {
        panels.push(tablePanel);
      } else {
        panels.push(makeTerminalPanel(body, title));
      }
    }
    if (panels.length > 0) return panels;
  }

  // Fallback: try to extract tables & code blocks from flat text
  const panels = [];
  extractTables(text, panels);
  extractCodeBlocks(text, panels);

  if (panels.length === 0) {
    panels.push(makeTerminalPanel(text, "Agent 执行结果"));
  }
  return panels;
}

function tryParseTable(body, title) {
  const rows = body.split("\n").map((r) => r.trim()).filter((r) => r.startsWith("|"));
  const isSep = (r) => /^[\|\s\-:]+$/.test(r);
  const dataRows = rows.filter((r) => !isSep(r));
  if (dataRows.length < 2) return null;

  const parseRow = (r) =>
    r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  return {
    id: uid("wp"),
    type: "table",
    title,
    columns: parseRow(dataRows[0]),
    rows: dataRows.slice(1).map(parseRow),
  };
}

function extractTables(text, panels) {
  const tableRe = /(?:^|\n)((?:\|.+\|[ \t]*\n){2,}(?:\|.+\|[ \t]*(?:\n|$))*)/g;
  let m;
  while ((m = tableRe.exec(text)) !== null) {
    const panel = tryParseTable(m[1], "查询结果");
    if (panel) panels.push(panel);
  }
}

function extractCodeBlocks(text, panels) {
  const codeRe = /```[\w]*\n([\s\S]*?)```/g;
  let m;
  while ((m = codeRe.exec(text)) !== null) {
    const code = m[1].trim();
    if (code) panels.push(makeTerminalPanel(code, "执行输出"));
  }
}

function classifyLine(line) {
  if (/❌|🔴|Error|error|FAIL|失败/.test(line)) return "error";
  if (/⚠|🟡|warning|WARNING|警告/.test(line)) return "warn";
  if (/✅|✓|🟢|正常/.test(line)) return "ok";
  if (/^#{1,3}\s|^\|/.test(line)) return "head";
  if (/^\*\*/.test(line)) return "ok";
  if (/^[-•]/.test(line)) return "ok";
  return "dim";
}

function makeTerminalPanel(body, title) {
  return {
    id: uid("wp"),
    type: "terminal",
    title,
    lines: body.split("\n").map((line) => ({ text: line, cls: classifyLine(line) })),
  };
}

export { getConfig, SYSTEM_PROMPT, SRE_TOOLS, isOpenClawGatewayBaseUrl };
