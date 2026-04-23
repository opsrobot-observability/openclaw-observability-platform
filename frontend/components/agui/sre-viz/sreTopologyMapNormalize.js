/**
 * 将多种 topology_map JSON 归一为 SreVizTopologyMap / TopologySvgGraph 所需形状。
 */

function mapNode(n) {
  if (!n || typeof n !== "object") return null;
  const id = String(n.id ?? "").trim();
  if (!id) return null;
  const name = String(n.name ?? n.label ?? id).trim() || id;
  const status = String(n.status ?? n.health_status ?? "").trim() || undefined;
  const out = {
    ...n,
    id,
    name,
    ...(status ? { status } : {}),
  };
  return out;
}

function mapEdge(e) {
  if (!e || typeof e !== "object") return null;
  const source = String(e.source ?? e.from ?? "").trim();
  const target = String(e.target ?? e.to ?? "").trim();
  if (!source || !target) return null;
  return {
    ...e,
    source,
    target,
    label: e.label != null ? String(e.label) : "",
    type: e.type != null ? String(e.type) : "",
  };
}

function ensureNodesForEdges(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    if (!byId.has(e.source)) {
      byId.set(e.source, { id: e.source, name: e.source, type: "ref", status: "normal" });
    }
    if (!byId.has(e.target)) {
      byId.set(e.target, { id: e.target, name: e.target, type: "ref", status: "normal" });
    }
  }
  return [...byId.values()];
}

/**
 * @param {object} raw panel.payload
 * @returns {{ model: object, nodes: object[], edges: object[] }}
 */
export function normalizeTopologyMapModel(raw) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const st = base.static_topology && typeof base.static_topology === "object" ? { ...base.static_topology } : {};
  const rawNodes = Array.isArray(st.nodes) ? st.nodes : Array.isArray(base.nodes) ? base.nodes : [];
  let nodes = rawNodes.map(mapNode).filter(Boolean);
  const rawEdges = Array.isArray(st.edges) ? st.edges : [];
  let edges = rawEdges.map(mapEdge).filter(Boolean);
  nodes = ensureNodesForEdges(nodes, edges);
  const model = {
    ...base,
    static_topology: {
      ...st,
      nodes,
      edges,
    },
  };
  return { model, nodes, edges };
}
