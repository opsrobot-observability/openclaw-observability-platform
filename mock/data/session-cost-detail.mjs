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
  const allRows = [];
  const fullAgentPool = ["合规审查官", "数据分析员", "HR 面试助手", "客服助手·小智", "运维巡检员"];
  const fullUserPool = ["张三", "李四", "王五", "赵六", "钱七"];
  const fullGatewayPool = ["api-gateway", "webchat", "feishu", "cron-job", "internal"];
  const fullModelPool = ["Gemini 3.1 Pro", "Opus 4.6", "GLM 5.1", "MiniMax-M2.7", "Gemini 3.1 Flash"];

  const REAL_SESSION_IDS = [
    "sess_9988776655443322",
    "sess_1122334455667788",
    "sess_aabbccddeeff0011",
    "sess_shrimpx9y8z7w6v5",
    "sess_a1b2c3d4e5f67890",
    "sess_f9e8d7c6b5a49382",
  ];

  const totalCount = 100; // Generate more rows to ensure we have enough after filtering
  
  for (let i = 0; i < totalCount; i++) {
    const session_id = i < REAL_SESSION_IDS.length
      ? REAL_SESSION_IDS[i]
      : `sess_cost_${100000 + i}`;

    const totalT = Math.floor(Math.random() * 50000) + 1000;
    const ratio = 0.7 + Math.random() * 0.2;
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
