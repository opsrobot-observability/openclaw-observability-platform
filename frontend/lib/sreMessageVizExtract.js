/**
 * 从 Agent Markdown 消息中提取 SRE 可视化规格：
 * - 优先使用 ```json 代码块内嵌的合法 JSON（type 为已知 viz）
 * - 若无内嵌 JSON，仅从 Markdown **无序列表**行收集路径，且路径须以五种 viz 的 `.json` 文件名结尾；由前端请求 /api/sre-agent/viz-json
 */

export const SRE_VIZ_TYPES = new Set([
  "metrics_trend",
  "logs_distribution",
  "trace_call_chain",
  "topology_map",
  "anomaly_pattern",
]);

/** 允许的 path 文件名后缀（小写，用于 endsWith） */
export const SRE_VIZ_JSON_BASENAMES = [
  "metrics_trend.json",
  "logs_distribution.json",
  "trace_call_chain.json",
  "topology_map.json",
  "anomaly_pattern.json",
];

/** 左侧标题（与 Agent 文案中的「指标趋势图」等对齐） */
export const SRE_VIZ_DISPLAY_TITLE = {
  metrics_trend: "指标趋势图",
  logs_distribution: "日志分布",
  trace_call_chain: "调用链",
  topology_map: "拓扑图",
  anomaly_pattern: "异常模式",
};

function pathEndsWithAllowedVizJson(p) {
  const s = String(p || "").trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  return SRE_VIZ_JSON_BASENAMES.some((suffix) => lower.endsWith(suffix));
}

/** 从无序列表行内容中提取候选路径（反引号内或连续非空白路径字符） */
function extractPathsFromListLineContent(rest) {
  const out = [];
  const s = String(rest ?? "");
  const tickRe = /`([~./][^`\s]+)`/g;
  let m;
  while ((m = tickRe.exec(s)) !== null) {
    const p = m[1].trim();
    if (p) out.push(p);
  }
  const looseRe = /[~./][^\s`\]"'<>]+/g;
  while ((m = looseRe.exec(s)) !== null) {
    const p = m[0].trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

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
    // 保留块与块之间的**真正空行**，否则 GFM 会把连续两张表并成一张（表头被当成续行）
    if (line.trim() === "") return true;
    let s = line.trim();
    s = s.replace(/\s*📁\s*文件路径\s*[：:]\s*$/u, "").replace(/\s*文件路径\s*[：:]\s*$/u, "").trim();
    if (!s) return false;
    if (/数据缺口/.test(s)) return false;
    if (/^说明[：:]/.test(s)) return false;
    if (/可视化数据/.test(s) && s.length < 160) return false;
    if (/文件路径\s*[：:]/.test(s)) return false;
    if (/^路径\s*[：:]/.test(s)) return false;
    if (/^[`\s]*~\/\.openclaw\/[^\s`]+\.json[`\s]*$/.test(s)) return false;
    const listBody = s.replace(/^\s{0,3}[-*+]\s+/, "");
    if (/^\s{0,3}[-*+]\s+/.test(s) && sorted.some((p) => listBody.includes(p))) return false;
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

const LIST_LINE_RE = /^\s{0,3}[-*+]\s+(.+)$/;

/**
 * 仅删除「已提取的、以五种 *.json 结尾的」路径所在的无序列表行，不改动表格、标题与其它段落。
 * @param {string} text
 * @param {string[]} pathList
 */
export function removeSreVizPathListItemLines(text, pathList) {
  const paths = new Set(
    (pathList || [])
      .map((p) => String(p || "").trim())
      .filter((p) => pathEndsWithAllowedVizJson(p)),
  );
  if (paths.size === 0) return String(text ?? "");

  const lines = String(text ?? "").split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const lm = line.match(LIST_LINE_RE);
    if (!lm) {
      out.push(line);
      continue;
    }
    const cands = extractPathsFromListLineContent(lm[1]);
    const isVizListLine = cands.some((p) => paths.has(p));
    if (isVizListLine) continue;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * 在「含路径的无序列表」的**原位置**插入 UI：按首/末条列表行下标将全文拆为前后两段，中间不保留列表行。
 * @param {string} text
 * @param {string[]} pathList extractSreVizWorkQueue 提取的路径（与行内候选项一致方命中）
 * @returns {{ before: string; after: string; hasListBlock: boolean }}
 */
export function splitMessageAroundSreVizPathList(text, pathList) {
  const paths = new Set(
    (pathList || [])
      .map((p) => String(p || "").trim())
      .filter((p) => pathEndsWithAllowedVizJson(p)),
  );
  if (paths.size === 0) {
    return { before: String(text ?? ""), after: "", hasListBlock: false };
  }
  const lines = String(text ?? "").split(/\r?\n/);
  const idx = [];
  for (let i = 0; i < lines.length; i++) {
    const lm = lines[i].match(LIST_LINE_RE);
    if (!lm) continue;
    const cands = extractPathsFromListLineContent(lm[1]);
    if (cands.some((p) => paths.has(p))) idx.push(i);
  }
  if (idx.length === 0) {
    return { before: String(text ?? ""), after: "", hasListBlock: false };
  }
  const first = Math.min(...idx);
  const last = Math.max(...idx);
  const before = lines.slice(0, first).join("\n");
  const after = lines.slice(last + 1).join("\n");
  return { before, after, hasListBlock: true };
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
 * path-only：仅从无序列表行收集以五种 viz 文件名结尾的路径；保序去重。
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
  const lines = src.split(/\r?\n/);
  const listLineRe = /^\s{0,3}[-*+]\s+(.+)$/;

  for (const line of lines) {
    const lm = line.match(listLineRe);
    if (!lm) continue;
    const candidates = extractPathsFromListLineContent(lm[1]);
    for (const p of candidates) {
      if (!pathEndsWithAllowedVizJson(p)) continue;
      if (seen.has(p)) continue;
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

/** 行内反引号路径或裸露路径，须以 final_report.md 结尾（大小写不敏感） */
const FINAL_REPORT_PATH_RE = /`([~./][^`\s]*final_report\.md)`|([~./][^\s`\]"'<>]*final_report\.md)/gi;

/**
 * 将助手消息按「归档报告 *.md 路径」拆成 Markdown 与可点击预览段，用于在聊天里用按钮替代长路径。
 *
 * @param {string} text
 * @returns {{ parts: Array<{ type: "markdown"; text: string } | { type: "final_report"; path: string }> } | null}
 */
export function splitAssistantMessageOnFinalReportPaths(text) {
  const src = String(text ?? "");
  const re = new RegExp(FINAL_REPORT_PATH_RE.source, "gi");
  const rawMatches = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const path = String(m[1] || m[2] || "").trim();
    if (!path) continue;
    const low = path.toLowerCase();
    if (!low.endsWith("final_report.md")) continue;
    rawMatches.push({ path, start: m.index, end: m.index + m[0].length });
  }
  if (rawMatches.length === 0) return null;

  const matches = [];
  for (const hit of rawMatches) {
    const prev = matches[matches.length - 1];
    if (prev && hit.start < prev.end) continue;
    matches.push(hit);
  }

  const parts = [];
  let last = 0;
  for (const hit of matches) {
    if (hit.start > last) parts.push({ type: "markdown", text: src.slice(last, hit.start) });
    parts.push({ type: "final_report", path: hit.path });
    last = hit.end;
  }
  if (last < src.length) parts.push({ type: "markdown", text: src.slice(last) });
  return { parts };
}
