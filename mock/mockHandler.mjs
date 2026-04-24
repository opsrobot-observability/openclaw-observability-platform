/**
 * Mock 路由分发器 — 统一入口
 * 在 Vite 开发插件中，当 VITE_MOCK=true 时短路到此处理器
 */
import { mockCostOverview } from "./data/cost-overview.mjs";
import { mockAgentCostList } from "./data/agent-cost-list.mjs";
import { mockLlmCostDetail } from "./data/llm-cost-detail.mjs";
import { mockAgentSessions } from "./data/agent-sessions.mjs";
import { mockAgentSessionsLogs } from "./data/agent-sessions-logs.mjs";
import { mockAuditOverview } from "./data/audit-overview.mjs";
import { mockLogTables } from "./data/log-tables.mjs";
import { mockLogSearch, mockUnifiedLogsSearch } from "./data/log-search.mjs";
import { mockConfigAuditLogs } from "./data/config-audit-logs.mjs";
import { mockConfigAuditStats } from "./data/config-audit-stats.mjs";
import { mockSessionCostDetail } from "./data/session-cost-detail.mjs";
import { mockSessionCostOptions } from "./data/session-cost-options.mjs";
import { mockOtelOverview } from "./data/otel-overview.mjs";
import { mockDigitalEmployeeOverview } from "./data/digital-employee-overview.mjs";
import { mockDigitalEmployeeProfile } from "./data/digital-employee-profile.mjs";
import { mockMonitorDashboard } from "./data/monitor-dashboard.mjs";
import {
  mockMonitorSession,
  mockMonitorSessionOverview,
  mockMonitorSessionRiskSessions,
  mockMonitorSessionTrend,
} from "./data/monitor-session.mjs";
import {
  mockHostMonitorData,
  mockHostMonitorOverviewData,
} from "./data/host-monitor.mjs";
import { DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS } from "../frontend/lib/digitalEmployeeRows.js";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

/**
 * Mock 路由处理器
 * @param {string} url - 请求 URL
 * @param {object} res - HTTP response（Vite middleware 风格）
 * @returns {boolean} 是否命中 mock 路由
 */
