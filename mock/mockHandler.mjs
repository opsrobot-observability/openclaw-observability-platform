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
import { mockLogSearch } from "./data/log-search.mjs";
import { mockConfigAuditLogs } from "./data/config-audit-logs.mjs";
import { mockConfigAuditStats } from "./data/config-audit-stats.mjs";
import { mockSessionCostDetail } from "./data/session-cost-detail.mjs";
import { mockSessionCostOptions } from "./data/session-cost-options.mjs";
import { mockOtelOverview } from "./data/otel-overview.mjs";
import { mockMonitorDashboard } from "./data/monitor-dashboard.mjs";

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
    sendJson(res, 200, mockCostOverview());
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

  // --- 数字员工监控大屏 ---
  if (url.startsWith("/api/monitor-dashboard")) {
    sendJson(res, 200, mockMonitorDashboard());
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
