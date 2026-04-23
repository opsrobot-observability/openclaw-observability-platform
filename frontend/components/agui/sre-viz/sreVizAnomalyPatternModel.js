/**
 * 异常模式面板 — 数据与样式常量：严重度卡片/徽章 class、图表颜色合并、严重度 key 归一化。
 */

export const ANOMALY_PATTERN_SEV = {
  critical: "border-rose-200/90 bg-gradient-to-br from-rose-50/95 to-white dark:border-rose-900/60 dark:from-rose-950/35 dark:to-gray-950/80",
  high: "border-orange-200/90 bg-gradient-to-br from-orange-50/90 to-white dark:border-orange-900/50 dark:from-orange-950/30 dark:to-gray-950/80",
  medium: "border-amber-200/90 bg-gradient-to-br from-amber-50/80 to-white dark:border-amber-900/45 dark:from-amber-950/25 dark:to-gray-950/80",
  low: "border-gray-200 bg-gradient-to-br from-gray-50/90 to-white dark:border-gray-700 dark:from-gray-900/50 dark:to-gray-950/80",
  info: "border-sky-200/90 bg-gradient-to-br from-sky-50/80 to-white dark:border-sky-900/50 dark:from-sky-950/30 dark:to-gray-950/80",
};

export const ANOMALY_SEV_BADGE = {
  critical: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200",
  high: "bg-orange-100 text-orange-900 dark:bg-orange-950/70 dark:text-orange-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200",
};

export const ANOMALY_SEV_LABEL = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
  info: "信息",
};

export function mergeAnomalyPatternChartColors(chartConfig) {
  const c = chartConfig?.colors || {};
  return {
    pattern: c.pattern ?? "#9C27B0",
    root_cause: c.root_cause ?? "#F44336",
    symptom: c.symptom ?? "#FFC107",
  };
}

export function anomalyPatternSeverityKey(sev) {
  const k = String(sev || "").toLowerCase();
  return k in ANOMALY_PATTERN_SEV ? k : "medium";
}

function asObjectArray(v) {
  if (v == null) return [];
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
}

/**
 * 兼容 LLM 多 schema：patterns、关联字段、根因对象别名。
 *
 * @param {object} raw
 * @returns {object}
 */
export function normalizeAnomalyPatternModel(raw) {
  const m = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if (m.type && String(m.type) !== "anomaly_pattern") return m;

  let patterns = asObjectArray(m.detected_patterns);
  if (!patterns.length) patterns = asObjectArray(m.patterns);
  m.detected_patterns = patterns.map((p) => {
    const id = p.id ?? p.pattern_id ?? p.patternId;
    const next = id != null && p.id == null ? { ...p, id: String(id) } : { ...p };
    if (Array.isArray(next.evidence)) {
      next.evidence = next.evidence.map((ev) =>
        typeof ev === "string" ? ev : ev && typeof ev === "object" ? JSON.stringify(ev) : String(ev),
      );
    }
    return next;
  });

  let rels = asObjectArray(m.pattern_relationship);
  if (!rels.length) rels = asObjectArray(m.pattern_relationships);
  if (!rels.length) rels = asObjectArray(m.relationships);
  m.pattern_relationship = rels;

  let rcc = m.root_cause_chain;
  if ((!rcc || typeof rcc !== "object" || Array.isArray(rcc)) && m.root_cause && typeof m.root_cause === "object" && !Array.isArray(m.root_cause)) {
    rcc = m.root_cause;
  }
  if (rcc && typeof rcc === "object" && !Array.isArray(rcc)) {
    m.root_cause_chain = { ...rcc };
  }

  return m;
}
