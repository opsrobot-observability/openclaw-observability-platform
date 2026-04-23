/**
 * logs_distribution 多 schema → SreVizLogsDistribution 可用视图模型。
 */

export const DEFAULT_LOGS_DISTRIBUTION_CHART_CONFIG = {
  primary_view: "combined",
  show_pie_by_level: true,
  show_bar_by_source: true,
  show_top_errors: true,
  top_n: 5,
  colors: {
    ERROR: "#F44336",
    WARN: "#FF9800",
    INFO: "#4CAF50",
    normal: "#4CAF50",
    warning: "#FF9800",
    critical: "#F44336",
  },
  interactive: {
    zoom: true,
    pan: true,
    tooltip: true,
    click_to_drilldown: true,
    filter_by_level: true,
    filter_by_source: true,
  },
};

function mergeLogsChartConfig(over) {
  const b = DEFAULT_LOGS_DISTRIBUTION_CHART_CONFIG;
  const o = over && typeof over === "object" && !Array.isArray(over) ? over : {};
  const out = { ...b, ...o };
  out.colors = { ...b.colors, ...(o.colors && typeof o.colors === "object" ? o.colors : {}) };
  out.interactive = { ...b.interactive, ...(o.interactive && typeof o.interactive === "object" ? o.interactive : {}) };
  return out;
}

function isNumberRecord(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const vals = Object.values(obj);
  return vals.length > 0 && vals.every((v) => typeof v === "number" && Number.isFinite(v));
}

function normalizeTraceId(t) {
  const s = t == null ? "" : String(t).trim();
  if (!s || s.toLowerCase() === "null") return "";
  return s;
}

function mapTopErrorFull(e, idx) {
  if (!e || typeof e !== "object") return null;
  const rank = Number(e.rank) || idx + 1;
  const time = String(e.first_occurrence || e.last_occurrence || e.time || "").trim();
  const msg = String(e.sample_log || e.msg || e.description || "").trim();
  const name = String(e.error_type || e.name || `pattern-${rank}`).trim();
  return {
    rank,
    level: "ERROR",
    time,
    service: String(e.service || "").trim() || undefined,
    count: e.count != null ? Number(e.count) : undefined,
    trace_id: normalizeTraceId(e.trace_id),
    msg: msg || name,
    pod: e.pod,
  };
}

function mapCriticalMessage(m, idx) {
  if (!m || typeof m !== "object") return null;
  return {
    rank: idx + 1,
    level: String(m.level || "INFO").toUpperCase(),
    time: String(m.ts || m.time || "").trim(),
    service: String(m.service || "").trim() || undefined,
    count: undefined,
    trace_id: normalizeTraceId(m.trace_id),
    msg: String(m.msg || "").trim() || "—",
    pod: m.pod,
  };
}

function pivotHeatmapCells(cells, yAxisValues) {
  if (!Array.isArray(cells) || !cells.length) return null;
  const colSet = new Set();
  const rowSet = new Set(yAxisValues && yAxisValues.length ? yAxisValues : []);
  for (const c of cells) {
    if (c?.time_bucket) colSet.add(String(c.time_bucket));
    if (c?.service) rowSet.add(String(c.service));
  }
  const colNames = [...colSet].sort((a, b) => a.localeCompare(b));
  const rowNames = [...rowSet].filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (!colNames.length || !rowNames.length) return null;
  const idxCol = new Map(colNames.map((c, i) => [c, i]));
  const idxRow = new Map(rowNames.map((r, i) => [r, i]));
  const matrix = rowNames.map(() => colNames.map(() => 0));
  for (const c of cells) {
    const svc = String(c?.service || "").trim();
    const tb = String(c?.time_bucket || "").trim();
    if (!svc || !tb) continue;
    const ri = idxRow.get(svc);
    const ci = idxCol.get(tb);
    if (ri == null || ci == null) continue;
    const v = Number(c.error_count ?? c.count ?? c.density ?? 0) || 0;
    matrix[ri][ci] += v;
  }
  return { rows: rowNames, columns: colNames, data: matrix };
}

