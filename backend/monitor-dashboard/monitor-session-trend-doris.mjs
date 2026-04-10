/**
 * 监控大屏专用：按本地日历日统计 agent_sessions 会话量趋势（与审计 7 日趋势同一 SQL 口径）。
 * 不修改 security-audit/audit-dashboard-query.mjs，供 monitor-session-query 独立调用。
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

const TREND_SESSIONS_BY_DAY_SQL = `
SELECT
  DATE(FROM_UNIXTIME(FLOOR(started_at / 1000))) AS d,
  COUNT(*) AS cnt
FROM agent_sessions
WHERE started_at >= ? AND started_at <= ?
GROUP BY d
ORDER BY d
`;

function startOfLocalDayMs(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function toDayStrFromMs(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * @param {object[]} rows
 * @param {string} keyField
 * @param {string} valField
 */
function rowsToDayMap(rows, keyField, valField) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const r of rows) {
    const k = r[keyField];
    if (k == null) continue;
    let ks;
    if (k instanceof Date) {
      ks = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, "0")}-${String(k.getDate()).padStart(2, "0")}`;
    } else {
      ks = String(k);
      if (ks.includes("T")) ks = ks.slice(0, 10);
      if (ks.length >= 10) ks = ks.slice(0, 10);
    }
    m[ks] = Number(r[valField]) || 0;
  }
  return m;
}

/**
 * 连续日历日（含首尾），缺日补 0
 * @param {string} startDayStr YYYY-MM-DD
 * @param {string} endDayStr YYYY-MM-DD
 * @param {Record<string, number>} map
 */
function fillCalendarDays(startDayStr, endDayStr, map) {
  const out = [];
  const start = new Date(startDayStr + "T00:00:00");
  const end = new Date(endDayStr + "T00:00:00");
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, value: map[key] ?? 0 });
  }
  return out;
}

let _cache = { key: "", rows: /** @type {{ day: string; label: string; value: number }[] | null} */ (null), expiresAt: 0 };
let _inflight = /** @type {Promise<{ day: string; label: string; value: number }[]> | null} */ (null);

function trendCacheTtlMs() {
  const raw = process.env.MONITOR_SESSION_TREND_CACHE_MS;
  if (raw === "0" || raw === "false") return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return 45_000;
}

/**
 * 大屏会话折线图：按 started_at 落在「含今日共 calendarDays 个本地日历日」内按日计数。
 * @param {{ calendarDays?: number; nowMs?: number }} [opts]
 * @returns {Promise<{ day: string; label: string; value: number }[]>}
 */
export async function queryMonitorSessionCountTrend(opts = {}) {
  const nowMs =
    opts.nowMs != null && Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const calendarDays = Math.min(90, Math.max(1, Math.floor(Number(opts.calendarDays) || 30)));
  const cacheKey = String(calendarDays);
  const ttl = trendCacheTtlMs();
  const now = Date.now();
  if (ttl > 0 && _cache.rows && _cache.key === cacheKey && now < _cache.expiresAt) {
    return _cache.rows;
  }
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const todayStart = startOfLocalDayMs(new Date(nowMs));
      const windowStartMs = todayStart - (calendarDays - 1) * 24 * 60 * 60 * 1000;
      const startStr = toDayStrFromMs(windowStartMs);
      const endStr = toDayStrFromMs(nowMs);

      const conn = await mysql.createConnection({
        ...getDorisConfig(),
        connectTimeout: 30000,
      });
      try {
        const [sessRows] = await conn.query(TREND_SESSIONS_BY_DAY_SQL, [windowStartMs, nowMs]);
        const sessMap = rowsToDayMap(/** @type {any[]} */ (sessRows), "d", "cnt");
        const filled = fillCalendarDays(startStr, endStr, sessMap);
        const rows = filled.map((x) => ({
          day: x.day,
          label: x.day.slice(5, 10),
          value: x.value,
        }));
        if (ttl > 0) {
          _cache = { key: cacheKey, rows, expiresAt: Date.now() + ttl };
        }
        return rows;
      } finally {
        await conn.end();
      }
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}
