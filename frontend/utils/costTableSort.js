/** 解析展示用 Token，如 "42.1M" "18.6K" "1,234"（纯数字按个位） */
export function parseTokensDisplay(s) {
  if (s == null || s === "—") return 0;
  const str = String(s).trim().replace(/,/g, "");
  const m = str.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return 0;
  const u = (m[2] || "").toUpperCase();
  const mult = u === "K" ? 1e3 : u === "M" ? 1e6 : u === "B" ? 1e9 : 1;
  return n * mult;
}

/** "32.8%" */
export function parsePercentDisplay(s) {
  if (s == null || s === "—") return 0;
  const m = String(s).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/** "¥18,200" */
export function parseYuanDisplay(s) {
  if (s == null || s === "—") return 0;
  const digits = String(s).replace(/[^\d.-]/g, "");
  const n = parseFloat(digits);
  return Number.isNaN(n) ? 0 : n;
}

/** "↑ 4%" "↓ 2%" "→ 0%" */
export function parseTrendDisplay(s) {
  if (s == null || s === "—") return 0;
  const str = String(s);
  const m = str.match(/(\d+(?:\.\d+)?)/);
  const n = m ? parseFloat(m[1]) : 0;
  if (/↓/.test(str)) return -Math.abs(n);
  if (/↑/.test(str)) return Math.abs(n);
  return 0;
}

export function parseStatDateValue(isoDate) {
  if (!isoDate) return 0;
  const t = new Date(`${isoDate}T12:00:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function compareValues(va, vb) {
  if (typeof va === "number" && typeof vb === "number") {
    if (va !== vb) return va < vb ? -1 : 1;
    return 0;
  }
  return String(va).localeCompare(String(vb), "zh-CN", { numeric: true });
}

/**
 * @param {object[]} rows
 * @param {string} key
 * @param {'asc'|'desc'} order
 * @param {'agent-list'|'llm'|'llm-summary'} table
 */
export function sortCostRows(rows, key, order, table) {
  if (!key || !rows.length) return rows;
  const get =
    table === "agent-list"
      ? {
          agentId: (r) => r.agentId,
          agent: (r) => r.agent,
          totalCost: (r) => parseTokensDisplay(r.totalCost),
          avgPerTask: (r) => parseTokensDisplay(r.avgPerTask),
          callCount: (r) => Number(r.callCount) || 0,
          successRate: (r) => parsePercentDisplay(r.successRate),
        }[key]
      : table === "llm-summary"
      ? {
          model: (r) => r.model,
          provider: (r) => r.provider ?? "",
          totalTokens: (r) => Number(r.totalTokens) || parseTokensDisplay(r.totalTokensFmt),
          callCount: (r) => Number(r.callCount) || 0,
          errorRate: (r) => parsePercentDisplay(r.errorRate),
        }[key]
      : {
          model: (r) => r.model,
          provider: (r) => r.provider ?? "",
          statDate: (r) => parseStatDateValue(r.statDate),
          tokens: (r) => parseTokensDisplay(r.tokens),
          share: (r) => parsePercentDisplay(r.share),
          inputOut: (r) => r.inputOut ?? "",
        }[key];

  if (!get) return [...rows];

  const arr = [...rows];
  arr.sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const r = compareValues(va, vb);
    return order === "asc" ? r : -r;
  });
  return arr;
}