export function handleMockRequest(url, res) {
  // --- 成本概览 ---
  if (url.startsWith("/api/cost-overview")) {
    const u = new URL(url, "http://mock.local");
    const trendDays = u.searchParams.get("trendDays");
    const start = u.searchParams.get("start");
    const end = u.searchParams.get("end");
    sendJson(res, 200, mockCostOverview({ trendDays, start, end }));
    return true;
  }

  // --- Agent 成本列表 ---
  if (url.startsWith("/api/agent-cost-list")) {
    const u = new URL(url, "http://mock.local");
    const startDay = u.searchParams.get("startDay") || "";
    const endDay = u.searchParams.get("endDay") || "";
    sendJson(res, 200, mockAgentCostList(startDay, endDay));
    return true;
  }

  // --- LLM 成本明细 ---
  if (url.startsWith("/api/llm-cost-detail")) {
    const u = new URL(url, "http://mock.local");
    const startDay = u.searchParams.get("startDay") || "";
    const endDay = u.searchParams.get("endDay") || "";
    sendJson(res, 200, mockLlmCostDetail(startDay, endDay));
    return true;
  }

  // --- 会话成本明细 ---
  if (url.startsWith("/api/session-cost-detail")) {
    const u = new URL(url, "http://mock.local");
    const agents = u.searchParams.get("agents") ? u.searchParams.get("agents").split(",") : [];
    const users = u.searchParams.get("users") ? u.searchParams.get("users").split(",") : [];
    const gateways = u.searchParams.get("gateways") ? u.searchParams.get("gateways").split(",") : [];
    const models = u.searchParams.get("models") ? u.searchParams.get("models").split(",") : [];
    const page = Number(u.searchParams.get("page") ?? "1");
    const pageSize = Number(u.searchParams.get("pageSize") ?? "20");
    sendJson(res, 200, mockSessionCostDetail({ agents, users, gateways, models, page, pageSize }));
    return true;
  }

  // --- 会话成本明细选项 ---
  if (url.startsWith("/api/session-cost-options")) {
    sendJson(res, 200, mockSessionCostOptions());
    return true;
  }

  // --- 审计概览 ---
  if (url.startsWith("/api/agent-sessions-audit-overview")) {
    const u = new URL(url, "http://mock.local");
    const days = parseInt(u.searchParams.get("days") || "7", 10);
    sendJson(res, 200, mockAuditOverview(days));
    return true;
  }

  // --- 数字员工概览 ---
  if (url.startsWith("/api/digital-employees/overview")) {
    const u = new URL(url, "http://mock.local");
    const days = Number(u.searchParams.get("days") || String(DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS));
    const hours = u.searchParams.get("hours");
    sendJson(res, 200, mockDigitalEmployeeOverview(days, hours));
    return true;
  }

  // --- 数字员工画像 ---
  if (url.startsWith("/api/digital-employees/profile")) {
    const u = new URL(url, "http://mock.local");
    const agentName = u.searchParams.get("agentName");
    if (!agentName || !String(agentName).trim()) {
      sendJson(res, 400, { error: "缺少 agentName" });
      return true;
    }
    const days = Number(u.searchParams.get("days") || String(DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS));
    const hours = u.searchParams.get("hours");
    const sessionKey = u.searchParams.get("sessionKey") || u.searchParams.get("session_key");
    const data = mockDigitalEmployeeProfile(agentName, days, hours, sessionKey);
    if (data?.error === "not_found") {
      sendJson(res, 404, { error: data.message || "未找到", source: "mock" });
      return true;
    }
    sendJson(res, 200, data);
    return true;
  }

  // --- 统一日志搜索 ---
  if (url.startsWith("/api/logs-search")) {
    const u = new URL(url, "http://mock.local");
    sendJson(res, 200, mockUnifiedLogsSearch(Object.fromEntries(u.searchParams.entries())));
    return true;
  }

  // --- 日志搜索 ---
  if (url.startsWith("/api/agent-sessions-logs-search")) {
    const u = new URL(url, "http://mock.local");
    sendJson(
      res,
      200,
      mockLogSearch({
        startIso: u.searchParams.get("startIso") || "",
        endIso: u.searchParams.get("endIso") || "",
        q: u.searchParams.get("q") || "",
        type: u.searchParams.get("type") || "",
        provider: u.searchParams.get("provider") || "",
        model: u.searchParams.get("model") || "",
        channel: u.searchParams.get("channel") || "",
        agentName: u.searchParams.get("agentName") || "",
        error: u.searchParams.get("error") || "all",
        limit: u.searchParams.get("limit") || "100",
        offset: u.searchParams.get("offset") || "0",
        logTable: u.searchParams.get("logTable") || "",
      }),
    );
    return true;
  }

  // --- 日志表列表 ---
  if (url.startsWith("/api/agent-sessions-logs-tables")) {
    sendJson(res, 200, mockLogTables());
    return true;
  }

  // --- 单会话日志（注意顺序：需在 /api/agent-sessions 之前匹配） ---
  if (url.startsWith("/api/agent-sessions-logs")) {
    const u = new URL(url, "http://mock.local");
    const sessionId = u.searchParams.get("sessionId") || "";
    if (!sessionId) {
      sendJson(res, 400, { error: "missing sessionId" });
      return true;
    }
    sendJson(res, 200, mockAgentSessionsLogs(sessionId));
    return true;
  }

  // --- 会话列表 ---
  if (url.startsWith("/api/agent-sessions")) {
    sendJson(res, 200, mockAgentSessions());
    return true;
  }

  // --- Gateway 监控概览 ---
  if (url.startsWith("/api/otel-overview")) {
    const u = new URL(url, "http://mock.local");
    sendJson(res, 200, mockOtelOverview({
      hours: u.searchParams.get("hours") || "24",
      granularityMinutes: u.searchParams.get("granularityMinutes") || "30",
      startTime: u.searchParams.get("startTime") || null,
      endTime: u.searchParams.get("endTime") || null,
    }));
    return true;
  }

  // --- 驾驶舱：OTel 综合数据 ---
  if (url.startsWith("/api/monitor-dashboard")) {
    const u = new URL(url, "http://mock.local");
    sendJson(
      res,
      200,
      mockMonitorDashboard({
        trendDays: Number(u.searchParams.get("trendDays") ?? "14"),
        topLimit: Number(u.searchParams.get("topLimit") ?? "10"),
      }),
    );
    return true;
  }
  
  // --- 主机监控总览 ---
  if (url.startsWith("/api/host-monitor/overview")) {
    sendJson(res, 200, mockHostMonitorOverviewData());
    return true;
  }

  // --- 主机监控详情 ---
  if (url.startsWith("/api/host-monitor")) {
    sendJson(res, 200, mockHostMonitorData());
    return true;
  }

  // --- 驾驶舱：会话模块聚合 ---
  if (url === "/api/monitor-session" || url.startsWith("/api/monitor-session?")) {
    const u = new URL(url, "http://mock.local");
    sendJson(
      res,
      200,
      mockMonitorSession({
        trendDays: Number(u.searchParams.get("trendDays") ?? "30"),
        riskLimit: Number(u.searchParams.get("riskLimit") ?? "0"),
      }),
    );
    return true;
  }

  // --- 驾驶舱：会话概览 ---
  if (url.startsWith("/api/monitor-session-overview")) {
    sendJson(res, 200, mockMonitorSessionOverview());
    return true;
  }

  // --- 驾驶舱：风险会话 ---
  if (url.startsWith("/api/monitor-session-risk")) {
    const u = new URL(url, "http://mock.local");
    sendJson(
      res,
      200,
      mockMonitorSessionRiskSessions({
        riskLimit: Number(u.searchParams.get("riskLimit") ?? "0"),
      }),
    );
    return true;
  }

  // --- 驾驶舱：会话趋势 ---
  if (url.startsWith("/api/monitor-session-trend")) {
    const u = new URL(url, "http://mock.local");
    sendJson(
      res,
      200,
      mockMonitorSessionTrend({
        trendDays: Number(u.searchParams.get("trendDays") ?? "30"),
      }),
    );
    return true;
  }

  // --- 配置审计统计（注意顺序：需在 /api/config-audit-logs 之前匹配） ---
  if (url.startsWith("/api/config-audit-stats")) {
    sendJson(res, 200, mockConfigAuditStats());
    return true;
  }

  // --- 配置审计日志 ---
  if (url.startsWith("/api/config-audit-logs")) {
    const u = new URL(url, "http://mock.local");
    sendJson(
      res,
      200,
      mockConfigAuditLogs({
        startIso: u.searchParams.get("startIso") || "",
        endIso: u.searchParams.get("endIso") || "",
        limit: u.searchParams.get("limit") || "100",
        offset: u.searchParams.get("offset") || "0",
      }),
    );
    return true;
  }

  // 未命中
  return false;
}
