/**
 * 统一日志搜索：dataSource = agent_sessions | audit_logs | gateway_logs | all
 */
import { queryAgentSessionsLogsSearch } from "./log-search-query.mjs";
import { queryAuditLogsSearch } from "./audit-logs-search-query.mjs";
import { queryGatewayLogsSearch } from "./gateway-logs-query.mjs";
import {
  normalizeAgentSessionsRow,
  normalizeAuditRow,
  normalizeGatewayRow,
  sortUnifiedByTime,
} from "./log-unified-model.mjs";

const MAX_MERGE_FETCH = 2000;

/**
 * 兼容表名/简称：agent_session_logs、audit、gateway 等
 * @param {unknown} raw
 */
function normalizeDataSource(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (
    s === "agent_sessions" ||
    s === "agent_session_logs" ||
    s === "agent_sessions_logs" ||
    s === "agentsessions"
  ) {
    return "agent_sessions";
  }
  if (s === "audit" || s === "audit_log" || s === "audit_logs") return "audit_logs";
  if (s === "gateway" || s === "gateway_log" || s === "gateway_logs") return "gateway_logs";
  if (s === "all" || s === "*" || s === "any") return "all";
  return String(raw ?? "").trim() || "agent_sessions";
}

/**
 * @param {string} logCategory
 */
function pickSourcesForCategory(logCategory) {
  const c = String(logCategory || "").toLowerCase();
  if (c === "gateway") return { agent: false, audit: false, gateway: true };
  if (c === "agent") return { agent: true, audit: false, gateway: false };
  if (c === "skill" || c === "channel") return { agent: true, audit: false, gateway: false };
  return { agent: true, audit: true, gateway: true };
}

/**
 * @param {Record<string, unknown>} raw
 */
function buildShared(raw) {
  const startIso = String(raw.startIso ?? "").trim();
  const endIso = String(raw.endIso ?? "").trim();
  const q = String(raw.q ?? "").trim();
  const sessionId = String(raw.sessionId ?? "").trim();
  const traceId = String(raw.traceId ?? "").trim();
  const requestId = String(raw.requestId ?? "").trim();
  const levels = String(raw.levels ?? "").trim();
  const logCategory = String(raw.logCategory ?? "").trim();
  const channel = String(raw.channel ?? "").trim();
  const sortKey = String(raw.sortKey ?? "time").trim();
  const sortDir = String(raw.sortDir ?? "desc").trim();
  const limit = Math.min(Math.max(Number(raw.limit) || 100, 1), 500);
  const offset = Math.min(Math.max(Number(raw.offset) || 0, 0), 5000);
  const logTable = String(raw.logTable ?? "").trim();
  const agentName = String(raw.agentName ?? "").trim();
  const dataSource = normalizeDataSource(raw.dataSource ?? "agent_sessions");
  const error = /** @type {"all"|"yes"|"no"} */ (raw.error === "yes" || raw.error === "no" ? raw.error : "all");
  const fieldFilterKey = String(raw.fieldFilterKey ?? "").trim();
  const fieldFilterValue =
    raw.fieldFilterValue === undefined || raw.fieldFilterValue === null ? "" : String(raw.fieldFilterValue);

  return {
    startIso,
    endIso,
    q,
    sessionId,
    traceId,
    requestId,
    levels,
    logCategory,
    channel,
    sortKey,
    sortDir,
    limit,
    offset,
    logTable,
    agentName,
    dataSource,
    error,
    fieldFilterKey,
    fieldFilterValue,
  };
}

/**
 * @param {Record<string, unknown>} raw
 */
