/**
 * 调用链面板：整合 trace 元信息、火焰图瀑布与时序图瀑布（数据来自 flame_chart / sequence_diagram）。
 */

import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import { SpanSummaryBox } from "./SpanSummaryBox.jsx";
import { TraceCallChainWaterfall } from "./TraceCallChainWaterfall.jsx";
import { mergeTraceChartColors, prepareTraceWaterfall } from "./sreVizTraceWaterfallCore.js";

export function SreVizTraceCallChain({ panel }) {
  const model = panel.payload;
  const chartColors = useMemo(() => mergeTraceChartColors(model.chart_config), [model.chart_config]);
  const wfFlame = useMemo(() => prepareTraceWaterfall(model, "flame"), [model]);
  const wfSeq = useMemo(() => prepareTraceWaterfall(model, "seq"), [model]);
  const hasSeq = (model.sequence_diagram?.sequence || []).length > 0;
  const hasEdges = (model.flame_chart?.edges || []).length > 0;

  return (
    <Shell title={model.title || "调用链"} accent="emerald">
      {model.trace_id != null && String(model.trace_id).trim() !== "" && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="shrink-0 text-gray-500 dark:text-gray-400">Trace</span>
          <code className="max-w-full break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            {model.trace_id}
          </code>
        </div>
      )}

      {model.data_note && (
        <p className="mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {model.data_note}
        </p>
      )}

      <SpanSummaryBox summary={model.span_summary} />

      {hasEdges && (wfFlame.rows.length > 0 || wfFlame.events.length > 0) && (
        <div className="mt-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">火焰图</p>
          <p className="mb-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
            纵轴按调用深度排列组件；横轴为时间。折线表示 flame_chart 因果边。悬停连线、圆点、编号或下方列表可查看完整说明与 trace_id。
          </p>
          {wfFlame.events.length === 0 && wfFlame.rows.length > 0 ? (
            <p className="mb-2 text-[11px] text-amber-800 dark:text-amber-300">当前无带时间戳的边，仅展示组件泳道。</p>
          ) : null}
          <TraceCallChainWaterfall prep={wfFlame} chartColors={chartColors} />
        </div>
      )}

      {hasSeq && (wfSeq.rows.length > 0 || wfSeq.events.length > 0) && (
        <div className="mt-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">调用链路图</p>
          <p className="mb-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
            时序图形式。悬停连线、圆点、编号或下方列表可查看完整说明与 trace_id。
          </p>
          {wfSeq.events.length === 0 && wfSeq.rows.length > 0 ? (
            <p className="mb-2 text-[11px] text-amber-800 dark:text-amber-300">当前无带时间戳的时序步骤，仅展示组件泳道。</p>
          ) : null}
          <TraceCallChainWaterfall prep={wfSeq} chartColors={chartColors} isSequence={true} />
        </div>
      )}

      {!hasEdges && !hasSeq && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">暂无 flame_chart / sequence_diagram 数据</p>
      )}
    </Shell>
  );
}
