/**
 * metrics_trend JSON → 统一时间轴（毫秒）+ 各序列对齐数据，供 SRE 指标趋势图渲染。
 * 兼容：旧 `series[].data`、完整版 `data_points[].timestamp`、简略版 `data_points[].ts` + `time` + `time_window`。
 */

const DEFAULT_PALETTE = ["#2563eb", "#ea580c", "#db2777", "#059669"];

export const DEFAULT_METRICS_TREND_CHART_CONFIG = {
  type: "area",
  show_baseline: true,
  show_threshold: true,
  show_threshold_secondary: true,
  fill_anomaly_area: true,
  colors: {
    normal: "#4CAF50",
    warning: "#FF9800",
    critical: "#F44336",
    baseline: "#2196F3",
    threshold: "#FF9800",
    threshold_secondary: "#F44336",
  },
  interactive: {
    zoom: true,
    pan: true,
    tooltip: true,
    click_to_drilldown: true,
    legend_toggle: true,
    range_select: true,
  },
  legend: {
    show: true,
    position: "bottom",
    layout: "horizontal",
  },
};

function mergeMetricsChartConfig(over) {
  const b = DEFAULT_METRICS_TREND_CHART_CONFIG;
  const o = over && typeof over === "object" && !Array.isArray(over) ? over : {};
  const out = { ...b, ...o };
  out.colors = { ...b.colors, ...(o.colors && typeof o.colors === "object" ? o.colors : {}) };
  out.interactive = { ...b.interactive, ...(o.interactive && typeof o.interactive === "object" ? o.interactive : {}) };
  out.legend = { ...b.legend, ...(o.legend && typeof o.legend === "object" ? o.legend : {}) };
  return out;
}

function findLastIndex(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (pred(arr[i], i)) return i;
  }
  return -1;
}

export function metricsTrendTimeWindowStart(model) {
  const tw = model?.time_window || model?.time_range;
  const start = tw?.start;
  if (start != null && String(start).trim()) return String(start).trim();
  return "";
}

export function metricsDataPointToMs(p, startHint) {
  if (!p || typeof p !== "object") return NaN;
  if (Number.isFinite(Number(p.ts))) return Number(p.ts);
  const iso = p.timestamp != null ? String(p.timestamp).trim() : "";
  if (iso) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }
  const clock = p.time != null ? String(p.time).trim() : "";
  if (clock && startHint) {
    const base = Date.parse(String(startHint));
    if (!Number.isFinite(base)) return NaN;
    const m = clock.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return NaN;
    const d = new Date(base);
    d.setUTCHours(Number(m[1]), Number(m[2]), m[3] != null ? Number(m[3]) : 0, 0);
    return d.getTime();
  }
  return NaN;
}

export function seriesDataPairsMs(s, startHint) {
  if (!s || typeof s !== "object") return [];
  if (Array.isArray(s.data_points) && s.data_points.length) {
    const out = [];
    for (const p of s.data_points) {
      const ms = metricsDataPointToMs(p, startHint);
      if (!Number.isFinite(ms)) continue;
      const v = Number(p?.value);
      if (!Number.isFinite(v)) continue;
      out.push([ms, v]);
    }
    return out;
  }
  if (Array.isArray(s.data)) {
    return s.data
      .filter((pair) => Array.isArray(pair) && pair[0] != null)
      .map((pair) => {
        const sk = String(pair[0]).trim();
        let ms = NaN;
        if (/^\d+$/.test(sk) && sk.length >= 11) ms = Number(sk);
        else ms = Date.parse(sk);
        return [ms, Number(pair[1])];
      })
      .filter(([ms]) => Number.isFinite(ms));
  }
  return [];
}

