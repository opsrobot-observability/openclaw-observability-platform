/**
 * 会话成本明细 Mock 数据生成器
 */
export function mockSessionCostDetail({
  page = 1,
  pageSize = 20,
  agents = [],
  users = [],
  gateways = [],
  models = [],
  statuses = [],
  sessionId = "",
  startDay = "",
  endDay = "",
}) {
  const fullAgentPool = ["乐园运营助手", "内容营销助手", "合规审查官", "数据分析员", "HR 面试助手", "客服助手·小智", "运维巡检员"];
  const fullUserPool = ["growth-ops@corp.example", "marketing-ops@corp.example", "park-planner@corp.example", "张三", "李四", "王五", "赵六", "钱七"];
  const fullGatewayPool = ["campaign-console", "event-bus", "api-gateway", "webchat", "feishu", "cron-job", "internal"];
  const fullModelPool = ["Claude 3.7 Sonnet", "Gemini 3.1 Pro", "Opus 4.6", "GLM 5.1", "MiniMax-M2.7", "Gemini 3.1 Flash"];

  const allRows = [
    {
      session_id: "sess_ai_kpi_loop_20260407",
      agentName: "乐园运营助手",
      userName: "growth-ops@corp.example",
      gateway: "campaign-console",
      model: "Claude 3.7 Sonnet",
      totalTokens: 3120000000,
      inputTokens: 1540000000,
      outputTokens: 1580000000,
      costYuan: 9360.0000,
      createTime: new Date(Date.now() - 25 * 60_000).toISOString().slice(0, 16).replace("T", " "),
      status: "loop",
      stopReason: "cost_guardrail_soft_cap_exceeded + max_iterations",
      stepCount: 50000,
      duration: 21586,
    },
    {
      session_id: "sess_ai_kpi_batch_20260407_a",
      agentName: "乐园运营助手",
      userName: "marketing-ops@corp.example",
      gateway: "event-bus",
      model: "Claude 3.7 Sonnet",
      totalTokens: 420000000,
      inputTokens: 208000000,
      outputTokens: 212000000,
      costYuan: 1260.0000,
      createTime: new Date(Date.now() - 42 * 60_000).toISOString().slice(0, 16).replace("T", " "),
      status: "loop",
      stopReason: "repeat_prompt_signature_detected",
      stepCount: 6800,
      duration: 3120,
    },
    {
      session_id: "sess_ai_kpi_batch_20260407_b",
      agentName: "乐园运营助手",
      userName: "park-planner@corp.example",
      gateway: "campaign-console",
      model: "Claude 3.7 Sonnet",
      totalTokens: 310000000,
      inputTokens: 156000000,
      outputTokens: 154000000,
      costYuan: 930.0000,
      createTime: new Date(Date.now() - 67 * 60_000).toISOString().slice(0, 16).replace("T", " "),
      status: "interruption",
      stopReason: "budget_quota_blocked",
      stepCount: 5100,
      duration: 2420,
    },
    {
      session_id: "sess_9988776655443322",
      agentName: "合规审查官",
      userName: "赵六",
      gateway: "internal",
      model: "Opus 4.6",
      totalTokens: 15200,
      inputTokens: 10640,
      outputTokens: 4560,
      costYuan: 0.7600,
      createTime: new Date(Date.now() - 2 * 3600000).toISOString().slice(0, 16).replace("T", " "),
      status: "error",
      stopReason: "model_error",
      stepCount: 9,
      duration: 68,
    },
    {
      session_id: "sess_1122334455667788",
      agentName: "数据分析员",
      userName: "王五",
      gateway: "api-gateway",
      model: "Gemini 3.1 Pro",
      totalTokens: 22100,
      inputTokens: 13260,
      outputTokens: 8840,
      costYuan: 1.1050,
      createTime: new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 16).replace("T", " "),
      status: "loop",
      stopReason: "max_tokens (reached model limit)",
      stepCount: 7,
      duration: 77,
    },
  ];

  const totalCount = 100; // Generate more rows to ensure we have enough after filtering
  
  for (let i = 0; i < totalCount; i++) {
    const session_id = `sess_cost_${100000 + i}`;

    const totalT = 1000 + ((i * 7919) % 50000);
    const ratio = 0.58 + ((i % 9) * 0.035);
    const inputT = Math.floor(totalT * ratio);
    const outputT = totalT - inputT;
    const costYuan = Math.round((totalT / 1000000) * 50 * 10000) / 10000;

    allRows.push({
      session_id,
      agentName: fullAgentPool[i % fullAgentPool.length],
      userName: fullUserPool[i % fullUserPool.length],
      gateway: fullGatewayPool[i % fullGatewayPool.length],
      model: fullModelPool[i % fullModelPool.length],
      totalTokens: totalT,
      inputTokens: inputT,
      outputTokens: outputT,
      costYuan: costYuan,
      createTime: new Date(Date.now() - i * 3600000).toISOString().slice(0, 16).replace("T", " "),
      status: i === 1 ? "loop" : (i % 5 === 3 ? "interruption" : (i % 7 === 0 ? "error" : "normal")),
      stopReason: i === 1 ? "max_tokens (reached model limit)" : (i % 5 === 3 ? "gateway_timeout" : (i % 7 === 0 ? "model_error" : "stop")),
      stepCount: Math.floor(Math.random() * 10) + 1,
      duration: Math.floor(Math.random() * 60) + 10,
    });
  }

  const filteredRows = allRows.filter(r => {
    if (statuses.length > 0 && !statuses.includes(r.status)) return false;
    if (agents.length > 0 && !agents.includes(r.agentName)) return false;
    if (users.length > 0 && !users.includes(r.userName)) return false;
    if (gateways.length > 0 && !gateways.includes(r.gateway)) return false;
    if (models.length > 0 && !models.includes(r.model)) return false;
    if (sessionId && !r.session_id.toLowerCase().includes(sessionId.toLowerCase())) return false;
    return true;
  });

  const start = (page - 1) * pageSize;
  const rows = filteredRows.slice(start, start + pageSize);

  return { rows, total: filteredRows.length };
}
