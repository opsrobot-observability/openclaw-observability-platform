/**
 * metrics_trend JSON → 统一时间轴 + 各序列对齐数据，供 SRE 指标趋势图渲染。
 */

const DEFAULT_PALETTE = ["#2563eb", "#ea580c", "#db2777", "#059669"];

function findLastIndex(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (pred(arr[i], i)) return i;
  }
  return -1;
}

/** 收集所有序列中出现的时间标签并排序（同日 HH:MM:SS 字典序即可） */
export function mergeSortedTimes(seriesList) {
  const set = new Set();
  for (const s of seriesList || []) {
    for (const pair of s.data || []) {
      if (Array.isArray(pair) && pair[0] != null) {
        const k = String(pair[0]).trim();
        if (k) set.add(k);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** 将单条序列对齐到 timeline：前向填充，缺失点沿用上一采样值 */
export function alignSeriesToTimeline(s, timeline) {
  const m = new Map();
  for (const pair of s.data || []) {
    if (!Array.isArray(pair) || pair[0] == null) continue;
    const k = String(pair[0]).trim();
    const v = Number(pair[1]);
    m.set(k, Number.isFinite(v) ? v : NaN);
  }
  let carry = null;
  return timeline.map((t, i) => {
    if (m.has(t)) {
      const v = m.get(t);
      if (Number.isFinite(v)) carry = v;
    }
    const v = carry != null && Number.isFinite(carry) ? carry : 0;
    return { t: i, v, xLabel: t };
  });
}

function niceYMax(maxV, baseline, peak) {
  const hi = Math.max(
    Number.isFinite(maxV) ? maxV : 0,
    Number.isFinite(baseline) ? baseline : 0,
    Number.isFinite(peak) ? peak : 0,
  );
  if (hi <= 0) return 1;
  if (hi <= 1) return Math.ceil(hi * 20) / 20;
  if (hi <= 10) return Math.ceil(hi * 1.15 * 10) / 10;
  if (hi <= 100) return Math.ceil(hi / 5) * 5 || 100;
  return Math.ceil(hi / 50) * 50;
}

function pickLineColor(idx, name, colors) {
  const c = colors || {};
  const n = String(name || "").toLowerCase();
  if (n.includes("cpu") || n.includes("%")) return c.baseline || DEFAULT_PALETTE[0];
  if (n.includes("thread")) return c.warning || DEFAULT_PALETTE[1];
  if (n.includes("p99") || n.includes("latency") || n.includes("延迟")) return c.critical || DEFAULT_PALETTE[2];
  return DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
}

/** 异常窗口 → 画布 band（按 timeline 下标） */
export function anomalyBandsFromModel(anomalyRanges, timeline, colors) {
  if (!anomalyRanges?.length || !timeline.length) return [];
  const c = colors || {};
  const fill =
    c.critical != null ? hexToRgba(c.critical, 0.14) : "rgba(239, 68, 68, 0.14)";
  const out = [];
  for (const r of anomalyRanges) {
    const start = String(r.start ?? "").trim();
    const end = String(r.end ?? "").trim();
    if (!start || !end) continue;
    const i0 = timeline.findIndex((t) => t >= start);
    const i1 = findLastIndex(timeline, (t) => t <= end);
    if (i0 < 0 || i1 < 0 || i0 > i1) continue;
    out.push({ fromIdx: i0, toIdx: i1, fillStyle: fill, label: r.label });
  }
  return out;
}

function hexToRgba(hex, alpha) {
  const h = String(hex).replace("#", "").trim();
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].every((x) => !Number.isNaN(x))) return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(239, 68, 68, ${alpha})`;
}

function resolvePeakIndex(s, timeline, data) {
  const pt = s.peak_time != null ? String(s.peak_time).trim() : "";
  if (pt) {
    const idx = timeline.indexOf(pt);
    if (idx >= 0) return idx;
  }
  if (Number.isFinite(s.peak)) {
    const hit = data.findIndex((d) => Math.abs(d.v - s.peak) < 1e-4);
    if (hit >= 0) return hit;
  }
  return null;
}

/**
 * @param {object} model metrics_trend payload
 * @returns {{
 *   title: string,
 *   timeline: string[],
 *   n: number,
 *   rows: object[],
 *   horizontalBands: { fromIdx: number, toIdx: number, fillStyle: string }[],
 *   summary?: string,
 *   correlation?: object[],
 *   xAxisName: string,
 * }}
 */
/** 与 chart_config.yAxes 对应：延迟类走「右轴」文案 */
export function axisLabelForSeries(name, unit, yAxes) {
  const nm = String(name || "").toLowerCase();
  const u = String(unit || "").toLowerCase();
  const isRight = u === "s" || /\b(latency|延迟|p99)\b/.test(nm);
  const axes = yAxes || [];
  if (axes.length >= 2) {
    return isRight ? String(axes[1]?.name || "右轴") : String(axes[0]?.name || "左轴");
  }
  return isRight ? "右轴" : "左轴";
}

export function prepareMetricsTrendChart(model) {
  const raw = model?.series || [];
  const timeline = mergeSortedTimes(raw);
  const n = timeline.length;
  const cc = model?.chart_config || {};
  const colors = cc.colors || {};

  const rows = raw.map((s, idx) => {
    const name = s.name || s.label || `series-${idx}`;
    const unit = s.unit != null ? String(s.unit) : "";
    const data = alignSeriesToTimeline(s, timeline);
    const maxV = Math.max(...data.map((d) => d.v), 0);
    const baseline = Number(s.baseline);
    const peak = Number(s.peak);
    const yMax = niceYMax(maxV, baseline, peak);
    const peakIdx = resolvePeakIndex(s, timeline, data);
    return {
      key: `${idx}-${name}`,
      name,
      unit,
      data,
      color: pickLineColor(idx, name, colors),
      baseline: Number.isFinite(baseline) ? baseline : null,
      peak: Number.isFinite(peak) ? peak : null,
      peak_time: s.peak_time != null ? String(s.peak_time) : "",
      deviation_factor: s.deviation_factor,
      yMax,
      peakIdx,
    };
  });

  const horizontalBands = anomalyBandsFromModel(model?.anomaly_ranges, timeline, colors);

  return {
    title: model?.title || "指标趋势",
    timeline,
    n,
    rows,
    horizontalBands,
    summary: typeof model?.summary === "string" ? model.summary : "",
    correlation: Array.isArray(model?.correlation) ? model.correlation : [],
    xAxisName: cc.xAxisName || "时间",
  };
}
