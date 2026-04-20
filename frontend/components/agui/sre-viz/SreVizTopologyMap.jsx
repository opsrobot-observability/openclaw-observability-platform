/**
 * 拓扑面板：静态拓扑图 + 故障传播路径提示 + 异常时间窗表 + 自愈信息。
 */

import { Fragment, useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import { TopologySvgGraph } from "./TopologySvgGraph.jsx";
import {
  buildFaultPropagationEdgeKeySet,
  mergeTopologyNodeColors,
  parseFaultPathSegments,
  topologyNodeAccent,
} from "./sreVizTopologyCore.js";

export function SreVizTopologyMap({ panel }) {
  const model = panel.payload;
  const topo = model.static_topology || {};
  const nodes = topo.nodes || model.nodes || [];
  const edges = topo.edges || [];
  const fp = model.fault_propagation;
  const cc = model.chart_config || {};
  const colors = useMemo(() => mergeTopologyNodeColors(cc), [cc]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const direction = String(cc.direction || "LR").toUpperCase();
  const pathSegments = useMemo(() => parseFaultPathSegments(fp?.path), [fp?.path]);
  const faultPathEdgeKeys = useMemo(
    () => buildFaultPropagationEdgeKeySet(pathSegments, edges, nodes),
    [pathSegments, edges, nodes],
  );
  const faultPathMappedToEdges = faultPathEdgeKeys.size > 0;

  return (
    <Shell title={model.title || "拓扑"} accent="rose">
      {pathSegments.length > 0 && faultPathMappedToEdges ? (
        <p className="mb-2 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-400/95">
          故障传播已叠加在拓扑连线：沿<strong className="font-semibold">红色流动虚线</strong>方向为下游影响（箭头指向传播方向）。
        </p>
      ) : null}
      {pathSegments.length > 0 && !faultPathMappedToEdges ? (
        <div className="mb-3 rounded-xl border border-amber-200/60 bg-[#FDF9EE]/80 px-4 py-3 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/25">
          <p className="mb-2 text-[11px] font-bold text-amber-800/90 dark:text-amber-400">故障传播路径（未全部匹配到拓扑边）</p>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12px]">
            {pathSegments.map((seg, i) => {
              const n = [...nodeById.values()].find((x) => x.id === seg || String(x.name) === seg);
              const accent = n ? topologyNodeAccent(colors, n) : colors.fallback;
              return (
                <Fragment key={`${seg}-${i}`}>
                  {i > 0 ? <span className="px-0.5 text-gray-300 dark:text-gray-600">→</span> : null}
                  <span
                    className="rounded-md border border-gray-200/80 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    style={{ borderLeftWidth: 4, borderLeftColor: accent }}
                    title={n ? `${n.name} (${n.id})` : seg}
                  >
                    {n?.name || seg}
                  </span>
                </Fragment>
              );
            })}
          </div>
        </div>
      ) : null}

      {nodes.length > 0 ? (
        <>
          <p className="mb-1 text-[10px] text-gray-500 dark:text-gray-400">
            {cc.layout === "directed" ? "有向" : "无向"}拓扑 · {direction}
            {edges.length ? ` · ${edges.length} 条边（悬停连线查看依赖与标签）` : ""}
          </p>
          <TopologySvgGraph nodes={nodes} edges={edges} colors={colors} faultPathEdgeKeys={faultPathEdgeKeys} />
        </>
      ) : null}

      {Array.isArray(fp?.timeline) && fp.timeline.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">异常时间窗</p>
          <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700">
            <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/90 text-[10px] uppercase text-gray-500 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-400">
                  <th className="px-2 py-1.5 font-medium">节点</th>
                  <th className="px-2 py-1.5 font-medium">开始</th>
                  <th className="px-2 py-1.5 font-medium">结束</th>
                  <th className="px-2 py-1.5 font-medium">时长</th>
                  <th className="px-2 py-1.5 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {fp.timeline.map((row, i) => {
                  const nn = nodeById.get(row.node_id);
                  return (
                    <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                      <td className="px-2 py-1.5 font-mono font-medium text-gray-800 dark:text-gray-100">{nn?.name || row.node_id}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-600 dark:text-gray-300">{row.anomaly_start ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-600 dark:text-gray-300">{row.anomaly_end ?? "—"}</td>
                      <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300">
                        {row.duration_seconds != null ? `${row.duration_seconds}s` : "—"}
                      </td>
                      <td className="max-w-[280px] px-2 py-1.5 text-gray-700 dark:text-gray-200">{row.description ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {fp?.healing && typeof fp.healing === "object" && (fp.healing.trigger || fp.healing.start) && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-[11px] dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">恢复 / 自愈</p>
          {fp.healing.trigger && <p className="font-medium text-emerald-900 dark:text-emerald-100">{fp.healing.trigger}</p>}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-emerald-800/90 dark:text-emerald-200/90">
            {fp.healing.start && <span>开始 {fp.healing.start}</span>}
            {fp.healing.complete && <span>完成 {fp.healing.complete}</span>}
            {fp.healing.duration_seconds != null && <span>耗时 {fp.healing.duration_seconds}s</span>}
          </div>
        </div>
      )}

      {!nodes.length && !edges.length && !pathSegments.length && !(fp?.timeline || []).length && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">暂无拓扑数据</p>
      )}
    </Shell>
  );
}
