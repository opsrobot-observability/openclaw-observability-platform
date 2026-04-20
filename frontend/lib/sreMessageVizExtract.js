/**
 * 从 Agent Markdown 消息中提取 SRE 可视化规格：
 * - 优先使用 ```json 代码块内嵌的合法 JSON（type 为已知 viz）
 * - 若无内嵌 JSON，则收集 ~/.openclaw/.../*.json 文件路径，由前端再请求 /api/sre-agent/viz-json
 */

export const SRE_VIZ_TYPES = new Set([
  "metrics_trend",
  "logs_distribution",
  "trace_call_chain",
  "topology_map",
  "anomaly_pattern",
]);

/** 左侧标题（与 Agent 文案中的「指标趋势图」等对齐） */
export const SRE_VIZ_DISPLAY_TITLE = {
  metrics_trend: "指标趋势图",
  logs_distribution: "日志分布",
  trace_call_chain: "调用链",
  topology_map: "拓扑图",
  anomaly_pattern: "异常模式",
};

/**
 * @param {{ kind: "inline"; model: object } | { kind: "path"; path: string }} item
 */
export function inferSreVizDisplayTitleFromQueueItem(item) {
  if (!item) return "图表";
  if (item.kind === "inline") {
    const m = item.model;
    if (!m || typeof m !== "object") return "图表";
    const title = String(m.title || "").trim();
    if (title) return title;
    const ty = String(m.type || "").toLowerCase();
    return SRE_VIZ_DISPLAY_TITLE[ty] || m.type || "图表";
  }
  if (item.kind === "path") {
    const path = String(item.path || "");
    const m = path.match(/(metrics_trend|logs_distribution|trace_call_chain|topology_map|anomaly_pattern)\.json$/i);
    if (m) return SRE_VIZ_DISPLAY_TITLE[m[1].toLowerCase()] || "图表";
    const base = path.split("/").pop()?.replace(/\.json$/i, "") || "";
    if (SRE_VIZ_TYPES.has(base)) return SRE_VIZ_DISPLAY_TITLE[base] || "图表";
    return "可视化";
  }
  return "图表";
}

/**
 * 去掉路径、反引号路径及 Agent 常见引导行（如 topology_map（拓扑图）、文件路径：…），
 * 用于 path-only 场景，或内联 viz 代码块前紧邻的 Markdown 片段。
 * @param {string} text
 * @param {string[]} [paths]
 */
export function stripSrePathVizBoilerplateMarkdown(text, paths = []) {
  let t = String(text ?? "");
  const sorted = [...paths].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp("`\\s*" + esc + "\\s*`", "g"), "");
    t = t.split(p).join("");
  }
  t = t.replace(/`~\/\.openclaw\/[^`\n]+?\.json`/g, "");
  t = t.replace(/文件路径\s*[：:]\s*`?~\/\.openclaw\/[^\n`]+`?/gi, "");
  t = t.replace(/路径\s*[：:]\s*`?~\/\.openclaw\/[^\n`]+`?/gi, "");
  if (!sorted.length) {
    t = t.replace(/~\/\.openclaw\/[^\s`\]"'<>\n]+\.json/g, "");
  }
  const kept = t.split(/\r?\n/).filter((line) => {
    let s = line.trim();
    s = s.replace(/\s*📁\s*文件路径\s*[：:]\s*$/u, "").replace(/\s*文件路径\s*[：:]\s*$/u, "").trim();
    if (!s) return false;
    if (/数据缺口/.test(s)) return false;
    if (/^说明[：:]/.test(s)) return false;
    if (/可视化数据/.test(s) && s.length < 160) return false;
    if (/文件路径\s*[：:]/.test(s)) return false;
    if (/^路径\s*[：:]/.test(s)) return false;
    if (/^[`\s]*~\/\.openclaw\/[^\s`]+\.json[`\s]*$/.test(s)) return false;
    if (
      /\b(metrics_trend|logs_distribution|trace_call_chain|topology_map|anomaly_pattern)\b/i.test(s) &&
      (/（[^）\n]{0,64}）/.test(s) || /\([^)\n]{0,64}\)/.test(s)) &&
      s.length < 200
    ) {
      return false;
    }
    if (
      /\b(metrics_trend|logs_distribution|trace_call_chain|topology_map|anomaly_pattern)\s*(\(|（|）|\)|:|：|\s*$)/i.test(s) &&
      s.length < 160
    ) {
      return false;
    }
    return true;
  });
  return kept.join("\n").trim();
}

function tryParseVizObject(raw) {
  const t = String(raw ?? "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t);
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const ty = o.type;
    if (typeof ty !== "string" || !SRE_VIZ_TYPES.has(ty)) return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {{ kind: "inline", model: object }[] | { kind: "path", path: string }[]}
 */
export function extractSreVizWorkQueue(text) {
  const src = String(text ?? "");
  const inlineModels = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(src)) !== null) {
    const obj = tryParseVizObject(m[1]);
    if (obj) inlineModels.push(obj);
  }

  if (inlineModels.length > 0) {
    return inlineModels.map((model) => ({ kind: "inline", model }));
  }

  const paths = [];
  const seen = new Set();

  const labeledPathRe = /(?:文件路径|路径)\s*[:：]\s*`?([~./][^\s`\]"'<>]+\.json)`?/gi;
  while ((m = labeledPathRe.exec(src)) !== null) {
    const p = m[1].trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }

  const bareRe = /~\/\.openclaw\/[^\s`\]"'<>]+\.json/g;
  while ((m = bareRe.exec(src)) !== null) {
    const p = m[0].trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }

  return paths.map((path) => ({ kind: "path", path }));
}

/**
 * 将助手消息按「已知 SRE viz 的 ```json 代码块」拆成 Markdown 片段与内嵌图表段，用于在聊天里用按钮替代整块 JSON。
 * 非 viz 的 ``` 块保留在相邻的 markdown 片段中，不拆分。
 *
 * @param {string} text
 * @returns {{ parts: Array<{ type: "markdown"; text: string } | { type: "viz"; model: object }> } | null} 无内嵌 viz 时返回 null
 */
export function splitAssistantMessageOnVizFences(text) {
  const src = String(text ?? "");
  const parts = [];
  let last = 0;
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(src)) !== null) {
    const obj = tryParseVizObject(m[1]);
    if (!obj) continue;
    if (m.index > last) {
      parts.push({ type: "markdown", text: src.slice(last, m.index) });
    }
    parts.push({ type: "viz", model: obj });
    last = m.lastIndex;
  }
  if (last < src.length) {
    parts.push({ type: "markdown", text: src.slice(last) });
  }
  if (!parts.some((p) => p.type === "viz")) return null;
  return { parts };
}
