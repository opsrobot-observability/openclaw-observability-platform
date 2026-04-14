/**
 * CanvasChart — HTML5 Canvas 实时折线图
 *
 * 用于 SRE 工作区的 CPU / 内存 / 网络等实时指标可视化。
 * 支持多系列、自动滚动、渐变填充、暗色模式、ResizeObserver 自适应。
 */
import { useEffect, useRef, useState, useCallback } from "react";

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const PAD = { top: 12, right: 16, bottom: 28, left: 44 };

export default function CanvasChart({
  series = [],
  height = 180,
  maxPoints = 30,
  yMin = 0,
  yMax: yMaxProp,
  yLabel = "%",
  gridLines = 5,
  showLegend = true,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(400);

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cw = width - PAD.left - PAD.right;
    const ch = height - PAD.top - PAD.bottom;

    // Compute Y range
    let yMax = yMaxProp ?? 100;
    if (!yMaxProp) {
      for (const s of series) {
        for (const p of s.data || []) if (p.v > yMax) yMax = p.v;
      }
      yMax = Math.ceil(yMax / 10) * 10 || 100;
    }

    ctx.clearRect(0, 0, width, height);

    // Grid + Y labels
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
      ctx.fillText(`${Math.round(val)}${yLabel}`, PAD.left - 6, y);
    }

    // Series
    for (let si = 0; si < series.length; si++) {
      const s = series[si];
      const color = s.color || PALETTE[si % PALETTE.length];
      const data = (s.data || []).slice(-maxPoints);
      if (data.length < 2) continue;

      const xStep = cw / (maxPoints - 1);

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

    // Legend
    if (showLegend && series.length > 0) {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      let lx = PAD.left;
      for (let si = 0; si < series.length; si++) {
        const color = series[si].color || PALETTE[si % PALETTE.length];
        ctx.fillStyle = color;
        ctx.fillRect(lx, height - 8, 14, 3);
        ctx.fillStyle = "rgba(148,163,184,0.6)";
        ctx.font = "10px system-ui, sans-serif";
        const label = series[si].label || `series-${si}`;
        ctx.fillText(label, lx + 18, height - 4);
        lx += ctx.measureText(label).width + 36;
      }
    }
  }, [series, width, height, maxPoints, yMin, yMaxProp, yLabel, gridLines, showLegend]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${height}px` }}
        className="rounded-lg"
      />
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
