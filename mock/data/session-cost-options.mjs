/**
 * 会话成本明细筛选器选项 Mock 数据生成器
 */
export function mockSessionCostOptions() {
  return {
    agents: ["乐园运营助手", "内容营销助手", "合规审查官", "数据分析员", "HR 面试助手", "客服助手·小智", "运维巡检员", "数字员工·老王"],
    users: ["growth-ops@corp.example", "marketing-ops@corp.example", "park-planner@corp.example", "张三", "李四", "王五", "赵六", "钱七", "孙八", "周九"],
    gateways: ["campaign-console", "event-bus", "api-gateway", "webchat", "feishu", "cron-job", "internal", "dingtalk"],
    models: ["Claude 3.7 Sonnet", "Gemini 3.1 Pro", "Opus 4.6", "GLM 5.1", "MiniMax-M2.7", "Gemini 3.1 Flash"],
  };
}
