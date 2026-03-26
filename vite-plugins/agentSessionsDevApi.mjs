import {
  queryAgentSessionsLogsRaw,
  queryAgentSessionsRawWithLogTokens,
} from "../server/agentSessionsQuery.mjs";
import { queryAuditDashboardMetrics } from "../server/auditDashboardQuery.mjs";
import { queryCostOverviewSnapshot } from "../server/costOverviewQuery.mjs";
import { queryAgentCostList, queryLlmCostDetail } from "../server/agentLlmCostTablesQuery.mjs";
import {
  listOtelAgentSessionsLogTables,
  queryAgentSessionsLogsSearch,
} from "../server/agentSessionsLogsSearchQuery.mjs";
import { queryConfigAuditLogs, queryConfigAuditStats } from "../server/configAuditQuery.mjs";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
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
 */
export function agentSessionsDevApi() {
  return {
    name: "agent-sessions-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (req.method !== "GET") return next();

        if (url.startsWith("/api/cost-overview")) {
          try {
            const snapshot = await queryCostOverviewSnapshot();
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

        if (url.startsWith("/api/agent-sessions-logs-search")) {
          try {
            const u = new URL(url, "http://vite.local");
            const startIso = u.searchParams.get("startIso");
            const endIso = u.searchParams.get("endIso");
            if (!startIso || !endIso) {
              sendJson(res, 400, { error: "missing startIso or endIso" });
              return;
            }
            const data = await queryAgentSessionsLogsSearch({
              startIso,
              endIso,
              q: u.searchParams.get("q") ?? "",
              type: u.searchParams.get("type") ?? "",
              provider: u.searchParams.get("provider") ?? "",
              model: u.searchParams.get("model") ?? "",
              channel: u.searchParams.get("channel") ?? "",
              agentName: u.searchParams.get("agentName") ?? "",
              error: /** @type {"all"|"yes"|"no"} */ (u.searchParams.get("error") ?? "all"),
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

        next();
      });
    },
  };
}
