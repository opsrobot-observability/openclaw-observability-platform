/**
 * 静态拓扑 — 纯函数：节点配色、故障路径解析与边高亮 key、Bezier 路径、分层布局与内容包围盒。
 */

export function mergeTopologyNodeColors(chartConfig) {
  const n = chartConfig?.node_colors || {};
  return {
    anomaly: n.anomaly ?? "#F44336",
    degraded: n.degraded ?? "#FF9800",
    slow: n.slow ?? "#FFC107",
    normal: n.normal ?? "#4CAF50",
    recovered: n.recovered ?? "#4CAF50",
    recovering: n.recovering ?? "#2196F3",
    external: n.external ?? "#2196F3",
    fallback: n.fallback ?? "#9E9E9E",
  };
}

export function topologyNodeAccent(colors, node) {
  const st = String(node?.status || node?.health_status || "").toLowerCase();
  if (st === "anomaly") return colors.anomaly;
  if (st === "degraded") return colors.degraded;
  if (st === "slow") return colors.slow;
  if (st === "normal") return colors.normal;
  if (st === "recovered") return colors.recovered ?? colors.normal;
  if (st === "recovering") return colors.recovering ?? colors.external;
  const ty = String(node?.type || "").toLowerCase();
  if (ty === "external") return colors.external;
  return colors.fallback;
}

/** 与 TopologyMapLegend 文案一致（紧急 / 严重 / 重要 / 警告 / 正常 / 其它） */
export function topologyDisplayStatusLabel(node) {
  const st = String(node?.status || node?.health_status || "").toLowerCase();
  if (st === "anomaly") return "紧急";
  if (st === "degraded") return "严重";
  if (st === "slow") return "重要";
  if (st === "normal") return "正常";
  if (st === "recovered") return "已恢复";
  if (st === "recovering") return "恢复中";
  const ty = String(node?.type || "").toLowerCase();
  if (ty === "external") return "警告";
  if (st) return `其它（${node.status || node.health_status}）`;
  return "其它";
}

