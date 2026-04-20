/**
 * 调用链瀑布图 UI：泳道 + 时间轴 + 因果/时序连线与事件列表，悬停展示详情。
 *
 * `prep` 由 `prepareTraceWaterfall` 生成；`isSequence` 为 true 时采用纵向箭头样式。
 */

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  computeTraceWaterfallLayouts,
  formatSecClock,
  traceEventTooltipLines,
  traceStatusAccentColor,
} from "./sreVizTraceWaterfallCore.js";

export function TraceCallChainWaterfall({ prep, chartColors, isSequence = false }) {
  const wrapRef = useRef(null);
  const [cw, setCw] = useState(720);
  const [tip, setTip] = useState(null);
  const uid = useId().replace(/:/g, "");
  const markerUrl = `url(#${uid}-trace-arr)`;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setCw(Math.max(420, el.clientWidth || 420));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labelW = 172;
  const marginR = 16;
  const marginT = 32;
  const marginB = 34;
  const rowH = 42;
  const nRows = prep.rows.length;
  const plotW = Math.max(240, cw - labelW - marginR);
  const totalW = labelW + plotW + marginR;
  const h = marginT + nRows * rowH + marginB;
  const span = Math.max(prep.tMax - prep.tMin, 1);

  const layouts = useMemo(
    () => computeTraceWaterfallLayouts(prep, { labelW, plotW, marginR, marginT, rowH, span, chartColors }),
    [prep, labelW, plotW, marginR, marginT, rowH, span, chartColors],
  );

  const xAt = (sec, stagger) => labelW + ((sec - prep.tMin) / span) * plotW + (stagger || 0);
  const yCenter = (rowId) => {
    const i = prep.rowIndex.get(rowId);
    if (i == null) return marginT + rowH / 2;
    return marginT + i * rowH + rowH / 2;
  };

  const uniqTicks = [...new Set(prep.events.map((e) => e.sec))].sort((a, b) => a - b);
  const tickSubset =
    uniqTicks.length <= 8 ? uniqTicks : uniqTicks.filter((_, idx) => idx % Math.ceil(uniqTicks.length / 8) === 0);

  const showTip = (clientX, clientY, ev) => {
    setTip({ x: clientX, y: clientY, lines: traceEventTooltipLines(ev) });
  };
  const moveTip = (clientX, clientY) => {
    setTip((prev) => (prev ? { ...prev, x: clientX, y: clientY } : prev));
  };

  if (!prep.rows.length && !prep.events.length) return null;

  return (
    <div
      ref={wrapRef}
      className="relative mt-1 w-full overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950/40"
      onMouseLeave={() => setTip(null)}
    >
      {tip ? (
        <div
          className="pointer-events-none fixed z-[200] max-w-[min(360px,calc(100vw-24px))] rounded-lg border border-gray-600 bg-gray-900 px-2.5 py-2 text-left text-[11px] leading-snug text-white shadow-xl dark:border-gray-500"
          style={{
            left: Math.max(8, Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 800) - 368)),
            top: Math.max(8, Math.min(tip.y + 14, (typeof window !== "undefined" ? window.innerHeight : 600) - 120)),
          }}
        >
          {tip.lines.map((line, i) => (
            <p key={i} className={i === 0 ? "font-semibold text-white" : "text-gray-200"}>
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <svg
        width={totalW}
        height={h}
        viewBox={`0 0 ${totalW} ${h}`}
        className="min-w-full max-w-full text-gray-900 dark:text-gray-100"
        role="img"
        aria-label="调用链瀑布图：纵轴为深度泳道，横轴为时间"
      >
        <defs>
          <marker id={`${uid}-trace-arr`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill="rgba(100,116,139,0.85)" />
          </marker>
        </defs>

        {prep.rows.map((n, ri) => {
          const y = marginT + ri * rowH;
          const laneFill = ri % 2 === 0 ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.02)";
          const accent = traceStatusAccentColor(chartColors, n.status);
          const nameShort = n.name.length > 20 ? `${n.name.slice(0, 18)}…` : n.name;
          return (
            <g key={n.id}>
              <rect x={labelW} y={y} width={plotW + marginR} height={rowH} fill={laneFill} />
              <rect x={0} y={y} width={labelW - 1} height={rowH} fill="rgba(249,250,251,0.96)" className="dark:fill-gray-900/92" />
              <rect x={0} y={y} width={3} height={rowH} fill={accent} />
              <text
                x={8}
                y={y + 18}
                style={{ fontSize: 11, fontWeight: 600, fontFamily: "ui-monospace, system-ui" }}
                className="fill-gray-800 dark:fill-gray-100"
              >
                {nameShort}
              </text>
              <text x={8} y={y + 34} style={{ fontSize: 8.5 }} className="fill-gray-400">
                d{Number(n.depth) ?? 0} · {String(n.type || "").toUpperCase()}
              </text>
            </g>
          );
        })}

        <line x1={labelW} x2={labelW} y1={marginT} y2={marginT + nRows * rowH} stroke="rgba(148,163,184,0.55)" strokeWidth={1} />

        {tickSubset.map((sec) => {
          const x = xAt(sec, 0);
          return (
            <line
              key={sec}
              x1={x}
              x2={x}
              y1={marginT}
              y2={marginT + nRows * rowH}
              stroke="rgba(148,163,184,0.28)"
              strokeDasharray="3 4"
            />
          );
        })}

        {[0, 0.5, 1].map((t) => {
          const sec = prep.tMin + t * span;
          const x = xAt(sec, 0);
          return (
            <text
              key={t}
              x={x}
              y={h - 8}
              textAnchor="middle"
              className="fill-gray-500"
              style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
            >
              {formatSecClock(sec)}
            </text>
          );
        })}

        <text x={labelW + plotW / 2} y={16} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 10 }}>
          时间轴（因果边 + 时序合并）→ · 悬停连线或编号查看详情
        </text>

        {layouts.map((row) => {
          const { ev, idx, x, y1, y2, selfCall, xElbow, midY, stubEnd, stroke } = row;

          if (isSequence) {
            if (selfCall) {
              return (
                <g key={idx}>
                  <circle
                    cx={x}
                    cy={y1}
                    r={14}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                    onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
                  />
                  <circle cx={x} cy={y1} r={5} fill={stroke} opacity={0.92} style={{ pointerEvents: "none" }} />
                  <circle cx={x} cy={y1} r={2} fill="#fff" style={{ pointerEvents: "none" }} />
                </g>
              );
            }

            const arrBump = y2 > y1 ? -3 : 3;
            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2 + arrBump}
                  stroke={stroke}
                  strokeWidth={1.5}
                  markerEnd={markerUrl}
                  style={{ pointerEvents: "none" }}
                />
                <line
                  x1={x - 6}
                  y1={y1}
                  x2={x + 6}
                  y2={y1}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                  onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
                />
                <circle cx={x} cy={y1} r={4} fill={stroke} style={{ pointerEvents: "none" }} />
              </g>
            );
          }

          const d = `M ${x} ${y1} L ${xElbow} ${y1} L ${xElbow} ${y2} L ${x} ${y2}`;

          if (selfCall) {
            return (
              <g key={idx}>
                <circle
                  cx={x}
                  cy={y1}
                  r={14}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                  onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
                />
                <circle cx={x} cy={y1} r={6.5} fill={stroke} opacity={0.92} style={{ pointerEvents: "none" }} />
                <circle cx={x} cy={y1} r={2.5} fill="#fff" style={{ pointerEvents: "none" }} />
                <line
                  x1={x + 8}
                  y1={y1}
                  x2={row.badgeX - 9}
                  y2={row.badgeY}
                  stroke="rgba(100,116,139,0.4)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  style={{ pointerEvents: "none" }}
                />
                <circle
                  cx={row.badgeX}
                  cy={row.badgeY}
                  r={10}
                  fill="rgba(255,255,255,0.95)"
                  stroke={stroke}
                  strokeWidth={1.5}
                  style={{ pointerEvents: "none" }}
                />
                <text
                  x={row.badgeX}
                  y={row.badgeY + 3.5}
                  textAnchor="middle"
                  style={{ fontSize: 9, fontWeight: 700, pointerEvents: "none" }}
                  className="fill-gray-800 dark:fill-gray-100"
                >
                  {row.n}
                </text>
                <circle
                  cx={row.badgeX}
                  cy={row.badgeY}
                  r={14}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                  onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
                />
              </g>
            );
          }

          return (
            <g key={idx}>
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                strokeLinejoin="round"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              />
              <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" opacity={0.9} style={{ pointerEvents: "none" }} />
              <circle
                cx={x}
                cy={y1}
                r={12}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              />
              <circle cx={x} cy={y1} r={4.5} fill={stroke} style={{ pointerEvents: "none" }} />
              <circle
                cx={x}
                cy={y2}
                r={12}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              />
              <circle cx={x} cy={y2} r={4.5} fill={stroke} style={{ pointerEvents: "none" }} />
              <line
                x1={xElbow}
                y1={midY}
                x2={stubEnd}
                y2={midY}
                stroke="rgba(100,116,139,0.45)"
                strokeWidth={8}
                strokeLinecap="round"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              />
              <line
                x1={xElbow}
                y1={midY}
                x2={stubEnd}
                y2={midY}
                stroke="rgba(100,116,139,0.45)"
                strokeWidth={1}
                markerEnd={markerUrl}
                style={{ pointerEvents: "none" }}
              />
              <line
                x1={stubEnd}
                y1={midY}
                x2={row.badgeX}
                y2={row.badgeY}
                stroke="rgba(100,116,139,0.35)"
                strokeWidth={1}
                strokeDasharray="2 2"
                style={{ pointerEvents: "none" }}
              />
              <circle
                cx={row.badgeX}
                cy={row.badgeY}
                r={10}
                fill="rgba(255,255,255,0.95)"
                stroke={stroke}
                strokeWidth={1.5}
                className="dark:fill-gray-900"
                style={{ pointerEvents: "none" }}
              />
              <text
                x={row.badgeX}
                y={row.badgeY + 3.5}
                textAnchor="middle"
                style={{ fontSize: 9, fontWeight: 700, pointerEvents: "none" }}
                className="fill-gray-800 dark:fill-gray-100"
              >
                {row.n}
              </text>
              <circle
                cx={row.badgeX}
                cy={row.badgeY}
                r={14}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => showTip(e.clientX, e.clientY, ev)}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              />
            </g>
          );
        })}
      </svg>

      {layouts.length > 0 ? (
        <div className="border-t border-gray-100 bg-gray-50/95 px-2 py-2 dark:border-gray-800 dark:bg-gray-900/80">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            事件说明{isSequence ? "" : "（与图中编号对应）"}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-[10px] leading-snug text-gray-700 dark:text-gray-200">
            {layouts.map((row) => (
              <li
                key={row.idx}
                className="cursor-default rounded border border-transparent px-1 py-0.5 hover:border-gray-300 hover:bg-white dark:hover:border-gray-600 dark:hover:bg-gray-950/60"
                onMouseEnter={(e) => showTip(e.clientX, e.clientY, row.ev)}
                onMouseMove={(e) => moveTip(e.clientX, e.clientY)}
              >
                {!isSequence && (
                  <span className="inline-flex w-5 shrink-0 justify-center font-mono font-bold text-primary">{row.n}.</span>
                )}
                <span className="font-mono text-gray-500">{formatSecClock(row.ev.sec)}</span>
                <span className="mx-1 text-gray-400">·</span>
                <span className="font-mono text-gray-600 dark:text-gray-300">
                  {row.ev.from} → {row.ev.to}
                </span>
                {row.ev.label ? (
                  <>
                    <span className="mx-1 text-gray-400">—</span>
                    <span>{row.ev.label}</span>
                  </>
                ) : null}
                {row.ev.trace_id ? <span className="ml-1 font-mono text-gray-400">({row.ev.trace_id})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
