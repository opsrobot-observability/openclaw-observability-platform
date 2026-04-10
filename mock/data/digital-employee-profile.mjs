import { mockDigitalEmployeeOverview } from "./digital-employee-overview.mjs";

/**
 * Mock: GET /api/digital-employees/profile
 * 对齐后端 buildDigitalEmployeeProfile 输出结构
 */
export function mockDigitalEmployeeProfile(agentName, days, hours, sessionScopeRaw) {
  let wanted = String(agentName ?? "").trim();
  try {
    wanted = decodeURIComponent(wanted);
  } catch {
    /* keep */
  }
  const d = Number(days) || 7;
  const sessionScope = String(sessionScopeRaw ?? "").trim();
  const ov = mockDigitalEmployeeOverview(d, hours);
  const agent =
    ov.agentsAggregated?.find(
      (a) =>
        (sessionScope &&
          (String(a.employeeKey || "").trim() === sessionScope ||
            String(a.agentName || "").trim() === sessionScope ||
            String(a.sessionKey || "").trim() === sessionScope)) ||
        String(a.agentName || "").trim() === wanted,
    ) || null;
  if (!agent) {
    return {
      error: "not_found",
      message: "mock 数据中未找到该 agentName",
      source: "mock",
      days: ov.days,
      hours: ov.hours,
    };
  }
  const billingDays = Math.max(d, 1);
  const dailyCostUsd = agent.totalCostUsd / billingDays;
  const successPct = Number(agent.successRate) * 100;
  const errPct = Math.max(0, 100 - successPct);
  const agentSeries = ov.o1_summary?.costTrendByEmployee?.series?.find((s) => s.agentName === agent.agentName);
  const daysSeries = ov.o1_summary?.costTrendByEmployee?.days ?? [];
  const costTrend = daysSeries.map((day, idx) => ({
    day,
    usd: Math.round((Number(agentSeries?.values?.[idx]) || 0) * 1e4) / 1e4,
  }));
  const agentSessions = (ov.o3_employees ?? [])
    .filter((s) => String(s.agentName || "") === String(agent.agentName || ""))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const previewRows = agentSessions.slice(0, 20).map((s, i) => ({
    session_id: s.session_id || s.sessionId,
    sessionKey: s.sessionKey,
    label: `Mock 会话 ${i + 1}`,
    updatedAt: s.lastUpdatedAt,
    abortedLastRun: Number(s.abortedCount) > 0,
    totalTokens: s.totalTokens ?? null,
    durationMs: s.p95DurationMs ?? null,
    estimatedCostUsd: s.totalCostUsd ?? null,
    riskHigh: Number(s.riskHighTotal) || (i % 13 === 0 ? 1 : 0),
    riskMedium: Number(s.riskMediumTotal) || (i % 7 === 0 ? 1 : 0),
    riskLow: Number(s.riskLowTotal) || 0,
    toolErrorCount: Number(s.toolErrorCount) || 0,
    execCommandErrorCount: Number(s.execCommandErrorCount) || 0,
  }));
  const riskHighCount = previewRows.reduce((sum, x) => sum + (Number(x.riskHigh) || 0), 0);
  const riskMediumCount = previewRows.reduce((sum, x) => sum + (Number(x.riskMedium) || 0), 0);
  const riskLowCount = previewRows.reduce((sum, x) => sum + (Number(x.riskLow) || 0), 0);
  const inputTokens = Math.round(agent.totalTokens * 0.42);
  const outputTokens = Math.round(agent.totalTokens * 0.58);
  const unitCostIn = 0.3;
  const unitCostOut = 1.2;
  const estimatedByFormula = (inputTokens / 1_000_000) * unitCostIn + (outputTokens / 1_000_000) * unitCostOut;

  return {
    source: "mock",
    days: ov.days,
    hours: ov.hours,
    windowStartMs: ov.windowStartMs,
    agent,
    l1: {
      headline: `${agent.agentName} 在窗口内共 ${agent.sessionCount} 次会话（Mock）。`,
      actions: ["Mock：观察五维 Tab 与下钻按钮文案。", "接入真实 API 后将替换为 L1 结论文案。"],
    },
    header: {
      employeeKey: agent.employeeKey,
      sessionKey: agent.sessionKey,
      sessionKeys: Array.isArray(agent.sessionKeys) ? agent.sessionKeys : [agent.sessionKey].filter(Boolean),
      chatType: agent.chatTypeTop ?? "—",
      channelTop: agent.channels?.[0]?.name ?? "—",
      online: true,
      minutesSinceLastActivity: 12,
      workspaceDir: `/mock/workspace/${String(agent.agentName || "agent").replace(/\s+/g, "-").toLowerCase()}`,
    },
    quad: {
      successRate: agent.successRate,
      dailyCostUsd,
      p95DurationMs: agent.p95DurationMs,
      securityLevel: Number(agent.securityRiskScore) >= 70 ? "高" : Number(agent.securityRiskScore) >= 45 ? "中" : "低",
      securityScore: agent.securityRiskScore,
      hasCostData: true,
    },
    basic: {
      dominantModel: agent.models?.[0]?.name ?? "—",
      skillCountDistinct: Math.round(agent.avgSkillCount || 0),
      toolCountDistinct: 9,
      modelProvider: agent.dominantModelProvider ?? "—",
    },
    dimensions: agent.dimensions,
    radarScores: {
      capability: 86,
      quality: Math.round(successPct),
      efficacy: agent.p95DurationMs > 40000 ? 62 : 83,
      cost: 78,
      security: Math.max(0, 100 - Math.round(Number(agent.securityRiskScore) || 0)),
    },
    tabs: {
      capability: {
        metrics: [
          { key: "kpi_score", label: "能力维度评分", value: 84 },
          { key: "model_provider", label: "模型供应商", value: agent.dominantModelProvider ?? "—" },
          { key: "model_name", label: "模型名称", value: agent.models?.[0]?.name ?? "—" },
          { key: "context_window", label: "上下文窗口", value: 128000 },
          { key: "max_tokens", label: "最大输出", value: 16384 },
          { key: "reasoning", label: "推理能力", value: "是" },
          { key: "skills", label: "技能清单", value: "docs、search、review、ops、sql" },
          { key: "tools", label: "工具清单", value: "read、write、exec" },
          { key: "subagents_max_concurrent", label: "子代理并发数", value: 4 },
          { key: "sandbox_mode", label: "沙箱模式", value: "off" },
        ],
      },
      quality: {
        charts: {
          successRate: agent.successRate,
          errorRatePct: errPct,
          toolErrorCount: Math.max(0, Math.round(agent.totalToolUse * (errPct / 100))),
          toolUseCount: agent.totalToolUse,
        },
        metrics: [
          { key: "kpi_score", label: "质量维度评分", value: Math.max(0, Math.min(100, Math.round(successPct - errPct * 0.2))) },
          { key: "aborted_session_count", label: "异常中止会话数", value: agent.abortedCount },
          { key: "tool_error_count", label: "工具调用错误次数", value: Math.max(0, Math.round(agent.totalToolUse * (errPct / 100))) },
          { key: "exec_command_error_count", label: "命令执行错误次数", value: Math.max(1, Math.round(agent.abortedCount * 0.6)) },
        ],
      },
      efficacy: {
        charts: {
          sessionTotal: agent.sessionCount,
          successSessions: agent.sessionCount - agent.abortedCount,
          p95Ms: agent.p95DurationMs,
          runtimeSampleCount: Math.max(1, previewRows.length),
        },
        metrics: [
          { key: "kpi_score", label: "效能维度评分", value: agent.p95DurationMs > 40000 ? 63 : 86 },
          { key: "avg_tool_duration_ms", label: "平均工具耗时(ms)", value: agent.p95DurationMs > 40000 ? 3800 : 920 },
          { key: "avg_runtime_ms", label: "平均会话耗时(ms)", value: 4200 },
          { key: "efficiency_per_cost", label: "单位成本产出（估）", value: 12.5 },
        ],
      },
      cost: {
        charts: {
          dailyCostUsd,
          costTrendDays: costTrend.length,
          tokenRatio: (outputTokens / Math.max(1, inputTokens)).toFixed(2),
          tokenRatioSampleCount: Math.max(1, previewRows.length),
          costTrend,
        },
        metrics: [
          { key: "kpi_score", label: "成本维度评分", value: 77 },
          { key: "input_tokens", label: "输入 Token（DB）", value: inputTokens },
          { key: "output_tokens", label: "输出 Token（DB）", value: outputTokens },
          { key: "total_tokens", label: "总 Token", value: inputTokens + outputTokens },
          { key: "model_unit_cost_input", label: "输入单价（$/1M）", value: unitCostIn },
          { key: "model_unit_cost_output", label: "输出单价（$/1M）", value: unitCostOut },
          { key: "estimated_cost_usd", label: "窗口估算成本(USD)", value: Math.round(estimatedByFormula * 1e6) / 1e6 },
        ],
      },
      security: {
        charts: {
          securityScore: Number(agent.securityRiskScore) || 0,
          securityLevel: Number(agent.securityRiskScore) >= 70 ? "高" : Number(agent.securityRiskScore) >= 45 ? "中" : "低",
          riskHighCount,
          riskMediumCount,
          riskLowCount,
          riskTags: ["Mock 风险标签"],
        },
        metrics: [
          { key: "kpi_score", label: "安全维度评分", value: Math.max(0, 100 - Math.round(Number(agent.securityRiskScore) || 0)) },
          { key: "exec_security_mode", label: "exec 安全级别", value: "full" },
          { key: "exec_ask_policy", label: "审批策略(ask)", value: "on-miss" },
          { key: "fs_workspace_only", label: "文件仅工作区", value: "true" },
          { key: "channel_group_policy", label: "群聊策略", value: "open" },
          { key: "elevated_allow_from", label: "提权工具 allowFrom", value: "feishu" },
          { key: "gateway_auth_mode", label: "网关鉴权", value: "token" },
          { key: "gateway_deny_commands", label: "网关封禁命令数", value: 5 },
        ],
      },
    },
    sessionsPreview: previewRows,
    qualityDetails: {
      abortedRows: previewRows
        .filter((x) => x.abortedLastRun)
        .map((x) => ({ sessionId: x.session_id, sessionKey: x.sessionKey, updatedAt: x.updatedAt, detail: "abortedLastRun=true", count: 1 })),
      toolErrorRows: previewRows
        .filter((x) => (Number(x.toolErrorCount) || 0) > 0)
        .map((x) => ({ sessionId: x.session_id, sessionKey: x.sessionKey, updatedAt: x.updatedAt, detail: `toolErrorCount=${x.toolErrorCount}`, count: x.toolErrorCount })),
      execErrorRows: previewRows
        .filter((x) => (Number(x.execCommandErrorCount) || 0) > 0)
        .map((x) => ({ sessionId: x.session_id, sessionKey: x.sessionKey, updatedAt: x.updatedAt, detail: `execCommandErrorCount=${x.execCommandErrorCount}`, count: x.execCommandErrorCount })),
    },
    openclawHintsPresent: true,
  };
}