export function parseFaultPathSegments(pathField) {
  if (!pathField) return [];
  const arr = Array.isArray(pathField) ? pathField : [pathField];
  if (!arr.length) return [];
  const s = String(arr[0] || "");
  return s
    .split(/\s*→\s*|\s*->\s*|\s*—>\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function resolveTopologyPathSegmentToNodeId(seg, nodes) {
  const s = String(seg ?? "").trim();
  if (!s) return null;
  if (nodes.some((n) => n.id === s)) return s;
  const byName = nodes.find((n) => String(n.name) === s);
  return byName ? byName.id : null;
}

/** 故障路径（节点 id 或 name 序列）在拓扑边中的有向匹配，用于高亮与流向动画 */
export function buildFaultPropagationEdgeKeySet(pathSegments, edges, nodes) {
  if (!pathSegments?.length || !edges?.length || !nodes?.length) return new Set();
  const ids = [];
  for (const seg of pathSegments) {
    const id = resolveTopologyPathSegmentToNodeId(seg, nodes);
    if (id) ids.push(id);
  }
  const allowed = new Set(edges.map((e) => `${e.source}\t${e.target}`));
  const out = new Set();
  for (let i = 0; i < ids.length - 1; i++) {
    const key = `${ids[i]}\t${ids[i + 1]}`;
    if (allowed.has(key)) out.add(key);
  }
  return out;
}

/**
 * 从 fault_propagation 多种形态得到有序节点 id（用于路径条与边高亮）。
 * @param {object|Array|null} fp
 * @param {{ id: string, name?: string }[]} nodes
 */
export function faultPropagationPathSegments(fp, nodes) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const pushResolved = (arr, raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return;
    const id = resolveTopologyPathSegmentToNodeId(s, safeNodes) || s;
    if (!id) return;
    if (arr.length && arr[arr.length - 1] === id) return;
    arr.push(id);
  };

  if (!fp) return [];
  if (typeof fp.path !== "undefined" && fp.path != null) {
    return parseFaultPathSegments(fp.path);
  }
  if (Array.isArray(fp)) {
    const sorted = [...fp].sort((a, b) => (Number(a?.step) || 0) - (Number(b?.step) || 0));
    const out = [];
    for (const s of sorted) {
      if (!s || typeof s !== "object") continue;
      pushResolved(out, s.from);
      pushResolved(out, s.to);
    }
    return out;
  }
  if (fp && typeof fp === "object" && Array.isArray(fp.propagation_path)) {
    const sorted = [...fp.propagation_path].sort((a, b) => (Number(a?.step) || 0) - (Number(b?.step) || 0));
    const out = [];
    for (const s of sorted) {
      if (!s || typeof s !== "object") continue;
      pushResolved(out, s.from_node);
      pushResolved(out, s.to_node);
    }
    return out;
  }
  return [];
}

export function formatTopologyNodeTooltipLines(n) {
  const nm = n?.name != null && String(n.name).trim() ? String(n.name) : String(n?.id ?? "");
  const lines = [nm, `id: ${n.id}`];
  if (n.type) lines.push(`类型: ${n.type}`);
  if (n.role) lines.push(`角色: ${n.role}`);
  const ty = String(n?.type || "").toLowerCase();
  if (n.status || n.health_status || ty === "external") {
    lines.push(`状态: ${topologyDisplayStatusLabel(n)}`);
  }
  const meta = n.metadata && typeof n.metadata === "object" ? n.metadata : null;
  const props = n.properties && typeof n.properties === "object" ? n.properties : null;
  const ext = { ...(props || {}), ...(meta || {}) };
  for (const [k, v] of Object.entries(ext)) {
    lines.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  if (n.anomaly_details) lines.push(typeof n.anomaly_details === "string" ? n.anomaly_details : JSON.stringify(n.anomaly_details));
  return lines;
}

export function topologyEdgeBezier(ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dir = dx >= 0 ? 1 : -1;
  const x1 = ax + dir * r * 0.9;
  const x2 = bx - dir * r * 0.9;
  const hx = (x1 + x2) / 2;
  return `M ${x1} ${ay} C ${hx} ${ay}, ${hx} ${by}, ${x2} ${by}`;
}

export function computeTopologyLayout(nodes, edges, containerWidth, R) {
  /** 节点中心间距相对默认布局的倍数（1 = 原先密度） */
  const NODE_SPACING_MULT = 2;
  const marginX = 56;
  const marginY = 40;
  const labelBand = 36;
  const ids = nodes.map((n) => n.id);
  const set = new Set(ids);
  const layer = new Map(ids.map((id) => [id, 0]));
  for (let iter = 0; iter < ids.length + 2; iter++) {
    for (const e of edges) {
      const s = e?.source;
      const t = e?.target;
      if (!s || !t || !set.has(s) || !set.has(t)) continue;
      const next = layer.get(s) + 1;
      if (next > layer.get(t)) layer.set(t, next);
    }
  }
  const maxL = Math.max(0, ...[...layer.values()]);
  const byLayer = new Map();
  for (const id of ids) {
    const L = layer.get(id);
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L).push(id);
  }
  for (const [, arr] of byLayer) {
    arr.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
  }
  const maxInLayer = Math.max(1, ...[...byLayer.values()].map((a) => a.length));
  const rowGap = (R * 2 + 24) * NODE_SPACING_MULT;
  const innerH = maxInLayer * rowGap;
  const height = Math.max(220, marginY + innerH + labelBand + marginY);
  const baseWidth = Math.max(400, containerWidth);
  const usableW = baseWidth - marginX * 2;
  const cols = maxL + 1;
  const colW = cols > 0 ? (usableW / cols) * NODE_SPACING_MULT : usableW * NODE_SPACING_MULT;
  const width = Math.max(baseWidth, Math.ceil(2 * marginX + cols * colW - colW / 2 + R));
  const positions = new Map();
  for (let L = 0; L <= maxL; L++) {
    const col = byLayer.get(L) || [];
    const n = col.length;
    const startY = marginY + (innerH - (n - 1) * rowGap) / 2;
    col.forEach((id, i) => {
      positions.set(id, { x: marginX + L * colW + colW / 2, y: startY + i * rowGap });
    });
  }
  return { positions, width, height, R, marginY, innerH, labelBand };
}

export function topologyContentBBox(nodes, positions, R) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    minX = Math.min(minX, p.x - R - 8);
    maxX = Math.max(maxX, p.x + R + 8);
    minY = Math.min(minY, p.y - R - 8);
    maxY = Math.max(maxY, p.y + R + 22);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 400, maxY: 280 };
  return { minX, minY, maxX, maxY };
}
