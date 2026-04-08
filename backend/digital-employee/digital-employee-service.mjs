/**
 * 数字员工：仅从 Doris 会话表聚合，不再使用本地文件兜底。
 * 版本 1.1.0
 */
import { queryAgentSessionsRawWithLogTokens, queryAgentSessionsLogsRaw } from "../agentSessionsQuery.mjs";
import { mapAgentSessionRows, agentSessionsLogsRowsToLines, extractToolInvocations } from "../../frontend/lib/sessionAudit.js";
import { buildOverviewPayload } from "./digital-employee-overview-builder.mjs";
import { readOpenclawHintsBundle } from "./digital-employee-openclaw-hints.mjs";
import { buildEmployeeProfileDetail } from "./digital-employee-profile-builder.mjs";

function clampDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(90, Math.floor(n));
}

function clampHours(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(168, Math.floor(n));
}

/**
 * @returns {{ cutoffMs: number, billingDays: number, displayDays: number|null, displayHours: number|null }}
 * 版本 1.0.1
 */
function resolveWindow(daysRaw, hoursRaw) {
  if (hoursRaw != null && hoursRaw !== "" && Number.isFinite(Number(hoursRaw))) {
    const h = clampHours(hoursRaw);
    const billingDays = Math.max(h / 24, 1 / 24);
    return {
      cutoffMs: Date.now() - h * 3600000,
      billingDays,
      displayDays: null,
      displayHours: h,
    };
  }
  const d = clampDays(daysRaw);
  return {
    cutoffMs: Date.now() - d * 86400000,
    billingDays: d,
    displayDays: d,
    displayHours: null,
  };
}

/**
 * @param {number} cutoffMs
 * @returns {Promise<{ source: "doris", rows: ReturnType<typeof mapAgentSessionRows> }>}
 */
export async function loadDigitalEmployeeSessionRowsByCutoff(cutoffMs) {
  const raw = await queryAgentSessionsRawWithLogTokens();
  const inWindow = raw.filter((r) => {
    const u = Number(r.updated_at);
    return Number.isFinite(u) && u >= cutoffMs;
  });
  return { source: "doris", rows: mapAgentSessionRows(inWindow) };
}

/**
 * @param {number|string|undefined} days
 * @param {number|string|undefined|null} hours  若传入则优先按小时窗口（12/24 等）
 */
export async function buildDigitalEmployeeOverview(days, hours) {
  const win = resolveWindow(days, hours);
  const { source, rows } = await loadDigitalEmployeeSessionRowsByCutoff(win.cutoffMs);
  const payload = buildOverviewPayload(rows, {
    days: win.billingDays,
    windowStartMs: win.cutoffMs,
    hasHours: win.displayHours != null,
  });
  return {
    source,
    ...payload,
    days: win.displayDays ?? win.billingDays,
    hours: win.displayHours,
  };
}

function normalizeAgentQuery(name) {
  if (name == null) return "";
  let s = String(name).trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  return s.trim();
}

/** @param {Record<string, unknown>} r */
function rowEmployeeKey(r) {
  const sk = r.sessionKey != null && String(r.sessionKey).trim() ? String(r.sessionKey).trim() : "";
  if (sk) return sk;
  const sid =
    (r.session_id != null && String(r.session_id).trim() ? String(r.session_id).trim() : "") ||
    (r.sessionId != null && String(r.sessionId).trim() ? String(r.sessionId).trim() : "");
  return sid || "";
}

/**
 * 单员工画像：o3 汇总 + 会话行下钻 + Doris 配置摘要。
 * @param {string|null|undefined} agentNameRaw URL 中的 agentName
 * @param {number|string|undefined} days
 * @param {number|string|undefined|null} hours
 * @param {string|null|undefined} sessionScopeRaw 与列表 `rowSessionKey` 一致，用于事件时间线仅含本数字员工会话
 */
