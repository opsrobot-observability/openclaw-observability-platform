/**
 * CanvasChart — HTML5 Canvas 实时折线图
 *
 * 用于 SRE 工作区的 CPU / 内存 / 网络等实时指标可视化。
 * 支持多系列、自动滚动、渐变填充、暗色模式、ResizeObserver 自适应。
 */
import { useEffect, useRef, useState, useCallback } from "react";

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const PAD = { top: 12, right: 16, bottom: 28, left: 44 };
/** 水平 X 轴刻度预留高度 */
const X_AXIS_EXTRA_BOTTOM_FLAT = 20;
/** 倾斜 X 轴刻度预留高度 */
const X_AXIS_EXTRA_BOTTOM_TILTED = 34;
/** 开启倾斜时，约 -30° */
const X_LABEL_ROTATION = (-30 * Math.PI) / 180;

function getXAxisExtraBottom(showXAxisTicks, refL, tilted) {
  if (!showXAxisTicks || refL < 2) return 0;
  return tilted ? X_AXIS_EXTRA_BOTTOM_TILTED : X_AXIS_EXTRA_BOTTOM_FLAT;
}

function fmtY(v) {
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2);
}

function formatXAxisTickLabel(pt, i) {
  if (pt?.xLabel != null && String(pt.xLabel).trim() !== "") return String(pt.xLabel).trim();
  if (typeof pt?.t === "number" && pt.t > 1e11) {
    const d = new Date(pt.t);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  return String(i + 1);
}

function pickXTickIndices(L, maxTicks) {
  const cap = Math.min(Math.max(2, maxTicks), L);
  if (L <= 0) return [];
  if (L === 1) return [0];
  const out = [];
  for (let k = 0; k < cap; k += 1) {
    out.push(Math.round((k * (L - 1)) / Math.max(cap - 1, 1)));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** 按宽度稀疏刻度，避免挤在一起（与 maxXAxisTicks 取较小） */
function effectiveXTickCap(L, cw, maxXAxisTicks) {
  if (L <= 0) return 0;
  const byWidth = Math.max(3, Math.floor(cw / 44));
  return Math.min(L, maxXAxisTicks, byWidth);
}

function computeVisibleMaxLen(series, hiddenSeries, maxPoints) {
  let refL = 0;
  for (let si = 0; si < series.length; si++) {
    if (hiddenSeries.has(si)) continue;
    const d = (series[si].data || []).slice(-maxPoints);
    refL = Math.max(refL, d.length);
  }
  return refL;
}

function pickLabelDataSeries(series, hiddenSeries, maxPoints, refL) {
  for (let si = 0; si < series.length; si++) {
    if (hiddenSeries.has(si)) continue;
    const d = (series[si].data || []).slice(-maxPoints);
    if (refL > 0 && d.length === refL) return d;
  }
  for (let si = 0; si < series.length; si++) {
    if (hiddenSeries.has(si)) continue;
    const d = (series[si].data || []).slice(-maxPoints);
    if (d.length > 0) return d;
  }
  return [];
}

export default function CanvasChart({
  series = [],
  height = 180,
  maxPoints = 30,
  yMin = 0,
  yMax: yMaxProp,
  yLabel = "%",
  gridLines = 5,
  showLegend = true,
  enableTooltip = true,
  /** 多系列时点击图例可隐藏/显示曲线；至少保留一条可见 */
  legendFilterable = true,
  /** X 方向异常/高亮区间（数据点下标，与当前对齐后的序列长度一致） */
  horizontalBands = [],
  /** 水平参考线，如基线 */
  referenceLines = [],
  /** 竖线标记，如峰值时刻（数据点下标） */
  verticalMarkers = [],
  /** 在绘图区底部绘制 X 轴刻度与标签（取首条可见序列的 xLabel / 时间戳） */
  showXAxisTicks = true,
  /** X 轴最多显示的刻度个数（会与宽度取较小，尽量稀疏） */
  maxXAxisTicks = 6,
  /** 为 true 时 X 轴时间标签倾斜约 -30°（更占纵向空间） */
  xAxisLabelsTilted = false,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(400);
  const [tooltip, setTooltip] = useState(null);
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setHiddenSeries((prev) => {
      const next = new Set();
      for (const i of prev) {
        if (i < series.length) next.add(i);
      }
      return next;
    });
  }, [series.length]);

  const toggleSeriesVisibility = useCallback(
    (si) => {
      if (!legendFilterable || series.length < 2) return;
      setHiddenSeries((prev) => {
        const next = new Set(prev);
        if (next.has(si)) {
          next.delete(si);
          return next;
        }
        const visible = series.length - next.size;
        if (visible <= 1) return prev;
        next.add(si);
        return next;
      });
    },
    [legendFilterable, series.length],
  );

  const handleCanvasMouseMove = useCallback(
    (e) => {
      if (!enableTooltip) return;
      const canvas = canvasRef.current;
      if (!canvas || !series.length) {
        setTooltip(null);
        return;
      }
      const cw = width - PAD.left - PAD.right;
      const refLm = computeVisibleMaxLen(series, hiddenSeries, maxPoints);
      const bottomPad = PAD.bottom + getXAxisExtraBottom(showXAxisTicks, refLm, xAxisLabelsTilted);
      const ch = height - PAD.top - bottomPad;
      if (cw <= 0 || ch <= 0) {
        setTooltip(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = width / Math.max(rect.width, 1);
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * (height / Math.max(rect.height, 1));
      if (mx < PAD.left || mx > width - PAD.right || my < PAD.top || my > PAD.top + ch) {
        setTooltip(null);
        return;
      }

      const visible = series.map((s, i) => ({ s, i })).filter(({ i }) => !hiddenSeries.has(i));
      if (!visible.length) {
        setTooltip(null);
        return;
      }
      const slices = visible.map(({ s }) => (s.data || []).slice(-maxPoints));
      const L = Math.max(...slices.map((d) => d.length), 0);
      if (L < 1) {
        setTooltip(null);
        return;
      }
      const xStep = cw / Math.max(maxPoints - 1, 1);
      const start = maxPoints - L;
      let j = Math.round((mx - PAD.left) / xStep - start);
      j = Math.max(0, Math.min(L - 1, j));

      let longestVi = 0;
      let maxLen = 0;
      slices.forEach((d, vi) => {
        if (d.length > maxLen) {
          maxLen = d.length;
          longestVi = vi;
        }
      });
      const refPt = slices[longestVi][j];
      const xCaption =
        refPt?.xLabel != null && String(refPt.xLabel).trim() !== ""
          ? String(refPt.xLabel)
          : `序号 ${j + 1}/${L}`;

      const suffix = yLabel && yLabel.trim() !== "" ? yLabel : "";
      const lines = [];
      for (let vi = 0; vi < visible.length; vi++) {
        const { s, i: origSi } = visible[vi];
        const d = (s.data || []).slice(-maxPoints);
        const localJ = j - (L - d.length);
        if (localJ < 0 || localJ >= d.length) continue;
        const pt = d[localJ];
        const label = s.label || `series-${origSi}`;
        lines.push(`${label}: ${fmtY(pt.v)}${suffix}`);
      }

      if (lines.length === 0) {
        setTooltip(null);
        return;
      }

      setTooltip({
        clientX: e.clientX,
        clientY: e.clientY,
        title: xCaption,
        lines,
      });
    },
    [enableTooltip, series, width, height, maxPoints, yLabel, hiddenSeries, showXAxisTicks, xAxisLabelsTilted],
  );

  const handleCanvasMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cw = width - PAD.left - PAD.right;

    let refL = 0;
    for (let si = 0; si < series.length; si++) {
      if (hiddenSeries.has(si)) continue;
      const d = (series[si].data || []).slice(-maxPoints);
      refL = Math.max(refL, d.length);
    }
    const bottomPad = PAD.bottom + getXAxisExtraBottom(showXAxisTicks, refL, xAxisLabelsTilted);
    const ch = height - PAD.top - bottomPad;

    let yMax = yMaxProp ?? 100;
    if (!yMaxProp) {
      yMax = yMin;
      let anyVisible = false;
      for (let si = 0; si < series.length; si++) {
        if (hiddenSeries.has(si)) continue;
        anyVisible = true;
        const s = series[si];
        for (const p of s.data || []) if (p.v > yMax) yMax = p.v;
      }
      if (!anyVisible) yMax = 100;
      else yMax = Math.ceil(yMax / 10) * 10 || 100;
    }

    ctx.clearRect(0, 0, width, height);

    const refStart = refL > 0 ? maxPoints - refL : 0;
    const refXStep = cw / Math.max(maxPoints - 1, 1);

    if (horizontalBands?.length && refL > 0) {
      for (const band of horizontalBands) {
        let i0 = Math.max(0, Math.min(refL - 1, band.fromIdx));
        let i1 = Math.max(0, Math.min(refL - 1, band.toIdx));
        if (i0 > i1) [i0, i1] = [i1, i0];
        const xL = PAD.left + refXStep * (refStart + i0) - refXStep * 0.35;
        const xR = PAD.left + refXStep * (refStart + i1) + refXStep * 0.35;
        ctx.fillStyle = band.fillStyle || "rgba(239,68,68,0.12)";
        ctx.fillRect(Math.min(xL, xR), PAD.top, Math.abs(xR - xL), ch);
      }
    }

    // Grid + Y labels（仅数字，不显示 Y 轴单位）
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= gridLines; i++) {
      const y = PAD.top + (ch / gridLines) * i;
      ctx.strokeStyle = "rgba(148,163,184,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(width - PAD.right, y);
      ctx.stroke();

      const val = yMax - ((yMax - yMin) / gridLines) * i;
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(fmtY(val), PAD.left - 6, y);
    }

    for (const ref of referenceLines || []) {
      if (!Number.isFinite(ref.y)) continue;
      if (ref.y < yMin || ref.y > yMax) continue;
      const yLine = PAD.top + ch - ((ref.y - yMin) / (yMax - yMin)) * ch;
      ctx.save();
      ctx.strokeStyle = ref.color || "rgba(33,150,243,0.75)";
      ctx.lineWidth = ref.lineWidth ?? 1;
      ctx.setLineDash(ref.dash || [5, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, yLine);
      ctx.lineTo(width - PAD.right, yLine);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Series（按图例筛选隐藏）
    for (let si = 0; si < series.length; si++) {
      if (hiddenSeries.has(si)) continue;
      const s = series[si];
      const color = s.color || PALETTE[si % PALETTE.length];
      const data = (s.data || []).slice(-maxPoints);
      if (data.length < 2) continue;

      const xStep = cw / Math.max(maxPoints - 1, 1);

      // Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = PAD.left + xStep * (maxPoints - data.length + i);
        const y = PAD.top + ch - ((data[i].v - yMin) / (yMax - yMin)) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Gradient fill
      const path = new Path2D();
      for (let i = 0; i < data.length; i++) {
        const x = PAD.left + xStep * (maxPoints - data.length + i);
        const y = PAD.top + ch - ((data[i].v - yMin) / (yMax - yMin)) * ch;
        i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
      }
      const lastX = PAD.left + xStep * (maxPoints - 1);
      const firstX = PAD.left + xStep * (maxPoints - data.length);
      path.lineTo(lastX, PAD.top + ch);
      path.lineTo(firstX, PAD.top + ch);
      path.closePath();
      const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + ch);
      grad.addColorStop(0, color + "28");
      grad.addColorStop(1, color + "03");
      ctx.fillStyle = grad;
      ctx.fill(path);

      // Current value dot
      if (data.length > 0) {
        const last = data[data.length - 1];
        const lx = PAD.left + xStep * (maxPoints - 1);
        const ly = PAD.top + ch - ((last.v - yMin) / (yMax - yMin)) * ch;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (verticalMarkers?.length && refL > 0) {
      for (const vm of verticalMarkers) {
        if (!Number.isFinite(vm.index)) continue;
        const idx = Math.max(0, Math.min(refL - 1, Math.round(vm.index)));
        const x = PAD.left + refXStep * (refStart + idx);
        ctx.save();
        ctx.strokeStyle = vm.color || "rgba(244,67,54,0.7)";
        ctx.lineWidth = vm.lineWidth ?? 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + ch);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    const axisY = PAD.top + ch;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, axisY);
    ctx.lineTo(width - PAD.right, axisY);
    ctx.stroke();

    if (showXAxisTicks && refL >= 2) {
      const labelData = pickLabelDataSeries(series, hiddenSeries, maxPoints, refL);
      if (labelData.length >= 2) {
        const Llab = labelData.length;
        const startLab = maxPoints - Llab;
        const tickCap = effectiveXTickCap(Llab, cw, maxXAxisTicks);
        const ticks = pickXTickIndices(Llab, tickCap);
        ctx.font = "9px ui-monospace, system-ui, sans-serif";
        ctx.fillStyle = "rgba(71, 85, 105, 0.95)";
        ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
        ctx.lineWidth = 1;
        for (const i of ticks) {
          const x = PAD.left + refXStep * (startLab + i);
          ctx.beginPath();
          ctx.moveTo(x, axisY);
          ctx.lineTo(x, axisY + 5);
          ctx.stroke();
          const pt = labelData[i];
          const text = formatXAxisTickLabel(pt, i);
          if (xAxisLabelsTilted) {
            ctx.save();
            ctx.translate(x, axisY + 6);
            ctx.rotate(X_LABEL_ROTATION);
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(text, 0, 0);
            ctx.restore();
          } else {
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(text, x, axisY + 6);
          }
        }
      }
    }
  }, [
    series,
    width,
    height,
    maxPoints,
    yMin,
    yMaxProp,
    yLabel,
    gridLines,
    hiddenSeries,
    horizontalBands,
    referenceLines,
    verticalMarkers,
    showXAxisTicks,
    maxXAxisTicks,
    xAxisLabelsTilted,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${height}px` }}
        className="rounded-lg"
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
      />
      {showLegend && series.length > 0 && (
        <div
          className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 dark:border-gray-800"
          title={legendFilterable ? "点击图例可显示或隐藏对应曲线（至少保留一条可见）" : undefined}
        >
          {series.map((s, si) => {
            const color = s.color || PALETTE[si % PALETTE.length];
            const label = s.label || `series-${si}`;
            const off = hiddenSeries.has(si);
            const visibleCount = series.length - hiddenSeries.size;
            const canToggle = legendFilterable && series.length >= 2 && (off || visibleCount > 1);
            return (
              <button
                key={si}
                type="button"
                disabled={!canToggle}
                onClick={() => toggleSeriesVisibility(si)}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${
                  off
                    ? "border-gray-200 bg-gray-50 text-gray-400 line-through dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-500"
                    : "border-gray-200 bg-white text-gray-700 hover:border-primary/50 hover:text-primary disabled:hover:border-gray-200 disabled:hover:text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:disabled:hover:border-gray-600 dark:disabled:hover:text-gray-200"
                }`}
              >
                <span
                  className="h-2 w-3.5 shrink-0 rounded-sm ring-1 ring-black/5 dark:ring-white/10"
                  style={{ backgroundColor: color, opacity: off ? 0.35 : 1 }}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      )}
      {tooltip && enableTooltip && (() => {
        const pad = 14;
        let left = tooltip.clientX + pad;
        let top = tooltip.clientY + pad;
        if (typeof window !== "undefined") {
          const boxW = 220;
          const boxH = 120;
          left = Math.min(Math.max(8, left), window.innerWidth - boxW);
          top = Math.min(Math.max(8, top), window.innerHeight - boxH);
        }
        return (
          <div
            className="pointer-events-none fixed z-[100] w-[204px] rounded-lg border border-gray-200 bg-white/95 px-2.5 py-2 text-[11px] shadow-lg backdrop-blur-sm dark:border-gray-600 dark:bg-gray-900/95"
            style={{ left, top }}
          >
            <div className="font-mono text-[10px] font-semibold text-gray-700 dark:text-gray-200">{tooltip.title}</div>
            <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-gray-600 dark:text-gray-300">
              {tooltip.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Live Chart Wrapper (auto-refresh) ───────────────────────────
/**
 * LiveChart 在 CanvasChart 基础上自动刷新：
 * - 接受 dataSource 函数，每 interval ms 调用一次获取新数据点
 * - 或接受 series prop 被外部驱动
 */
export function LiveChart({
  dataSource,
  interval = 2000,
  seriesConfig = [],
  maxPoints = 30,
  height = 180,
  yLabel = "%",
}) {
  const [series, setSeries] = useState(() =>
    seriesConfig.map((c) => ({ label: c.label, color: c.color, data: [] }))
  );

  useEffect(() => {
    if (!dataSource) return;
    const tick = () => {
      const points = dataSource();
      if (!points) return;
      setSeries((prev) =>
        prev.map((s, i) => ({
          ...s,
          data: [...s.data.slice(-(maxPoints - 1)), { t: Date.now(), v: points[i] ?? 0 }],
        }))
      );
    };
    tick();
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [dataSource, interval, maxPoints]);

  return <CanvasChart series={series} maxPoints={maxPoints} height={height} yLabel={yLabel} />;
}
