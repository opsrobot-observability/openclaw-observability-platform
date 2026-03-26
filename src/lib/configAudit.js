/** ConfigAuditEvent 解析、筛选与风险规则（与 datamodel/config_event.md 对齐） */

/** 敏感路径片段（命中则视为需重点审计） */
const SENSITIVE_SUBSTR = ["credentials", "secrets", "auth", "passwd", "token"];

export function parseConfigAuditJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function stableRowId(e) {
  if (e._rowKey != null) return e._rowKey;
  return `${e.ts}::${e.pid}::${e.nextHash}`;
}

/** 主配置文件（openclaw.json）— 变更频繁，用于「关键文件」类统计与高亮，不单独标红整行 */
export function isMainOpenclawConfig(configPath) {
  if (!configPath) return false;
  return /openclaw\.json$/i.test(configPath.replace(/\\/g, "/"));
}

export function isSensitiveConfigPath(configPath) {
  if (!configPath) return false;
  const p = configPath.replace(/\\/g, "/").toLowerCase();
  return SENSITIVE_SUBSTR.some((k) => p.includes(k));
}

export function isGatewayModeChanged(e) {
  const a = e.gatewayModeBefore ?? null;
  const b = e.gatewayModeAfter ?? null;
  return a !== b;
}

/**
 * 行级风险色：红 = 可疑或敏感路径；黄 = 网关模式变更或主配置 openclaw.json；绿 = 其它
 */
export function riskLevel(e) {
  const sus = Array.isArray(e.suspicious) && e.suspicious.length > 0;
  if (sus || isSensitiveConfigPath(e.configPath)) return "red";
  if (isGatewayModeChanged(e) || isMainOpenclawConfig(e.configPath)) return "yellow";
  return "green";
}

/** 大盘「高风险」：可疑 / 网关模式变更 / 主配置或敏感路径变更 */
export function isHighRisk(e) {
  const sus = Array.isArray(e.suspicious) && e.suspicious.length > 0;
  return sus || isGatewayModeChanged(e) || isMainOpenclawConfig(e.configPath) || isSensitiveConfigPath(e.configPath);
}

export function byteDelta(e) {
  const a = e.previousBytes;
  const b = e.nextBytes;
  if (a == null || b == null) return null;
  return b - a;
}

export function shortHash(hex, n = 8) {
  if (!hex || typeof hex !== "string") return "—";
  return hex.length <= n * 2 ? hex : `${hex.slice(0, n)}…`;
}

export function hashChanged(e) {
  return e.previousHash !== e.nextHash;
}

/** 时间预设：返回 [startMs, endMs]，end 为 now */
export function rangeFromPreset(preset, now = Date.now()) {
  const end = now;
  let start = end;
  switch (preset) {
    case "10m":
      start = end - 10 * 60 * 1000;
      break;
    case "1h":
      start = end - 60 * 60 * 1000;
      break;
    case "1d":
    case "24h":
      start = end - 24 * 60 * 60 * 1000;
      break;
    case "7d":
      start = end - 7 * 24 * 60 * 60 * 1000;
      break;
    case "30d":
      start = end - 30 * 24 * 60 * 60 * 1000;
      break;
    case "custom":
    default:
      return null;
  }
  return [start, end];
}

export function parseTsMs(ts) {
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * @param {object[]} events
 * @param {object} f
 */
export function filterConfigAuditEvents(events, f) {
  let list = [...events];

  if (f.timePreset && f.timePreset !== "custom" && f.timePreset !== "all") {
    const r = rangeFromPreset(f.timePreset);
    if (r) {
      const [a, b] = r;
      list = list.filter((e) => {
        const t = parseTsMs(e.ts);
        return t >= a && t <= b;
      });
    }
  } else if (f.customStart && f.customEnd) {
    const a = new Date(f.customStart).getTime();
    const b = new Date(f.customEnd).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      list = list.filter((e) => {
        const t = parseTsMs(e.ts);
        return t >= a && t <= b;
      });
    }
  }

  if (f.source && f.source !== "全部") {
    list = list.filter((e) => e.source === f.source);
  }
  if (f.event && f.event !== "全部") {
    list = list.filter((e) => e.event === f.event);
  }
  if (f.configPathQ && f.configPathQ.trim()) {
    const q = f.configPathQ.trim().toLowerCase();
    list = list.filter((e) => (e.configPath || "").toLowerCase().includes(q));
  }
  if (f.pid && String(f.pid).trim() !== "") {
    const p = Number(f.pid);
    if (!Number.isNaN(p)) list = list.filter((e) => e.pid === p);
  }
  if (f.result && f.result !== "全部") {
    list = list.filter((e) => e.result === f.result);
  }
  if (f.suspicious === "可疑") {
    list = list.filter((e) => Array.isArray(e.suspicious) && e.suspicious.length > 0);
  } else if (f.suspicious === "正常") {
    list = list.filter((e) => !e.suspicious || e.suspicious.length === 0);
  }

  if (f.gatewayChange === "变更") {
    list = list.filter((e) => isGatewayModeChanged(e));
  } else if (f.gatewayChange === "未变更") {
    list = list.filter((e) => !isGatewayModeChanged(e));
  } else if (f.gatewayChange === "空") {
    list = list.filter((e) => e.gatewayModeBefore == null && e.gatewayModeAfter == null);
  }

  return list;
}

