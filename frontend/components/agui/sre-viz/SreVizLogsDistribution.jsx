/**
 * 日志分布面板：可选热力表、按时间堆叠条、图例与 Top 错误样本。
 */

import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";

const DEFAULT_LOG_LEVEL_COLORS = {
  INFO: "#4CAF50",
  WARN: "#FF9800",
  ERROR: "#F44336",
  FATAL: "#B71C1C",
};

function mergeLogLevelColors(chartConfig) {
  return { ...DEFAULT_LOG_LEVEL_COLORS, ...(chartConfig?.colors || {}) };
}

function LogsHeatmapGrid({ heatmap }) {
  const rowNames = heatmap?.rows || [];
  const colNames = heatmap?.columns || [];
  const matrix = heatmap?.data || [];
  if (!rowNames.length || !colNames.length) return null;
  let flatMax = 0;
  for (let ri = 0; ri < rowNames.length; ri++) {
    const row = matrix[ri] || [];
    for (let ci = 0; ci < colNames.length; ci++) {
      flatMax = Math.max(flatMax, Number(row[ci]) || 0);
    }
  }
  const denom = Math.max(flatMax, 1);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700">
      <table className="w-full min-w-[280px] border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/90 dark:border-gray-600 dark:bg-gray-800/80">
            <th className="sticky left-0 z-10 min-w-[100px] bg-gray-50/95 px-2 py-1.5 text-left font-medium text-gray-600 dark:bg-gray-800/95 dark:text-gray-300">
              服务 / 时间
            </th>
            {colNames.map((c) => (
              <th key={c} className="min-w-[56px] px-1 py-1.5 text-center font-mono font-normal text-gray-500 dark:text-gray-400" title={c}>
                {c.length > 8 ? `${c.slice(0, 7)}…` : c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowNames.map((svc, ri) => (
            <tr key={svc} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
              <td className="sticky left-0 z-10 bg-white/95 px-2 py-1 font-medium text-gray-800 dark:bg-gray-900/95 dark:text-gray-100">{svc}</td>
              {colNames.map((_, ci) => {
                const v = Number(matrix[ri]?.[ci]) || 0;
                const a = v <= 0 ? 0 : 0.22 + 0.78 * (v / denom);
                const bg = v <= 0 ? "rgba(148, 163, 184, 0.12)" : `rgba(220, 38, 38, ${a})`;
                return (
                  <td
                    key={ci}
                    className="border-l border-gray-100 px-0 py-0 text-center font-mono dark:border-gray-700"
                    title={`${svc} @ ${colNames[ci]}：${v} 条`}
                  >
                    <div className="min-h-[28px] py-1.5 leading-none" style={{ backgroundColor: bg }}>
                      <span className={v > 0 ? "font-semibold text-gray-900 dark:text-gray-50" : "text-gray-400 dark:text-gray-500"}>
                        {v > 0 ? v : "·"}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopErrorsPanel({ items, colors }) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0));
  return (
    <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top 日志样本</p>
      <div className="space-y-2">
        {sorted.map((e) => {
          const lv = String(e.level || "INFO").toUpperCase();
          const chip = colors[lv] || colors.INFO;
          return (
            <div key={`${e.rank}-${e.trace_id || e.msg}`} className="rounded-lg border border-gray-100 bg-white/90 px-2.5 py-2 text-[11px] dark:border-gray-700 dark:bg-gray-950/40">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[10px] text-gray-400">#{e.rank}</span>
                {e.time && <span className="font-mono text-[10px] text-gray-500">{e.time}</span>}
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white" style={{ backgroundColor: chip }}>
                  {lv}
                </span>
                {e.service && <span className="font-medium text-gray-800 dark:text-gray-100">{e.service}</span>}
                {e.count != null && <span className="text-[10px] text-gray-500">×{e.count}</span>}
                {e.trace_id && <span className="font-mono text-[10px] text-gray-400">{e.trace_id}</span>}
              </div>
              {e.msg && <p className="mt-1.5 leading-snug text-gray-700 dark:text-gray-200">{e.msg}</p>}
              {e.pod && <p className="mt-1 font-mono text-[10px] text-gray-500">{e.pod}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SreVizLogsDistribution({ panel }) {
  const model = panel.payload;
  const colors = useMemo(() => mergeLogLevelColors(model.chart_config), [model.chart_config]);
  const rows = model.distribution || [];
  const heatmap = model.heatmap;
  const topErrors = model.top_errors || [];

  const maxVal = Math.max(
    1,
    ...rows.map((r) =>
      (Number(r.INFO) || 0) + (Number(r.WARN) || 0) + (Number(r.ERROR) || 0) + (Number(r.FATAL) || 0),
    ),
  );

  const hasHeatmap = Array.isArray(heatmap?.rows) && heatmap.rows.length > 0 && Array.isArray(heatmap?.columns) && heatmap.columns.length > 0;

  return (
    <Shell title={model.title || "日志分布"} accent="amber">
      {hasHeatmap && (
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">服务 × 时间 (热力)</p>
          <LogsHeatmapGrid heatmap={heatmap} />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className={`mb-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 ${hasHeatmap ? "mt-4" : ""}`}>
            按时间聚合 (堆叠占比)
          </p>
          <div className="space-y-1">
            {rows.map((r, i) => {
              const info = Number(r.INFO) || 0;
              const warn = Number(r.WARN) || 0;
              const err = Number(r.ERROR) || 0;
              const fatal = Number(r.FATAL) || 0;
              const total = info + warn + err + fatal;
              const t = Math.max(total, 0.0001);
              const pct = (n) => (n / t) * 100;
              const tip = `时间 ${r.time}\nINFO ${info} · WARN ${warn} · ERROR ${err}${fatal ? ` · FATAL ${fatal}` : ""}\n合计 ${total} (柱宽 = 相对全局峰值 ${maxVal})`;
              const scaleW = total > 0 ? (total / maxVal) * 100 : 0;
              return (
                <div key={i} className="group relative flex items-center gap-3">
                  <span className="w-[68px] shrink-0 font-mono text-[11px] text-gray-500" title={r.time}>
                    {r.time}
                  </span>
                  <div className="relative h-[22px] min-w-0 flex-1 rounded border border-gray-200/50 bg-gray-50/50 dark:border-gray-700/50 dark:bg-gray-800/30">
                    <div className="flex h-full overflow-hidden rounded-[3px]" style={{ width: total > 0 ? `${scaleW}%` : "0%" }}>
                      {total > 0 && (
                        <>
                          {info > 0 && (
                            <div
                              className="h-full min-w-0 shrink-0 transition-opacity hover:opacity-90"
                              style={{ width: `${pct(info)}%`, backgroundColor: colors.INFO }}
                              title={`INFO ${info}`}
                            />
                          )}
                          {warn > 0 && (
                            <div
                              className="h-full min-w-0 shrink-0 transition-opacity hover:opacity-90"
                              style={{ width: `${pct(warn)}%`, backgroundColor: colors.WARN }}
                              title={`WARN ${warn}`}
                            />
                          )}
                          {err > 0 && (
                            <div
                              className="h-full min-w-0 shrink-0 transition-opacity hover:opacity-90"
                              style={{ width: `${pct(err)}%`, backgroundColor: colors.ERROR }}
                              title={`ERROR ${err}`}
                            />
                          )}
                          {fatal > 0 && (
                            <div
                              className="h-full min-w-0 shrink-0 transition-opacity hover:opacity-90"
                              style={{ width: `${pct(fatal)}%`, backgroundColor: colors.FATAL }}
                              title={`FATAL ${fatal}`}
                            />
                          )}
                        </>
                      )}
                    </div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-[min(300px,88vw)] -translate-x-1/2 rounded-md border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-left text-[11px] leading-relaxed text-white shadow-lg group-hover:block whitespace-pre-line">
                      {tip}
                    </div>
                  </div>
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] text-gray-400">{total > 0 ? total : "—"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.INFO }} />
          INFO
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.WARN }} />
          WARN
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.ERROR }} />
          ERROR
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.FATAL }} />
          FATAL
        </span>
      </div>

      <TopErrorsPanel items={topErrors} colors={colors} />

      {!hasHeatmap && rows.length === 0 && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">暂无 distribution / heatmap 数据</p>
      )}
    </Shell>
  );
}
