import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";
import TablePagination from "../components/TablePagination.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import SpanDetailView from "./SpanDetailView.jsx";
import {
  Area,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RechartsScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
} from "recharts";

const DETAIL_TABS = [
  { key: "spans", labelKey: "detail.tab.spans", icon: "layers" },
  { key: "traces", labelKey: "detail.tab.traces", icon: "git-branch" },
  { key: "scatter", labelKey: "detail.tab.scatter", icon: "bar-chart-2" },
  { key: "apdex", labelKey: "detail.tab.apdex", icon: "zap" },
  { key: "aggregation", labelKey: "detail.tab.aggregation", icon: "viewColumns" },
  { key: "topology", labelKey: "detail.tab.topology", icon: "globe" },
];

const TIME_RANGE_DEFS = [
  { value: "10m", hours: 1 / 6, labelKey: "detail.timeRange.10m" },
  { value: "30m", hours: 0.5, labelKey: "detail.timeRange.30m" },
  { value: "1h", hours: 1, labelKey: "detail.timeRange.1h" },
  { value: "6h", hours: 6, labelKey: "detail.timeRange.6h" },
  { value: "24h", hours: 24, labelKey: "detail.timeRange.24h" },
  { value: "7d", hours: 168, labelKey: "detail.timeRange.7d" },
];

const SPAN_NAME_LABELS = {
  "openclaw.message.processed": intl.get("callChain.spanNameMessageProcessed"),
  "openclaw.model.usage": intl.get("callChain.spanNameModelUsage"),
  "openclaw.webhook.processed": intl.get("callChain.spanNameWebhookProcessed"),
  "openclaw.webhook.error": intl.get("callChain.spanNameWebhookError"),
  "openclaw.session.stuck": intl.get("callChain.spanNameSessionStuck"),
};

