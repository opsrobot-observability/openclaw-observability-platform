/**
 * OpenClaw Client — 调用 OpenClaw Agent API 的 SSE 流式客户端
 *
 * 将 AG-UI RunAgentInput 转换为 OpenClaw Chat Completion 请求，
 * 解析 OpenClaw 的 SSE 响应并翻译为 AG-UI 事件流。
 *
 * 兼容 OpenAI Chat Completion SSE 协议（OpenClaw v3.x+ 默认兼容）。
 */

// ─── SRE Agent System Prompt ─────────────────────────────────────
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
5. 高危操作必须先提示风险，等待用户确认`;

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
  return {
    baseUrl: raw.replace(/\/+$/, ""),
    agentId: process.env.OPENCLAW_AGENT_ID || "sre-agent",
    apiKey: process.env.OPENCLAW_API_KEY || "",
    model: optionalModelFromEnv(),
  };
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

/**
 * 核心：将用户消息发给 OpenClaw，流式返回 AG-UI 事件
 *
 * @param {object} input - AG-UI RunAgentInput
 * @param {(event: object) => void} emit - 发送 AG-UI SSE 事件
 * @param {AbortSignal} [signal] - 用于取消请求
 */
export async function runSreAgent(input, emit, signal) {
  const envConfig = getConfig();
  const reqAgent =
    input?.agentId != null && String(input.agentId).trim() !== ""
      ? String(input.agentId).trim()
      : "";
  const config = { ...envConfig, agentId: reqAgent || envConfig.agentId };
  const runId = uid("run");
  const threadId = input.threadId || uid("thread");

  // 如果 agentId 为非默认值，说明连接的是外部 OpenClaw Agent，
  // 不注入本地 SYSTEM_PROMPT / SRE_TOOLS，让 Agent 使用自身技能。
  const isExternalAgent = config.agentId && config.agentId !== "sre-agent";

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
    const userMessages = (input.messages || []).map((m) => ({
      role: m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const chatMessages = isExternalAgent
      ? userMessages
      : [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];

    const tools = isExternalAgent ? [] : SRE_TOOLS;

    console.log(
      `[sre-agent] → ${config.baseUrl} | agent=${config.agentId} | model=${config.model || "(default)"} | external=${isExternalAgent} | msgs=${chatMessages.length} | tools=${tools.length}`
    );

    const response = await callOpenClawStream(config, chatMessages, signal, tools);
    trackedEmit({ type: EventType.STEP_FINISHED, stepName: "理解意图" });

    await processStreamResponse(response, trackedEmit, config, chatMessages, signal);

    if (!hasWorkspacePanel) {
      emitFallbackWorkspacePanel(trackedEmit);
    }

    trackedEmit({ type: EventType.RUN_FINISHED, threadId, runId });
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("[sre-agent] Error:", err.message);
    trackedEmit({ type: EventType.RUN_ERROR, message: err.message || String(err) });
  }
}

/**
 * 调用 OpenClaw Chat Completion API (SSE streaming)
 */
async function callOpenClawStream(config, messages, signal, tools = SRE_TOOLS) {
  const url = `${config.baseUrl}/v1/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  if (config.agentId) {
    headers["X-OpenClaw-Agent-Id"] = config.agentId;
  }

  const body = {
    ...(config.model ? { model: config.model } : {}),
    ...(config.agentId ? { agent_id: config.agentId } : {}),
    messages,
    stream: true,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (fetchErr) {
    throw new Error(
      `无法连接 OpenClaw API (${url})：${fetchErr.cause?.message || fetchErr.message}。请确认 OPENCLAW_API_URL 地址正确且服务已启动。`
    );
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenClaw API 响应 ${resp.status}: ${text || resp.statusText}`);
  }

  return resp;
}

let _lastContentBuffer = "";

/**
 * 解析 OpenClaw SSE 流，翻译为 AG-UI 事件
 */
async function processStreamResponse(response, emit, config, chatMessages, signal) {
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

  // Finalize text message
  if (messageStarted) {
    emit({ type: EventType.TEXT_MESSAGE_END, messageId: msgId });
    emit({ type: EventType.STEP_FINISHED, stepName: "生成回复" });
  }
  _lastContentBuffer = contentBuffer;

  console.log(
    `[sre-agent] ← stream ended | content=${contentBuffer.length} chars | toolCalls=${hasToolCalls} | preview="${contentBuffer.slice(0, 80).replace(/\n/g, "\\n")}…"`
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

    const assistantMsg = {
      role: "assistant",
      content: contentBuffer || null,
      tool_calls: Object.values(toolCallBuffers).map((buf) => ({
        id: buf.id,
        type: "function",
        function: { name: buf.name, arguments: buf.args },
      })),
    };

    const followUpMessages = [...chatMessages, assistantMsg, ...toolResultMessages];

    emit({ type: EventType.STEP_STARTED, stepName: "分析结果", detail: "综合工具输出生成最终回复" });

    const followUpResponse = await callOpenClawStream(config, followUpMessages, signal, []);
    await processStreamResponse(followUpResponse, emit, config, followUpMessages, signal);

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

export { getConfig, SYSTEM_PROMPT, SRE_TOOLS };
