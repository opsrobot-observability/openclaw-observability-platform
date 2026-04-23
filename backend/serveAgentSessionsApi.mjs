/**
 * 独立 HTTP 服务（供 `vite preview` 代理）
 * - POST /api/sre-agent              — SRE Agent SSE (AG-UI → OpenClaw)
 * - GET  /api/openclaw/agents       — OpenClaw Agent 列表（与 GET /api/sre-agent/agents 等价）
 * - GET /api/logs-search（统一：agent_sessions / audit_logs / gateway_logs / all）
 * - GET  /api/agent-sessions
 * - GET  /api/agent-sessions-logs-search
 * - GET  /api/agent-sessions-logs-tables
 * - GET  /api/agent-sessions-logs?sessionId=
 * - GET  /api/cost-overview
 * - GET  /api/agent-cost-list?startDay=&endDay=
 * - GET  /api/llm-cost-detail?startDay=&endDay=
 * - GET  /api/session-cost-detail?startDay=&endDay=
 * - GET  /api/session-cost-options?startDay=&endDay=
 */
import "./env-bootstrap.mjs";
import http from "node:http";
import {
  handleSreAgent,
  handleListAgents,
  isOpenClawAgentsListPath,
  handleOpenClawSessions,
  isOpenClawSessionsPath,
} from "./sre-agent/sre-agent-handler.mjs";
import {
  handleSreVizFileRead,
  isSreVizJsonPath,
  handleSreReportMdRead,
  isSreReportMdPath,
} from "./sre-agent/sre-viz-file-handler.mjs";
import { attachSreAgentWebSocket } from "./sre-agent/sre-agent-ws.mjs";
import {
  queryAgentSessionsLogsRaw,
  queryAgentSessionsRawWithLogTokens,
} from "./agentSessionsQuery.mjs";
import { queryAuditDashboardMetrics } from "./security-audit/audit-dashboard-query.mjs";
import { queryCostOverviewSnapshot } from "./cost-analysis/cost-overview-query.mjs";
import { queryAgentCostList, queryLlmCostDetail } from "./cost-analysis/agent-llm-cost-tables-query.mjs";
import {
  listOtelAgentSessionsLogTables,
  queryAgentSessionsLogsSearch,
} from "./log-search/log-search-query.mjs";
import { queryUnifiedLogsSearch } from "./log-search/unified-logs-search.mjs";
import { queryConfigAuditLogs, queryConfigAuditStats } from "./security-audit/config-audit-query.mjs";
import {
  querySessionCostDetail,
  querySessionCostOptions,
} from "./cost-analysis/cost-overview-2-query.mjs";
import {
  queryMonitorDashboard,
  queryMonitorDashboardSourceTerminalsByWindow,
} from "./monitor-dashboard/monitor-dashboard-query.mjs";
import {
  queryMonitorSession,
  queryMonitorSessionOverview,
  queryMonitorSessionRiskSessions,
  queryMonitorSessionTrend,
} from "./monitor-dashboard/monitor-session-query.mjs";
import {
  buildDigitalEmployeeOverview,
  buildDigitalEmployeeProfile,
} from "./digital-employee/digital-employee-service.mjs";

