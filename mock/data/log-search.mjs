/**
 * Mock: GET /api/agent-sessions-logs-search
 * 对齐 backend/log-search/log-search-query.mjs → queryAgentSessionsLogsSearch()
 */
import {
  normalizeAgentSessionsRow,
  normalizeAuditRow,
  normalizeGatewayRow,
} from "../../backend/log-search/log-unified-model.mjs";

function isoStr(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function mockLogSearch(params) {
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Number(params.offset) || 0;

  const sampleRows = [
    {
      id: "log-search-001",
      sessionId: "sess_a1b2c3d4e5f67890",
      timestamp: isoStr(-3600_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o-mini",
      message_model: "gpt-4o-mini",
      message_role: "assistant",
      message_tool_name: "",
      message_is_error: 0,
      parent_id: "",
      log_attributes: null,
      agent_name: "客服助手·小智",
      channel: "web",
    },
    {
      message_id: "log-search-002",
      session_id: "sess_f9e8d7c6b5a49382",
      timestamp: isoStr(-7200_000),
      type: "message",
      version: "1.0",
      provider: "anthropic",
      model_id: "claude-3-5-sonnet",
      message_model: "claude-3-5-sonnet",
      message_role: "assistant",
      message_tool_name: "metrics.query",
      message_is_error: 0,
      parent_id: "",
      log_attributes: null,
      agent_name: "运维巡检员",
      channel: "internal",
    },
    {
      message_id: "log-search-003",
      session_id: "sess_1122334455667788",
      timestamp: isoStr(-14400_000),
      type: "message",
      version: "1.0",
      provider: "openai",
      model_id: "gpt-4o",
      message_model: "gpt-4o",
      message_role: "toolResult",
      message_tool_name: "warehouse.run_sql",
      message_is_error: 1,
      parent_id: "",
      log_attributes: null,
      agent_name: "数据分析员",
      channel: "api",
    },
    {
      message_id: "log-search-004",
      session_id: "sess_aabbccddeeff0011",
      timestamp: isoStr(-21600_000),
      type: "message",
      version: "1.0",
      provider: "minimax-cn",
      model_id: "MiniMax-M2.5",
      message_model: "MiniMax-M2.5",
      message_role: "user",
      message_tool_name: "",
      message_is_error: 0,
      parent_id: "",
      log_attributes: null,
      agent_name: "HR 面试助手",
      channel: "feishu",
    },
    {
      message_id: "log-search-005",
      session_id: "sess_9988776655443322",
      timestamp: isoStr(-43200_000),
      type: "message",
      version: "1.0",
      provider: "deepseek",
      model_id: "deepseek-r1",
      message_model: "deepseek-r1",
      message_role: "assistant",
      message_tool_name: "",
      message_is_error: 0,
      parent_id: "",
      log_attributes: null,
      agent_name: "合规审查官",
      channel: "internal",
    },
  ];

  // 按小时聚合趋势
  const trend = [];
  for (let h = 23; h >= 0; h--) {
    const d = new Date(Date.now() - h * 3600_000);
    const bucket = d.toISOString().slice(0, 13);
    trend.push({ bucket, count: Math.floor(Math.random() * 20) + 1 });
  }

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
    const rows = [
      {
        id: 9001,
        event_time: isoStr(-1800_000),
        log_attributes: JSON.stringify({
          source: "config",
          event: "reload",
          level: "info",
          session_id: "sess_mock_audit",
          trace_id: "tr_audit_1",
        }),
      },
    ];
    const unifiedRows = rows.map((r) => normalizeAuditRow(r));
    return {
      dataSource: "audit_logs",
      total: rows.length,
      limit,
      offset,
      unifiedRows,
      meta: { audit: { total: rows.length, rows } },
    };
  }

  if (ds === "gateway_logs") {
    const rows = [
      {
        id: 8001,
        event_time: isoStr(-900_000),
        module: "http",
        level: "info",
        log_attributes: JSON.stringify({
          message: "GET /v1/chat",
          session_id: "sess_gw_1",
          trace_id: "tr_gw_1",
        }),
      },
    ];
    const unifiedRows = rows.map((r) => normalizeGatewayRow(r));
    return {
      dataSource: "gateway_logs",
      total: rows.length,
      limit,
      offset,
      unifiedRows,
      meta: { gateway: { total: rows.length, rows } },
    };
  }

  const agent = mockLogSearch({ ...params, limit: 50, offset: 0 });
  const auditRows = [
    {
      id: 9001,
      event_time: isoStr(-1800_000),
      log_attributes: JSON.stringify({ event: "audit_mock", level: "warn" }),
    },
  ];
  const gwRows = [
    {
      id: 8001,
      event_time: isoStr(-900_000),
      module: "router",
      level: "info",
      log_attributes: JSON.stringify({ message: "gateway mock" }),
    },
  ];
  const merged = [
    ...(agent.rows || []).map((row) => normalizeAgentSessionsRow(row)),
    ...auditRows.map((row) => normalizeAuditRow(row)),
    ...gwRows.map((row) => normalizeGatewayRow(row)),
  ].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const unifiedRows = merged.slice(offset, offset + limit);

  return {
    dataSource: "all",
    total: merged.length,
    limit,
    offset,
    unifiedRows,
    mergeNote: "mock all",
    meta: {},
  };
}