export async function queryUnifiedLogsSearch(raw) {
  const p = buildShared(raw);
  if (!p.startIso || !p.endIso) {
    throw new Error("missing startIso or endIso");
  }

  const agentParams = {
    startIso: p.startIso,
    endIso: p.endIso,
    q: p.q,
    type: String(raw.type ?? "").trim(),
    provider: String(raw.provider ?? "").trim(),
    model: String(raw.model ?? "").trim(),
    channel: p.channel,
    agentName: p.agentName,
    sessionId: p.sessionId,
    traceId: p.traceId,
    requestId: p.requestId,
    levels: p.levels,
    logCategory: p.logCategory,
    sortKey: p.sortKey,
    sortDir: p.sortDir,
    error: p.error,
    limit: p.limit,
    offset: p.offset,
    logTable: p.logTable,
    fieldFilterKey: p.fieldFilterKey,
    fieldFilterValue: p.fieldFilterValue,
    fieldFilters: raw.fieldFilters,
  };

  const auditParams = {
    startIso: p.startIso,
    endIso: p.endIso,
    q: p.q,
    sessionId: p.sessionId,
    traceId: p.traceId,
    requestId: p.requestId,
    sortKey: p.sortKey,
    sortDir: p.sortDir,
    limit: p.limit,
    offset: p.offset,
  };

  const gatewayParams = {
    startIso: p.startIso,
    endIso: p.endIso,
    q: p.q,
    levels: p.levels,
    module: String(raw.module ?? "").trim(),
    sessionId: p.sessionId,
    traceId: p.traceId,
    requestId: p.requestId,
    sortKey: p.sortKey,
    sortDir: p.sortDir,
    limit: p.limit,
    offset: p.offset,
    fieldFilterKey: p.fieldFilterKey,
    fieldFilterValue: p.fieldFilterValue,
    fieldFilters: raw.fieldFilters,
  };

  if (p.dataSource === "agent_sessions") {
    const r = await queryAgentSessionsLogsSearch(agentParams);
    const unifiedRows = (r.rows || []).map((row) => normalizeAgentSessionsRow(row));
    return {
      dataSource: "agent_sessions",
      total: r.total,
      limit: r.limit,
      offset: r.offset,
      unifiedRows,
      meta: { agent: r },
    };
  }

  if (p.dataSource === "audit_logs") {
    const r = await queryAuditLogsSearch(auditParams);
    const unifiedRows = (r.rows || []).map((row) => normalizeAuditRow(row));
    return {
      dataSource: "audit_logs",
      total: r.total,
      limit: r.limit,
      offset: r.offset,
      unifiedRows,
      meta: { audit: r },
    };
  }

  if (p.dataSource === "gateway_logs") {
    const r = await queryGatewayLogsSearch(gatewayParams);
    const unifiedRows = (r.rows || []).map((row) => normalizeGatewayRow(row));
    return {
      dataSource: "gateway_logs",
      total: r.total,
      limit: r.limit,
      offset: r.offset,
      unifiedRows,
      meta: { gateway: r },
    };
  }

  if (p.dataSource === "all") {
    const src = pickSourcesForCategory(p.logCategory);
    const fetchCap = Math.min(p.offset + p.limit, MAX_MERGE_FETCH);
    const tasks = [];
    if (src.agent) {
      tasks.push(
        queryAgentSessionsLogsSearch({
          ...agentParams,
          limit: fetchCap,
          offset: 0,
        }).then((r) => ({ kind: "agent", r }))
      );
    }
    if (src.audit) {
      tasks.push(
        queryAuditLogsSearch({
          ...auditParams,
          limit: fetchCap,
          offset: 0,
        }).then((r) => ({ kind: "audit", r }))
      );
    }
    if (src.gateway) {
      tasks.push(
        queryGatewayLogsSearch({
          ...gatewayParams,
          limit: fetchCap,
          offset: 0,
        }).then((r) => ({ kind: "gateway", r }))
      );
    }

    const results = await Promise.all(tasks);
    /** @type {ReturnType<normalizeAgentSessionsRow>[]} */
    const merged = [];
    let total = 0;
    const meta = {};
    for (const x of results) {
      if (x.kind === "agent") {
        meta.agent = x.r;
        total += x.r.total || 0;
        for (const row of x.r.rows || []) merged.push(normalizeAgentSessionsRow(row));
      } else if (x.kind === "audit") {
        meta.audit = x.r;
        total += x.r.total || 0;
        for (const row of x.r.rows || []) merged.push(normalizeAuditRow(row));
      } else if (x.kind === "gateway") {
        meta.gateway = x.r;
        total += x.r.total || 0;
        for (const row of x.r.rows || []) merged.push(normalizeGatewayRow(row));
      }
    }

    const sorted = sortUnifiedByTime(merged, p.sortDir.toLowerCase() === "asc" ? "asc" : "desc");
    const unifiedRows = sorted.slice(p.offset, p.offset + p.limit);

    return {
      dataSource: "all",
      total,
      limit: p.limit,
      offset: p.offset,
      unifiedRows,
      meta,
      mergeNote:
        "all：各源各取至多 offset+limit 条合并后分页，超大 offset 可能漏数；建议收窄时间或单数据源。",
    };
  }

  throw new Error(`unknown dataSource: ${p.dataSource}`);
}