import { queryOtelOverviewData } from "./otel-metrics/otel-overview-query.mjs";
const port = Number(process.env.PORT ?? 8787);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function requestPathname(raw) {
  const u = raw || "";
  const q = u.indexOf("?");
  const p = q >= 0 ? u.slice(0, q) : u;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "";
  const path = requestPathname(url);

  // OpenClaw Agent 列表（GET），须剥离 ?query，避免误匹配下方 /api/sre-agent
  if (isOpenClawAgentsListPath(path) && req.method === "GET") {
    return handleListAgents(req, res);
  }

  if (isOpenClawSessionsPath(path) && req.method === "GET") {
    return handleOpenClawSessions(req, res);
  }

  if (isSreReportMdPath(path) && req.method === "GET") {
    return handleSreReportMdRead(req, res, url);
  }

  if (isSreVizJsonPath(path) && req.method === "GET") {
    return handleSreVizFileRead(req, res, url);
  }

  // WebSocket 仅 upgrade，不走 HTTP POST
  if (path === "/api/sre-agent/ws") {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "WebSocket only — use ws:// on this path" }));
    return;
  }

  // SRE Agent SSE endpoint (POST only)
  if (path.startsWith("/api/sre-agent")) {
    return handleSreAgent(req, res);
  }

  if (req.method !== "GET") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (url.startsWith("/api/otel-overview")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const hours = Number(u.searchParams.get("hours") ?? "1");
      const granularityMinutes = Number(u.searchParams.get("granularityMinutes") ?? "1");
      const startTime = u.searchParams.get("startTime");
      const endTime = u.searchParams.get("endTime");
      const data = await queryOtelOverviewData({ hours, granularityMinutes, startTime, endTime });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/cost-overview")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const td = Number(u.searchParams.get("trendDays") ?? "14");
      const snapshot = await queryCostOverviewSnapshot({ trendDays: td });
      sendJson(res, 200, snapshot);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/agent-cost-list")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const startDay = u.searchParams.get("startDay");
      const endDay = u.searchParams.get("endDay");
      if (!startDay || !endDay) {
        sendJson(res, 400, { error: "missing startDay or endDay (YYYY-MM-DD)" });
        return;
      }
      const data = await queryAgentCostList(startDay, endDay);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/llm-cost-detail")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const startDay = u.searchParams.get("startDay");
      const endDay = u.searchParams.get("endDay");
      if (!startDay || !endDay) {
        sendJson(res, 400, { error: "missing startDay or endDay (YYYY-MM-DD)" });
        return;
      }
      const data = await queryLlmCostDetail(startDay, endDay);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/agent-sessions-audit-overview")) {
    try {
      const snapshot = await queryAuditDashboardMetrics();
      sendJson(res, 200, snapshot);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/digital-employees/overview")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const daysParam = u.searchParams.get("days");
      const hoursParam = u.searchParams.get("hours");
      const data = await buildDigitalEmployeeOverview(daysParam ?? "7", hoursParam);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/digital-employees/profile")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const agentName = u.searchParams.get("agentName");
      const daysParam = u.searchParams.get("days");
      const hoursParam = u.searchParams.get("hours");
      const sessionKeyParam = u.searchParams.get("sessionKey") || u.searchParams.get("session_key");
      if (!agentName || !String(agentName).trim()) {
        sendJson(res, 400, { error: "缺少 agentName" });
        return;
      }
      const data = await buildDigitalEmployeeProfile(agentName, daysParam ?? "7", hoursParam, sessionKeyParam);
      if (data.error === "missing_agent") {
        sendJson(res, 400, { error: data.message || "缺少 agentName" });
        return;
      }
      if (data.error === "not_found") {
        sendJson(res, 404, { error: data.message || "未找到", source: data.source });
        return;
      }
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/logs-search")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const o = Object.fromEntries(u.searchParams.entries());
      const data = await queryUnifiedLogsSearch(o);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/agent-sessions-logs-search")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const startIso = u.searchParams.get("startIso");
      const endIso = u.searchParams.get("endIso");
      if (!startIso || !endIso) {
        sendJson(res, 400, { error: "missing startIso or endIso" });
        return;
      }
      const errParam = u.searchParams.get("error");
      const err =
        errParam === "yes" || errParam === "no" ? /** @type {"yes"|"no"} */ (errParam) : "all";
      const data = await queryAgentSessionsLogsSearch({
        startIso,
        endIso,
        q: u.searchParams.get("q") ?? "",
        type: u.searchParams.get("type") ?? "",
        provider: u.searchParams.get("provider") ?? "",
        model: u.searchParams.get("model") ?? "",
        channel: u.searchParams.get("channel") ?? "",
        agentName: u.searchParams.get("agentName") ?? "",
        sessionId: u.searchParams.get("sessionId") ?? "",
        traceId: u.searchParams.get("traceId") ?? "",
        requestId: u.searchParams.get("requestId") ?? "",
        levels: u.searchParams.get("levels") ?? "",
        logCategory: u.searchParams.get("logCategory") ?? "",
        sortKey: u.searchParams.get("sortKey") ?? "time",
        sortDir: u.searchParams.get("sortDir") ?? "desc",
        error: err,
        limit: Number(u.searchParams.get("limit") ?? "100"),
        offset: Number(u.searchParams.get("offset") ?? "0"),
        logTable: u.searchParams.get("logTable") ?? "",
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/agent-sessions-logs-tables")) {
    try {
      const data = await listOtelAgentSessionsLogTables();
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/agent-sessions-logs")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const sessionId = u.searchParams.get("sessionId");
      if (!sessionId) {
        sendJson(res, 400, { error: "missing sessionId" });
        return;
      }
      const rows = await queryAgentSessionsLogsRaw(sessionId);
      sendJson(res, 200, rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/agent-sessions")) {
    try {
      const rows = await queryAgentSessionsRawWithLogTokens();
      sendJson(res, 200, rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/session-cost-detail")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const startDay = u.searchParams.get("startDay");
      const endDay = u.searchParams.get("endDay");
      if (!startDay || !endDay) {
        sendJson(res, 400, { error: "missing startDay or endDay (YYYY-MM-DD)" });
        return;
      }
      const data = await querySessionCostDetail({
        startDay,
        endDay,
        agents: u.searchParams.get("agents") ? u.searchParams.get("agents").split(",") : [],
        users: u.searchParams.get("users") ? u.searchParams.get("users").split(",") : [],
        gateways: u.searchParams.get("gateways") ? u.searchParams.get("gateways").split(",") : [],
        models: u.searchParams.get("models") ? u.searchParams.get("models").split(",") : [],
        page: Number(u.searchParams.get("page") ?? "1"),
        pageSize: Number(u.searchParams.get("pageSize") ?? "20"),
        sortKey: u.searchParams.get("sortKey") ?? "totalTokens",
        sortOrder: u.searchParams.get("sortOrder") ?? "desc",
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  if (url.startsWith("/api/session-cost-options")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await querySessionCostOptions({
        startDay: u.searchParams.get("startDay") || undefined,
        endDay: u.searchParams.get("endDay") || undefined,
        limit: Number(u.searchParams.get("limit") ?? "50"),
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 配置变更审计日志查询
  if (url.startsWith("/api/config-audit-logs")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await queryConfigAuditLogs({
        startIso: u.searchParams.get("startIso") ?? undefined,
        endIso: u.searchParams.get("endIso") ?? undefined,
        source: u.searchParams.get("source") ?? undefined,
        event: u.searchParams.get("event") ?? undefined,
        configPath: u.searchParams.get("configPath") ?? undefined,
        pid: u.searchParams.get("pid") ? Number(u.searchParams.get("pid")) : undefined,
        result: u.searchParams.get("result") ?? undefined,
        suspicious: u.searchParams.get("suspicious") ?? "all",
        gatewayChange: u.searchParams.get("gatewayChange") ?? undefined,
        sortKey: u.searchParams.get("sortKey") ?? "event_time",
        sortDir: u.searchParams.get("sortDir") ?? "desc",
        limit: Number(u.searchParams.get("limit") ?? "100"),
        offset: Number(u.searchParams.get("offset") ?? "0"),
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 配置变更审计统计
  if (url.startsWith("/api/config-audit-stats")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await queryConfigAuditStats({
        startIso: u.searchParams.get("startIso") ?? undefined,
        endIso: u.searchParams.get("endIso") ?? undefined,
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 监控大屏 — 来源终端（口径对齐行为审计概览）
  if (url.startsWith("/api/monitor-dashboard-source-terminals")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const window = u.searchParams.get("window") ?? "month";
      const data = await queryMonitorDashboardSourceTerminalsByWindow(window);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 监控大屏 — OTel 综合数据
  if (url.startsWith("/api/monitor-dashboard")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await queryMonitorDashboard({
        trendDays: Number(u.searchParams.get("trendDays") ?? "14"),
        topLimit: Number(u.searchParams.get("topLimit") ?? "10"),
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 监控大屏 — 会话模块（会话概览 / 风险会话 / 会话趋势）
  if (url === "/api/monitor-session" || url.startsWith("/api/monitor-session?")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await queryMonitorSession({
        trendDays: Number(u.searchParams.get("trendDays") ?? "14"),
        riskLimit: Number(u.searchParams.get("riskLimit") ?? "50"),
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 监控大屏 — 会话概览（独立接口）
  if (url.startsWith("/api/monitor-session-overview")) {
    try {
      const data = await queryMonitorSessionOverview();
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 监控大屏 — 风险会话（独立接口）
  if (url.startsWith("/api/monitor-session-risk")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await queryMonitorSessionRiskSessions({
        riskLimit: Number(u.searchParams.get("riskLimit") ?? "0"),
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  // 监控大屏 — 会话趋势（独立接口）
  if (url.startsWith("/api/monitor-session-trend")) {
    try {
      const u = new URL(url, "http://127.0.0.1");
      const data = await queryMonitorSessionTrend({
        trendDays: Number(u.searchParams.get("trendDays") ?? "14"),
      });
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

attachSreAgentWebSocket(server);

server.listen(port, "0.0.0.0", () => {
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/monitor-dashboard`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/monitor-session`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/digital-employees/overview`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/digital-employees/profile?agentName=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/otel-overview`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/openclaw/agents`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/openclaw/sessions`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/cost-overview`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-cost-list?startDay=&endDay=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/llm-cost-detail?startDay=&endDay=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions-audit-overview`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions-logs-tables`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions-logs?sessionId=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/config-audit-logs`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/config-audit-stats`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/session-cost-detail?startDay=&endDay=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/session-cost-options?startDay=&endDay=`);
});
