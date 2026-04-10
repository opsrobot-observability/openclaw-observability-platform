/**
 * 驾驶舱专用：对 Doris 重查询做进程内短缓存与 in-flight 合并。
 * 不修改 agentSessionsQuery / audit-dashboard-query / cost-overview-query 的实现。
 *
 * 环境变量（均为可选，毫秒；0 或 false 关闭对应缓存）：
 * - MONITOR_AGENT_SESSIONS_CACHE_MS  默认 45000
 * - MONITOR_AUDIT_METRICS_CACHE_MS     默认 45000
 * - MONITOR_COST_SNAPSHOT_CACHE_MS     默认 45000
 */
import { queryAgentSessionsRawWithLogTokens } from "../agentSessionsQuery.mjs";
import { queryAuditDashboardMetrics } from "../security-audit/audit-dashboard-query.mjs";
import { queryCostOverviewSnapshot } from "../cost-analysis/cost-overview-query.mjs";

const DEFAULT_TTL_MS = 45_000;

function ttlMs(envKey, fallback = DEFAULT_TTL_MS) {
  const raw = process.env[envKey];
  if (raw === "0" || raw === "false") return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return fallback;
}

let _agentRows = { rows: /** @type {object[]|null} */ (null), expiresAt: 0 };
let _agentInflight = /** @type {Promise<object[]>|null} */ (null);

/**
 * 缓存版全量 agent_sessions + logs 聚合（仅大屏与会话子接口使用）
 */
export async function monitorCachedAgentSessionsWithLogTokens() {
  const ttl = ttlMs("MONITOR_AGENT_SESSIONS_CACHE_MS", DEFAULT_TTL_MS);
  const now = Date.now();
  if (ttl > 0 && _agentRows.rows && now < _agentRows.expiresAt) {
    return _agentRows.rows;
  }
  if (_agentInflight) return _agentInflight;

  _agentInflight = (async () => {
    try {
      const rows = await queryAgentSessionsRawWithLogTokens();
      if (ttl > 0) {
        _agentRows = { rows, expiresAt: Date.now() + ttl };
      }
      return rows;
    } finally {
      _agentInflight = null;
    }
  })();

  return _agentInflight;
}

let _audit = { data: /** @type {any} */ (null), expiresAt: 0 };
let _auditInflight = /** @type {Promise<any>|null} */ (null);

export async function monitorCachedAuditDashboardMetrics() {
  const ttl = ttlMs("MONITOR_AUDIT_METRICS_CACHE_MS", DEFAULT_TTL_MS);
  const now = Date.now();
  if (ttl > 0 && _audit.data && now < _audit.expiresAt) {
    return _audit.data;
  }
  if (_auditInflight) return _auditInflight;

  _auditInflight = (async () => {
    try {
      const data = await queryAuditDashboardMetrics();
      if (ttl > 0) {
        _audit = { data, expiresAt: Date.now() + ttl };
      }
      return data;
    } finally {
      _auditInflight = null;
    }
  })();

  return _auditInflight;
}

let _cost = { key: "", data: /** @type {any} */ (null), expiresAt: 0 };
/** @type {Map<string, Promise<any>>} */
const _costInflight = new Map();

/**
 * @param {{ trendDays?: number }} [opts]
 */
export async function monitorCachedCostOverviewSnapshot(opts = {}) {
  const rawDays = Number(opts.trendDays);
  const trendWindowDays = [7, 14, 30].includes(rawDays) ? rawDays : 14;
  const cacheKey = String(trendWindowDays);
  const ttl = ttlMs("MONITOR_COST_SNAPSHOT_CACHE_MS", DEFAULT_TTL_MS);
  const now = Date.now();
  if (ttl > 0 && _cost.data && _cost.key === cacheKey && now < _cost.expiresAt) {
    return _cost.data;
  }
  const pending = _costInflight.get(cacheKey);
  if (pending) return pending;

  const p = (async () => {
    try {
      const data = await queryCostOverviewSnapshot(opts);
      if (ttl > 0) {
        _cost = { key: cacheKey, data, expiresAt: Date.now() + ttl };
      }
      return data;
    } finally {
      _costInflight.delete(cacheKey);
    }
  })();
  _costInflight.set(cacheKey, p);
  return p;
}