function getSpanKindLabel(kind) {
  switch (kind) {
    case "SPAN_KIND_SERVER": return { label: "SERVER", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" };
    case "SPAN_KIND_CLIENT": return { label: "CLIENT", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" };
    case "SPAN_KIND_INTERNAL": return { label: "INTERNAL", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" };
    case "SPAN_KIND_CONSUMER": return { label: "CONSUMER", color: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" };
    case "SPAN_KIND_PRODUCER": return { label: "PRODUCER", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" };
    default: return { label: kind || "—", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
  }
}

function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return "—";
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "min";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  return ms.toFixed(1) + "ms";
}

function formatTokenCount(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(2) + "M";
  if (count >= 1000) return (count / 1000).toFixed(1) + "K";
  return count?.toLocaleString() || "0";
}

function MetricTrendCard({ title, value, icon, iconColor, valueColor }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{title}</span>
        <Icon name={icon || "activity"} className={["h-4 w-4", iconColor || "text-gray-400"].join(" ")} />
      </div>
      <p className={["text-lg font-semibold", valueColor || "text-gray-900 dark:text-gray-100"].join(" ")}>{value}</p>
    </div>
  );
}

function TopologyTab({ spanData, loading, onViewTrace, onFilterSpanName }) {
  const spans = spanData?.spans || [];
  const [aggDimension, setAggDimension] = useState("spanName");
  const [sampleCount, setSampleCount] = useState(100);
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showNodeDetail, setShowNodeDetail] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  const AGG_DIMENSIONS = [
    { value: "serviceName", label: intl.get("topology.aggService") },
    { value: "spanName", label: intl.get("topology.aggSpanName") },
    { value: "ip", label: intl.get("topology.aggIp") },
    { value: "hostname", label: intl.get("topology.aggHostname") },
    { value: "kind", label: intl.get("topology.aggKind") },
    { value: "agentDuration", label: intl.get("topology.aggAgentDuration") },
    { value: "agentMsgCount", label: intl.get("topology.aggAgentMsgCount") },
    { value: "agentToolCount", label: intl.get("topology.aggAgentToolCount") },
  ];

  const getNodeKey = useCallback((s) => {
    switch (aggDimension) {
      case "serviceName": return s.serviceName || "unknown";
      case "spanName": return s.spanName || "unknown";
      case "ip": return s.hostIp || "unknown";
      case "hostname": return s.hostName || "unknown";
      case "kind": return s.spanKind || "unknown";
      case "agentDuration": {
        const d = s.durationMs || 0;
        if (d < 100) return "<100ms";
        if (d < 500) return "100-500ms";
        if (d < 2000) return "500ms-2s";
        if (d < 10000) return "2s-10s";
        return ">10s";
      }
      case "agentMsgCount": {
        const attrs = s.attributes || {};
        const c = Number(attrs["agent.message_count"]) || 0;
        if (c <= 1) return "1 msg";
        if (c <= 5) return "2-5 msgs";
        return ">5 msgs";
      }
      case "agentToolCount": {
        const attrs = s.attributes || {};
        const c = Number(attrs["agent.tool_call_count"]) || 0;
        if (c === 0) return "0 tools";
        if (c <= 2) return "1-2 tools";
        return ">2 tools";
      }
      default: return s.spanName || "unknown";
    }
  }, [aggDimension]);

  const topologyData = useMemo(() => {
    const nodeMap = new Map();
    for (const s of spans) {
      const key = getNodeKey(s);
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { key, calls: 0, errors: 0, totalDuration: 0, spanNames: new Set() });
      }
      const node = nodeMap.get(key);
      node.calls++;
      if (s.status === "error") node.errors++;
      node.totalDuration += s.durationMs || 0;
      node.spanNames.add(s.spanName);
    }
    return [...nodeMap.values()].map((n) => ({
      ...n,
      avgDuration: n.calls > 0 ? n.totalDuration / n.calls : 0,
      errorRate: n.calls > 0 ? (n.errors / n.calls * 100) : 0,
      spanNames: [...n.spanNames],
    }));
  }, [spans, getNodeKey]);

  const edges = useMemo(() => {
    const edgeMap = new Map();
    const spanById = new Map();
    for (const s of spans) {
      if (s.spanId) spanById.set(s.spanId, s);
    }
    for (const s of spans) {
      if (!s.parentSpanId) continue;
      const parent = spanById.get(s.parentSpanId);
      if (!parent) continue;
      const srcKey = getNodeKey(parent);
      const tgtKey = getNodeKey(s);
      if (srcKey === tgtKey) continue;
      const edgeKey = `${srcKey}→${tgtKey}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, { src: srcKey, tgt: tgtKey, calls: 0, errors: 0, totalDuration: 0 });
      }
      const e = edgeMap.get(edgeKey);
      e.calls++;
      if (s.status === "error") e.errors++;
      e.totalDuration += s.durationMs || 0;
    }
    return [...edgeMap.values()].map((e) => ({
      ...e,
      avgDuration: e.calls > 0 ? e.totalDuration / e.calls : 0,
      errorRate: e.calls > 0 ? (e.errors / e.calls * 100) : 0,
    }));
  }, [spans, getNodeKey]);

  const layoutNodes = useMemo(() => {
    const nodes = [...topologyData];
    if (nodes.length === 0) return { positions: new Map(), nodeW: 200, nodeH: 88, maxLevel: 0, totalW: 0, totalH: 0 };
    const inDegree = new Map();
    const adj = new Map();
    for (const n of nodes) { inDegree.set(n.key, 0); adj.set(n.key, []); }
    for (const e of edges) {
      inDegree.set(e.tgt, (inDegree.get(e.tgt) || 0) + 1);
      if (adj.has(e.src)) adj.get(e.src).push(e.tgt);
    }
    const levels = new Map();
    const visited = new Set();
    const queue = [];
    for (const n of nodes) {
      if ((inDegree.get(n.key) || 0) === 0) { queue.push(n.key); levels.set(n.key, 0); }
    }
    if (queue.length === 0 && nodes.length > 0) {
      queue.push(nodes[0].key);
      levels.set(nodes[0].key, 0);
    }
    while (queue.length > 0) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      const curLevel = levels.get(cur) || 0;
      for (const next of (adj.get(cur) || [])) {
        if (!visited.has(next)) {
          levels.set(next, curLevel + 1);
          queue.push(next);
        }
      }
    }
    for (const n of nodes) {
      if (!levels.has(n.key)) levels.set(n.key, 0);
    }
    const levelGroups = new Map();
    for (const n of nodes) {
      const lv = levels.get(n.key);
      if (!levelGroups.has(lv)) levelGroups.set(lv, []);
      levelGroups.get(lv).push(n);
    }
    const maxLevel = Math.max(...[...levels.values()], 0);
    const nodeW = 200;
    const nodeH = 88;
    const gapX = 120;
    const gapY = 24;
    const padX = 40;
    const padY = 30;
    const positions = new Map();
    for (let lv = 0; lv <= maxLevel; lv++) {
      const group = levelGroups.get(lv) || [];
      for (let i = 0; i < group.length; i++) {
        positions.set(group[i].key, {
          x: padX + lv * (nodeW + gapX),
          y: padY + i * (nodeH + gapY),
        });
      }
    }
    const maxNodesInLevel = Math.max(...[...levelGroups.values()].map(g => g.length), 1);
    const totalW = padX * 2 + (maxLevel + 1) * nodeW + maxLevel * gapX;
    const totalH = padY * 2 + maxNodesInLevel * nodeH + (maxNodesInLevel - 1) * gapY;
    return { positions, nodeW, nodeH, maxLevel, totalW, totalH };
  }, [topologyData, edges]);

  const getNodeIcon = (key) => {
    const k = (key || "").toLowerCase();
    if (k.includes("gateway") || k.includes("enter_openclaw")) return { icon: "🖥️", color: "bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700" };
    if (k.includes("agent") || k.includes("invoke_agent")) return { icon: "🤖", color: "bg-purple-50 border-purple-300 dark:bg-purple-950/40 dark:border-purple-700" };
    if (k.includes("react") || k.includes("step") || k.includes("think")) return { icon: "💡", color: "bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700" };
    if (k.includes("chat") || k.includes("model") || k.includes("minimax") || k.includes("openai") || k.includes("llm")) return { icon: "🧠", color: "bg-cyan-50 border-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-700" };
    if (k.includes("tool") || k.includes("exec") || k.includes("read") || k.includes("edit")) return { icon: "🔧", color: "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700" };
    if (k.includes("session") || k.includes("webhook")) return { icon: "💬", color: "bg-indigo-50 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700" };
    return { icon: "📦", color: "bg-gray-50 border-gray-300 dark:bg-gray-800 dark:border-gray-600" };
  };

  const getNodeStatusColor = (node) => {
    if (node.errors > 0) return "border-red-400 dark:border-red-600 ring-1 ring-red-200 dark:ring-red-900";
    if (node.avgDuration > 5000) return "border-amber-400 dark:border-amber-600 ring-1 ring-amber-200 dark:ring-amber-900";
    return "border-blue-300 dark:border-blue-700";
  };

  const getEdgeStyle = (edge) => {
    const maxCalls = Math.max(...edges.map(e => e.calls), 1);
    const width = 1 + (edge.calls / maxCalls) * 4;
    if (edge.errorRate > 5) return { stroke: "#ef4444", width, dash: "" };
    if (edge.avgDuration > 5000) return { stroke: "#f59e0b", width, dash: "6 3" };
    return { stroke: "#94a3b8", width, dash: "" };
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.15, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.15, 0.15));
  const handleZoomFit = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (e.target.closest("[data-node]")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  const handleNodeClick = (key) => {
    if (selectedNode === key) {
      setSelectedNode(null);
      setShowNodeDetail(false);
    } else {
      setSelectedNode(key);
      setShowNodeDetail(true);
    }
  };

  const handleNodeDblClick = (node) => {
    if (onFilterSpanName && node.spanNames.length > 0) {
      onFilterSpanName(node.spanNames[0]);
    }
  };

  if (loading && !spanData) {
    return <div className="flex min-h-[320px] items-center justify-center"><Icon name="loading" className="h-8 w-8 text-primary animate-spin" /></div>;
  }

  if (spans.length === 0) {
    return <div className="flex items-center justify-center py-12 text-xs text-gray-400">{intl.get("callChain.noTraceData")}</div>;
  }

  const { positions, nodeW, nodeH, maxLevel, totalW, totalH } = layoutNodes;
  const selectedNodeData = selectedNode ? topologyData.find(n => n.key === selectedNode) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("topology.aggDimension")}:</span>
          <select value={aggDimension} onChange={(e) => { setAggDimension(e.target.value); setSelectedNode(null); setShowNodeDetail(false); }}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-[11px]">
            {AGG_DIMENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("topology.sampleCount")}:</span>
          <select value={sampleCount} onChange={(e) => setSampleCount(Number(e.target.value))}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-[11px]">
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">{intl.get("topology.spanCount", { count: spans.length })}</span>
      </div>

      <div className="rounded-lg border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2">
        <div className="flex items-start gap-2">
          <Icon name="info" className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            {intl.get("topology.hintMsg", { count: spans.length, sample: sampleCount })}
          </p>
        </div>
      </div>

      <div className="relative rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/80 overflow-hidden" style={{ height: 520 }}>
        <div className="absolute left-3 bottom-3 z-10 flex flex-col gap-1.5">
          <button type="button" onClick={handleZoomIn} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-bold">+</button>
          <button type="button" onClick={handleZoomOut} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-bold">−</button>
          <button type="button" onClick={handleZoomFit} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Icon name="maximize" className="h-3.5 w-3.5" />
          </button>
          <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1">{Math.round(zoom * 100)}%</div>
        </div>

        <div ref={canvasRef}
          className="w-full h-full overflow-hidden"
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}>
          <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, transformOrigin: "0 0", transition: isDragging ? "none" : "transform 0.2s ease" }}>
            <div className="relative" style={{ width: totalW, height: totalH }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                  </marker>
                  <marker id="arrowhead-red" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
                  </marker>
                  <marker id="arrowhead-amber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#f59e0b" />
                  </marker>
                </defs>
                {edges.map((e, i) => {
                  const srcPos = positions.get(e.src);
                  const tgtPos = positions.get(e.tgt);
                  if (!srcPos || !tgtPos) return null;
                  const sx = srcPos.x + nodeW;
                  const sy = srcPos.y + nodeH / 2;
                  const tx = tgtPos.x;
                  const ty = tgtPos.y + nodeH / 2;
                  const style = getEdgeStyle(e);
                  const midX = (sx + tx) / 2;
                  const midY = (sy + ty) / 2;
                  return (
                    <g key={i}>
                      <line x1={sx} y1={sy} x2={tx} y2={ty}
                        stroke={style.stroke} strokeWidth={style.width}
                        strokeDasharray={style.dash}
                        markerEnd={e.errorRate > 5 ? "url(#arrowhead-red)" : e.avgDuration > 5000 ? "url(#arrowhead-amber)" : "url(#arrowhead)"} />
                      <text x={midX} y={midY - 6} textAnchor="middle" fontSize="10" fill="#64748b">
                        <tspan>{intl.get("topology.calls")}: {e.calls}</tspan>
                        {e.errorRate > 0 && <tspan dx="4" fill="#ef4444">{e.errorRate.toFixed(0)}% err</tspan>}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {topologyData.map((node) => {
                const pos = positions.get(node.key);
                if (!pos) return null;
                const iconInfo = getNodeIcon(node.key);
                const statusBorder = getNodeStatusColor(node);
                const isSelected = selectedNode === node.key;
                return (
                  <div key={node.key} data-node="true"
                    className={["absolute rounded-lg border-2 shadow-sm cursor-pointer transition-all hover:shadow-md", iconInfo.color, statusBorder, isSelected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""].join(" ")}
                    style={{ left: pos.x, top: pos.y, width: nodeW, zIndex: isSelected ? 10 : 2 }}
                    onClick={() => handleNodeClick(node.key)}
                    onDoubleClick={() => handleNodeDblClick(node)}>
                    <div className="px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm shrink-0">{iconInfo.icon}</span>
                        <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100 truncate" title={node.key}>{SPAN_NAME_LABELS[node.key] || node.key}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className={["inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium", node.errors > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"].join(" ")}>
                          {intl.get("topology.errorCount")}: {node.errors}
                        </span>
                        <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          {intl.get("topology.callCount")}: {node.calls}
                        </span>
                        <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {intl.get("topology.avgDuration")}: {formatDuration(node.avgDuration)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showNodeDetail && selectedNodeData && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">{getNodeIcon(selectedNodeData.key).icon}</span>
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{SPAN_NAME_LABELS[selectedNodeData.key] || selectedNodeData.key}</h4>
            <span className="text-[10px] text-gray-400">{intl.get("topology.nodeDetail")}</span>
            <button type="button" onClick={() => { setSelectedNode(null); setShowNodeDetail(false); }} className="ml-auto text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{intl.get("detail.backToList")}</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4 mb-3">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-2 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{intl.get("topology.callCount")}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedNodeData.calls}</p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-2 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{intl.get("topology.errorCount")}</p>
              <p className={["text-sm font-semibold", selectedNodeData.errors > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{selectedNodeData.errors}</p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-2 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{intl.get("topology.avgDuration")}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDuration(selectedNodeData.avgDuration)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-2 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.successRate")}</p>
              <p className={["text-sm font-semibold", selectedNodeData.errorRate > 5 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{(100 - selectedNodeData.errorRate).toFixed(1)}%</p>
            </div>
          </div>
          {selectedNodeData.spanNames.length > 0 && (
            <div>
              <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{intl.get("topology.relatedSpans")}</h5>
              <div className="flex flex-wrap gap-1.5">
                {selectedNodeData.spanNames.map((sn) => (
                  <button key={sn} type="button" onClick={() => onFilterSpanName && onFilterSpanName(sn)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary bg-primary/10 ring-1 ring-inset ring-primary/20 hover:bg-primary/20 transition-colors">
                    {SPAN_NAME_LABELS[sn] || sn}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <button type="button" onClick={() => handleNodeDblClick(selectedNodeData)}
              className="text-[11px] font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1">
              <Icon name="filter" className="h-3 w-3" />{intl.get("topology.filterToSpanList")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function truncateId(id, prefixLen = 8, suffixLen = 8) {
  if (!id) return "—";
  if (id.length <= prefixLen + suffixLen + 3) return id;
  return id.substring(0, prefixLen) + "..." + id.substring(id.length - suffixLen);
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button type="button" onClick={handleCopy} className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-primary" title={intl.get("detail.copy")}>
      {copied ? <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-500" /> : <Icon name="link" className="h-3.5 w-3.5" />}
    </button>
  );
}

function getInstanceStatusColor(status) {
  switch (status) {
    case "normal": return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning": return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "error": return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300";
    default: return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
  }
}

function getInstanceStatusLabel(status) {
  switch (status) {
    case "normal": return intl.get("callChain.instance.statusNormal");
    case "warning": return intl.get("callChain.instance.statusWarning");
    case "error": return intl.get("callChain.instance.statusError");
    default: return intl.get("callChain.instance.statusOffline");
  }
}

function DedupTooltip({ active, payload, label, yTickFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  const seen = new Map();
  for (const entry of payload) {
    if (!seen.has(entry.name)) seen.set(entry.name, entry);
  }
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {[...seen.values()].map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 dark:text-gray-300">{entry.name}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100 ml-auto">{yTickFormatter ? yTickFormatter(entry.value) : entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function InstanceDetailView({ instance, onBack, initialTimeRange, initialFilters }) {
  const [activeTab, setActiveTab] = useState("spans");
  const [selectedTimeRange, setSelectedTimeRange] = useState(initialTimeRange || "1h");
  const [timeMode, setTimeMode] = useState("quick");
  const [customStartTime, setCustomStartTime] = useState("");
  const [customEndTime, setCustomEndTime] = useState("");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState(() => {
    const base = {
      status: ["ok", "error"],
      minDuration: null,
      maxDuration: null,
      spanNames: [],
      channels: [],
      models: [],
      sessionKey: "",
    };
    if (initialFilters?.spanNames && initialFilters.spanNames.length > 0) {
      base.spanNames = initialFilters.spanNames;
    }
    return base;
  });

  const [spanData, setSpanData] = useState(null);
  const [traceData, setTraceData] = useState(null);
  const [scatterData, setScatterData] = useState(null);
  const [apdexData, setApdexData] = useState(null);
  const [aggData, setAggData] = useState(null);
  const [filterOptions, setFilterOptions] = useState(null);

  const { locale } = useLocale();
  const timeRanges = useMemo(() => TIME_RANGE_DEFS.map((d) => ({ ...d, label: intl.get(d.labelKey) })), [locale]);
  const timeRangeConfig = timeRanges.find((r) => r.value === selectedTimeRange);
  const selectedHours = timeRangeConfig?.hours || 1;

  const buildUrlParams = useCallback(() => {
    if (timeMode === "custom" && customStartTime && customEndTime) {
      return `startTime=${encodeURIComponent(customStartTime)}&endTime=${encodeURIComponent(customEndTime)}`;
    }
    return `hours=${selectedHours}`;
  }, [selectedHours, timeMode, customStartTime, customEndTime]);

  const buildFilterParams = useCallback(() => {
    const f = {};
    if (filters.status.length < 2 && filters.status.length > 0) f.status = filters.status;
    if (filters.minDuration != null) f.minDuration = filters.minDuration;
    if (filters.maxDuration != null) f.maxDuration = filters.maxDuration;
    if (filters.spanNames.length > 0) f.spanNames = filters.spanNames;
    if (filters.channels.length > 0) f.channels = filters.channels;
    if (filters.models.length > 0) f.models = filters.models;
    if (filters.sessionKey) f.sessionKey = filters.sessionKey;
    return JSON.stringify(f);
  }, [filters]);

  const instanceId = instance?.instanceId || "";

  const fetchTabData = useCallback(async (tab) => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const baseParams = buildUrlParams();
      const filterParam = buildFilterParams();
      let url;
      switch (tab) {
        case "spans":
          url = `/api/instance-detail/spans?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&filters=${encodeURIComponent(filterParam)}`;
          break;
        case "traces":
          url = `/api/instance-detail/traces?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&filters=${encodeURIComponent(filterParam)}`;
          break;
        case "scatter":
          url = `/api/instance-detail/scatter?instanceId=${encodeURIComponent(instanceId)}&${baseParams}`;
          break;
        case "apdex":
          url = `/api/instance-detail/apdex?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&threshold=${apdexThreshold}`;
          break;
        case "aggregation":
          url = `/api/instance-detail/aggregation?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&dimension=${aggDimension}`;
          break;
        default:
          url = `/api/instance-detail/spans?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&filters=${encodeURIComponent(filterParam)}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const errBody = await res.text();
        console.error(`API ${tab} error: ${res.status}`, errBody);
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }
      const data = await res.json();
      if (data.error) {
        console.error(`API ${tab} returned error:`, data.error);
        return;
      }
      switch (tab) {
        case "spans":
          setSpanData(data);
          if (data.filterOptions) setFilterOptions(data.filterOptions);
          break;
        case "traces":
          setTraceData(data);
          break;
        case "scatter":
          setScatterData(data);
          break;
        case "apdex":
          setApdexData(data);
          break;
        case "aggregation":
          setAggData(data);
          break;
      }
      setLastUpdated(new Date());
    } catch (e) {
      console.error(`Failed to fetch ${tab} data:`, e);
    } finally {
      setLoading(false);
    }
  }, [instanceId, buildUrlParams, buildFilterParams]);

  const [apdexThreshold, setApdexThreshold] = useState(500);
  const [aggDimension, setAggDimension] = useState("spanName");
  const [selectedTraceId, setSelectedTraceId] = useState(null);

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  const handleRefresh = () => {
    fetchTabData(activeTab);
  };

  const handleQuickTimeSelect = (value) => {
    setSelectedTimeRange(value);
    setTimeMode("quick");
    setCustomStartTime("");
    setCustomEndTime("");
  };

  const handleApplyCustomTime = () => {
    if (customStartTime && customEndTime) {
      setTimeMode("custom");
      setShowTimePicker(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      status: ["ok", "error"],
      minDuration: null,
      maxDuration: null,
      spanNames: [],
      channels: [],
      models: [],
      sessionKey: "",
    });
  };

  const inst = instance || {};
  const liveMetrics = spanData?.metrics;
  const displayTotalCalls = liveMetrics?.totalCalls ?? inst.totalCalls ?? 0;
  const displaySuccessRate = liveMetrics?.successRate ?? inst.successRate ?? 0;
  const displayAvgDuration = liveMetrics?.avgDurationMs ?? inst.avgDurationMs ?? 0;
  const successRateColor = displaySuccessRate < 90 ? "text-red-600 dark:text-red-400" : displaySuccessRate < 95 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400";

  if (selectedTraceId) {
    return (
      <SpanDetailView
        traceId={selectedTraceId}
        instanceId={instanceId}
        onBack={() => setSelectedTraceId(null)}
        timeParams={buildUrlParams()}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 h-12 px-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/80 shrink-0">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary dark:text-gray-400 dark:hover:text-primary transition-colors">
          <Icon name="arrow-left" className="h-4 w-4" />
          {intl.get("detail.backToList")}
        </button>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex gap-1.5">
          {timeRanges.map((range) => (
            <button key={range.value} type="button" onClick={() => handleQuickTimeSelect(range.value)}
              className={["rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                timeMode === "quick" && selectedTimeRange === range.value ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
              ].join(" ")}>{range.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={handleRefresh} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
            <Icon name="refresh" className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />{intl.get("callChain.manualRefresh")}
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{intl.get("callChain.lastUpdated")}: {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      <div className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 px-4 py-3 shrink-0">
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{intl.get("detail.basicInfo")}</h2>
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getInstanceStatusColor(inst.status)}`}>
                {getInstanceStatusLabel(inst.status)}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="server" className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.instanceId")}:</span>
              <span className="font-mono text-sm text-primary truncate" title={inst.instanceId}>{inst.instanceId}</span>
              <CopyButton text={inst.instanceId || ""} />
              {inst.hostName && (
                <>
                  <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
                  <Icon name="monitor" className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">{inst.hostName}</span>
                </>
              )}
              {inst.hostIp && (
                <>
                  <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{inst.hostIp}</span>
                </>
              )}
              {inst.deployEnv && (
                <>
                  <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{inst.deployEnv}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs">
                <Icon name="activity" className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-gray-500 dark:text-gray-400">{intl.get("detail.metricTotalCalls")}:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{displayTotalCalls.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Icon name="shield-check" className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.successRate")}:</span>
                <span className={`font-semibold ${successRateColor}`}>{displaySuccessRate}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Icon name="clock" className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.avgDuration")}:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDuration(displayAvgDuration)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Icon name="zap" className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.colTotalTokens")}:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatTokenCount(inst.totalTokens || 0)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2">
          <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">{intl.get("detail.instanceTrend")}</h4>
          <div className="h-[120px]">
            {spanData?.trend && spanData.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={spanData.trend.map(t => {
                  const total = t.callCount || 0;
                  const errors = t.errorCount || 0;
                  const success = total - errors;
                  const sr = total > 0 ? Math.round((success / total) * 10000) / 100 : 100;
                  return { time: (t.time || "").substring(11, 16) || t.time, success, errors, total, successRate: sr };
                })} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9 }} width={35} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} width={35} domain={[0, 100]} tickFormatter={(v) => v + "%"} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-xl text-xs space-y-1">
                        <p className="text-gray-500 dark:text-gray-400">{label}</p>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span className="text-gray-600 dark:text-gray-300">{intl.get("detail.successCount")}: <span className="font-semibold text-gray-900 dark:text-gray-100">{d.success}</span></span></div>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /><span className="text-gray-600 dark:text-gray-300">{intl.get("detail.errorCount")}: <span className="font-semibold text-gray-900 dark:text-gray-100">{d.errors}</span></span></div>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-gray-600 dark:text-gray-300">{intl.get("callChain.overview.successRate")}: <span className="font-semibold text-gray-900 dark:text-gray-100">{d.successRate}%</span></span></div>
                      </div>
                    );
                  }} />
                  <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="success" stackId="a" fill="#3b82f6" name={intl.get("detail.successCount")} maxBarSize={16} />
                  <Bar yAxisId="left" dataKey="errors" stackId="a" fill="#f87171" name={intl.get("detail.errorCount")} maxBarSize={16} />
                  <Line yAxisId="right" type="monotone" dataKey="successRate" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 3 }} name={intl.get("callChain.overview.successRate")} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[11px] text-gray-400">{intl.get("callChain.noTraceData")}</div>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("detail.filterStatus")}:</span>
            <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/80 p-0.5 dark:bg-gray-800/60">
              {[{ key: "ok", label: intl.get("detail.statusOk"), count: filterOptions?.statusCounts?.ok || 0 }, { key: "error", label: intl.get("detail.statusError"), count: filterOptions?.statusCounts?.error || 0 }].map((s) => (
                <button key={s.key} type="button" onClick={() => {
                  setFilters((f) => ({
                    ...f,
                    status: f.status.includes(s.key) ? f.status.filter((k) => k !== s.key) : [...f.status, s.key],
                  }));
                }} className={["rounded px-2 py-0.5 text-[11px] font-medium transition-colors", filters.status.includes(s.key) ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"].join(" ")}>
                  {s.label} <span className="text-gray-400 dark:text-gray-500">({s.count})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("detail.filterDuration")}:</span>
            <input type="number" value={filters.minDuration ?? ""} onChange={(e) => setFilters((f) => ({ ...f, minDuration: e.target.value ? Number(e.target.value) : null }))} placeholder="0" className="w-14 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-[11px]" />
            <span className="text-gray-400 text-[11px]">—</span>
            <input type="number" value={filters.maxDuration ?? ""} onChange={(e) => setFilters((f) => ({ ...f, maxDuration: e.target.value ? Number(e.target.value) : null }))} placeholder="∞" className="w-14 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-[11px]" />
            <span className="text-gray-400 text-[11px]">ms</span>
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("detail.filterSpanName")}:</span>
            <select value={filters.spanNames.length === 1 ? filters.spanNames[0] : filters.spanNames.length > 1 ? "__multi__" : ""} onChange={(e) => {
              const v = e.target.value;
              if (!v) setFilters((f) => ({ ...f, spanNames: [] }));
              else setFilters((f) => ({ ...f, spanNames: [v] }));
            }} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-[11px] max-w-[180px]">
              <option value="">{intl.get("detail.filterAllSpanNames")}</option>
              {(filterOptions?.spanNames || []).slice(0, 30).map((s) => (
                <option key={s.name} value={s.name}>{SPAN_NAME_LABELS[s.name] || s.name} ({s.count})</option>
              ))}
            </select>
          </div>

          {(filterOptions?.channels || []).length > 0 && (
            <>
              <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("detail.filterChannel")}:</span>
                <select value={filters.channels.length === 1 ? filters.channels[0] : ""} onChange={(e) => {
                  const v = e.target.value;
                  if (!v) setFilters((f) => ({ ...f, channels: [] }));
                  else setFilters((f) => ({ ...f, channels: [v] }));
                }} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-[11px] max-w-[160px]">
                  <option value="">{intl.get("detail.filterAllChannels")}</option>
                  {filterOptions.channels.map((ch) => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {(filterOptions?.models || []).length > 0 && (
            <>
              <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("detail.filterModel")}:</span>
                <select value={filters.models.length === 1 ? filters.models[0] : ""} onChange={(e) => {
                  const v = e.target.value;
                  if (!v) setFilters((f) => ({ ...f, models: [] }));
                  else setFilters((f) => ({ ...f, models: [v] }));
                }} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-[11px] max-w-[160px]">
                  <option value="">{intl.get("detail.filterAllModels")}</option>
                  {filterOptions.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{intl.get("detail.filterSession")}:</span>
            <input type="text" placeholder={intl.get("detail.searchSessionKey")} value={filters.sessionKey} onChange={(e) => setFilters((f) => ({ ...f, sessionKey: e.target.value }))} className="w-32 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-[11px]" />
          </div>

          <button type="button" onClick={resetFilters} className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors ml-auto">
            {intl.get("detail.resetFilters")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <MetricTrendCard title={intl.get("detail.metricTotalCalls")} value={(spanData?.metrics?.totalCalls || 0).toLocaleString()} icon="activity" iconColor="text-blue-500" />
            <MetricTrendCard title={intl.get("spanDetail.errorNodes")} value={spanData?.metrics?.errorCount || 0} icon="alert" iconColor="text-red-500" valueColor={(spanData?.metrics?.errorCount || 0) > 0 ? "text-red-600 dark:text-red-400" : ""} />
            <MetricTrendCard title={intl.get("callChain.overview.avgDuration")} value={formatDuration(spanData?.metrics?.avgDurationMs || 0)} icon="clock" iconColor="text-amber-500" />
            <MetricTrendCard title={intl.get("detail.metricP95P99")} value={spanData?.metrics ? `${formatDuration(spanData.metrics.p95DurationMs)} / ${formatDuration(spanData.metrics.p99DurationMs)}` : "—"} icon="timer" iconColor="text-orange-500" />
            <MetricTrendCard title={intl.get("detail.metricErrorRate")} value={`${spanData?.metrics?.errorRate || 0}%`} icon="shield" iconColor={(spanData?.metrics?.errorCount || 0) > 0 ? "text-red-500" : "text-emerald-500"} valueColor={(spanData?.metrics?.errorCount || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"} />
          </div>
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-3 mt-3">
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-3">
              <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-2">{intl.get("detail.spanTypeDist")}</h5>
              <div className="h-[180px]">
                {spanData?.spans && spanData.spans.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={(() => {
                      const map = new Map();
                      for (const s of spanData.spans) {
                        const name = s.spanName || "unknown";
                        if (!map.has(name)) map.set(name, { name: SPAN_NAME_LABELS[name] || name, ok: 0, error: 0 });
                        if (s.status === "error") map.get(name).error++;
                        else map.get(name).ok++;
                      }
                      return [...map.values()].sort((a, b) => (b.ok + b.error) - (a.ok + a.error)).slice(0, 8);
                    })()} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 9 }} width={25} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Bar dataKey="ok" stackId="a" fill="#3b82f6" name={intl.get("detail.statusOk")} maxBarSize={28} />
                      <Bar dataKey="error" stackId="a" fill="#ef4444" name={intl.get("detail.statusError")} maxBarSize={28} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : <div className="flex items-center justify-center h-full text-[11px] text-gray-400">{intl.get("callChain.noTraceData")}</div>}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-3">
              <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-2">{intl.get("detail.durationStacked")}</h5>
              <div className="h-[180px]">
                {spanData?.spans && spanData.spans.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={(() => {
                      const map = new Map();
                      for (const s of spanData.spans) {
                        const name = s.spanName || "unknown";
                        if (!map.has(name)) map.set(name, { name: SPAN_NAME_LABELS[name] || name, total: 0, count: 0, max: 0 });
                        const e = map.get(name);
                        e.total += s.durationMs || 0;
                        e.count++;
                        if ((s.durationMs || 0) > e.max) e.max = s.durationMs || 0;
                      }
                      return [...map.values()].map(e => {
                        const avg = e.count > 0 ? e.total / e.count : 0;
                        const maxVal = e.max;
                        return { name: e.name, avg: Math.round(avg), diff: Math.round(Math.max(0, maxVal - avg)) };
                      }).sort((a, b) => (b.avg + b.diff) - (a.avg + a.diff)).slice(0, 8);
                    })()} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(1) + "s" : v + "ms"} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v, name) => {
                        if (name === intl.get("detail.avgDuration")) return v >= 1000 ? (v / 1000).toFixed(2) + "s" : v + "ms";
                        return v >= 1000 ? (v / 1000).toFixed(2) + "s" : v + "ms";
                      }} labelFormatter={(label) => label} />
                      <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="avg" stackId="a" fill="#3b82f6" name={intl.get("detail.avgDuration")} maxBarSize={20} />
                      <Bar dataKey="diff" stackId="a" fill="#f59e0b" name={intl.get("detail.maxDurationDiff")} maxBarSize={20} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : <div className="flex items-center justify-center h-full text-[11px] text-gray-400">{intl.get("callChain.noTraceData")}</div>}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-3">
              <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-2">{intl.get("detail.channelStacked")}</h5>
              <div className="h-[180px]">
                {spanData?.spans && spanData.spans.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={(() => {
                      const timeMap = new Map();
                      for (const s of spanData.spans) {
                        const t = (s.startTime || "").substring(11, 16) || "unknown";
                        const ch = s.channel || s.sessionKey || intl.get("callChain.overview.channelOther");
                        if (!timeMap.has(t)) timeMap.set(t, { time: t });
                        const entry = timeMap.get(t);
                        entry[ch] = (entry[ch] || 0) + 1;
                      }
                      return [...timeMap.values()].sort((a, b) => a.time.localeCompare(b.time)).slice(-20);
                    })()} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} width={25} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      {(() => {
                        const channels = [...new Set(spanData.spans.map(s => s.channel || s.sessionKey || intl.get("callChain.overview.channelOther")))];
                        const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#64748b"];
                        return channels.slice(0, 8).map((ch, i) => (
                          <Bar key={ch} dataKey={ch} stackId="a" fill={colors[i % colors.length]} maxBarSize={24} />
                        ));
                      })()}
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : <div className="flex items-center justify-center h-full text-[11px] text-gray-400">{intl.get("callChain.noTraceData")}</div>}
              </div>
            </div>
          </div>
          <div className="border-b border-gray-100 dark:border-gray-700/60">
            <nav className="flex gap-1" role="tablist">
              {DETAIL_TABS.map((tab) => (
                <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={["px-4 py-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5",
                    activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  ].join(" ")}>
                  {tab.icon && <Icon name={tab.icon} className="h-3.5 w-3.5" />}
                  {intl.get(tab.labelKey)}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === "spans" && <SpanListTab data={spanData} loading={loading} onViewTrace={setSelectedTraceId} />}
          {activeTab === "traces" && <TraceListTab data={traceData} loading={loading} instanceId={instanceId} buildUrlParams={buildUrlParams} buildFilterParams={buildFilterParams} onViewTrace={setSelectedTraceId} totalTraces={spanData?.metrics?.totalTraces || 0} />}
          {activeTab === "scatter" && <ScatterTab data={scatterData} loading={loading} onViewTrace={setSelectedTraceId} />}
          {activeTab === "apdex" && <ApdexTab data={apdexData} loading={loading} threshold={apdexThreshold} setThreshold={setApdexThreshold} onApply={() => fetchTabData("apdex")} onFilterSpanName={(name) => { setFilters(f => ({ ...f, spanNames: [name] })); setActiveTab("spans"); }} />}
          {activeTab === "aggregation" && <AggregationTab data={aggData} loading={loading} dimension={aggDimension} setDimension={setAggDimension} onQuery={() => fetchTabData("aggregation")} onFilterDimension={(dimVal) => { if (aggDimension === "spanName") { setFilters(f => ({ ...f, spanNames: [dimVal] })); setActiveTab("spans"); } }} />}
          {activeTab === "topology" && <TopologyTab spanData={spanData} loading={loading} onViewTrace={setSelectedTraceId} onFilterSpanName={(sn) => { setFilters(f => ({ ...f, spanNames: [sn] })); setActiveTab("spans"); }} />}
        </div>
    </div>
  );
}

const SPAN_COLUMNS = [
  { key: "traceId", labelKey: "detail.colTraceId", icon: "link" },
  { key: "spanName", labelKey: "detail.colSpanName", icon: "layers" },
  { key: "serviceName", labelKey: "detail.colAppName", icon: "server" },
  { key: "spanKind", labelKey: "detail.colSpanKind", icon: "layers" },
  { key: "parentSpanId", labelKey: "detail.colParentSpanId", icon: "git-branch" },
  { key: "sessionId", labelKey: "detail.colSessionId", icon: "link" },
  { key: "durationMs", labelKey: "detail.colDuration", icon: "clock" },
  { key: "status", labelKey: "detail.colStatus", icon: "check-circle" },
  { key: "startTime", labelKey: "detail.colStartTime", icon: "calendar" },
  { key: "hostIp", labelKey: "detail.colHostAddr", icon: "globe" },
];

const DEFAULT_SPAN_PAGE_SIZE = 20;

function SpanListTab({ data, loading, onViewTrace }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "startTime", dir: "desc" });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_SPAN_PAGE_SIZE);

  const spans = data?.spans || [];
  const totalCount = data?.metrics?.totalCalls || 0;
  const filtered = useMemo(() => {
    if (!search) return spans;
    const kw = search.toLowerCase();
    return spans.filter((s) =>
      (s.traceId || "").toLowerCase().includes(kw) ||
      (s.spanId || "").toLowerCase().includes(kw) ||
      (s.spanName || "").toLowerCase().includes(kw) ||
      (s.sessionKey || "").toLowerCase().includes(kw)
    );
  }, [spans, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const sk = sort.key;
    const sd = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = a[sk] ?? "";
      const vb = b[sk] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va < vb ? -1 : va > vb ? 1 : 0) * sd;
      return String(va).localeCompare(String(vb)) * sd;
    });
    return list;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(pageIndex + 1, totalPages);
  const pageSlice = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => { setPageIndex(0); }, [search]);

  const toggleSort = (key) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.spanCount", { count: totalCount })}{totalCount !== spans.length ? ` (${intl.get("detail.displayCount", { count: spans.length })})` : ""}</span>
        <div className="flex items-center gap-2">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={intl.get("detail.searchSpanPlaceholder")} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs w-64" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
              {SPAN_COLUMNS.map((col) => (
                <th key={col.key} scope="col" className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort(col.key)} className="group inline-flex items-center gap-1 font-semibold text-gray-700 hover:text-primary dark:text-gray-300 dark:hover:text-primary">
                    {col.icon && <Icon name={col.icon} className="h-3 w-3 text-gray-400" />}
                    <span>{intl.get(col.labelKey)}</span>
                    <span className={`text-[10px] ${sort.key === col.key ? "text-primary" : "text-gray-400 opacity-60"}`}>
                      {sort.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : "▲▼"}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300">{intl.get("callChain.instance.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
            {pageSlice.length === 0 ? (
              <tr><td colSpan={SPAN_COLUMNS.length + 1} className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.noTraceData")}</td></tr>
            ) : pageSlice.map((span, i) => {
              const isError = span.status === "error";
              const isSlow = span.durationMs > 5000;
              const rowBg = isError ? "bg-red-50/50 dark:bg-red-950/20" : isSlow ? "bg-amber-50/30 dark:bg-amber-950/10" : "";
              const kindInfo = getSpanKindLabel(span.spanKind);
              return (
                <tr key={i} className={`transition-colors hover:bg-primary-soft/40 dark:hover:bg-primary/10 ${rowBg}`}>
                  <td className="px-3 py-2"><span className="font-mono text-primary cursor-pointer text-[11px]" title={span.traceId} onClick={() => onViewTrace && onViewTrace(span.traceId)}>{truncateId(span.traceId)}</span></td>
                  <td className="px-3 py-2"><span className={isError ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-900 dark:text-gray-100"}>{SPAN_NAME_LABELS[span.spanName] || span.spanName}</span></td>
                  <td className="px-3 py-2"><span className="text-gray-600 dark:text-gray-400">{span.serviceName || "—"}</span></td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${kindInfo.color}`}>{kindInfo.label}</span></td>
                  <td className="px-3 py-2">{span.parentSpanId ? <span className="font-mono text-primary cursor-pointer text-[11px]" title={span.parentSpanId}>{truncateId(span.parentSpanId)}</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2">{span.sessionId ? <span className="font-mono text-primary text-[11px]" title={span.sessionId}>{truncateId(span.sessionId, 6, 6)}</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2"><span className={["font-mono font-medium", span.durationMs > 10000 ? "text-red-600 dark:text-red-400" : span.durationMs > 5000 ? "text-orange-500 dark:text-orange-400" : "text-gray-700 dark:text-gray-300"].join(" ")}>{formatDuration(span.durationMs)}</span></td>
                  <td className="px-3 py-2">{isError ? <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><Icon name="alert" className="h-3 w-3" />{intl.get("detail.statusError")}</span> : isSlow ? <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Icon name="alert-triangle" className="h-3 w-3" />{intl.get("detail.statusSlow")}</span> : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Icon name="check-circle" className="h-3 w-3" />{intl.get("detail.statusOk")}</span>}</td>
                  <td className="px-3 py-2"><span className="text-gray-600 dark:text-gray-400">{span.startTime || "—"}</span></td>
                  <td className="px-3 py-2"><span className="font-mono text-gray-600 dark:text-gray-400 text-[11px]">{span.hostIp || "—"}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => onViewTrace && onViewTrace(span.traceId)} className="text-xs font-medium text-primary hover:text-primary/80">{intl.get("callChain.instance.viewDetail")}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <TablePagination page={pageSafe} pageSize={pageSize} total={sorted.length} onPageChange={(p) => setPageIndex(p - 1)}
          trailingControls={
            <label className="ml-1 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-1 text-xs">
                {[10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </label>
          }
        />
      )}
    </div>
  );
}

function TraceListTab({ data, loading, instanceId, buildUrlParams, buildFilterParams, onViewTrace, totalTraces }) {
  const [expandedTrace, setExpandedTrace] = useState(null);
  const [expandedSpans, setExpandedSpans] = useState([]);
  const [sort, setSort] = useState({ key: "startTime", dir: "desc" });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const traces = data?.traces || [];
  const sorted = useMemo(() => {
    const list = [...traces];
    const sk = sort.key;
    const sd = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = a[sk] ?? "";
      const vb = b[sk] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va < vb ? -1 : va > vb ? 1 : 0) * sd;
      return String(va).localeCompare(String(vb)) * sd;
    });
    return list;
  }, [traces, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(pageIndex + 1, totalPages);
  const pageSlice = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const toggleSort = (key) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  const handleExpand = async (traceId) => {
    if (expandedTrace === traceId) {
      setExpandedTrace(null);
      setExpandedSpans([]);
      return;
    }
    setExpandedTrace(traceId);
    try {
      const baseParams = buildUrlParams();
      const res = await fetch(`/api/instance-detail/traces?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&traceId=${encodeURIComponent(traceId)}`);
      if (res.ok) {
        const d = await res.json();
        setExpandedSpans(d.spans || []);
      }
    } catch (e) {
      console.error("Failed to expand trace:", e);
    }
  };

  if (loading && !data) {
    return <div className="flex min-h-[320px] items-center justify-center"><Icon name="loading" className="h-8 w-8 text-primary animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.traceCount", { count: totalTraces || traces.length })}{totalTraces && totalTraces !== traces.length ? ` (${intl.get("detail.displayCount", { count: traces.length })})` : ""}</span>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
              <th className="px-3 py-2.5 w-8" />
              <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("traceId")} className="font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.colTraceId")}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("rootSpanName")} className="font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.colRootSpan")}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("spanCount")} className="font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.colSpanCount")}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("totalDurationMs")} className="font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.colTotalDuration")}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("status")} className="font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.colStatus")}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("startTime")} className="font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.colStartTime")}</button></th>
              <th className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">{intl.get("callChain.instance.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
            {pageSlice.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-500">{intl.get("callChain.noTraceData")}</td></tr>
            ) : pageSlice.map((trace) => {
              const isError = trace.status === "error";
              return (
                <TraceRow key={trace.traceId} trace={trace} isError={isError} expanded={expandedTrace === trace.traceId} expandedSpans={expandedSpans} onExpand={handleExpand} onViewTrace={onViewTrace} />
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <TablePagination page={pageSafe} pageSize={pageSize} total={sorted.length} onPageChange={(p) => setPageIndex(p - 1)}
          trailingControls={
            <label className="ml-1 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-1 text-xs">
                {[10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </label>
          }
        />
      )}
    </div>
  );
}

function TraceRow({ trace, isError, expanded, expandedSpans, onExpand, onViewTrace }) {
  return (
    <>
      <tr className={`transition-colors hover:bg-primary-soft/40 dark:hover:bg-primary/10 ${isError ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
        <td className="px-3 py-2">
          <button type="button" onClick={() => onExpand(trace.traceId)} className="text-gray-400 hover:text-primary transition-colors">
            <Icon name="chevron" className={["h-3.5 w-3.5 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
          </button>
        </td>
        <td className="px-3 py-2"><span className="font-mono text-primary cursor-pointer text-[11px]" title={trace.traceId}>{truncateId(trace.traceId)}</span></td>
        <td className="px-3 py-2"><span className={isError ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-900 dark:text-gray-100"}>{SPAN_NAME_LABELS[trace.rootSpanName] || trace.rootSpanName}</span></td>
        <td className="px-3 py-2"><span className="font-mono text-gray-700 dark:text-gray-300">{trace.spanCount}</span></td>
        <td className="px-3 py-2"><span className={["font-mono font-medium", trace.totalDurationMs > 10000 ? "text-red-600 dark:text-red-400" : trace.totalDurationMs > 5000 ? "text-orange-500 dark:text-orange-400" : "text-gray-700 dark:text-gray-300"].join(" ")}>{formatDuration(trace.totalDurationMs)}</span></td>
        <td className="px-3 py-2">{isError ? <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><Icon name="alert" className="h-3 w-3" />{intl.get("detail.statusError")}</span> : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Icon name="check-circle" className="h-3 w-3" />{intl.get("detail.statusOk")}</span>}</td>
        <td className="px-3 py-2"><span className="text-gray-600 dark:text-gray-400">{trace.startTime || "—"}</span></td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onViewTrace && onViewTrace(trace.traceId)} className="text-xs font-medium text-primary hover:text-primary/80">{intl.get("callChain.instance.viewDetail")}</button>
          </div>
        </td>
      </tr>
      {expanded && expandedSpans.length > 0 && (
        <tr>
          <td colSpan={8} className="px-3 py-3 bg-gray-50/50 dark:bg-gray-950/20">
            <div className="ml-6 space-y-2">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{intl.get("detail.traceSpanDetail")}</span>
                <span className="text-[10px] text-gray-400">{expandedSpans.length} spans</span>
                <button type="button" onClick={() => onViewTrace && onViewTrace(trace.traceId)} className="ml-auto text-[11px] font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1">
                  <Icon name="external-link" className="h-3 w-3" />{intl.get("callChain.instance.viewDetail")}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 w-8" />
                      <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colSpanName")}</th>
                      <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colDuration")}</th>
                      <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colStatus")}</th>
                      <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colSessionId")}</th>
                      <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colStartTime")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {expandedSpans.map((s, i) => {
                      const isSpanError = s.status === "error";
                      const maxDur = Math.max(...expandedSpans.map(x => x.durationMs || 0), 1);
                      const barWidth = Math.max(2, (s.durationMs || 0) / maxDur * 100);
                      return (
                        <tr key={i} className={isSpanError ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                          <td className="px-2 py-1.5 text-gray-400">{s.parentSpanId ? "└" : "●"}</td>
                          <td className="px-2 py-1.5">
                            <span className={isSpanError ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-900 dark:text-gray-100"}>{SPAN_NAME_LABELS[s.spanName] || s.spanName}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className={["h-full rounded-full", isSpanError ? "bg-red-400" : s.durationMs > 5000 ? "bg-amber-400" : "bg-blue-400"].join(" ")} style={{ width: `${barWidth}%` }} />
                              </div>
                              <span className="font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDuration(s.durationMs)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">{isSpanError ? <span className="text-red-600 dark:text-red-400">✗</span> : <span className="text-emerald-600">✓</span>}</td>
                          <td className="px-2 py-1.5 font-mono text-gray-600 dark:text-gray-400 text-[10px]">{s.sessionId ? truncateId(s.sessionId, 6, 6) : "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{s.startTime || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ScatterTab({ data, loading, onViewTrace }) {
  const [yMetric, setYMetric] = useState("totalDurationMs");
  const [highlightErrors, setHighlightErrors] = useState(false);

  const points = data?.points || [];

  const chartData = useMemo(() => {
    return points.map((p) => {
      let ts = 0;
      if (p.startTime) {
        const d = new Date(p.startTime.replace(" ", "T"));
        if (!isNaN(d.getTime())) ts = d.getTime();
      }
      return {
        x: ts,
        y: yMetric === "totalDurationMs" ? p.totalDurationMs : yMetric === "spanCount" ? p.spanCount : p.totalTokens,
        traceId: p.traceId,
        rootSpanName: p.rootSpanName,
        spanCount: p.spanCount,
        totalDurationMs: p.totalDurationMs,
        totalTokens: p.totalTokens,
        status: p.status,
        startTime: p.startTime,
      };
    }).filter(d => d.x > 0);
  }, [points, yMetric]);

  const yLabel = yMetric === "totalDurationMs" ? intl.get("detail.colTotalDuration") : yMetric === "spanCount" ? intl.get("detail.colSpanCount") : intl.get("callChain.instance.colTotalTokens");
  const yFormatter = yMetric === "totalDurationMs" ? (v) => formatDuration(v) : (v) => v.toLocaleString();

  const topErrors = useMemo(() => {
    return points
      .filter((p) => p.status === "error" || p.totalDurationMs > 5000)
      .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
      .slice(0, 20);
  }, [points]);

  if (loading && !data) {
    return <div className="flex min-h-[320px] items-center justify-center"><Icon name="loading" className="h-8 w-8 text-primary animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.scatterYAxis")}:</span>
          <select value={yMetric} onChange={(e) => setYMetric(e.target.value)} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs">
            <option value="totalDurationMs">{intl.get("detail.colTotalDuration")}</option>
            <option value="spanCount">{intl.get("detail.colSpanCount")}</option>
            <option value="totalTokens">{intl.get("callChain.instance.colTotalTokens")}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={highlightErrors} onChange={(e) => setHighlightErrors(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary" />
          <span className="text-gray-600 dark:text-gray-400">{intl.get("detail.highlightErrors")}</span>
        </label>
      </div>

      <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
        {chartData.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-8 text-center">{intl.get("callChain.noTraceData")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => { const d = new Date(v); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }} tick={{ fontSize: 10 }} name={intl.get("detail.colStartTime")} />
              <YAxis dataKey="y" type="number" tickFormatter={yFormatter} tick={{ fontSize: 10 }} name={yLabel} />
              <ZAxis dataKey="spanCount" range={[20, 200]} />
              <ReferenceLine y={5000} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "5s", position: "right", fontSize: 10, fill: "#f59e0b" }} />
              <ReferenceLine y={10000} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "10s", position: "right", fontSize: 10, fill: "#ef4444" }} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-xl text-xs space-y-1">
                    <p className="text-gray-500 dark:text-gray-400">{d.startTime}</p>
                    <p className="font-mono text-primary">{truncateId(d.traceId)}</p>
                    <p>{SPAN_NAME_LABELS[d.rootSpanName] || d.rootSpanName}</p>
                    <p>{intl.get("detail.colTotalDuration")}: <span className="font-semibold">{formatDuration(d.totalDurationMs)}</span></p>
                    <p>{intl.get("detail.colSpanCount")}: <span className="font-semibold">{d.spanCount}</span></p>
                    <p>{intl.get("detail.colStatus")}: <span className={d.status === "error" ? "text-red-600" : "text-emerald-600"}>{d.status === "error" ? intl.get("detail.statusError") : intl.get("detail.statusOk")}</span></p>
                  </div>
                );
              }} />
              <Scatter data={highlightErrors ? chartData.filter((d) => d.status === "error") : chartData} fill="#3b82f6" onClick={(payload) => { if (payload?.traceId) onViewTrace(payload.traceId); }}>
                {(highlightErrors ? chartData.filter((d) => d.status === "error") : chartData).map((entry, i) => (
                  <Cell key={i} fill={entry.status === "error" ? "#ef4444" : "#3b82f6"} fillOpacity={0.7} style={{ cursor: "pointer" }} />
                ))}
              </Scatter>
            </RechartsScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {topErrors.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
          <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("detail.topErrorsTitle")}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colTraceId")}</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colRootSpan")}</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colTotalDuration")}</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colSpanCount")}</th>
                  <th className="py-2 px-2 text-center font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colStatus")}</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colStartTime")}</th>
                  <th className="py-2 px-2 text-center font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {topErrors.map((t, i) => (
                  <tr key={i} className={t.status === "error" ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                    <td className="py-2 px-2 font-mono text-primary cursor-pointer text-[11px]" title={t.traceId}>{truncateId(t.traceId)}</td>
                    <td className="py-2 px-2 text-gray-900 dark:text-gray-100">{SPAN_NAME_LABELS[t.rootSpanName] || t.rootSpanName}</td>
                    <td className="py-2 px-2 text-right font-mono font-medium text-red-600 dark:text-red-400">{formatDuration(t.totalDurationMs)}</td>
                    <td className="py-2 px-2 text-right font-mono text-gray-700 dark:text-gray-300">{t.spanCount}</td>
                    <td className="py-2 px-2 text-center">{t.status === "error" ? <span className="text-red-600 dark:text-red-400">✗</span> : <span className="text-orange-500">⚠</span>}</td>
                    <td className="py-2 px-2 text-gray-600 dark:text-gray-400">{t.startTime || "—"}</td>
                    <td className="py-2 px-2 text-center">
                      <button type="button" onClick={() => onViewTrace && onViewTrace(t.traceId)} className="text-xs font-medium text-primary hover:text-primary/80">{intl.get("callChain.instance.viewDetail")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ApdexTab({ data, loading, threshold, setThreshold, onApply, onFilterSpanName }) {
  const [inputThreshold, setInputThreshold] = useState(threshold);

  if (loading && !data) {
    return <div className="flex min-h-[320px] items-center justify-center"><Icon name="loading" className="h-8 w-8 text-primary animate-spin" /></div>;
  }

  const overall = data?.overall || {};
  const bySpan = data?.bySpan || [];
  const trend = data?.trend || [];

  const apdexColor = (v) => v >= 0.94 ? "text-emerald-600 dark:text-emerald-400" : v >= 0.85 ? "text-orange-500 dark:text-orange-400" : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.apdexThreshold")} T (ms):</span>
        <input type="number" value={inputThreshold} onChange={(e) => setInputThreshold(Number(e.target.value))} className="w-20 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs" />
        <button type="button" onClick={() => { setThreshold(inputThreshold); onApply(); }} className="rounded-md px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary/90">{intl.get("callChain.apply")}</button>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">{intl.get("detail.apdexThresholdHint")}</span>
      </div>

      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3">
        <div className="flex items-start gap-2">
          <Icon name="info" className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-[11px] text-blue-700 dark:text-blue-300 space-y-1.5">
            <p className="font-semibold">{intl.get("detail.apdexFormulaTitle")}</p>
            <p className="font-mono bg-white/60 dark:bg-gray-900/40 rounded px-2 py-1 inline-block">
              Apdex = (Satisfied + Tolerated / 2) / Total
            </p>
            <div className="grid grid-cols-3 gap-3 mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Satisfied:</strong> {intl.get("detail.apdexSatisfiedDesc")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                <span><strong>Tolerated:</strong> {intl.get("detail.apdexToleratedDesc")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>Frustrated:</strong> {intl.get("detail.apdexFrustratedDesc")}</span>
              </div>
            </div>
            <p className="text-blue-500 dark:text-blue-400 mt-1">
              T = {threshold}ms &nbsp;|&nbsp; 4T = {threshold * 4}ms &nbsp;|&nbsp; {intl.get("detail.apdexRangeHint")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.apdexScore")}</p>
          <p className={`text-2xl font-semibold mt-1 ${apdexColor(overall.apdex || 0)}`}>{(overall.apdex || 0).toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.satisfiedRate")}</p>
          <p className="text-2xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">{(overall.satisfiedRate || 0).toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.toleratingRate")}</p>
          <p className="text-2xl font-semibold mt-1 text-orange-500 dark:text-orange-400">{(overall.toleratingRate || 0).toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.frustratedRate")}</p>
          <p className="text-2xl font-semibold mt-1 text-red-600 dark:text-red-400">{(overall.frustratedRate || 0).toFixed(1)}%</p>
        </div>
      </div>

      {trend.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
          <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("detail.apdexTrend")}</h4>
          <ResponsiveContainer width="100%" height={250}>
            <RechartsLineChart data={trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} width={40} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
              <Tooltip content={<DedupTooltip yTickFormatter={(v) => v?.toFixed(2)} />} />
              <ReferenceLine y={0.85} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "0.85", position: "right", fontSize: 10, fill: "#f59e0b" }} />
              <ReferenceLine y={0.94} stroke="#10b981" strokeDasharray="6 3" label={{ value: "0.94", position: "right", fontSize: 10, fill: "#10b981" }} />
              <Line type="monotone" dataKey="apdex" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} name="Apdex" />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      )}

      {bySpan.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
          <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("detail.apdexBySpan")}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colSpanName")}</th>
                  <th className="py-2 px-2 text-center font-medium text-gray-500 dark:text-gray-400">Apdex</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.satisfiedRate")}</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.toleratingRate")}</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.frustratedRate")}</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.colTotalCalls")}</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.avgDuration")}</th>
                  <th className="py-2 px-2 text-center font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {bySpan.sort((a, b) => a.apdex - b.apdex).map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 px-2 text-primary cursor-pointer">{SPAN_NAME_LABELS[s.spanName] || s.spanName}</td>
                    <td className={`py-2 px-2 text-center font-semibold ${apdexColor(s.apdex)}`}>{s.apdex.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-emerald-600 dark:text-emerald-400">{s.satisfiedRate.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-orange-500 dark:text-orange-400">{s.toleratingRate.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-red-600 dark:text-red-400 font-medium">{s.frustratedRate.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right font-mono text-gray-700 dark:text-gray-300">{s.totalCalls.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right font-mono text-gray-700 dark:text-gray-300">{formatDuration(s.avgDurationMs)}</td>
                    <td className="py-2 px-2 text-center"><button type="button" onClick={() => onFilterSpanName && onFilterSpanName(s.spanName)} className="text-xs font-medium text-primary hover:text-primary/80">{intl.get("detail.viewChain")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const AGG_DIMENSIONS = [
  { value: "spanName", labelKey: "detail.aggDimSpanName" },
  { value: "status", labelKey: "detail.aggDimStatus" },
  { value: "channel", labelKey: "detail.aggDimChannel" },
  { value: "model", labelKey: "detail.aggDimModel" },
  { value: "durationBucket", labelKey: "detail.aggDimDuration" },
  { value: "hour", labelKey: "detail.aggDimHour" },
  { value: "minute", labelKey: "detail.aggDimMinute" },
];

const AGG_METRICS = [
  { key: "totalCalls", labelKey: "detail.aggMetricCalls" },
  { key: "successRate", labelKey: "detail.aggMetricSuccessRate" },
  { key: "avgDurationMs", labelKey: "detail.aggMetricAvgDuration" },
  { key: "p99DurationMs", labelKey: "detail.aggMetricP99" },
  { key: "errorCount", labelKey: "detail.aggMetricErrors" },
  { key: "totalTokens", labelKey: "detail.aggMetricTokens" },
];

function AggregationTab({ data, loading, dimension, setDimension, onQuery, onFilterDimension }) {
  const [selectedMetrics, setSelectedMetrics] = useState(new Set(["totalCalls", "successRate", "avgDurationMs"]));

  const rows = data?.rows || [];
  const trend = data?.trend || [];

  const toggleMetric = (key) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const trendPivot = useMemo(() => {
    if (!trend || trend.length === 0) return [];
    const dimSet = new Set();
    for (const r of trend) { if (r.dimValue) dimSet.add(r.dimValue); }
    const dims = [...dimSet].sort();
    const timeMap = new Map();
    for (const r of trend) {
      const t = r.time || "";
      if (!timeMap.has(t)) timeMap.set(t, { time: t });
      timeMap.get(t)[r.dimValue] = r.totalCalls;
    }
    return [...timeMap.values()].sort((a, b) => a.time.localeCompare(b.time));
  }, [trend]);

  const lineKeys = useMemo(() => {
    if (!trend || trend.length === 0) return [];
    const dimSet = new Set();
    for (const r of trend) { if (r.dimValue) dimSet.add(r.dimValue); }
    return [...dimSet].sort().map((d) => ({ key: d, name: SPAN_NAME_LABELS[d] || d }));
  }, [trend]);

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  if (loading && !data) {
    return <div className="flex min-h-[320px] items-center justify-center"><Icon name="loading" className="h-8 w-8 text-primary animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.aggDimension")}:</span>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs">
            {AGG_DIMENSIONS.map((d) => (<option key={d.value} value={d.value}>{intl.get(d.labelKey)}</option>))}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetrics")}:</span>
          {AGG_METRICS.map((m) => (
            <label key={m.key} className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="checkbox" checked={selectedMetrics.has(m.key)} onChange={() => toggleMetric(m.key)} className="rounded border-gray-300 text-primary focus:ring-primary" />
              <span className="text-gray-600 dark:text-gray-400">{intl.get(m.labelKey)}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={onQuery} className="rounded-md px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary/90">{intl.get("detail.aggQuery")}</button>
      </div>

      {rows.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggDimValue")}</th>
                  {selectedMetrics.has("totalCalls") && <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetricCalls")}</th>}
                  {selectedMetrics.has("successRate") && <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetricSuccessRate")}</th>}
                  {selectedMetrics.has("avgDurationMs") && <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetricAvgDuration")}</th>}
                  {selectedMetrics.has("p99DurationMs") && <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetricP99")}</th>}
                  {selectedMetrics.has("errorCount") && <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetricErrors")}</th>}
                  {selectedMetrics.has("totalTokens") && <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("detail.aggMetricTokens")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {rows.map((r, i) => (
                  <tr key={i} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40" onClick={() => onFilterDimension && onFilterDimension(r.dimValue)}>
                    <td className="py-2 px-2 text-primary">{SPAN_NAME_LABELS[r.dimValue] || r.dimValue}</td>
                    {selectedMetrics.has("totalCalls") && <td className="py-2 px-2 text-right font-mono text-gray-700 dark:text-gray-300">{r.totalCalls.toLocaleString()}</td>}
                    {selectedMetrics.has("successRate") && <td className={["py-2 px-2 text-right font-mono font-medium", r.successRate < 90 ? "text-red-600 dark:text-red-400" : r.successRate < 95 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{r.successRate}%</td>}
                    {selectedMetrics.has("avgDurationMs") && <td className="py-2 px-2 text-right font-mono text-gray-700 dark:text-gray-300">{formatDuration(r.avgDurationMs)}</td>}
                    {selectedMetrics.has("p99DurationMs") && <td className="py-2 px-2 text-right font-mono text-orange-600 dark:text-orange-400">{formatDuration(r.p99DurationMs)}</td>}
                    {selectedMetrics.has("errorCount") && <td className={["py-2 px-2 text-right font-mono", r.errorCount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-700 dark:text-gray-300"].join(" ")}>{r.errorCount}</td>}
                    {selectedMetrics.has("totalTokens") && <td className="py-2 px-2 text-right font-mono text-gray-700 dark:text-gray-300">{formatTokenCount(r.totalTokens)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {trendPivot.length > 0 && lineKeys.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4">
          <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("detail.aggTrend")}</h4>
          <ResponsiveContainer width="100%" height={250}>
            <RechartsLineChart data={trendPivot} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + "K" : v} />
              <Tooltip content={<DedupTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {lineKeys.map((lk, i) => (
                <Line key={lk.key} type="monotone" dataKey={lk.key} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} name={lk.name} />
              ))}
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
