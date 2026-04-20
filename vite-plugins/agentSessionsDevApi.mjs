import {
  queryAgentSessionsLogsRaw,
  queryAgentSessionsRawWithLogTokens,
} from "../backend/agentSessionsQuery.mjs";
import {
  handleSreAgentMiddleware,
  handleSreAgentActionMiddleware,
  handleListAgentsMiddleware,
  isOpenClawAgentsListPath,
  handleOpenClawSessionsMiddleware,
  isOpenClawSessionsPath,
} from "../backend/sre-agent/sre-agent-handler.mjs";
import { handleSreVizFileMiddleware, isSreVizJsonPath } from "../backend/sre-agent/sre-viz-file-handler.mjs";
import { queryAuditDashboardMetrics } from "../backend/security-audit/audit-dashboard-query.mjs";
import { queryCostOverviewSnapshot } from "../backend/cost-analysis/cost-overview-query.mjs";
import {
  querySessionCostDetail,
  querySessionCostOptions,
} from "../backend/cost-analysis/cost-overview-2-query.mjs";
import { queryAgentCostList, queryLlmCostDetail } from "../backend/cost-analysis/agent-llm-cost-tables-query.mjs";
import {
  listOtelAgentSessionsLogTables,
  queryAgentSessionsLogsSearch,
} from "../backend/log-search/log-search-query.mjs";
import { queryUnifiedLogsSearch } from "../backend/log-search/unified-logs-search.mjs";
import { queryConfigAuditLogs, queryConfigAuditStats } from "../backend/security-audit/config-audit-query.mjs";
import { queryOtelOverviewData } from "../backend/otel-metrics/otel-overview-query.mjs";
import {
  queryMonitorDashboard,
  queryMonitorDashboardSourceTerminalsByWindow,
} from "../backend/monitor-dashboard/monitor-dashboard-query.mjs";
import {
  queryMonitorSession,
  queryMonitorSessionOverview,
  queryMonitorSessionRiskSessions,
  queryMonitorSessionTrend,
} from "../backend/monitor-dashboard/monitor-session-query.mjs";

import {
  buildDigitalEmployeeOverview,
  buildDigitalEmployeeProfile,
} from "../backend/digital-employee/digital-employee-service.mjs";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

