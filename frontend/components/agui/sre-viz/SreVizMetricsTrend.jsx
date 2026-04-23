/**
 * 指标趋势面板：多序列折线、基线/峰值、相关性摘要等。
 * 数据经 `prepareMetricsTrendChart` 预处理后由 `CanvasChart` 绘制。
 */

import { useMemo } from "react";
import CanvasChart from "../CanvasChart.jsx";
import { axisLabelForSeries, prepareMetricsTrendChart } from "../../../lib/sreMetricsTrendPrep.js";
import { Shell } from "./SreVizShell.jsx";

function formatMetricValue(v, unit) {
  if (!Number.isFinite(v)) return "—";
  const u = String(unit || "");
  if (u === "s" || u.includes("latency")) return v < 1 ? v.toFixed(3) : v.toFixed(2);
  if (Math.abs(v - Math.round(v)) < 1e-5) return String(Math.round(v));
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function SreVizMetricsTrend({ panel }) {
  const model = panel?.payload && typeof panel.payload === "object" ? panel.payload : {};
  const prep = useMemo(() => prepareMetricsTrendChart(model), [model]);
  const cc = prep.chartConfig || {};

  if (!prep.n) {
    return (
      <Shell title={prep.title} accent="blue">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          无可绘制的时间点（请检查 series[].data 或 series[].data_points）
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={prep.title} accent="blue">
      {prep.description ? (
        <p className="mb-3 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">{prep.description}</p>
      ) : null}

      <div className="space-y-3">
        {prep.rows.map((row) => (
          <div
            key={row.key}
            className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 dark:border-gray-700 dark:bg-gray-900/45"
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-[12px] font-semibold text-gray-800 dark:text-gray-100" title={row.name}>
                    {row.name}
                  </span>
                  {Array.isArray(cc.yAxes) && cc.yAxes.length > 0 && (
                    <span className="shrink-0 rounded-md bg-gray-200/90 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {axisLabelForSeries(row.name, row.unit, cc.yAxes)}
                    </span>
                  )}
                </div>
                {row.subtitle ? (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{row.subtitle}</span>
                ) : null}
              </div>
              <div className="max-w-full shrink-0 text-right font-mono text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                {row.baseline != null && row.showBaseline !== false && (
                  <span>
                    基线 {formatMetricValue(row.baseline, row.unit)}
                    {row.unit ? ` ${row.unit}` : ""}
                  </span>
                )}
                {row.baseline != null && row.showBaseline !== false && row.peak != null && <span className="mx-1">·</span>}
                {row.peak != null && (
                  <span>
                    峰值 {formatMetricValue(row.peak, row.unit)}
                    {row.unit ? ` ${row.unit}` : ""}
                    {row.peak_time ? ` @ ${row.peak_time}` : ""}
                  </span>
                )}
                {row.deviation_factor != null && (
                  <span className="mt-0.5 block text-rose-600 dark:text-rose-400">相对基线 ×{row.deviation_factor}</span>
                )}
              </div>
            </div>
            {prep.n < 2 ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">至少需要 2 个时间点才能绘制折线</p>
            ) : (
              <CanvasChart
                series={[{ label: row.name, color: row.color, data: row.data }]}
                maxPoints={prep.n}
                height={118}
                yMax={row.yMax}
                yMin={0}
                yLabel={row.unit || ""}
                horizontalBands={row.horizontalBands || []}
                referenceLines={[
                  ...(row.showBaseline !== false && row.baseline != null
                    ? [{ y: row.baseline, color: "rgba(33,150,243,0.78)", dash: [6, 4], lineWidth: 1.25 }]
                    : []),
                  ...(Array.isArray(row.refThreshold) ? row.refThreshold : []),
                ]}
                verticalMarkers={
                  row.peakIdx != null ? [{ index: row.peakIdx, color: "rgba(220,38,38,0.82)", lineWidth: 1 }] : []
                }
                showLegend={false}
                legendFilterable={false}
                gridLines={4}
              />
            )}
          </div>
        ))}
      </div>

      {prep.summary ? (
        <p className="mt-3 rounded-md border border-gray-100 bg-white/80 px-3 py-2 text-[12px] leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-200">
          {prep.summary}
        </p>
      ) : null}

      {prep.correlation.length > 0 ? (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">相关性</p>
          <div className="flex flex-wrap gap-2">
            {prep.correlation.map((c, i) => (
              <span
                key={i}
                className="max-w-full rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-[10px] text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                title={JSON.stringify(c)}
              >
                {(Array.isArray(c.pair) ? c.pair : []).join(" ↔ ")}
                {c.coefficient != null && ` · r=${Number(c.coefficient).toFixed(2)}`}
                {c.lag_seconds != null && ` · 滞后 ${c.lag_seconds}s`}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500">{prep.xAxisName}</p>
    </Shell>
  );
}
