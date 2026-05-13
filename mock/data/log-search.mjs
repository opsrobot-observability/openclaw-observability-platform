/**
 * Mock: GET /api/agent-sessions-logs-search
 * 对齐 backend/log-search/log-search-query.mjs → queryAgentSessionsLogsSearch()
 */
import {
  normalizeAgentSessionsRow,
  normalizeAuditRow,
  normalizeGatewayRow,
  sortUnifiedByTime,
} from "../../backend/log-search/log-unified-model.mjs";

/** Agent 会话 mock 条数（分页演示） */
const MOCK_AGENT_LOG_ROWS = 300;
/** 配置变更（audit_logs）mock 条数 */
const MOCK_AUDIT_LOG_ROWS = 300;
/** 网关（gateway_logs）mock 条数 */
const MOCK_GATEWAY_LOG_ROWS = 300;

const MOCK_TYPES = ["message", "session", "model_change", "custom"];
const MOCK_PROVIDERS = ["openai", "anthropic", "minimax-cn", "deepseek", "alibaba"];
const MOCK_CHANNELS = ["web", "internal", "api", "feishu", "dingtalk"];
const MOCK_AGENTS = ["客服助手·小智", "运维巡检员", "数据分析员", "HR 面试助手", "合规审查官"];
const MOCK_MODELS = ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet", "MiniMax-M2.5", "deepseek-r1", "qwen-turbo"];
const MOCK_ROLES = ["assistant", "user", "toolResult", "system"];
const MOCK_TOOLS = ["metrics.query", "warehouse.run_sql", "docs.search", "calendar.create", ""];

/** @type {Record<string, unknown>[] | null} */
let cachedMockAgentRows = null;
/** @type {Record<string, unknown>[] | null} */
let cachedMockAuditRows = null;
/** @type {Record<string, unknown>[] | null} */
let cachedMockGatewayRows = null;

/**
 * 生成固定条数的会话日志样例（时间分布在约 7 天内，便于时间轴 / 分页联调）
 * @param {number} n
 */
function buildMockAgentSessionRows(n) {
  const out = [];
  const spanMs = 7 * 24 * 3600_000;
  for (let i = 0; i < n; i++) {
    const frac = n <= 1 ? 0 : i / (n - 1);
    const t = Date.now() - Math.floor(frac * spanMs) - (i % 41) * 60_000 - (i % 3) * 1000;
    const type = MOCK_TYPES[i % MOCK_TYPES.length];
    const provider = MOCK_PROVIDERS[i % MOCK_PROVIDERS.length];
    const model = MOCK_MODELS[i % MOCK_MODELS.length];
    const agent = MOCK_AGENTS[i % MOCK_AGENTS.length];
    const channel = MOCK_CHANNELS[i % MOCK_CHANNELS.length];
    const role = MOCK_ROLES[i % MOCK_ROLES.length];
    const isErr = i % 9 === 0 || i % 13 === 0 ? 1 : 0;
    const sessionId = `sess_mock_${String(i).padStart(4, "0")}${(((i * 7919) % 4096) + 4096).toString(16).slice(1, 5)}`;
    const messageId = `msg_mock_${String(i + 1).padStart(5, "0")}`;
    const tool = role === "toolResult" ? MOCK_TOOLS[i % MOCK_TOOLS.length] : "";
    const tracePayload =
      i % 4 === 0
        ? JSON.stringify({
            trace_id: `tr_mock_${((i * 131) % 999999).toString(36)}`,
            request_id: i % 6 === 0 ? `req_mock_${i}` : undefined,
          })
        : null;
    out.push({
      message_id: messageId,
      session_id: sessionId,
      timestamp: new Date(t).toISOString(),
      type,
      version: "1.0",
      provider,
      model_id: model,
      message_model: model,
      message_role: role,
      message_tool_name: tool,
      message_is_error: isErr,
      parent_id: "",
      log_attributes: tracePayload,
      agent_name: agent,
      channel,
    });
  }
  out.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return out;
}

function getMockAgentSessionRowsAll() {
  if (!cachedMockAgentRows) cachedMockAgentRows = buildMockAgentSessionRows(MOCK_AGENT_LOG_ROWS);
  return cachedMockAgentRows;
}

function getMockAuditRowsAll() {
  if (!cachedMockAuditRows) cachedMockAuditRows = buildMockAuditRows(MOCK_AUDIT_LOG_ROWS);
  return cachedMockAuditRows;
}

function getMockGatewayRowsAll() {
  if (!cachedMockGatewayRows) cachedMockGatewayRows = buildMockGatewayRows(MOCK_GATEWAY_LOG_ROWS);
  return cachedMockGatewayRows;
}

