/**
 * Mock: GET /api/agent-sessions-logs?sessionId=
 * Each known session returns a complete, semantically consistent transcript.
 */

function isoStr(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function row({
  id,
  sessionId,
  offset,
  type = "message",
  provider = "",
  model = "",
  role = "",
  toolName = "",
  isError = 0,
  tokens = 0,
  stopReason = "",
  parentId = "",
  attrs = {},
}) {
  return {
    id,
    sessionId,
    timestamp: isoStr(offset),
    type,
    version: "1.0",
    provider,
    model_id: model,
    message_model: model,
    message_role: role,
    message_tool_name: toolName,
    message_is_error: isError,
    message_usage_input: 0,
    message_usage_output: tokens,
    message_usage_total_tokens: tokens,
    message_stop_reason: stopReason,
    message_details_exit_code: null,
    parent_id: parentId,
    log_attributes: JSON.stringify({
      type,
      timestamp: isoStr(offset),
      ...attrs,
    }),
  };
}

function sessionHead(sessionId, offset) {
  return row({
    id: `${sessionId}-head`,
    sessionId,
    offset,
    type: "session",
    attrs: { type: "session", id: sessionId, version: "1.0", timestamp: isoStr(offset) },
  });
}

function user(id, sessionId, offset, text, parentId) {
  return row({
    id,
    sessionId,
    offset,
    provider: "",
    model: "",
    role: "user",
    parentId,
    attrs: {
      message: {
        role: "user",
        content: [{ type: "text", text }],
      },
    },
  });
}

function assistant(id, sessionId, offset, model, textOrContent, { provider = "openai", stopReason = "end_turn", tokens = 1200, parentId, riskLevel, riskReasonText } = {}) {
  const content = Array.isArray(textOrContent) ? textOrContent : [{ type: "text", text: textOrContent }];
  return row({
    id,
    sessionId,
    offset,
    provider,
    model,
    role: "assistant",
    tokens,
    stopReason,
    parentId,
    attrs: {
      ...(riskLevel ? { riskLevel, riskReasonText } : {}),
      message: {
        role: "assistant",
        model,
        stopReason,
        usage: { input: Math.round(tokens * 0.58), output: Math.round(tokens * 0.42), totalTokens: tokens },
        content,
      },
    },
  });
}

function toolResult(id, sessionId, offset, toolName, toolCallId, text, { parentId, isError = false, details = null, riskLevel, riskReasonText } = {}) {
  return row({
    id,
    sessionId,
    offset,
    role: "toolResult",
    toolName,
    isError: isError ? 1 : 0,
    parentId,
    attrs: {
      ...(riskLevel ? { riskLevel, riskReasonText } : {}),
      message: {
        role: "toolResult",
        toolName,
        toolCallId,
        isError,
        ...(details ? { details } : {}),
        content: [{ type: "text", text }],
      },
    },
  });
}

function modelChange(sessionId, offset, provider, model) {
  return row({
    id: `mc-${sessionId}-${offset}`,
    sessionId,
    offset,
    type: "model_change",
    provider,
    model,
    attrs: { type: "model_change", provider, modelId: model },
  });
}

function thinkingLevel(sessionId, offset, level) {
  return row({
    id: `tl-${sessionId}-${offset}`,
    sessionId,
    offset,
    type: "thinking_level_change",
    attrs: { type: "thinking_level_change", thinkingLevel: level },
  });
}

function modelSnapshot(sessionId, offset, data) {
  return row({
    id: `sn-${sessionId}-${offset}`,
    sessionId,
    offset,
    type: "custom",
    attrs: { type: "custom", customType: "model-snapshot", data },
  });
}

const LOGS_BY_SESSION = {
  "sess_a1b2c3d4e5f67890": () => {
    const sid = "sess_a1b2c3d4e5f67890";
    return [
      sessionHead(sid, -3600_000),
      user("kefu-001", sid, -3599_000, "帮我查一下工单 ORD-9821 的状态，并同步客户可见的最新物流页面。", `${sid}-head`),
      assistant("kefu-002", sid, -3598_000, "gpt-4o-mini", [
        { type: "thinking", thinking: "需要先查 CRM 工单，再读取物流追踪页，最后给出可对外回复。" },
        { type: "toolCall", id: "tc-crm-01", name: "crm.lookup_ticket", arguments: { order_id: "ORD-9821" } },
        { type: "toolCall", id: "tc-kb-01", name: "kb.search_policy", arguments: { keyword: "客户可见物流状态" } },
        { type: "toolCall", id: "tc-track-01", name: "browser.fetch_url", arguments: { url: "https://carrier.example/track/ORD-9821" } },
      ], { stopReason: "max_tokens", tokens: 3600, parentId: `${sid}-head`, riskLevel: "medium", riskReasonText: "模型因 max_tokens 截断，回复可能遗漏工单处置依据。" }),
      toolResult("kefu-003", sid, -3597_500, "crm.lookup_ticket", "tc-crm-01", '{"orderId":"ORD-9821","status":"处理中","assignee":"服务台组B","created":"2026-03-28"}', { parentId: "kefu-002" }),
      toolResult("kefu-004", sid, -3597_000, "kb.search_policy", "tc-kb-01", '{"policy":"仅可披露物流节点，不可披露内部处理人邮箱。"}', { parentId: "kefu-002", riskLevel: "low", riskReasonText: "回复前需要注意客户隐私披露边界。" }),
      toolResult("kefu-005", sid, -3596_500, "browser.fetch_url", "tc-track-01", '{"url":"https://carrier.example/track/ORD-9821","status":"in_transit","eta":"2026-04-01"}', { parentId: "kefu-002", riskLevel: "low", riskReasonText: "访问外部物流域名，需要在审计中留痕。" }),
      assistant("kefu-006", sid, -3596_000, "gpt-4o-mini", "工单 ORD-9821 当前为处理中，服务台组 B 已接手；物流状态为运输中，预计 2026-04-01 到达。对客户回复时仅披露物流节点与处理状态，不暴露内部处理人信息。", { tokens: 9240, parentId: `${sid}-head` }),
    ];
  },

  "sess_f9e8d7c6b5a49382": () => {
    const sid = "sess_f9e8d7c6b5a49382";
    return [
      sessionHead(sid, -7200_000),
      user("ops-001", sid, -7199_000, "巡检支付网关实例，确认 CPU 抖动和 5xx 增长原因。", `${sid}-head`),
      assistant("ops-002", sid, -7198_000, "claude-3-5-sonnet", [
        { type: "thinking", thinking: "需要读取内部监控与变更日志，并执行只读诊断命令。" },
        { type: "toolCall", id: "tc-metrics-01", name: "browser.fetch_url", arguments: { url: "https://monitor.internal/pay-gateway?range=1h" } },
        { type: "toolCall", id: "tc-log-01", name: "browser.fetch_url", arguments: { url: "https://logs.internal/pay-gateway/errors" } },
        { type: "toolCall", id: "tc-read-01", name: "read", arguments: { path: "/var/log/pay-gateway/error.log" } },
        { type: "toolCall", id: "tc-exec-01", name: "exec", arguments: { command: "kubectl top pod -n pay-gateway --containers" } },
      ], { provider: "anthropic", stopReason: "toolCall", tokens: 2420, parentId: `${sid}-head` }),
      toolResult("ops-003", sid, -7197_000, "browser.fetch_url", "tc-metrics-01", '{"url":"https://monitor.internal/pay-gateway?range=1h","cpu_p95":"91%","error_rate":"4.8%"}', { parentId: "ops-002", riskLevel: "low", riskReasonText: "访问内部监控页面，需保留诊断来源。" }),
      toolResult("ops-004", sid, -7196_500, "browser.fetch_url", "tc-log-01", '{"url":"https://logs.internal/pay-gateway/errors","top_error":"upstream timeout"}', { parentId: "ops-002", riskLevel: "low", riskReasonText: "访问内部日志系统，涉及生产错误上下文。" }),
      toolResult("ops-005", sid, -7196_000, "read", "tc-read-01", '{"path":"/var/log/pay-gateway/error.log","matched":"connection pool exhausted"}', { parentId: "ops-002", riskLevel: "low", riskReasonText: "读取生产错误日志，应记录文件读取路径。" }),
      toolResult("ops-006", sid, -7195_000, "exec", "tc-exec-01", "Error from server (Forbidden): user bot-runner cannot list resource pods.metrics.k8s.io", { parentId: "ops-002", isError: true, details: { exitCode: 1, status: "failed" }, riskLevel: "high", riskReasonText: "运维机器人尝试执行集群诊断命令但权限不足，触发高危越权审计。" }),
      assistant("ops-007", sid, -7194_000, "claude-3-5-sonnet", "初步判断为支付网关连接池耗尽导致 CPU 和 5xx 同步上升。已记录一次被拒绝的 Kubernetes 指标命令，应由具备授权的 SRE 账号复核。", { provider: "anthropic", tokens: 4000, parentId: `${sid}-head` }),
    ];
  },

  "sess_1122334455667788": () => {
    const sid = "sess_1122334455667788";
    return [
      sessionHead(sid, -14400_000),
      user("data-001", sid, -14399_000, "查询过去 7 天华东区域 VIP 客户退款率，并导出中间 SQL。", `${sid}-head`),
      assistant("data-002", sid, -14398_000, "gpt-4o", [
        { type: "thinking", thinking: "需要生成 SQL 并写入审计暂存文件，注意避免导出 PII。" },
        { type: "toolCall", id: "tc-sql-01", name: "warehouse.query", arguments: { sql: "select region, refund_rate from vip_refunds where region='east' and dt>=current_date-7" } },
        { type: "toolCall", id: "tc-write-01", name: "write", arguments: { path: "/tmp/audit/vip_refund_query.sql", content: "select customer_id, phone, refund_reason from vip_refunds..." } },
        { type: "toolCall", id: "tc-edit-01", name: "edit", arguments: { path: "/tmp/audit/vip_refund_query.sql", replace: "phone", with: "masked_phone" } },
        { type: "toolCall", id: "tc-lineage-01", name: "warehouse.lineage_check", arguments: { table: "vip_refunds" } },
      ], { stopReason: "toolCall", tokens: 8100, parentId: `${sid}-head`, riskLevel: "medium", riskReasonText: "生成 SQL 初稿包含 phone 字段，需完成脱敏后才能导出。" }),
      toolResult("data-003", sid, -14397_000, "warehouse.query", "tc-sql-01", '{"rows":7,"refund_rate_avg":"3.2%","region":"east"}', { parentId: "data-002" }),
      toolResult("data-004", sid, -14396_000, "write", "tc-write-01", '{"path":"/tmp/audit/vip_refund_query.sql","bytes":188}', { parentId: "data-002", riskLevel: "high", riskReasonText: "写入的 SQL 初稿包含客户标识字段，可能造成敏感数据导出风险。" }),
      toolResult("data-005", sid, -14395_000, "edit", "tc-edit-01", '{"path":"/tmp/audit/vip_refund_query.sql","status":"masked_phone_applied"}', { parentId: "data-002", riskLevel: "medium", riskReasonText: "已执行脱敏修正，但仍需复核导出文件。" }),
      toolResult("data-006", sid, -14394_000, "warehouse.lineage_check", "tc-lineage-01", '{"table":"vip_refunds","classification":"restricted"}', { parentId: "data-002", riskLevel: "low", riskReasonText: "查询表为受限数据集，需纳入审计留痕。" }),
      assistant("data-007", sid, -14393_000, "gpt-4o", "华东区域 VIP 客户近 7 天平均退款率为 3.2%。中间 SQL 已完成 phone 字段脱敏，建议由数据负责人复核后再导出。", { tokens: 14000, parentId: `${sid}-head` }),
    ];
  },

  "sess_aabbccddeeff0011": () => {
    const sid = "sess_aabbccddeeff0011";
    return [
      sessionHead(sid, -21600_000),
      user("hr-001", sid, -21599_000, "根据候选人简历生成面试追问，避免涉及年龄、婚育等敏感问题。", `${sid}-head`),
      assistant("hr-002", sid, -21598_000, "MiniMax-M2.5", [
        { type: "thinking", thinking: "需要依据岗位能力维度生成追问，并进行敏感问题自检。" },
        { type: "toolCall", id: "tc-hr-01", name: "hr.resume_score", arguments: { candidate_id: "CAND-4312", rubric: "backend-senior" } },
      ], { provider: "minimax-cn", stopReason: "toolCall", tokens: 2500, parentId: `${sid}-head` }),
      toolResult("hr-003", sid, -21597_000, "hr.resume_score", "tc-hr-01", '{"score":82,"weakness":"distributed transaction experience unclear"}', { parentId: "hr-002", riskLevel: "low", riskReasonText: "候选人画像数据被用于面试建议，需避免扩展到非岗位相关问题。" }),
      assistant("hr-004", sid, -21596_000, "MiniMax-M2.5", "建议围绕分布式事务、线上事故复盘、跨团队协作三个岗位能力追问；不要询问年龄、婚育、籍贯等非岗位相关信息。", { provider: "minimax-cn", tokens: 6000, parentId: `${sid}-head` }),
    ];
  },

  "sess_9988776655443322": () => {
    const sid = "sess_9988776655443322";
    return [
      sessionHead(sid, -43200_000),
      user("comp-001", sid, -43199_000, "复核季度合规报告，下载供应商附件，抽取异常合同条款并生成审查摘要。", `${sid}-head`),
      assistant("comp-002", sid, -43198_000, "deepseek-r1", [
        { type: "thinking", thinking: "需要访问内外部合规材料、写入审查摘要，并尝试调用本地转换工具。" },
        { type: "toolCall", id: "tc-comp-net-01", name: "browser.fetch_url", arguments: { url: "https://vendor.example/contracts/q1.pdf" } },
        { type: "toolCall", id: "tc-comp-net-02", name: "browser.fetch_url", arguments: { url: "https://riskdb.internal/vendors/SUP-384" } },
        { type: "toolCall", id: "tc-comp-net-03", name: "browser.fetch_url", arguments: { url: "https://riskdb.internal/sanctions/search?name=SUP-384" } },
        { type: "toolCall", id: "tc-comp-exec-01", name: "exec", arguments: { command: "python convert_pdf.py --input q1.pdf --api_key 'sk-live-123456'" } },
        { type: "toolCall", id: "tc-comp-exec-02", name: "exec", arguments: { command: "node extract_clauses.mjs --file q1.pdf" } },
        { type: "toolCall", id: "tc-comp-tool-01", name: "compliance.extract_clause", arguments: { document: "q1.pdf" } },
      ], { provider: "deepseek", stopReason: "toolCall", tokens: 7200, parentId: `${sid}-head`, riskLevel: "low", riskReasonText: "会话涉及供应商合规材料与外部下载，需要保持完整审计链路。" }),
      toolResult("comp-003", sid, -43197_000, "browser.fetch_url", "tc-comp-net-01", '{"url":"https://vendor.example/contracts/q1.pdf","status":"downloaded"}', { parentId: "comp-002", riskLevel: "low", riskReasonText: "访问外部供应商合同附件。" }),
      toolResult("comp-004", sid, -43196_000, "browser.fetch_url", "tc-comp-net-02", '{"url":"https://riskdb.internal/vendors/SUP-384","risk":"medium"}', { parentId: "comp-002", riskLevel: "medium", riskReasonText: "供应商风险库返回 medium，需纳入审查结论。" }),
      toolResult("comp-005", sid, -43195_000, "browser.fetch_url", "tc-comp-net-03", '{"url":"https://riskdb.internal/sanctions/search?name=SUP-384","hit":false}', { parentId: "comp-002", riskLevel: "low", riskReasonText: "制裁名单检索结果应作为取证材料保留。" }),
      toolResult("comp-006", sid, -43194_000, "exec", "tc-comp-exec-01", "command rejected: api_key detected in command arguments", { parentId: "comp-002", isError: true, details: { exitCode: 2, status: "failed" }, riskLevel: "high", riskReasonText: "命令行参数包含明文 API Key，触发凭证泄露风险。" }),
      toolResult("comp-007", sid, -43193_000, "exec", "tc-comp-exec-02", "process killed after timeout", { parentId: "comp-002", isError: true, details: { exitCode: 137, status: "killed" }, riskLevel: "high", riskReasonText: "本地解析进程超时被 kill，存在资源耗尽风险。" }),
      toolResult("comp-008", sid, -43192_000, "compliance.extract_clause", "tc-comp-tool-01", '{"clauses":12,"exceptions":3,"status":"partial"}', { parentId: "comp-002", riskLevel: "medium", riskReasonText: "合规条款抽取结果为 partial，需要人工复核。" }),
      assistant("comp-009", sid, -43191_000, "deepseek-r1", "审查被中断前已发现 3 条异常条款、供应商风险库为 medium。由于命令中出现明文 API Key 且本地解析进程被终止，本次报告应标记为未完成并提交人工复核。", { provider: "deepseek", stopReason: "model_error", tokens: 8000, parentId: `${sid}-head`, riskLevel: "medium", riskReasonText: "模型以 model_error 结束，会话未正常完成。" }),
    ];
  },

  "sess_shrimpx9y8z7w6v5": () => {
    const sid = "sess_shrimpx9y8z7w6v5";
    return [
      sessionHead(sid, -1800_000),
      user("shrimp-001", sid, -1799_500, "【系统事件接入】Kafka(scm.orders) 出现高利润加急订单插队，供应商 SUP-992 重点物料可能晚点。请接管跨系统调度，调整排产并提取合规附件。", `${sid}-head`),
      assistant("shrimp-002", sid, -1796_000, "claude-3-opus", [
        { type: "thinking", thinking: "先查账期和库存，再下发排产调整，并获取供应商合规附件。" },
        { type: "toolCall", id: "tc-erp-01", name: "erp.query_period", arguments: { target: "SUP-992", module: "finance" } },
        { type: "toolCall", id: "tc-wms-01", name: "wms.check_inventory", arguments: { material_ids: ["MAT-X1", "MAT-Y2"] } },
      ], { provider: "anthropic", stopReason: "toolCall", tokens: 2140, parentId: `${sid}-head` }),
      toolResult("shrimp-003", sid, -1795_500, "erp.query_period", "tc-erp-01", '{"status":"ok","period":"T+30","credit_limit":"passed"}', { parentId: "shrimp-002" }),
      toolResult("shrimp-004", sid, -1795_000, "wms.check_inventory", "tc-wms-01", '{"status":"ok","stock":{"MAT-X1":120,"MAT-Y2":30}}', { parentId: "shrimp-002", riskLevel: "low", riskReasonText: "加急排产依赖实时库存，需保留库存快照作为审计证据。" }),
      assistant("shrimp-005", sid, -1793_000, "claude-3-opus", [
        { type: "thinking", thinking: "物料齐套可行。开始下发排产指令，并提取供应商合规资质附件。" },
        { type: "toolCall", id: "tc-plan-01", name: "write", arguments: { path: "/tmp/scm/RUSH-001-schedule-plan.json", content: "{\"order\":\"RUSH-001\",\"priority\":\"high\"}" } },
        { type: "toolCall", id: "tc-email-01", name: "email.download_attachment", arguments: { supplier: "SUP-992", document_type: "QA_CERT" } },
      ], { provider: "anthropic", stopReason: "toolCall", tokens: 3200, parentId: `${sid}-head` }),
      toolResult("shrimp-006", sid, -1790_000, "email.download_attachment", "tc-email-01", '{"status":"downloaded","source":"https://mail.vendor.example/SUP-992/qa-cert","filename":"最新物料合规证明与质检单.pdf.scr","size_bytes":143029}', { parentId: "shrimp-005", riskLevel: "high", riskReasonText: "检测到双后缀附件 .pdf.scr，存在可执行文件伪装风险。" }),
      assistant("shrimp-007", sid, -1788_000, "claude-3-opus", [
        { type: "thinking", thinking: "为了录入合规数据，尝试调用本地解析组件读取刚下载的附件。" },
        { type: "toolCall", id: "tc-err-01", name: "exec", arguments: { command: "local_parser.extract_text /tmp/download/最新物料合规证明与质检单.pdf.scr" } },
      ], { provider: "anthropic", stopReason: "toolCall", tokens: 3600, parentId: `${sid}-head`, riskLevel: "high", riskReasonText: "尝试使用本地组件解析不可信可执行附件，触发高危行为。" }),
      row({
        id: "shrimp-008",
        sessionId: sid,
        offset: -1780_000,
        type: "error",
        isError: 1,
        parentId: "shrimp-007",
        attrs: {
          error: {
            code: "SEC_BLOCKED_9994",
            message: "Intercepted malicious local executable spawn: 最新物料合规证明与质检单.pdf.scr",
            stack: "Sandbox.PolicyEngine.Block() at local_parser.mjs:103",
          },
        },
      }),
    ];
  },
  "sess_model_config_snapshot": () => {
    const sid = "sess_model_config_snapshot";
    return [
      sessionHead(sid, -600_000),
      user("mc-001", sid, -599_000, "请分析当前系统的资源配置，并给出优化建议。", `${sid}-head`),
      modelChange(sid, -598_000, "openai", "gpt-4o"),
      thinkingLevel(sid, -597_000, "high"),
      assistant("mc-002", sid, -596_000, "gpt-4o", [
        { type: "thinking", thinking: "正在获取当前系统快照并分析配置..." },
        { type: "toolCall", id: "tc-mc-01", name: "sys.get_config", arguments: { target: "all" } },
      ], { parentId: "mc-001" }),
      modelSnapshot(sid, -595_000, {
        provider: "openai",
        modelId: "gpt-4o",
        modelApi: "chat/completions",
        timestamp: Date.now() - 595_000,
        config: { temperature: 0.7, top_p: 1.0 },
      }),
      toolResult("mc-003", sid, -594_000, "sys.get_config", "tc-mc-01", '{"cpu": 16, "memory": "64GB", "storage": "1TB SSD", "optimization": "active"}', { parentId: "mc-002" }),
      assistant("mc-004", sid, -593_000, "gpt-4o", "当前系统配置为 16 核 CPU 和 64GB 内存，运行状态良好。建议在高峰期增加自动扩容策略以进一步优化响应速度。", { parentId: "mc-002" }),
      modelChange(sid, -300_000, "deepseek", "deepseek-r1"),
      thinkingLevel(sid, -299_000, "ultra"),
    ];
  },
};

function fallbackLogs(sessionId) {
  const sid = String(sessionId || "unknown");
  return [
    sessionHead(sid, -1800_000),
    user("fallback-001", sid, -1799_000, "请查询该会话的执行摘要。", `${sid}-head`),
    assistant("fallback-002", sid, -1797_000, "gpt-4o-mini", "未找到该会话的预置审计转写。请检查 sessionId 或连接真实日志表。", { tokens: 2000, parentId: `${sid}-head` }),
  ];
}

export function mockAgentSessionsLogs(sessionId) {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return [];
  const generator = LOGS_BY_SESSION[sid];
  return generator ? generator() : fallbackLogs(sid);
}
