/**
 * 调用链瀑布图 — 纯函数工具。
 *
 * 含：时间解析、事件去重与泳道行构建、tooltip 文案、连线布局与描边颜色（与 React 无关，可单测）。
 */

export function mergeTraceChartColors(chartConfig) {
  const c = chartConfig?.colors || {};
  return {
    normal: c.normal ?? "#4CAF50",
    slow: c.slow ?? c.degraded ?? "#FFC107",
    anomaly: c.anomaly ?? c.error ?? "#F44336",
    degraded: c.degraded ?? c.slow ?? "#FF9800",
    error: c.error ?? c.anomaly ?? "#B71C1C",
    recovering: c.recovering ?? "#2196F3",
    fallback: c.fallback ?? "#9E9E9E",
  };
}

export function traceStatusAccentColor(colors, status) {
  const s = String(status || "").toLowerCase();
  if (s === "anomaly" || s === "error") return colors.anomaly || colors.error;
  if (s === "degraded") return colors.degraded || colors.slow;
  if (s === "normal" || s === "recovered") return colors.normal;
  if (s === "recovering") return colors.recovering || colors.normal;
  return colors.fallback;
}

export function parseHmsToSec(t) {
  if (t == null) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  return h * 3600 + min * 60 + sec;
}

export function formatSecClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function matchNodeId(raw, nodes) {
  const r = String(raw || "").trim();
  if (!r) return "";
  const rl = r.toLowerCase();
  for (const n of nodes) {
    if (String(n.id || "").toLowerCase() === rl) return n.id;
    if (String(n.name || "").toLowerCase() === rl) return n.id;
  }
  return r;
}

export function eventStrokeColor(ev, chartColors) {
  const k = String(ev.kind || "").toLowerCase().replace(/_/g, "-");
  if (k === "causal") return "rgba(37, 99, 235, 0.85)";
  if (k === "error") return chartColors.anomaly;
  if (k === "metric") return "rgba(14, 165, 233, 0.9)";
  if (k === "stress") return "rgba(124, 58, 237, 0.9)";
  if (k === "k8s-event") return "rgba(71, 85, 105, 0.95)";
  return chartColors.fallback;
}