function stackedRowsFromCells(cells) {
  if (!Array.isArray(cells) || !cells.length) return [];
  const byBucket = new Map();
  for (const c of cells) {
    const tb = String(c?.time_bucket || "").trim();
    if (!tb) continue;
    if (!byBucket.has(tb)) byBucket.set(tb, { time: tb, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 });
    const row = byBucket.get(tb);
    const lv = String(c.log_level || "").toUpperCase();
    const cnt = Number(c.error_count) || 1;
    if (lv.includes("FATAL")) row.FATAL += cnt;
    else if (lv.includes("ERROR")) row.ERROR += cnt;
    else if (lv.includes("WARN")) row.WARN += cnt;
    else row.INFO += cnt;
  }
  return [...byBucket.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function summaryFromByLevel(by) {
  if (!isNumberRecord(by)) return null;
  return Object.entries(by).map(([k, v]) => ({ key: k, count: v }));
}

/**
 * @param {object} model
 */
export function prepareLogsDistributionView(model) {
  const m = model && typeof model === "object" && !Array.isArray(model) ? model : {};
  const cc = mergeLogsChartConfig(m.chart_config);

  const hasCells = Array.isArray(m.heatmap?.cells) && m.heatmap.cells.length > 0;
  const distObj = m.distribution && typeof m.distribution === "object" && !Array.isArray(m.distribution) ? m.distribution : null;
  const hasNestedDist = Boolean(distObj?.by_level || distObj?.by_source || distObj?.by_type);
  const legacyDist = Array.isArray(m.distribution) ? m.distribution : [];
  const hasCritical = Array.isArray(m.critical_messages);
  const topByLevel = m.by_level && typeof m.by_level === "object" && !Array.isArray(m.by_level);
  const simpleFlat = (hasCritical || (isNumberRecord(m.by_level) && !legacyDist.length && !hasNestedDist)) && !hasCells;

  let heatmap = null;
  if (m.heatmap?.rows?.length && m.heatmap?.columns?.length && Array.isArray(m.heatmap?.data)) {
    heatmap = {
      rows: m.heatmap.rows,
      columns: m.heatmap.columns,
      data: m.heatmap.data,
    };
  } else if (hasCells) {
    const yv = Array.isArray(m.heatmap?.y_axis?.values) ? m.heatmap.y_axis.values.map(String) : [];
    heatmap = pivotHeatmapCells(m.heatmap.cells, yv);
  }

  let distributionRows = legacyDist.filter((r) => r && typeof r === "object");
  if (!distributionRows.length && hasCells) {
    distributionRows = stackedRowsFromCells(m.heatmap.cells);
  }

  let topErrors = [];
  if (Array.isArray(m.top_errors) && m.top_errors.length) {
    topErrors = m.top_errors.map(mapTopErrorFull).filter(Boolean);
  } else if (hasCritical || Array.isArray(m.recovery_messages)) {
    const crit = (m.critical_messages || []).map(mapCriticalMessage).filter(Boolean);
    const rec = (m.recovery_messages || []).map(mapCriticalMessage).filter(Boolean);
    topErrors = [...crit, ...rec];
  }

  const levelSummary =
    summaryFromByLevel(m.by_level) ||
    summaryFromByLevel(m.log_level_distribution) ||
    (distObj?.by_level && typeof distObj.by_level === "object" && !Array.isArray(distObj.by_level)
      ? Object.entries(distObj.by_level).map(([k, v]) => ({
          key: k,
          count: typeof v === "object" && v != null && v.count != null ? Number(v.count) : Number(v) || 0,
        }))
      : null);

  const serviceSummary =
    summaryFromByLevel(m.by_service) ||
    summaryFromByLevel(m.source_distribution) ||
    (distObj?.by_source && typeof distObj.by_source === "object"
      ? Object.entries(distObj.by_source).map(([k, v]) => ({
          key: k,
          count: typeof v === "object" && v != null && v.count != null ? Number(v.count) : Number(v) || 0,
        }))
      : null);

  const description = [m.description, m.quality_note, m.data_quality ? `数据质量: ${m.data_quality}` : ""]
    .filter(Boolean)
    .join("\n");

  return {
    title: String(m.title || m.incident_id || "日志分布").trim() || "日志分布",
    description: String(description || "").trim(),
    chartConfig: cc,
    heatmap,
    distributionRows,
    topErrors,
    levelSummary: levelSummary || [],
    serviceSummary: serviceSummary || [],
    meta: { simpleFlat, hasNestedDist },
  };
}