export function sortEvents(list, sortKey, sortDir) {
  if (!sortKey) return list;
  const dir = sortDir === "asc" ? 1 : -1;
  const cmp = (a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (sortKey === "ts") {
      va = parseTsMs(va);
      vb = parseTsMs(vb);
    }
    if (sortKey === "argv") {
      va = Array.isArray(va) ? JSON.stringify(va) : "";
      vb = Array.isArray(vb) ? JSON.stringify(vb) : "";
    }
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dir;
    }
    if (va == null) return 1 * dir;
    if (vb == null) return -1 * dir;
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  };
  return [...list].sort(cmp);
}

export function countToday(events, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const start = new Date(y, m, d).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = parseTsMs(e.ts);
    return t >= start && t < end;
  }).length;
}

export function countHighRiskInRange(events, startMs, endMs) {
  return events.filter((e) => {
    const t = parseTsMs(e.ts);
    if (t < startMs || t > endMs) return false;
    return isHighRisk(e);
  }).length;
}

/** 按小时桶（24h） */
export function trendBuckets24h(events, now = Date.now()) {
  const buckets = [];
  for (let i = 23; i >= 0; i--) {
    const hourEnd = now - i * 60 * 60 * 1000;
    const hourStart = hourEnd - 60 * 60 * 1000;
    const label = new Date(hourStart).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const count = events.filter((e) => {
      const t = parseTsMs(e.ts);
      return t >= hourStart && t < hourEnd;
    }).length;
    buckets.push({ label, count });
  }
  return buckets;
}

/** 按天桶（7d） */
export function trendBuckets7d(events, now = Date.now()) {
  const buckets = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const start = day.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const label = `${day.getMonth() + 1}/${day.getDate()}`;
    const count = events.filter((e) => {
      const t = parseTsMs(e.ts);
      return t >= start && t < end;
    }).length;
    buckets.push({ label, count });
  }
  return buckets;
}

/** 按天桶（30d，与 7d 同一日历日对齐方式） */
export function trendBuckets30d(events, now = Date.now()) {
  const buckets = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const start = day.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const label = `${day.getMonth() + 1}/${day.getDate()}`;
    const count = events.filter((e) => {
      const t = parseTsMs(e.ts);
      return t >= start && t < end;
    }).length;
    buckets.push({ label, count });
  }
  return buckets;
}

/** 自定义起止（按日历日），含首尾自然日 */
export function trendBucketsRange(events, startMs, endMs) {
  const buckets = [];
  const cur = new Date(startMs);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(endMs);
  endDay.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cur.getTime() <= endDay.getTime() && guard++ < 62) {
    const start = new Date(cur).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const label = `${cur.getMonth() + 1}/${cur.getDate()}`;
    const count = events.filter((e) => {
      const t = parseTsMs(e.ts);
      return t >= start && t < end;
    }).length;
    buckets.push({ label, count });
    cur.setDate(cur.getDate() + 1);
  }
  return buckets;
}

export function topConfigPaths(events, topN = 5) {
  const map = new Map();
  for (const e of events) {
    const p = e.configPath || "—";
    map.set(p, (map.get(p) || 0) + 1);
  }
  return [...map.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function resultDistribution(events) {
  const map = new Map();
  for (const e of events) {
    const r = e.result || "—";
    map.set(r, (map.get(r) || 0) + 1);
  }
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  return [...map.entries()].map(([name, value], i) => ({
    name,
    value,
    color: colors[i % colors.length],
  }));
}

export function eventsToCsvRows(events) {
  const headers = [
    "ts",
    "source",
    "event",
    "configPath",
    "pid",
    "previousHash",
    "nextHash",
    "previousBytes",
    "nextBytes",
    "gatewayModeBefore",
    "gatewayModeAfter",
    "suspicious",
    "result",
  ];
  const lines = [headers.join(",")];
  for (const e of events) {
    const row = headers.map((h) => {
      let v = e[h];
      if (h === "suspicious" && Array.isArray(v)) v = JSON.stringify(v);
      if (v == null) v = "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    });
    lines.push(row.join(","));
  }
  return "\uFEFF" + lines.join("\n");
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openPrintPdf(title, htmlBody) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:system-ui,sans-serif;font-size:12px;padding:16px;}
    table{border-collapse:collapse;width:100%;}
    th,td{border:1px solid #ccc;padding:6px;text-align:left;}
    th{background:#f3f4f6;}
    h1{font-size:16px;}
  </style></head><body><h1>${title}</h1>${htmlBody}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
