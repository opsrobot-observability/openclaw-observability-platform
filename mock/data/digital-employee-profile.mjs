import { mockDigitalEmployeeOverview } from "./digital-employee-overview.mjs";

/**
 * Mock: GET /api/digital-employees/profile
 * 对齐后端 buildDigitalEmployeeProfile 输出结构
 */
export function mockDigitalEmployeeProfile(agentName, days, hours, sessionScopeRaw) {
  const now = Date.now();
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
  const previewRows = agentSessions.slice(0, 50).map((s, i) => ({
    session_id: s.session_id || s.sessionId,
    sessionKey: s.sessionKey,
    label: s.displayLabel || `Mock 会话 ${i + 1}`,
    updatedAt: s.lastUpdatedAt || s.updatedAt,
    abortedLastRun: Boolean(s.abortedLastRun) || Number(s.abortedCount) > 0,
    totalTokens: s.totalTokens ?? null,
    durationMs: s.durationMs ?? s.p95DurationMs ?? null,
    estimatedCostUsd: s.totalCostUsd ?? s.estimatedCostUsd ?? null,
    riskHigh: Number(s.riskHigh) || Number(s.riskHighTotal) || (i % 13 === 0 ? 1 : 0),
    riskMedium: Number(s.riskMedium) || Number(s.riskMediumTotal) || (i % 7 === 0 ? 1 : 0),
    riskLow: Number(s.riskLow) || Number(s.riskLowTotal) || 0,
    toolErrorCount: Number(s.toolErrorCount) || 0,
    execCommandErrorCount: Number(s.execCommandErrorCount) || 0,
  }));
  const riskHighCount = previewRows.reduce((sum, x) => sum + (Number(x.riskHigh) || 0), 0);
  const riskMediumCount = previewRows.reduce((sum, x) => sum + (Number(x.riskMedium) || 0), 0);
  const riskLowCount = previewRows.reduce((sum, x) => sum + (Number(x.riskLow) || 0), 0);
  const mockPerSessionTokens = previewRows.map((s, i) => Math.round((s.totalTokens ?? 8000) + i * 400));
  const mockAvgTokensPerSession =
    mockPerSessionTokens.length > 0
      ? Math.round(mockPerSessionTokens.reduce((sum, t) => sum + t, 0) / mockPerSessionTokens.length)
      : null;
  const mockMaxTokensPerSession =
    mockPerSessionTokens.length > 0 ? Math.round(Math.max(...mockPerSessionTokens)) : null;
  const inputTokens = Math.round(agent.totalTokens * 0.42);
  const outputTokens = Math.round(agent.totalTokens * 0.58);
  const nDays = Math.max(1, daysSeries.length || 1);
  const dayList = daysSeries.length > 0 ? daysSeries : [new Date().toISOString().slice(0, 10)];
  const tokenTrendDaily = dayList.map((day, idx) => {
    const inPart = Math.round((inputTokens / nDays) * (0.35 + (idx % 5) * 0.03));
    const outPart = Math.round((outputTokens / nDays) * (0.45 + (idx % 3) * 0.02));
    return { day, input: inPart, output: outPart };
  });
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
      headline: `${agent.agentName} 在窗口内共 ${agent.sessionCount} 次会话，综合健康 ${agent.healthOverall ?? "—"}。`,
      actions: [
        ...(agent.dimensions?.security === "red" ? ["安全维度标红：建议结合会话链路溯源核对工具/文件/网络行为。"] : []),
        ...(agent.dimensions?.quality === "red" || agent.successRate < 0.8 ? ["质量偏低：复盘中止会话与模型/渠道稳定性。"] : []),
        ...(agent.dimensions?.efficacy === "red" ? ["效能 P95 偏高：关注长会话与工具链耗时。"] : []),
        ...(agent.dimensions?.cost === "red" ? ["成本偏高：对比 Token 结构与会话频次。"] : []),
        "整体平稳：持续观察五维趋势与 Top 风险会话即可。",
      ].slice(0, 4),
    },
    header: {
      sessionKey: agent.sessionKey,
      sessionKeys: Array.isArray(agent.sessionKeys) ? agent.sessionKeys : [agent.sessionKey].filter(Boolean),
      chatType: agent.chatTypeTop ?? "—",
      channelTop: agent.channels?.[0]?.name ?? "—",
      online: agent.lastUpdatedAt ? (now - agent.lastUpdatedAt <= 15 * 60 * 1000) : false,
      minutesSinceLastActivity: agent.lastUpdatedAt
        ? Math.max(0, Math.round((now - agent.lastUpdatedAt) / 60000))
        : null,
      workspaceDir: `/mock/workspace/${String(agent.agentName || "agent").replace(/\s+/g, "-").toLowerCase()}`,
    },
    quad: {
      successRate: agent.successRate,
      dailyCostUsd,
      p95DurationMs: agent.p95DurationMs,
      securityLevel: Number(agent.securityRiskScore) >= 70 ? "高" : Number(agent.securityRiskScore) >= 45 ? "中" : "低",
      securityScore: agent.securityRiskScore,
      hasCostData: true,
      compositeScore: agent.compositeScore ?? Math.round(((agent.successRate * 100 + (100 - agent.securityRiskScore)) / 2) * 10) / 10,
    },
    basic: {
      dominantModel: agent.models?.[0]?.name ?? "—",
      skillCountDistinct: Math.round(agent.avgSkillCount || 0),
      toolCountDistinct: 9,
      modelProvider: agent.dominantModelProvider ?? "—",
    },
    dimensions: agent.dimensions,
    radarScores: {
      capability: agent.compositeScore ?? 86,
      quality: Math.round(successPct),
      efficacy: agent.p95DurationMs > 40000 ? 62 : 83,
      cost: 78,
      security: Math.max(0, 100 - Math.round(Number(agent.securityRiskScore) || 0)),
      composite: agent.compositeScore ?? Math.round(((agent.successRate * 100 + (100 - agent.securityRiskScore)) / 2) * 10) / 10,
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
      taskExecution: {
        charts: {
          successRate: agent.successRate,
          sessionTotal: agent.sessionCount,
          successSessions: agent.sessionCount - agent.abortedCount,
          abortedSessions: agent.abortedCount,
          toolUseCount: agent.totalToolUse,
          toolErrorCount: Math.max(0, Math.round(agent.totalToolUse * (errPct / 100))),
          execCommandErrorCount: Math.max(1, Math.round(agent.abortedCount * 0.6)),
          p95Ms: agent.p95DurationMs,
          avgRuntimeMs: 4200,
          avgToolDurationMs: agent.p95DurationMs > 40000 ? 3800 : 920,
          sessionExecutionDaily: dayList.map((day, idx) => {
            const base = Math.max(1, Math.ceil((previewRows.length || 1) / nDays));
            const aborted = idx % 4 === 0 ? 1 : 0;
            return {
              day,
              sessions: base + aborted,
              success: base,
              aborted,
            };
          }),
          toolTop10: [
            { name: "read", count: 120 },
            { name: "write", count: 44 },
            { name: "exec", count: 28 },
            { name: "search", count: 19 },
            { name: "browser", count: 12 },
          ],
          skillTop10: [
            { name: "docs", count: 90 },
            { name: "search", count: 55 },
            { name: "ops", count: 22 },
            { name: "review", count: 18 },
            { name: "sql", count: 9 },
          ],
        },
        metrics: [],
      },
      toolExecution: {
        charts: {
          toolUseCount: agent.totalToolUse,
          toolErrorCount: Math.max(0, Math.round(agent.totalToolUse * (errPct / 100))),
          toolErrorRatePct: errPct,
          avgToolDurationMs: agent.p95DurationMs > 40000 ? 3800 : 920,
          toolDurationSampleCount: 42,
          distinctToolCount: 5,
          toolCallsPerSession:
            agent.sessionCount > 0 ? Math.round((agent.totalToolUse / agent.sessionCount) * 100) / 100 : null,
          toolTrendDaily: dayList.map((day, idx) => ({
            day,
            toolCalls: 8 + idx,
            toolErrors: idx % 5 === 0 ? 1 : 0,
          })),
          toolOutcomePie: [
            { name: "success", value: Math.max(0, agent.totalToolUse - Math.round(agent.totalToolUse * (errPct / 100))) },
            { name: "error", value: Math.max(0, Math.round(agent.totalToolUse * (errPct / 100))) },
          ],
          toolTop15: [
            { name: "read", count: 120, sharePct: 35.2 },
            { name: "write", count: 44, sharePct: 12.9 },
            { name: "exec", count: 28, sharePct: 8.2 },
            { name: "search", count: 19, sharePct: 5.6 },
            { name: "browser", count: 12, sharePct: 3.5 },
          ],
          toolErrorSessions: [
            {
              sessionId: "mock-session-tool-err-1",
              sessionKey: "sk-mock-1",
              updatedAt: Date.now(),
              detail: "toolResult.isError=true",
              count: 2,
            },
          ],
        },
        metrics: [],
      },
      skillSituation: {
        charts: {
          skillMentionTotal: 220,
          distinctSkillCount: 5,
          sessionsWithSkill: Math.min(agent.sessionCount, Math.max(1, agent.sessionCount - 2)),
          sessionTotal: agent.sessionCount,
          avgSkillMentionsPerSession:
            agent.sessionCount > 0 ? Math.round((220 / agent.sessionCount) * 100) / 100 : null,
          skillCoveragePct:
            agent.sessionCount > 0
              ? Math.round((Math.min(agent.sessionCount, Math.max(1, agent.sessionCount - 2)) / agent.sessionCount) * 1000) / 10
              : null,
          skillTrendDaily: dayList.map((day, idx) => ({
            day,
            skillMentions: 6 + idx,
            sessionsWithSkill: Math.max(1, 3 + (idx % 2)),
          })),
          skillMixPie: [
            { name: "docs", value: 90 },
            { name: "search", value: 55 },
            { name: "ops", value: 22 },
            { name: "review", value: 18 },
            { name: "sql", value: 9 },
            { name: "__other__", value: 26 },
          ],
          skillTop15: [
            { name: "docs", count: 90, sharePct: 40.9 },
            { name: "search", count: 55, sharePct: 25 },
            { name: "ops", count: 22, sharePct: 10 },
            { name: "review", count: 18, sharePct: 8.2 },
            { name: "sql", count: 9, sharePct: 4.1 },
          ],
        },
        metrics: [],
      },
      userPortrait: {
        charts: {
          sessionTotal: agent.sessionCount,
          distinctUserKeys: 4,
          knownDistinctUsers: 3,
          unknownSessionCount: 2,
          knownIdentifiedSessionPct:
            agent.sessionCount > 0
              ? Math.round(((agent.sessionCount - 2) / agent.sessionCount) * 1000) / 10
              : null,
          topUserSharePct:
            agent.sessionCount > 0 ? Math.round((12 / Math.max(1, agent.sessionCount)) * 1000) / 10 : null,
          userConcentrationHhi: 0.318,
          userSessionPie: [
            { name: "user-a@mock", value: 12 },
            { name: "user-b@mock", value: 8 },
            { name: "__unknown__", value: 3 },
          ],
          userSessionTrendSeries: [
            { key: "u0", name: "user-a@mock" },
            { key: "u1", name: "user-b@mock" },
            { key: "u2", name: "__unknown__" },
            { key: "uOther", name: "__other__" },
          ],
          userSessionTrendDaily: dayList.map((day, idx) => ({
            day,
            u0: 2 + (idx % 3),
            u1: 1 + (idx % 2),
            u2: idx === 0 ? 1 : 0,
            uOther: 0,
          })),
          userTop15: [
            {
              name: "user-a@mock",
              sessionCount: 12,
              sessionSharePct: 40,
              tokens: 48000,
            },
            {
              name: "user-b@mock",
              sessionCount: 8,
              sessionSharePct: 26.7,
              tokens: 32000,
            },
            {
              name: "__unknown__",
              sessionCount: 2,
              sessionSharePct: 6.7,
              tokens: 4000,
            },
          ],
        },
        metrics: [],
      },
      channelAccess: {
        charts: {
          sessionTotal: agent.sessionCount,
          distinctChannelKeys: 4,
          knownDistinctChannels: 3,
          unknownChannelSessions: 2,
          knownChannelSessionPct:
            agent.sessionCount > 0
              ? Math.round(((agent.sessionCount - 2) / agent.sessionCount) * 1000) / 10
              : null,
          topChannelSharePct:
            agent.sessionCount > 0 ? Math.round((14 / Math.max(1, agent.sessionCount)) * 1000) / 10 : null,
          channelConcentrationHhi: 0.285,
          channelTrendDaily: dayList.map((day, idx) => ({
            day,
            knownChannels: Math.max(0, 5 + idx - (idx % 3)),
            unknownChannels: idx % 4 === 0 ? 1 : 0,
          })),
          channelSessionTrendSeries: [
            { key: "c0", name: "feishu" },
            { key: "c1", name: "web" },
            { key: "c2", name: "slack" },
            { key: "c3", name: "__unknown__" },
            { key: "cOther", name: "__other__" },
          ],
          channelSessionTrendDaily: dayList.map((day, idx) => ({
            day,
            c0: 3 + (idx % 2),
            c1: 2,
            c2: idx % 3 === 0 ? 1 : 0,
            c3: idx % 4 === 0 ? 1 : 0,
            cOther: 0,
          })),
          channelSessionPie: [
            { name: "feishu", value: 14 },
            { name: "web", value: 8 },
            { name: "slack", value: 3 },
            { name: "__unknown__", value: 2 },
          ],
          channelTop15: [
            {
              name: "feishu",
              sessionCount: 14,
              sessionSharePct: 46.7,
              tokens: 56000,
            },
            {
              name: "web",
              sessionCount: 8,
              sessionSharePct: 26.7,
              tokens: 30000,
            },
            {
              name: "slack",
              sessionCount: 3,
              sessionSharePct: 10,
              tokens: 9000,
            },
            {
              name: "__unknown__",
              sessionCount: 2,
              sessionSharePct: 6.7,
              tokens: 4000,
            },
          ],
        },
        metrics: [],
      },
      sessionExecution: {
        charts: {
          sessionTotal: agent.sessionCount,
          successRate: agent.successRate,
          failedSessions: agent.abortedCount,
          avgSessionDurationMs: 4200,
          sessionTrend: dayList.map((day, idx) => {
            const base = Math.max(1, Math.ceil((previewRows.length || 8) / nDays));
            return {
              day,
              sessions: base + (idx % 2),
              avgDurationMs: 3000 + idx * 200,
            };
          }),
          sessionStatusPie: [
            { name: "success", value: Math.max(0, agent.sessionCount - agent.abortedCount) },
            { name: "failed", value: agent.abortedCount },
          ],
          userSessionPie: [
            { name: "user-a@mock", value: 12 },
            { name: "user-b@mock", value: 8 },
            { name: "__unknown__", value: 3 },
          ],
          channelSessionPie: [
            { name: "feishu", value: 14 },
            { name: "web", value: 6 },
            { name: "slack", value: 3 },
          ],
        },
        metrics: [],
      },
      cost: {
        charts: {
          dailyCostUsd,
          costTrendDays: costTrend.length,
          tokenRatio: (outputTokens / Math.max(1, inputTokens)).toFixed(2),
          tokenRatioSampleCount: Math.max(1, previewRows.length),
          costTrend,
          totalTokens: inputTokens + outputTokens,
          dailyTokensAvg: Math.round((inputTokens + outputTokens) / billingDays),
          avgTokensPerSession: mockAvgTokensPerSession,
          maxTokensPerSession: mockMaxTokensPerSession,
          tokenTrendDaily,
          inputOutputPie: [
            { name: "input", value: inputTokens },
            { name: "output", value: outputTokens },
          ],
          modelTokenPie: [
            { name: agent.models?.[0]?.name || "anthropic/claude-3-5-sonnet", value: Math.round((inputTokens + outputTokens) * 0.62) },
            { name: "openai/gpt-4o", value: Math.round((inputTokens + outputTokens) * 0.28) },
            { name: "__other__", value: Math.round((inputTokens + outputTokens) * 0.1) },
          ],
          userTokenTop10: [
            { name: "zhang.san@mock", value: Math.round((inputTokens + outputTokens) * 0.35) },
            { name: "ops.bot.user", value: Math.round((inputTokens + outputTokens) * 0.28) },
            { name: "__unknown__", value: Math.round((inputTokens + outputTokens) * 0.15) },
            { name: "li.si@mock", value: Math.round((inputTokens + outputTokens) * 0.12) },
            { name: "qa.lead", value: Math.round((inputTokens + outputTokens) * 0.1) },
          ],
          channelTokenTop10: [
            { name: "feishu", value: Math.round((inputTokens + outputTokens) * 0.42) },
            { name: "slack", value: Math.round((inputTokens + outputTokens) * 0.22) },
            { name: "web", value: Math.round((inputTokens + outputTokens) * 0.18) },
            { name: "__unknown__", value: Math.round((inputTokens + outputTokens) * 0.1) },
            { name: "dingtalk", value: Math.round((inputTokens + outputTokens) * 0.08) },
          ],
          sessionTokenTop10: previewRows
            .map((s, i) => ({
              sessionKey: s.sessionKey || "",
              sessionId: s.session_id || null,
              totalTokens: Math.round((s.totalTokens ?? 8000) + i * 400),
              updatedAt: s.updatedAt ?? Date.now() - i * 3600000,
            }))
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .slice(0, 10),
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
          kpiScore: Math.max(0, 100 - Math.round(Number(agent.securityRiskScore) || 0)),
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
      securityRisk: {
        overview: {
          riskSessionTotal: Math.max(
            1,
            previewRows.filter(
              (x) =>
                (Number(x.riskHigh) || 0) + (Number(x.riskMedium) || 0) + (Number(x.riskLow) || 0) > 0 ||
                (Number(x.execCommandErrorCount) || 0) > 0,
            ).length,
          ),
          todayRiskSessionCount: 1,
          trend7d: "flat",
          p0Count: riskHighCount,
          p1Count: riskMediumCount,
          p2p3Count: riskLowCount,
          compliance: {
            unauthorizedOps: previewRows.filter((x) => (Number(x.execCommandErrorCount) || 0) > 0).length,
            sensitiveCommandBlocks: 5,
            highRiskUnapproved: null,
          },
        },
        riskDaily: dayList.slice(-7).map((day, idx) => ({
          day,
          riskSessions: idx % 3 === 0 ? 2 : 1,
          riskEvents: 3 + idx,
        })),
        riskRecords: previewRows
          .filter(
            (x) =>
              (Number(x.riskHigh) || 0) + (Number(x.riskMedium) || 0) + (Number(x.riskLow) || 0) > 0 ||
              (Number(x.execCommandErrorCount) || 0) > 0,
          )
          .slice(0, 8)
          .map((x) => ({
            ts: x.updatedAt ?? Date.now(),
            level:
              (Number(x.riskHigh) || 0) > 0 ? "high" : (Number(x.riskMedium) || 0) > 0 ? "medium" : "low",
            typeKey: (Number(x.execCommandErrorCount) || 0) > 0 ? "sensitive_cmd" : "external",
            sessionId: x.session_id ?? null,
            sessionKey: x.sessionKey ?? null,
            taskId: null,
            description: `Mock 风险事件 H${x.riskHigh}/M${x.riskMedium}/L${x.riskLow}`,
            rulePolicy: "Mock 策略",
            disposition: "pending",
            source: x.label ?? "—",
          })),
        sensitiveAudit: previewRows
          .filter((x) => (Number(x.execCommandErrorCount) || 0) > 0)
          .slice(0, 5)
          .map((x) => ({
            ts: x.updatedAt,
            category: "exec_shell",
            content: "Mock exec/shell 异常",
            sourceIp: null,
            needsConfirmation: true,
            approvalPassed: null,
            result: "blocked_or_error",
            sessionId: x.session_id ?? null,
            sessionKey: x.sessionKey ?? null,
          })),
        policy: {
          execSecurity: "full",
          execAsk: "on-miss",
          fsWorkspaceOnly: true,
          channelGroupPolicy: "open",
          gatewayAuthMode: "token",
          gatewayDenyCommandsCount: 5,
          gatewayDenyCommandsList: ["rm -rf /", "mkfs", ":(){:;};"],
          elevatedAllowFrom: "feishu",
          sandboxMode: "off",
          workspaceDefault: "/mock/ws",
          openclawPath: "/mock/openclaw.json",
          subagentsMaxConcurrent: 4,
          modelCatalogCount: 3,
        },
      },
    },
    sessionsPreview: previewRows,
    timelineRiskSummary: previewRows.reduce(
      (acc, s) => {
        acc.high += Number(s.riskHigh) || 0;
        acc.medium += Number(s.riskMedium) || 0;
        acc.low += Number(s.riskLow) || 0;
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    ),
    qualityDetails: {
      abortedRows: previewRows
        .filter((x) => x.abortedLastRun)
        .map((x) => ({
          sessionId: x.session_id,
          sessionKey: x.sessionKey,
          updatedAt: x.updatedAt,
          detail: "abortedLastRun=true",
          count: 1,
        })),
      toolErrorRows: previewRows
        .filter((x) => (Number(x.toolErrorCount) || 0) > 0)
        .map((x) => ({
          sessionId: x.session_id,
          sessionKey: x.sessionKey,
          updatedAt: x.updatedAt,
          detail: `toolErrorCount=${x.toolErrorCount}`,
          count: x.toolErrorCount,
        })),
      execErrorRows: previewRows
        .filter((x) => (Number(x.execCommandErrorCount) || 0) > 0)
        .map((x) => ({
          sessionId: x.session_id,
          sessionKey: x.sessionKey,
          updatedAt: x.updatedAt,
          detail: `execCommandErrorCount=${x.execCommandErrorCount}`,
          count: x.execCommandErrorCount,
        })),
    },
    openclawHintsPresent: true,
  };
}
