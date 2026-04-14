/**
 * A2UI Protocol — Agent-to-UI 交互协议
 *
 * 支持 OpenClaw Canvas 的混合格式消息：Markdown + A2UI JSON 块。
 * Agent 可通过 surfaceUpdate / dataModelUpdate 推送实时数据，
 * 前端通过 userAction 将操作事件上报给 Agent。
 */

// ─── A2UI Event Types ────────────────────────────────────────────
export const A2UIEvent = {
  SURFACE_CREATE: "surfaceCreate",
  SURFACE_UPDATE: "surfaceUpdate",
  SURFACE_REMOVE: "surfaceRemove",
  DATA_MODEL_UPDATE: "dataModelUpdate",
  USER_ACTION: "userAction",
};

// ─── A2UI Surface Types ─────────────────────────────────────────
export const SurfaceType = {
  LINE_CHART: "line_chart",
  METRIC_CARDS: "metric_cards",
  POD_GRID: "pod_grid",
  ACTION_BAR: "action_bar",
  TERMINAL: "terminal",
  TABLE: "table",
};

// ─── Mixed Format Parser ─────────────────────────────────────────
/**
 * 解析 Markdown + A2UI 混合格式文本。
 * A2UI 块以 ```a2ui ... ``` 包裹，内容为 JSON。
 *
 * @returns {{ type: "markdown"|"a2ui", content: string|object }[]}
 */
export function parseA2UIMixed(text) {
  if (!text) return [];
  const segments = [];
  const re = /```a2ui\n([\s\S]*?)```/g;
  let last = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const md = text.slice(last, m.index).trim();
      if (md) segments.push({ type: "markdown", content: md });
    }
    try {
      segments.push({ type: "a2ui", content: JSON.parse(m[1]) });
    } catch {
      segments.push({ type: "markdown", content: m[1] });
    }
    last = m.index + m[0].length;
  }

  const tail = text.slice(last).trim();
  if (tail) segments.push({ type: "markdown", content: tail });

  return segments;
}

/**
 * 从混合格式中提取所有 A2UI surface 定义
 */
export function extractSurfaces(text) {
  return parseA2UIMixed(text)
    .filter((s) => s.type === "a2ui" && s.content?.surface)
    .map((s) => s.content);
}

// ─── Data Model Store ────────────────────────────────────────────
/**
 * 简单的响应式数据模型：Agent 推送 dataModelUpdate 时合并到 store，
 * UI surface 通过 key 绑定并自动刷新。
 */
export function createDataModel(initial = {}) {
  let data = { ...initial };
  const listeners = new Set();

  return {
    get: (key) => (key ? data[key] : data),
    set: (key, value) => {
      data = { ...data, [key]: value };
      listeners.forEach((fn) => fn(data));
    },
    merge: (patch) => {
      data = { ...data, ...patch };
      listeners.forEach((fn) => fn(data));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ─── User Action Dispatcher ─────────────────────────────────────
/**
 * 将前端用户操作发送给 Agent（POST /api/sre-agent/action）
 */
export async function dispatchUserAction(action) {
  try {
    const resp = await fetch("/api/sre-agent/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