/** 最近 24 小时内按小时桶聚合（与样例时间戳一致，非随机） */
function buildLast24hTrendFromRows(rows) {
  const now = Date.now();
  const buckets = [];
  for (let h = 23; h >= 0; h -= 1) {
    const start = now - (h + 1) * 3600_000;
    const end = now - h * 3600_000;
    const d = new Date(end);
    const bucket = d.toISOString().slice(0, 13);
    let count = 0;
    for (const r of rows) {
      const t = Date.parse(String(r.timestamp));
      if (Number.isFinite(t) && t >= start && t < end) count += 1;
    }
    buckets.push({ bucket, count });
  }
  return buckets;
}

/** @param {number} n */
function buildMockAuditRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = Date.now() - i * 195_000 - (i % 11) * 8000;
    rows.push({
      id: 90000 + i,
      event_time: new Date(t).toISOString(),
      log_attributes: JSON.stringify({
        source: "config",
        event: i % 5 === 0 ? "reload" : "patch",
        level: i % 7 === 0 ? "warn" : "info",
        session_id: `sess_audit_${i % 24}`,
        trace_id: `tr_audit_${(i * 17) % 900}`,
        actor: `admin_${i % 5}`,
      }),
    });
  }
  rows.sort((a, b) => String(b.event_time).localeCompare(String(a.event_time)));
  return rows;
}

/** @param {number} n */
function buildMockGatewayRows(n) {
  const modules = ["http", "router", "ws", "grpc"];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = Date.now() - i * 125_000 - (i % 9) * 6000;
    rows.push({
      id: 80000 + i,
      event_time: new Date(t).toISOString(),
      module: modules[i % modules.length],
      level: i % 10 === 0 ? "warn" : "info",
      log_attributes: JSON.stringify({
        message: `GET /v1/chat mock-${i}`,
        session_id: i % 4 === 0 ? `sess_gw_${i % 35}` : "",
        trace_id: `tr_gw_${(i * 13) % 1200}`,
      }),
    });
  }
  rows.sort((a, b) => String(b.event_time).localeCompare(String(a.event_time)));
  return rows;
}

export function mockLogSearch(params) {
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Number(params.offset) || 0;

  const sampleRows = getMockAgentSessionRowsAll();
  const trend = buildLast24hTrendFromRows(sampleRows);

  const total = sampleRows.length;
  const sliced = sampleRows.slice(offset, offset + limit);

  return {
    source: "mock",
    database: "otel",
    logTable: params.logTable || "agent_sessions_logs",
    legend: "Mock 数据 · 无需数据库连接",
    total,
    limit,
    offset,
    trend,
    meta: {
      types: ["message", "session", "model_change", "custom"],
      providers: ["openai", "anthropic", "minimax-cn", "deepseek", "alibaba"],
      channels: ["web", "internal", "api", "feishu", "dingtalk"],
      agents: ["客服助手·小智", "运维巡检员", "数据分析员", "HR 面试助手", "合规审查官"],
      models: ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet", "MiniMax-M2.5", "deepseek-r1", "qwen-turbo"],
    },
    rows: sliced,
  };
}

/**
 * Mock: GET /api/logs-search
 */
export function mockUnifiedLogsSearch(params) {
  const ds = params.dataSource || "agent_sessions";
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Number(params.offset) || 0;

  if (ds === "agent_sessions") {
    const agent = mockLogSearch(params);
    const unifiedRows = (agent.rows || []).map((row) => normalizeAgentSessionsRow(row));
    return {
      dataSource: "agent_sessions",
      total: agent.total,
      limit: agent.limit,
      offset: agent.offset,
      unifiedRows,
      meta: { agent },
    };
  }

  if (ds === "audit_logs") {
    const rowsAll = getMockAuditRowsAll();
    const total = rowsAll.length;
    const sliced = rowsAll.slice(offset, offset + limit);
    const unifiedRows = sliced.map((r) => normalizeAuditRow(r));
    return {
      dataSource: "audit_logs",
      total,
      limit,
      offset,
      unifiedRows,
      meta: { audit: { total, rows: sliced } },
    };
  }

  if (ds === "gateway_logs") {
    const rowsAll = getMockGatewayRowsAll();
    const total = rowsAll.length;
    const sliced = rowsAll.slice(offset, offset + limit);
    const unifiedRows = sliced.map((r) => normalizeGatewayRow(r));
    return {
      dataSource: "gateway_logs",
      total,
      limit,
      offset,
      unifiedRows,
      meta: { gateway: { total, rows: sliced } },
    };
  }

  const agentRowsAll = getMockAgentSessionRowsAll();
  const auditRowsAll = getMockAuditRowsAll();
  const gwRowsAll = getMockGatewayRowsAll();
  const merged = sortUnifiedByTime(
    [
      ...agentRowsAll.map((row) => normalizeAgentSessionsRow(row)),
      ...auditRowsAll.map((row) => normalizeAuditRow(row)),
      ...gwRowsAll.map((row) => normalizeGatewayRow(row)),
    ],
    "desc",
  );
  const total = merged.length;
  const unifiedRows = merged.slice(offset, offset + limit);

  return {
    dataSource: "all",
    total,
    limit,
    offset,
    unifiedRows,
    mergeNote: "mock all",
    meta: {},
  };
}