export async function buildDigitalEmployeeProfile(agentNameRaw, days, hours, sessionScopeRaw) {
  const wanted = normalizeAgentQuery(agentNameRaw);
  const sessionScope =
    sessionScopeRaw != null && String(sessionScopeRaw).trim() ? String(sessionScopeRaw).trim() : "";
  if (!wanted && !sessionScope) {
    return { error: "missing_agent", message: "缺少 agentName 参数" };
  }
  const win = resolveWindow(days, hours);
  const { source, rows } = await loadDigitalEmployeeSessionRowsByCutoff(win.cutoffMs);
  const payload = buildOverviewPayload(rows, {
    days: win.billingDays,
    windowStartMs: win.cutoffMs,
    hasHours: win.displayHours != null,
  });
  const aggList = payload.agentsAggregated ?? [];
  const agent =
    (sessionScope
      ? aggList.find(
          (a) =>
            String(a.employeeKey || "").trim() === sessionScope ||
            String(a.sessionKey || "").trim() === sessionScope ||
            String(a.sessionId || "").trim() === sessionScope,
        )
      : null) ??
    aggList.find((a) => String(a.agentName || "").trim() === wanted) ??
    null;
  if (!agent) {
    return {
      error: "not_found",
      message: "当前时间窗内未找到该员工或无会话数据",
      source,
      days: win.displayDays ?? win.billingDays,
      hours: win.displayHours,
    };
  }
  const employeeKey = String(agent.employeeKey ?? "").trim();
  const sessionRows = employeeKey
    ? rows.filter((r) => rowEmployeeKey(r) === employeeKey)
    : rows.filter((r) => (r.agentName || "").trim() === agent.agentName);
  const sessionIds = [...new Set(sessionRows.map((r) => String(r.session_id ?? "").trim()).filter(Boolean))];
  const logRowsBatches = await Promise.all(sessionIds.map((sid) => queryAgentSessionsLogsRaw(sid)));
  const allLogRows = logRowsBatches.flat();
  const costFromDb = allLogRows.reduce(
    (acc, row) => {
      const inp = Number(row?.message_usage_input);
      const out = Number(row?.message_usage_output);
      if (Number.isFinite(inp) && inp > 0) acc.inputTokens += inp;
      if (Number.isFinite(out) && out > 0) acc.outputTokens += out;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0 },
  );
  const logLines = agentSessionsLogsRowsToLines(allLogRows);
  const toolInv = extractToolInvocations(logLines);
  let toolDurationSum = 0;
  let toolDurationN = 0;
  /** @type {Map<string, number>} */
  const toolStartById = new Map();
  /** @type {number[]} */
  const toolStartQueue = [];
  for (const c of toolInv.calls || []) {
    if (c.tMs == null || !Number.isFinite(Number(c.tMs))) continue;
    const t = Number(c.tMs);
    toolStartQueue.push(t);
    if (c.toolCallId) toolStartById.set(String(c.toolCallId), t);
  }
  for (const line of logLines) {
    if (line?.type !== "message" || !line.message || line.message.role !== "toolResult") continue;
    const endTs = Number(line.timestamp ? Date.parse(String(line.timestamp)) : NaN);
    let d = Number(line.message?.details?.durationMs);
    if (!(Number.isFinite(d) && d >= 0)) {
      const tcid = line.message?.toolCallId != null ? String(line.message.toolCallId) : "";
      let start = tcid && toolStartById.has(tcid) ? toolStartById.get(tcid) : null;
      if (start == null && Number.isFinite(endTs) && toolStartQueue.length > 0) {
        // fallback: 按时间顺序匹配最近未消费的 tool call
        start = toolStartQueue.shift();
      }
      if (start != null && Number.isFinite(endTs) && endTs >= start) {
        d = endTs - start;
      }
    }
    if (Number.isFinite(d) && d >= 0) {
      toolDurationSum += Number(d);
      toolDurationN += 1;
    }
  }
  const avgToolDurationMs = toolDurationN > 0 ? Math.round(toolDurationSum / toolDurationN) : null;
  let avgToolDurationFinal = avgToolDurationMs;
  if (avgToolDurationFinal == null) {
    const runtimeSum = sessionRows.reduce((s, r) => {
      const d = Number(r.durationMs);
      return Number.isFinite(d) && d >= 0 ? s + d : s;
    }, 0);
    const toolUseSum = sessionRows.reduce((s, r) => {
      const n = Number(r.toolUseCount);
      return Number.isFinite(n) && n > 0 ? s + n : s;
    }, 0);
    if (runtimeSum > 0 && toolUseSum > 0) {
      avgToolDurationFinal = Math.round(runtimeSum / toolUseSum);
    }
  }
  const toolNamesFromLogs = Object.keys(toolInv.byName || {});
  const sessionMetaById = new Map(
    sessionRows
      .map((r) => {
        const sid = String(r.session_id ?? r.sessionId ?? "").trim();
        if (!sid) return null;
        return [
          sid,
          {
            sessionId: sid,
            sessionKey: String(r.sessionKey ?? "").trim() || null,
            updatedAt: Number(r.updatedAt) || Number(r.endedAt) || null,
          },
        ];
      })
      .filter(Boolean),
  );
  const abortedRows = sessionRows
    .filter((r) => {
      const endOrUpdate = Number(r.endedAt) || Number(r.updatedAt) || 0;
      return Number.isFinite(endOrUpdate) && endOrUpdate >= win.cutoffMs && Boolean(r.abortedLastRun);
    })
    .map((r) => ({
      sessionId: String(r.session_id ?? r.sessionId ?? "").trim() || null,
      sessionKey: String(r.sessionKey ?? "").trim() || null,
      updatedAt: Number(r.updatedAt) || Number(r.endedAt) || null,
      detail: "abortedLastRun=true",
      count: 1,
    }));
  const abortedSessionCountWindow = abortedRows.length;
  let toolErrorCountWindow = 0;
  let execCommandErrorCount = 0;
  const toolErrorRows = [];
  const execErrorRows = [];
  for (let i = 0; i < sessionIds.length; i += 1) {
    const sid = String(sessionIds[i] ?? "").trim();
    if (!sid) continue;
    const perLines = agentSessionsLogsRowsToLines(logRowsBatches[i] ?? []);
    let perToolErr = 0;
    let perExecErr = 0;
    for (const line of perLines) {
      if (line?.type !== "message" || !line.message || line.message.role !== "toolResult") continue;
      const isError = line.message?.isError === true;
      if (isError) perToolErr += 1;
      const toolName = String(line.message?.toolName ?? "").toLowerCase();
      const details = line.message?.details && typeof line.message.details === "object" ? line.message.details : {};
      const exitCodeRaw = details.exitCode;
      const hasExitCode = exitCodeRaw != null && exitCodeRaw !== "";
      const exitCodeNonZero = hasExitCode && Number(exitCodeRaw) !== 0;
      if ((toolName === "exec" || toolName === "shell") && (isError || exitCodeNonZero)) {
        perExecErr += 1;
      }
    }
    toolErrorCountWindow += perToolErr;
    execCommandErrorCount += perExecErr;
    const meta = sessionMetaById.get(sid);
    if (perToolErr > 0) {
      toolErrorRows.push({
        sessionId: sid,
        sessionKey: meta?.sessionKey ?? null,
        updatedAt: meta?.updatedAt ?? null,
        detail: "toolResult.isError=true",
        count: perToolErr,
      });
    }
    if (perExecErr > 0) {
      execErrorRows.push({
        sessionId: sid,
        sessionKey: meta?.sessionKey ?? null,
        updatedAt: meta?.updatedAt ?? null,
        detail: "exec/shell失败",
        count: perExecErr,
      });
    }
  }
  const hints = await readOpenclawHintsBundle(agent.agentName);
  const detail = buildEmployeeProfileDetail(agent, sessionRows, {
    billingDays: win.billingDays,
    hasCostData: Boolean(payload.o1_summary?.hasCostData),
    openclawHints: hints,
    toolNamesFromLogs,
    avgToolDurationMs: avgToolDurationFinal,
    toolDurationSampleCount: toolDurationN,
    qualityMetrics: {
      abortedSessionCountWindow,
      toolErrorCountWindow,
      execCommandErrorCount,
    },
    qualityDetails: {
      abortedRows,
      toolErrorRows,
      execErrorRows,
    },
    costFromDb,
    sessionScope: sessionScope || null,
  });
  return {
    source,
    days: win.displayDays ?? win.billingDays,
    hours: win.displayHours,
    windowStartMs: payload.windowStartMs,
    agent,
    ...detail,
  };
}
