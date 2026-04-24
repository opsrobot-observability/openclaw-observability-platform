/**
 * 会话成本明细筛选器选项 Mock 数据生成器
 */
export function mockSessionCostOptions() {
  return {
    agents: ["合规审查官", "数据分析员", "HR 面试助手", "客服助手·小智", "运维巡检员", "数字员工·老王"],
    users: ["张三", "李四", "王五", "赵六", "钱七", "孙八", "周九"],
    gateways: ["api-gateway", "webchat", "feishu", "cron-job", "internal", "dingtalk"],
    models: ["Gemini 3.1 Pro", "Opus 4.6", "Gemini 1.5 Pro", "GLM 5.1"],
  };
}