export function prepareTraceWaterfall(model, mode = "all") {
  const fc = model.flame_chart || {};
  const nodes = [...(fc.nodes || [])];
  const edges = fc.edges || [];
  const sequence = model.sequence_diagram?.sequence || [];

  const events = [];
  if (mode === "all" || mode === "flame") {
    for (const e of edges) {
      const sec = parseHmsToSec(e.time);
      if (sec == null) continue;
      events.push({
        sec,
        from: String(e.from || ""),
        to: String(e.to || ""),
        label: String(e.label || ""),
        kind: "causal",
        trace_id: null,
      });
    }
  }
  if (mode === "all" || mode === "seq") {
    for (const s of sequence) {
      const sec = parseHmsToSec(s.time);
      if (sec == null) continue;
      const kind = String(s.type || "seq").toLowerCase().replace(/_/g, "-");
      events.push({
        sec,
        from: String(s.from || ""),
        to: String(s.to || ""),
        label: String(s.msg || ""),
        kind,
        trace_id: s.trace_id || null,
      });
    }
  }
  events.sort(
    (a, b) =>
      a.sec - b.sec ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      a.label.localeCompare(b.label),
  );

  const deduped = [];
  const seen = new Set();
  for (const ev of events) {
    const k = `${ev.sec}|${ev.from}|${ev.to}|${ev.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(ev);
  }

  const bySec = new Map();
  for (const ev of deduped) {
    if (!bySec.has(ev.sec)) bySec.set(ev.sec, []);
    bySec.get(ev.sec).push(ev);
  }
  for (const grp of bySec.values()) {
    grp.sort((a, b) => a.from.localeCompare(b.from));
    grp.forEach((ev, i) => {
      ev.stagger = (i - (grp.length - 1) / 2) * 14;
    });
  }

  const rowIdSet = new Set(nodes.map((n) => n.id));
  for (const ev of deduped) {
    rowIdSet.add(matchNodeId(ev.from, nodes));
    rowIdSet.add(matchNodeId(ev.to, nodes));
  }

  const sortedNodes = [...nodes].sort(
    (a, b) =>
      (Number(a.depth) || 0) - (Number(b.depth) || 0) || String(a.id).localeCompare(String(b.id)),
  );
  const extraIds = [...rowIdSet].filter((id) => !nodes.some((n) => n.id === id)).sort((a, b) => a.localeCompare(b));
  const extraNodes = extraIds.map((id) => ({ id, name: id, type: "ref", status: "normal", depth: 99 }));
  const rows = [...sortedNodes, ...extraNodes];

  const rowIndex = new Map(rows.map((n, i) => [n.id, i]));

  const secs = deduped.map((e) => e.sec);
  let tMin = secs.length ? Math.min(...secs) : 0;
  let tMax = secs.length ? Math.max(...secs) : tMin + 60;
  const span0 = Math.max(tMax - tMin, 1);
  const pad = Math.max(2, span0 * 0.1);
  tMin -= pad;
  tMax += pad;

  return { rows, events: deduped, tMin, tMax, rowIndex, match: (raw) => matchNodeId(raw, nodes) };
}

export function traceEventTooltipLines(ev) {
  const lines = [
    `${ev.from} → ${ev.to}`,
    formatSecClock(ev.sec),
    ev.label ? String(ev.label) : "",
    ev.trace_id ? `trace_id: ${ev.trace_id}` : "",
    ev.kind ? `类型: ${ev.kind}` : "",
  ];
  return lines.filter(Boolean);
}

export function computeTraceWaterfallLayouts(prep, geom) {
  const { labelW, plotW, marginR, marginT, rowH, span } = geom;
  const nRows = prep.rows.length;
  const labelXMax = labelW + plotW + marginR - 8;
  const yMin = marginT + 10;
  const yMax = marginT + nRows * rowH - 10;

  const xAt = (sec, stagger) => labelW + ((sec - prep.tMin) / span) * plotW + (stagger || 0);
  const yCenter = (rowId) => {
    const i = prep.rowIndex.get(rowId);
    if (i == null) return marginT + rowH / 2;
    return marginT + i * rowH + rowH / 2;
  };

  const raw = prep.events.map((ev, idx) => {
    const idFrom = prep.match(ev.from);
    const idTo = prep.match(ev.to);
    const y1 = yCenter(idFrom);
    const y2 = yCenter(idTo);
    const x = xAt(ev.sec, ev.stagger || 0);
    const selfCall = idFrom === idTo;
    const bump = selfCall ? 0 : Math.min(34, 14 + Math.abs(y2 - y1) * 0.12);
    const xElbow = x + bump;
    const midY = (y1 + y2) / 2;
    const stubEnd = selfCall ? x : Math.min(xElbow + 12, labelXMax - 28);
    return { ev, idx, idFrom, idTo, x, y1, y2, selfCall, bump, xElbow, midY, stubEnd, stroke: null };
  });

  for (const row of raw) {
    row.stroke = eventStrokeColor(row.ev, geom.chartColors);
  }

  const placed = [];
  const minDist = 22;
  for (const row of raw) {
    const baseX = row.selfCall ? row.x + 12 : row.stubEnd + 10;
    const baseY = row.midY;
    let placedHere = false;
    for (let k = 0; k < 24; k++) {
      const dy = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * (Math.ceil(k / 2) * 11);
      const bx = Math.min(baseX + (k > 4 ? (k % 3) * 8 : 0), labelXMax - 6);
      const by = Math.min(yMax, Math.max(yMin, baseY + dy));
      let ok = true;
      for (const p of placed) {
        if (Math.hypot(bx - p.bx, by - p.by) < minDist) {
          ok = false;
          break;
        }
      }
      if (ok) {
        row.badgeX = bx;
        row.badgeY = by;
        placed.push({ bx, by });
        placedHere = true;
        break;
      }
    }
    if (!placedHere) {
      row.badgeX = Math.min(baseX + placed.length * 5, labelXMax - 6);
      row.badgeY = Math.min(yMax, baseY);
      placed.push({ bx: row.badgeX, by: row.badgeY });
    }
    row.n = row.idx + 1;
  }

  return raw;
}