function mergeSortedTimelineMs(seriesList, startHint) {
  const set = new Set();
  for (const s of seriesList || []) {
    for (const [ms] of seriesDataPairsMs(s, startHint)) {
      if (Number.isFinite(ms)) set.add(ms);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** @deprecated 保留导出；返回 ISO 时间串（少用） */
export function mergeSortedTimes(seriesList, startHint = "") {
  const ms = mergeSortedTimelineMs(seriesList, startHint);
  return ms.map((t) => new Date(t).toISOString());
}

export function alignSeriesToTimelineMs(s, timelineMs, startHint) {
  const m = new Map();
  for (const [ms, val] of seriesDataPairsMs(s, startHint)) {
    if (Number.isFinite(ms) && Number.isFinite(val)) m.set(ms, val);
  }
  let carry = null;
  return timelineMs.map((ms) => {
    if (m.has(ms)) {
      const v = m.get(ms);
      if (Number.isFinite(v)) carry = v;
    }
    const v = carry != null && Number.isFinite(carry) ? carry : 0;
    const d = new Date(ms);
    const xLabel = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
    return { t: ms, v, xLabel };
  });
}

function niceYMax(maxV, baseline, peak, threshold, thresholdSecondary, limit) {
  const hi = Math.max(
    Number.isFinite(maxV) ? maxV : 0,
    Number.isFinite(baseline) ? baseline : 0,
    Number.isFinite(peak) ? peak : 0,
    Number.isFinite(threshold) ? threshold : 0,
    Number.isFinite(thresholdSecondary) ? thresholdSecondary : 0,
    Number.isFinite(limit) ? limit : 0,
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

function bandFillForSeverity(severity, colors) {
  const c = colors || {};
  const s = String(severity || "").toLowerCase();
  if (s === "critical" && c.critical) return hexToRgba(c.critical, 0.16);
  if (s === "warning" && c.warning) return hexToRgba(c.warning, 0.14);
  if ((s === "info" || s === "normal") && c.normal) return hexToRgba(c.normal, 0.1);
  return c.critical != null ? hexToRgba(c.critical, 0.12) : "rgba(239, 68, 68, 0.12)";
}

export function anomalyBandsFromModel(anomalyRanges, timelineMs, colors) {
  if (!anomalyRanges?.length || !timelineMs.length) return [];
  const out = [];
  for (const r of anomalyRanges) {
    const start = String(r.start ?? "").trim();
    const end = String(r.end ?? "").trim();
    if (!start || !end) continue;
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const i0 = timelineMs.findIndex((t) => t >= startMs);
    const i1 = findLastIndex(timelineMs, (t) => t <= endMs);
    if (i0 < 0 || i1 < 0 || i0 > i1) continue;
    const fillStyle = bandFillForSeverity(r.severity, colors);
    const label = r.label != null && String(r.label).trim() ? String(r.label).trim() : String(r.severity || "").trim();
    out.push({ fromIdx: i0, toIdx: i1, fillStyle, label });
  }
  return out;
}

function resolvePeakIndex(s, timelineMs, data, startHint) {
  if (s.peak_time != null) {
    const ms = Date.parse(String(s.peak_time));
    if (Number.isFinite(ms)) {
      const idx = timelineMs.indexOf(ms);
      if (idx >= 0) return idx;
    }
  }
  if (Number.isFinite(s.peak)) {
    const hit = data.findIndex((d) => Math.abs(d.v - s.peak) < 1e-4);
    if (hit >= 0) return hit;
  }
  const pairs = seriesDataPairsMs(s, startHint);
  let maxMs = null;
  let maxV = -Infinity;
  for (const [ms, v] of pairs) {
    if (Number.isFinite(v) && v >= maxV) {
      maxV = v;
      maxMs = ms;
    }
  }
  if (maxMs != null && Number.isFinite(maxV)) {
    const idx = timelineMs.indexOf(maxMs);
    if (idx >= 0) return idx;
  }
  return null;
}

function formatSeriesDisplayName(s, idx) {
  const base = String(
    s.metric_name || s.metric || s.name || s.label || s.series_id || `series-${idx}`,
  ).trim();
  return base || `series-${idx}`;
}

function formatSeriesSubtitle(s) {
  const parts = [];
  const lb = s.labels && typeof s.labels === "object" && !Array.isArray(s.labels) ? s.labels : null;
  if (lb) {
    for (const [k, v] of Object.entries(lb)) {
      if (v == null || String(v).trim() === "") continue;
      parts.push(`${k}=${v}`);
    }
  }
  if (s.service != null && String(s.service).trim()) parts.push(`service=${String(s.service).trim()}`);
  if (s.node != null && String(s.node).trim()) parts.push(`node=${String(s.node).trim()}`);
  return parts.join(" · ");
}

function inferPeakMeta(s, startHint) {
  const stats = s.statistics && typeof s.statistics === "object" ? s.statistics : {};
  const ranges = Array.isArray(s.anomaly_ranges) ? s.anomaly_ranges : [];
  let peak = Number(s.peak);
  let peak_time = s.peak_time != null ? String(s.peak_time).trim() : "";
  const fromRange = ranges.find((r) => r && Number.isFinite(Number(r.peak_value)));
  if (!Number.isFinite(peak) && fromRange) peak = Number(fromRange.peak_value);
  if (!peak_time && fromRange?.peak_time) peak_time = String(fromRange.peak_time).trim();
  if (!Number.isFinite(peak) && Number.isFinite(Number(stats.max))) peak = Number(stats.max);
  if (!peak_time && Number.isFinite(peak)) {
    for (const [ms, v] of seriesDataPairsMs(s, startHint)) {
      if (Number.isFinite(v) && Math.abs(v - peak) < 1e-4 * Math.max(1, Math.abs(peak))) {
        peak_time = new Date(ms).toISOString();
        break;
      }
    }
  }
  return {
    peak: Number.isFinite(peak) ? peak : null,
    peak_time,
  };
}

function formatMetricsSummary(model) {
  const sum = model?.summary;
  if (typeof sum === "string" && sum.trim()) return sum.trim();
  if (!sum || typeof sum !== "object") return "";
  const parts = [];
  if (sum.peak_value != null && sum.peak_unit) parts.push(`峰值 ${sum.peak_value} ${sum.peak_unit}`);
  else if (sum.peak_value != null) parts.push(`峰值 ${sum.peak_value}`);
  if (sum.peak_time) parts.push(`@ ${sum.peak_time}`);
  if (sum.deviation_percentage != null) parts.push(String(sum.deviation_percentage));
  if (sum.anomaly_count != null) parts.push(`异常点 ${sum.anomaly_count}`);
  if (sum.total_anomaly_duration_seconds != null) parts.push(`异常持续约 ${sum.total_anomaly_duration_seconds}s`);
  if (sum.first_anomaly_time) parts.push(`首次异常 ${sum.first_anomaly_time}`);
  if (sum.last_anomaly_time) parts.push(`末次异常 ${sum.last_anomaly_time}`);
  return parts.join(" · ");
}

export function axisLabelForSeries(name, unit, yAxes) {
  const nm = String(name || "").toLowerCase();
  const u = String(unit || "").toLowerCase();
  const isRight =
    u === "s" || u === "seconds" || /\b(latency|延迟|p99|duration)\b/.test(nm);
  const axes = yAxes || [];
  if (axes.length >= 2) {
    return isRight ? String(axes[1]?.name || "右轴") : String(axes[0]?.name || "左轴");
  }
  return isRight ? "右轴" : "左轴";
}

export function prepareMetricsTrendChart(model) {
  const rawIn = Array.isArray(model?.series) ? model.series : [];
  const raw = rawIn.filter((s) => s && typeof s === "object");
  const startHint = metricsTrendTimeWindowStart(model);
  const timelineMs = mergeSortedTimelineMs(raw, startHint);
  const n = timelineMs.length;
  const cc = mergeMetricsChartConfig(model?.chart_config);
  const colors = cc.colors && typeof cc.colors === "object" ? cc.colors : {};
  const fillAnomaly = cc.fill_anomaly_area !== false;
  const showBaseline = cc.show_baseline !== false;
  const showThreshold = cc.show_threshold !== false;
  const showThresholdSecondary = cc.show_threshold_secondary !== false;
  const globalBands = fillAnomaly ? anomalyBandsFromModel(model?.anomaly_ranges, timelineMs, colors) : [];

  const rows = raw
    .map((s, idx) => {
      const name = formatSeriesDisplayName(s, idx);
      const subtitle = formatSeriesSubtitle(s);
      const unit = s.unit != null ? String(s.unit) : "";
      const data = alignSeriesToTimelineMs(s, timelineMs, startHint);
      const maxV = Math.max(...data.map((d) => d.v), 0);
      const baseline = Number(s.baseline);
      const { peak, peak_time } = inferPeakMeta(s, startHint);
      const threshold = Number(s.threshold);
      const thresholdSecondary = Number(s.threshold_secondary);
      const limit = Number(s.limit);
      const yMax = niceYMax(maxV, baseline, peak ?? NaN, threshold, thresholdSecondary, limit);
      const peakIdx = resolvePeakIndex(
        { ...s, peak: peak ?? undefined, peak_time: peak_time || s.peak_time },
        timelineMs,
        data,
        startHint,
      );
      const seriesBands =
        fillAnomaly && Array.isArray(s.anomaly_ranges) && s.anomaly_ranges.length
          ? anomalyBandsFromModel(s.anomaly_ranges, timelineMs, colors)
          : [];
      const horizontalBands = seriesBands.length ? seriesBands : globalBands;

      const refThreshold = [];
      if (showThreshold && Number.isFinite(threshold)) {
        refThreshold.push({
          y: threshold,
          color: colors.threshold ? hexToRgba(colors.threshold, 0.85) : "rgba(249,115,22,0.72)",
          dash: [4, 3],
          lineWidth: 1,
        });
      }
      if (showThresholdSecondary && Number.isFinite(thresholdSecondary)) {
        refThreshold.push({
          y: thresholdSecondary,
          color: colors.threshold_secondary ? hexToRgba(colors.threshold_secondary, 0.75) : "rgba(220,38,38,0.55)",
          dash: [2, 3],
          lineWidth: 1,
        });
      }

      return {
        key: `${idx}-${name}`,
        name,
        subtitle,
        unit,
        data,
        color: pickLineColor(idx, name, colors),
        baseline: Number.isFinite(baseline) ? baseline : null,
        peak,
        peak_time,
        deviation_factor: s.deviation_factor,
        yMax,
        peakIdx,
        horizontalBands,
        refThreshold,
        showBaseline,
      };
    })
    .filter(Boolean);

  const title =
    (model?.title != null && String(model.title).trim()) ||
    (model?.incident_id != null && String(model.incident_id).trim()) ||
    "指标趋势";
  const description =
    model?.description != null && String(model.description).trim() ? String(model.description).trim() : "";
  const summary = formatMetricsSummary(model);
  const tw = model?.time_window || model?.time_range;
  const twLine =
    tw?.start && tw?.end
      ? `${String(tw.start)} — ${String(tw.end)}${tw.timezone ? ` (${tw.timezone})` : ""}`
      : "";

  return {
    title,
    description,
    chartConfig: cc,
    timelineMs,
    n,
    rows,
    horizontalBands: globalBands,
    summary: [summary, twLine].filter(Boolean).join("\n"),
    correlation: Array.isArray(model?.correlation) ? model.correlation : [],
    xAxisName: cc.xAxisName || "时间（UTC）",
  };
}
