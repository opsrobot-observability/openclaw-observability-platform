/**
 * 拓扑有向图 SVG：分层布局节点、贝塞尔边、故障路径流动高亮、缩放与视图工具条。
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TopologyMapLegend } from "./TopologyMapLegend.jsx";
import {
  computeTopologyLayout,
  formatTopologyNodeTooltipLines,
  topologyContentBBox,
  topologyEdgeBezier,
  topologyNodeAccent,
} from "./sreVizTopologyCore.js";

export function TopologySvgGraph({ nodes, edges, colors, faultPathEdgeKeys = null }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [cw, setCw] = useState(720);
  const [tip, setTip] = useState(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: 800, h: 400 });
  const uid = useId().replace(/:/g, "");
  const markerId = `${uid}-topo-arr`;
  const markerFaultId = `${uid}-topo-arr-fault`;
  const faultKeys = faultPathEdgeKeys instanceof Set ? faultPathEdgeKeys : null;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setCw(Math.max(400, el.clientWidth || 400));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const R = 34;
  const layout = useMemo(() => computeTopologyLayout(nodes, edges, cw, R), [nodes, edges, cw, R]);
  const { positions, width, height } = layout;
  const set = new Set(nodes.map((n) => n.id));

  useEffect(() => {
    setVb({ x: 0, y: 0, w: width, h: height });
  }, [width, height]);

  const clampVb = useCallback(
    (next) => {
      let { x, y, w, h } = next;
      w = Math.max(56, Math.min(w, width));
      h = Math.max(40, Math.min(h, height));
      x = Math.max(0, Math.min(x, width - w));
      y = Math.max(0, Math.min(y, height - h));
      return { x, y, w, h };
    },
    [width, height],
  );

  const zoomIn = useCallback(() => {
    setVb((prev) => {
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const nw = prev.w * 0.82;
      const nh = prev.h * 0.82;
      return clampVb({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
    });
  }, [clampVb]);

  const zoomOut = useCallback(() => {
    setVb((prev) => {
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const nw = Math.min(width, prev.w * 1.2);
      const nh = Math.min(height, prev.h * 1.2);
      return clampVb({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
    });
  }, [clampVb, width, height]);

  const resetView = useCallback(() => {
    setVb({ x: 0, y: 0, w: width, h: height });
  }, [width, height]);

  const fitView = useCallback(() => {
    const b = topologyContentBBox(nodes, positions, R);
    const pad = 28;
    let nw = b.maxX - b.minX + 2 * pad;
    let nh = b.maxY - b.minY + 2 * pad;
    nw = Math.min(nw, width);
    nh = Math.min(nh, height);
    let nx = b.minX - pad;
    let ny = b.minY - pad;
    nx = Math.max(0, Math.min(nx, width - nw));
    ny = Math.max(0, Math.min(ny, height - nh));
    setVb(clampVb({ x: nx, y: ny, w: nw, h: nh }));
  }, [nodes, positions, R, width, height, clampVb]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.deltaY > 0) zoomOut();
      else zoomIn();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomIn, zoomOut]);

  const showNodeTip = (e, n) => {
    setTip({ x: e.clientX, y: e.clientY, lines: formatTopologyNodeTooltipLines(n) });
  };
  const showEdgeTip = (e, edge, onFaultPath) => {
    const lines = [
      `${edge.source} → ${edge.target}`,
      onFaultPath ? "故障传播路径（沿此方向扩散）" : "",
      edge.label ? String(edge.label) : "",
      edge.type ? `类型: ${edge.type}` : "",
    ].filter(Boolean);
    setTip({ x: e.clientX, y: e.clientY, lines });
  };
  const moveTip = (e) => setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
  const hideTip = () => setTip(null);

  const topoFloatBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center text-gray-600 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 dark:text-gray-300 dark:hover:bg-sky-950/45 dark:hover:text-sky-300 dark:active:bg-sky-900/55";

  if (!nodes.length) return null;

  return (
    <div
      ref={wrapRef}
      className="relative mb-4 w-full overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50/40 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
      onMouseLeave={hideTip}
    >
      {tip ? (
        <div
          className="pointer-events-none fixed z-[200] max-w-[min(380px,calc(100vw-24px))] rounded-lg border border-gray-600 bg-gray-900 px-2.5 py-2 text-left text-[11px] leading-snug text-white shadow-xl dark:border-gray-500"
          style={{
            left: Math.max(8, Math.min(tip.x + 12, (typeof window !== "undefined" ? window.innerWidth : 800) - 388)),
            top: Math.max(8, Math.min(tip.y + 12, (typeof window !== "undefined" ? window.innerHeight : 600) - 140)),
          }}
        >
          {tip.lines.map((line, i) => (
            <p key={i} className={i === 0 ? "font-semibold" : "text-gray-200"}>
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <div className="border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">
        <p className="px-4 py-2.5 text-[11px] text-gray-500 dark:text-gray-400">
          拓扑视图 · 填充色=状态
          {faultKeys?.size ? " · 高亮连线=故障传播方向（流动动画）" : ""}
          · 悬停节点或连线查看详情 · 画布可滚轮缩放
        </p>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-white via-white/95 to-transparent px-4 pb-7 pt-2.5 dark:from-gray-950 dark:via-gray-950/95">
          <TopologyMapLegend colors={colors} />
        </div>
        <div className="max-h-[min(520px,72vh)] overflow-auto bg-white pt-9 dark:bg-gray-950">
          <svg
            ref={svgRef}
            width="100%"
            height={height}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="block w-full min-w-[320px] text-gray-800 dark:text-gray-100"
          >
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="rgba(148,163,184,0.85)" />
              </marker>
              <marker id={markerFaultId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" fill={colors.anomaly} />
              </marker>
              <filter id={`${uid}-node-glow`} x="-55%" y="-55%" width="210%" height="210%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.12" />
              </filter>
              <style type="text/css">
                {`
                @keyframes sreTopoFaultFlow {
                  from { stroke-dashoffset: 0; }
                  to { stroke-dashoffset: -56; }
                }
                .sre-topo-fault-flow {
                  animation: sreTopoFaultFlow 1.25s linear infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                  .sre-topo-fault-flow { animation: none; }
                }
              `}
              </style>
            </defs>

            {edges.map((e, i) => {
              const a = positions.get(e.source);
              const b = positions.get(e.target);
              if (!a || !b || !set.has(e.source) || !set.has(e.target)) return null;
              const d = topologyEdgeBezier(a.x, a.y, b.x, b.y, R);
              const edgeKey = `${e.source}\t${e.target}`;
              const onFaultPath = Boolean(faultKeys?.has(edgeKey));
              const flowStroke = colors.anomaly;
              return (
                <g key={i}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(ev) => showEdgeTip(ev, e, onFaultPath)}
                    onMouseMove={moveTip}
                  />
                  {onFaultPath ? (
                    <>
                      <path
                        d={d}
                        fill="none"
                        stroke={flowStroke}
                        strokeOpacity={0.22}
                        strokeWidth={9}
                        strokeLinecap="round"
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        d={d}
                        fill="none"
                        stroke={flowStroke}
                        strokeWidth={2.75}
                        strokeLinecap="round"
                        markerEnd={`url(#${markerFaultId})`}
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        className="sre-topo-fault-flow"
                        d={d}
                        fill="none"
                        stroke="rgba(255,255,255,0.92)"
                        strokeWidth={1.35}
                        strokeDasharray="5 11"
                        strokeLinecap="round"
                        style={{ pointerEvents: "none" }}
                      />
                    </>
                  ) : (
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(148,163,184,0.45)"
                      strokeWidth={1.5}
                      markerEnd={`url(#${markerId})`}
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                </g>
              );
            })}

            {nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const fill = topologyNodeAccent(colors, n);
              const label = n.name.length > 16 ? `${n.name.slice(0, 14)}…` : n.name;
              return (
                <g key={n.id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={R + 10}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => showNodeTip(e, n)}
                    onMouseMove={moveTip}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={R}
                    fill={fill}
                    filter={`url(#${uid}-node-glow)`}
                    style={{ pointerEvents: "none" }}
                  />
                  <text
                    x={p.x}
                    y={p.y + R + 18}
                    textAnchor="middle"
                    style={{ fontSize: 11, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
                    className="fill-gray-700 dark:fill-gray-300"
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div
          role="toolbar"
          aria-label="拓扑图工具"
          className="pointer-events-auto absolute bottom-3 right-3 z-20 flex w-9 flex-col divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200/90 bg-white/95 shadow-[0_4px_14px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:divide-gray-700 dark:border-gray-600 dark:bg-gray-900/95 dark:shadow-[0_4px_18px_rgba(0,0,0,0.35)]"
        >
          <button type="button" className={topoFloatBtn} onClick={zoomIn} title="放大（或滚轮向上）">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6" />
              <path d="M16.5 16.5L21 21" />
              <path d="M8 11h6M11 8v6" />
            </svg>
          </button>
          <button type="button" className={topoFloatBtn} onClick={zoomOut} title="缩小（或滚轮向下）">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6" />
              <path d="M16.5 16.5L21 21" />
              <path d="M8 11h6" />
            </svg>
          </button>
          <button type="button" className={topoFloatBtn} onClick={resetView} title="定位到全图 1:1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
            </svg>
          </button>
          <button type="button" className={topoFloatBtn} onClick={fitView} title="自适应框选全部节点">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
            </svg>
          </button>
          <span
            className="pointer-events-none absolute bottom-0 right-0 size-0 border-l-[7px] border-l-transparent border-b-[7px] border-b-gray-400/55 dark:border-b-gray-500/55"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
