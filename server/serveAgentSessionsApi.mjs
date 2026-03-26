/**
 * 独立 HTTP 服务（供 `vite preview` 代理）
 * - GET /api/agent-sessions
 * - GET /api/agent-sessions-logs-search
 * - GET /api/agent-sessions-logs-tables
 * - GET /api/agent-sessions-logs?sessionId=
 * - GET /api/cost-overview
 * - GET /api/agent-cost-list?startDay=&endDay=
 * - GET /api/llm-cost-detail?startDay=&endDay=
 */
import http from "node:http";
import {
  queryAgentSessionsLogsRaw,
  queryAgentSessionsRawWithLogTokens,
} from "./agentSessionsQuery.mjs";
import { queryAuditDashboardMetrics } from "./auditDashboardQuery.mjs";
import { queryCostOverviewSnapshot } from "./costOverviewQuery.mjs";
import { queryAgentCostList, queryLlmCostDetail } from "./agentLlmCostTablesQuery.mjs";
import {
  listOtelAgentSessionsLogTables,
  queryAgentSessionsLogsSearch,
} from "./agentSessionsLogsSearchQuery.mjs";
import { queryConfigAuditLogs, queryConfigAuditStats } from "./configAuditQuery.mjs";

const port = Number(process.env.PORT ?? 8787);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "";
  if (req.method !== "GET") {
    res.writeHead(404);
    res.end();
    return;
  }

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

  res.writeHead(404);
  res.end();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/cost-overview`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-cost-list?startDay=&endDay=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/llm-cost-detail?startDay=&endDay=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions-audit-overview`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions-logs-tables`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/agent-sessions-logs?sessionId=`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/config-audit-logs`);
  console.log(`[agent-sessions] http://127.0.0.1:${port}/api/config-audit-stats`);
});