/** Connect/Vite 下 req.url 常带 ?query；须用 pathname 匹配路由 */
function requestPathname(raw) {
  const u = raw || "";
  const q = u.indexOf("?");
  const p = q >= 0 ? u.slice(0, q) : u;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/**
 * 开发环境：挂载
 * - GET /api/agent-sessions-audit-overview — 两表聚合概览
 * - GET /api/agent-sessions — `otel.agent_sessions`
 * - GET /api/agent-sessions-logs-tables — 列出 otel 下 agent_sessions_logs* 表名
 * - GET /api/agent-sessions-logs-search — 日志查询（主表/日表 + logTable 参数）
 * - GET /api/agent-sessions-logs?sessionId= — 单会话原始行
 * - GET /api/cost-overview — 成本概览（`otel.agent_sessions_logs` + `agent_sessions`）
 * - GET /api/agent-cost-list?startDay=&endDay=
 * - GET /api/llm-cost-detail?startDay=&endDay=
 * - GET /api/session-cost-detail?startDay=&endDay=
 * - GET /api/session-cost-options?startDay=&endDay=
 * - GET /api/openclaw/agents | GET /api/sre-agent/agents — OpenClaw Agent 列表（JSON）
 * - GET /api/openclaw/sessions | GET /api/openclaw/sessions/:key — OpenClaw 会话列表/详情（代理）
 * - GET /api/digital-employees/overview?days=
 * - GET /api/digital-employees/profile?agentName=&days=&sessionKey=
 */
export function agentSessionsDevApi() {
  const useMock = process.env.VITE_MOCK === "true";
  if (useMock) {
    console.log("[dev-api] 🎭 Mock 模式已启用（VITE_MOCK=true），API 将返回预设数据");
  }
  return {
    name: "agent-sessions-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        const path = requestPathname(url);

        // SRE Agent endpoints — 独立于 Mock/Live 模式
        if (isOpenClawAgentsListPath(path) && req.method === "GET") {
          void handleListAgentsMiddleware(req, res).catch((e) => {
            if (!res.headersSent && !res.writableEnded) {
              sendJson(res, 500, { agents: [], error: String(e?.message || e) });
            }
          });
          return;
        }
        if (isOpenClawSessionsPath(path) && req.method === "GET") {
          void handleOpenClawSessionsMiddleware(req, res).catch((e) => {
            if (!res.headersSent && !res.writableEnded) {
              sendJson(res, 500, { error: String(e?.message || e) });
            }
          });
          return;
        }
        if (path === "/api/sre-agent/action" && req.method === "POST") {
          return handleSreAgentActionMiddleware(req, res);
        }
        if (isSreVizJsonPath(path) && req.method === "GET") {
          void handleSreVizFileMiddleware(req, res).catch((e) => {
            if (!res.headersSent && !res.writableEnded) {
              sendJson(res, 500, { error: String(e?.message || e) });
            }
          });
          return;
        }
        if (path.startsWith("/api/sre-agent") && req.method === "POST") {
          return handleSreAgentMiddleware(req, res);
        }

        if (req.method !== "GET") return next();

        // Mock 模式：使用静态数据，无需数据库
        if (useMock) {
          const { handleMockRequest } = await import("../mock/mockHandler.mjs");
          if (handleMockRequest(url, res)) return;
          return next();
        }

        if (url === "/api/cost-overview" || url.startsWith("/api/cost-overview?")) {
          try {
            const u = new URL(url, "http://vite.local");
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
            const u = new URL(url, "http://vite.local");
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
            const u = new URL(url, "http://vite.local");
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

        if (url.startsWith("/api/session-cost-detail")) {
          try {
            const u = new URL(url, "http://vite.local");
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
            const u = new URL(url, "http://vite.local");
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


        if (url.startsWith("/api/digital-employees/profile")) {
          try {
            const u = new URL(url, "http://vite.local");
            const agentName = u.searchParams.get("agentName");
            const daysParam = u.searchParams.get("days");
            const hoursParam = u.searchParams.get("hours");
            const sessionKeyParam = u.searchParams.get("sessionKey") || u.searchParams.get("session_key");
            if (!agentName || !String(agentName).trim()) {
              sendJson(res, 400, { error: "缺少 agentName" });
              return;
            }
            const data = await buildDigitalEmployeeProfile(agentName, daysParam, hoursParam, sessionKeyParam);
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

        if (url.startsWith("/api/digital-employees/overview")) {
          try {
            const u = new URL(url, "http://vite.local");
            const daysParam = u.searchParams.get("days");
            const hoursParam = u.searchParams.get("hours");
            const data = await buildDigitalEmployeeOverview(daysParam, hoursParam);
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

        if (url.startsWith("/api/logs-search")) {
          try {
            const u = new URL(url, "http://vite.local");
            const data = await queryUnifiedLogsSearch(Object.fromEntries(u.searchParams.entries()));
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url.startsWith("/api/agent-sessions-logs-search")) {
          try {
            const u = new URL(url, "http://vite.local");
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
            const u = new URL(url, "http://vite.local");
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

        if (url.startsWith("/api/config-audit-stats")) {
          try {
            const u = new URL(url, "http://vite.local");
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

        if (url.startsWith("/api/config-audit-logs")) {
          try {
            const u = new URL(url, "http://vite.local");
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

        if (url.startsWith("/api/monitor-dashboard-source-terminals")) {
          try {
            const u = new URL(url, "http://vite.local");
            const window = u.searchParams.get("window") ?? "month";
            const data = await queryMonitorDashboardSourceTerminalsByWindow(window);
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url.startsWith("/api/monitor-dashboard")) {
          try {
            const u = new URL(url, "http://vite.local");
            const data = await queryMonitorDashboard({
              trendDays: Number(u.searchParams.get("trendDays") ?? "14"),
              topLimit: Number(u.searchParams.get("topLimit") ?? "10"),
            });
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url === "/api/monitor-session" || url.startsWith("/api/monitor-session?")) {
          try {
            const u = new URL(url, "http://vite.local");
            const data = await queryMonitorSession({
              trendDays: Number(u.searchParams.get("trendDays") ?? "30"),
              riskLimit: Number(u.searchParams.get("riskLimit") ?? "50"),
            });
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url.startsWith("/api/monitor-session-overview")) {
          try {
            const data = await queryMonitorSessionOverview();
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url.startsWith("/api/monitor-session-risk")) {
          try {
            const u = new URL(url, "http://vite.local");
            const data = await queryMonitorSessionRiskSessions({
              riskLimit: Number(u.searchParams.get("riskLimit") ?? "0"),
            });
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url.startsWith("/api/monitor-session-trend")) {
          try {
            const u = new URL(url, "http://vite.local");
            const data = await queryMonitorSessionTrend({
              trendDays: Number(u.searchParams.get("trendDays") ?? "30"),
            });
            sendJson(res, 200, data);
          } catch (e) {
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        if (url.startsWith("/api/otel-overview")) {
          try {
            const u = new URL(url, "http://vite.local");
            const hours = Number(u.searchParams.get("hours") ?? "1");
            const granularityMinutes = Number(u.searchParams.get("granularityMinutes") ?? "1");
            const startTime = u.searchParams.get("startTime");
            const endTime = u.searchParams.get("endTime");
            console.log("[otel-overview] Querying with hours:", hours, "granularityMinutes:", granularityMinutes, "startTime:", startTime, "endTime:", endTime);
            const data = await queryOtelOverviewData({ hours, granularityMinutes, startTime, endTime });
            console.log("[otel-overview] Success, instances:", data.instances?.length || 0);
            sendJson(res, 200, data);
          } catch (e) {
            console.error("[otel-overview] Error:", e);
            const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
            sendJson(res, 500, { error: msg });
          }
          return;
        }

        next();
      });
    },
  };
}

