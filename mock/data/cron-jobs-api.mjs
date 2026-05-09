/**
 * Mock：GET /api/cron-jobs、GET /api/cron-jobs/:jobId/run-events
 * 与 backend `mapCronRunPageRowToJsonlEvent` 同形，数据源自 mock 运行行（分页见 mockCronRunsPage）。
 */
import { mapCronRunPageRowToJsonlEvent, runOverviewStatusIsFailure } from "../../backend/cron-jobs/cron-runs-query.mjs";
import { mockCronRunsPage, getMockCronRunRowsAll } from "./cron-runs.mjs";

/** @param {ReturnType<typeof mockCronRunsPage>["rows"][number]} r */
function mapMockRowToJsonlEvent(r) {
  return mapCronRunPageRowToJsonlEvent({
    jobId: r.jobId,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMs: r.durationMs,
    deliveryStatus: r.deliveryStatus,
    errorMessage: r.errorMessage,
    jobSessionId: r.jobSessionId,
    usage: r.usage,
    model: r.model,
    provider: r.provider,
    run_usage_in_raw: r.run_usage_in_raw,
    run_usage_out_raw: r.run_usage_out_raw,
    run_usage_total_raw: r.run_usage_total_raw,
    run_log_model_raw: r.run_log_model_raw,
    run_log_provider_raw: r.run_log_provider_raw,
    run_duration_ms_raw: r.run_duration_ms_raw,
    run_log_session_id_raw: r.run_log_session_id_raw,
    run_log_next_run_raw: r.run_log_next_run_raw,
    run_log_error_raw: r.run_log_error_raw,
    run_log_summary_raw: r.run_log_summary_raw,
    job_agent_id_col:
      r.agentId != null && String(r.agentId).trim()
        ? String(r.agentId).trim()
        : r.jobId != null
          ? `mock-agent-${r.jobId}`
          : null,
    job_agent_id_raw: null,
  });
}

function isOk(st) {
  const s = String(st ?? "").toLowerCase();
  return s === "success" || s === "succeeded" || s === "ok" || s === "completed";
}

function isFail(st) {
  const s = String(st ?? "").toLowerCase();
  return s === "error" || s === "failed" || s === "failure";
}

/** 按开始时间升序，统计连续失败的最大段长（发现雪崩式抖动） */
function maxConsecutiveFailStreakForRuns(runs) {
  const sorted = [...runs].sort((a, b) => Date.parse(String(a.startedAt)) - Date.parse(String(b.startedAt)));
  let max = 0;
  let cur = 0;
  for (const r of sorted) {
    if (isFail(r.status)) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

/** 最近 N 次执行中的失败次数（按时间倒序） */
function recentTailFailureCount(runs, tailN) {
  const sorted = [...runs].sort((a, b) => Date.parse(String(b.startedAt)) - Date.parse(String(a.startedAt)));
  const slice = sorted.slice(0, Math.max(0, tailN));
  return slice.filter((r) => isFail(r.status)).length;
}

/**
 * 模拟 `cron_jobs` 行 + `log_attributes`：最近执行、基本信息、负载卡片汇总（与后端 GET_JSON_STRING 路径对齐）
 */
const MOCK_JOB_LOG_SNAPSHOT_BY_ID = {
  "101": {
    /** 与 Doris `GET_JSON_STRING` 一致：最近执行优先 `log_attributes.state` */
    state: {
      last_run_at_ms: "1893456000000",
      last_run_status: "success",
      last_duration_ms: "9999",
      last_delivery_status: "delivered",
      last_error: "",
      next_run_at_ms: String(Date.now() + 86_400_000),
      consecutive_errors: "0",
      last_run_tokens_total: "4242",
    },
    display_name: "【cron_jobs】同步库存",
    description: "Mock：任务表描述 / 汇总来自 log_attributes",
    agent_id: "digital-emp-101",
    agentName: "库存同步数字员工",
    session_id: "sess-from-job-session-id",
    session_key: "agent:main:cron:101:ctx",
    session_target: "feishu:user:openId",
    wake_mode: "signal",
    delivery_mode: "lark",
    payload: {
      kind: "template",
      model: "MiniMax-M2.5",
      message: '{"op":"inventory-sync"}',
    },
    schedule_tz: "Asia/Tokyo",
    total_lines: "888",
    ok_count: "800",
    fail_count: "44",
    avg_duration_ms: "3200",
    max_duration_ms: "12000",
    total_tokens_sum: "500000",
    last_success_at_ms: "1893456000000",
  },
};

/** @param {unknown} v */
function parseMsFromLogLike(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1e11) return Math.floor(n);
    if (n >= 1e9) return Math.floor(n * 1000);
    return null;
  }
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : null;
}

/** @param {unknown} v */
function parseNonNegInt(v) {
  if (v == null) return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** @param {{ usage?: { input_tokens?: unknown, output_tokens?: unknown, total_tokens?: unknown } }} r */
function tokenTotalFromMockRow(r) {
  const u = r?.usage;
  if (!u || typeof u !== "object") return null;
  const tot = u.total_tokens ?? /** @type {any} */ (u).totalTokens;
  if (tot != null && tot !== "" && Number.isFinite(Number(tot))) return Number(tot);
  const a = Number(u.input_tokens ?? /** @type {any} */ (u).prompt_tokens);
  const b = Number(u.output_tokens ?? /** @type {any} */ (u).completion_tokens);
  if (Number.isFinite(a) || Number.isFinite(b)) return (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
  return null;
}

/** @param {{ usage?: { input_tokens?: unknown, prompt_tokens?: unknown } }} r */
function tokenInputFromMockRow(r) {
  const u = r?.usage;
  if (!u || typeof u !== "object") return null;
  const raw = u.input_tokens ?? /** @type {any} */ (u).prompt_tokens;
  if (raw == null || raw === "" || !Number.isFinite(Number(raw))) return null;
  return Number(raw);
}

/** @param {{ usage?: { output_tokens?: unknown, completion_tokens?: unknown } }} r */
function tokenOutputFromMockRow(r) {
  const u = r?.usage;
  if (!u || typeof u !== "object") return null;
  const raw = u.output_tokens ?? /** @type {any} */ (u).completion_tokens;
  if (raw == null || raw === "" || !Number.isFinite(Number(raw))) return null;
  return Number(raw);
}

/** 与 `cron-jobs-query` / `pickAgentDisplayName` 路径对齐：优先展示名，否则回落 agentId */
function mockJobAgentNameFromSnapshot(jid, agentId) {
  const snap = MOCK_JOB_LOG_SNAPSHOT_BY_ID[String(jid)];
  if (snap && typeof snap === "object") {
    for (const k of ["agentName", "agentDisplayName", "displayName", "agentLabel"]) {
      const v = /** @type {Record<string, unknown>} */ (snap)[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  const id = agentId != null && String(agentId).trim() ? String(agentId).trim() : "";
  return id || null;
}

/** 与 Doris `buildRunEffectiveDurationMsExprForAgg` / `mapCronRunPageRowToJsonlEvent` 一致：log 耗时优先，否则墙钟。 */
function effectiveDurationMsFromMockRun(r) {
  const raw = r?.run_duration_ms_raw ?? r?.RUN_DURATION_MS_RAW;
  const log = raw != null && String(raw).trim() !== "" ? Number(String(raw).trim()) : NaN;
  if (Number.isFinite(log) && log >= 0) return log;
  const col = r?.durationMs != null ? Number(r.durationMs) : NaN;
  if (Number.isFinite(col) && col >= 0) return col;
  const t0 = r?.startedAt != null ? Date.parse(String(r.startedAt)) : NaN;
  const t1 = r?.finishedAt != null ? Date.parse(String(r.finishedAt)) : NaN;
  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) return t1 - t0;
  return null;
}

export function mockCronJobsTaskDetailList() {
  const allRows = getMockCronRunRowsAll();
  const byJob = new Map();
  for (const r of allRows) {
    const jid = String(r.jobId);
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid).push(r);
  }
  const jobs = [];
  for (const [jid, runs] of byJob) {
    const sorted = [...runs].sort((a, b) => Date.parse(String(a.startedAt)) - Date.parse(String(b.startedAt)));
    const last = sorted[sorted.length - 1];
    let okCount = 0;
    let failCount = 0;
    let sumDur = 0;
    let nDur = 0;
    let maxDurationMs = null;
    let lastSuccessAtMs = null;
    let totalTokensSum = 0;
    let nTokRows = 0;
    for (const r of sorted) {
      const tt = tokenTotalFromMockRow(r);
      if (tt != null && Number.isFinite(tt)) {
        totalTokensSum += tt;
        nTokRows += 1;
      }
      if (isOk(r.status)) okCount += 1;
      else if (isFail(r.status)) failCount += 1;
      const d = effectiveDurationMsFromMockRun(r);
      if (d != null && Number.isFinite(d) && d >= 0) {
        sumDur += d;
        nDur += 1;
        maxDurationMs = maxDurationMs == null ? d : Math.max(maxDurationMs, d);
      }
      if (isOk(r.status)) {
        const anchor = Date.parse(String(r.startedAt));
        if (Number.isFinite(anchor)) {
          lastSuccessAtMs = lastSuccessAtMs == null ? anchor : Math.max(lastSuccessAtMs, anchor);
        }
      }
    }
    const totalLines = sorted.length;
    const neutralCount = Math.max(0, totalLines - okCount - failCount);
    const terminal = okCount + failCount;
    const successRatePct = terminal > 0 ? Math.round((okCount / terminal) * 1000) / 10 : null;
    const lastStarted = last?.startedAt ? Date.parse(String(last.startedAt)) : null;
    const lastFinished = last?.finishedAt ? Date.parse(String(last.finishedAt)) : null;
    const lastDurationMsFromRun =
      lastStarted != null && lastFinished != null && lastFinished >= lastStarted ? lastFinished - lastStarted : null;
    const snap = MOCK_JOB_LOG_SNAPSHOT_BY_ID[jid];
    const st = snap?.state != null && typeof snap.state === "object" ? snap.state : null;
    const lastRunAtMsFromRun = Number.isFinite(lastStarted) ? lastStarted : null;
    const lastRunAtMsFromSnap =
      (st?.last_run_at_ms != null ? parseMsFromLogLike(st.last_run_at_ms) : null) ??
      (snap?.last_run_at_ms != null ? parseMsFromLogLike(snap.last_run_at_ms) : null);
    const lastRunAtMs = lastRunAtMsFromSnap ?? lastRunAtMsFromRun;
    const lastDurFromSnap =
      (st?.last_duration_ms != null ? parseNonNegInt(st.last_duration_ms) : null) ??
      (snap?.last_duration_ms != null ? parseNonNegInt(snap.last_duration_ms) : null);
    const lastDurationMs = lastDurFromSnap != null ? lastDurFromSnap : lastDurationMsFromRun;
    const lastTokFromSnap =
      (st?.last_run_tokens_total != null ? parseNonNegInt(st.last_run_tokens_total) : null) ??
      (snap?.last_run_tokens_total != null ? parseNonNegInt(snap.last_run_tokens_total) : null);
    const lastRunTokensTotalFromRun = last ? tokenTotalFromMockRow(last) : null;
    const lastRunTokensTotal = lastTokFromSnap ?? lastRunTokensTotalFromRun;
    const lastRunStatus =
      (st?.last_run_status != null && String(st.last_run_status).trim() ? String(st.last_run_status) : null) ??
      (st?.status != null && String(st.status).trim() ? String(st.status) : null) ??
      (snap?.last_run_status != null && String(snap.last_run_status).trim() ? String(snap.last_run_status) : null) ??
      (last?.status != null ? String(last.status) : null);
    const lastDeliveryStatus =
      (st?.last_delivery_status != null && String(st.last_delivery_status).trim()
        ? String(st.last_delivery_status)
        : null) ??
      (st?.delivery_status != null && String(st.delivery_status).trim() ? String(st.delivery_status) : null) ??
      (snap?.last_delivery_status != null && String(snap.last_delivery_status).trim()
        ? String(snap.last_delivery_status)
        : null) ??
      (last?.deliveryStatus != null ? String(last.deliveryStatus) : null);
    const lastErrSt =
      st && "last_error" in st && st.last_error != null && String(st.last_error).trim()
        ? String(st.last_error)
        : null;
    const lastErrSnap =
      snap && "last_error" in snap && snap.last_error != null && String(snap.last_error).trim()
        ? String(snap.last_error)
        : null;
    const lastError = lastErrSt ?? lastErrSnap ?? (last?.errorMessage != null ? String(last.errorMessage) : null);
    let nextRunAtMs =
      (st?.next_run_at_ms != null ? parseMsFromLogLike(st.next_run_at_ms) : null) ??
      (st?.nextRunAtMs != null ? parseMsFromLogLike(st.nextRunAtMs) : null) ??
      (snap?.next_run_at_ms != null ? parseMsFromLogLike(snap.next_run_at_ms) : null) ??
      (snap?.nextRunAtMs != null ? parseMsFromLogLike(snap.nextRunAtMs) : null);
    if (nextRunAtMs == null && last) {
      const raw = last.run_log_next_run_raw ?? last.RUN_LOG_NEXT_RUN_RAW;
      const fromRun = parseMsFromLogLike(raw);
      if (fromRun != null) nextRunAtMs = fromRun;
    }
    if (nextRunAtMs == null && lastStarted != null && Number.isFinite(lastStarted)) {
      const jidNum = Number(String(jid).replace(/\D/g, "")) || 0;
      nextRunAtMs = lastStarted + (3600_000 + (jidNum % 24) * 60_000);
    }
    const consecutiveErrors =
      (st?.consecutive_errors != null ? parseNonNegInt(st.consecutive_errors) : null) ??
      (snap?.consecutive_errors != null ? parseNonNegInt(snap.consecutive_errors) : null);

    const nameFromSnap = snap?.display_name != null && String(snap.display_name).trim() ? String(snap.display_name) : null;
    const nameOut = nameFromSnap ?? (last?.jobName != null ? String(last.jobName) : jid);
    const description =
      snap?.description != null && String(snap.description).trim() ? String(snap.description) : null;
    const agentIdFromSnap = snap?.agent_id != null && String(snap.agent_id).trim() ? String(snap.agent_id) : null;
    const agentIdFromRuns = last?.agentId != null && String(last.agentId).trim() ? String(last.agentId) : null;
    const agentId = agentIdFromSnap ?? agentIdFromRuns;

    let sessionKey =
      snap?.session_key != null && String(snap.session_key).trim()
        ? String(snap.session_key)
        : snap?.session_id != null && String(snap.session_id).trim()
          ? String(snap.session_id)
          : null;
    if (!sessionKey && agentId) {
      sessionKey = `agent:${agentId}:cron:${jid}:ctx`;
    }
    const sessionTarget =
      snap?.session_target != null && String(snap.session_target).trim() ? String(snap.session_target) : null;
    const wakeMode = snap?.wake_mode != null && String(snap.wake_mode).trim() ? String(snap.wake_mode) : null;
    const deliveryMode =
      snap?.delivery_mode != null && String(snap.delivery_mode).trim() ? String(snap.delivery_mode) : null;
    const p = snap?.payload != null && typeof snap.payload === "object" ? snap.payload : null;
    const payloadKind =
      (p?.kind != null && String(p.kind).trim() ? String(p.kind) : null) ??
      (p?.type != null && String(p.type).trim() ? String(p.type) : null) ??
      (snap?.payload_kind != null && String(snap.payload_kind).trim() ? String(snap.payload_kind) : null);
    const payloadModel =
      (p?.model != null && String(p.model).trim() ? String(p.model) : null) ??
      (p?.modelName != null && String(p.modelName).trim() ? String(p.modelName) : null) ??
      (snap?.payload_model != null && String(snap.payload_model).trim() ? String(snap.payload_model) : null);
    const payloadMessage =
      (p?.message != null && String(p.message).trim() ? String(p.message) : null) ??
      (p?.body != null && String(p.body).trim() ? String(p.body) : null) ??
      (p?.text != null && String(p.text).trim() ? String(p.text) : null) ??
      (snap?.payload_message != null && String(snap.payload_message).trim() ? String(snap.payload_message) : null);
    const scheduleTz =
      snap?.schedule_tz != null && String(snap.schedule_tz).trim() ? String(snap.schedule_tz) : "Asia/Shanghai";

    let totalLinesOut = totalLines;
    let okCountOut = okCount;
    let failCountOut = failCount;
    let avgDurationMsOut = nDur > 0 ? sumDur / nDur : null;
    let maxDurationMsOut = maxDurationMs;
    let totalTokensSumOut = nTokRows > 0 ? totalTokensSum : null;
    let lastSuccessAtMsOut = lastSuccessAtMs;
    if (snap) {
      const tl = parseNonNegInt(snap.total_lines);
      if (tl != null) totalLinesOut = tl;
      const okJ = parseNonNegInt(snap.ok_count);
      if (okJ != null) okCountOut = okJ;
      const fj = parseNonNegInt(snap.fail_count);
      if (fj != null) failCountOut = fj;
      const avgJ = snap.avg_duration_ms != null ? Number(String(snap.avg_duration_ms).trim()) : NaN;
      if (Number.isFinite(avgJ) && avgJ >= 0) avgDurationMsOut = avgJ;
      const maxJ = parseNonNegInt(snap.max_duration_ms);
      if (maxJ != null) maxDurationMsOut = maxJ;
      const tokJ = snap.total_tokens_sum != null ? Number(String(snap.total_tokens_sum).trim()) : NaN;
      if (Number.isFinite(tokJ) && tokJ >= 0) totalTokensSumOut = tokJ;
      const ls = snap.last_success_at_ms != null ? parseMsFromLogLike(snap.last_success_at_ms) : null;
      if (ls != null) lastSuccessAtMsOut = ls;
    }
    const neutralCountOut = Math.max(0, totalLinesOut - okCountOut - failCountOut);
    const terminalOut = okCountOut + failCountOut;
    const successRatePctOut =
      terminalOut > 0 ? Math.round((okCountOut / terminalOut) * 1000) / 10 : null;

    jobs.push({
      id: jid,
      name: nameOut,
      enabled: true,
      description,
      agentId,
      sessionKey,
      sessionTarget,
      wakeMode,
      createdAtMs: lastStarted ?? Date.now(),
      updatedAtMs: lastFinished ?? lastStarted ?? Date.now(),
      schedule: {
        kind: "cron",
        expr: last?.cronExpression != null && String(last.cronExpression).trim() ? String(last.cronExpression) : "—",
        tz: scheduleTz,
      },
      delivery: { mode: deliveryMode },
      payload: { kind: payloadKind, message: payloadMessage, model: payloadModel },
      state: {
        nextRunAtMs,
        lastRunAtMs,
        lastRunStatus,
        lastDurationMs,
        lastDeliveryStatus,
        lastError,
        consecutiveErrors,
      },
      listRunSummary: {
        totalLines: totalLinesOut,
        sampleSize: totalLinesOut,
        truncated: false,
        okCount: okCountOut,
        failCount: failCountOut,
        neutralCount: neutralCountOut,
        successRatePct: successRatePctOut,
        avgDurationMs: avgDurationMsOut,
        maxDurationMs: maxDurationMsOut,
        totalTokensSum: totalTokensSumOut,
        lastRunTokensTotal,
        lastSuccessAtMs: lastSuccessAtMsOut,
      },
    });
  }
  jobs.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
  return { version: 0, jobs, _meta: { mock: true } };
}

/**
 * @param {string} jobId
 */
export function mockCronJobRunEvents(jobId) {
  const jid = String(jobId ?? "").trim();
  const { rows } = mockCronRunsPage({ page: 1, pageSize: 100, jobId: jid || null });
  const filtered = jid ? rows.filter((r) => String(r.jobId) === jid) : rows;
  const sorted = [...filtered].sort((a, b) => Date.parse(String(a.startedAt)) - Date.parse(String(b.startedAt)));
  const events = sorted.map(mapMockRowToJsonlEvent);
  return { jobId: jid, events, totalLines: events.length, _meta: { mock: true } };
}

/**
 * Mock：GET /api/cron-runs-run-overview（与 Doris `queryCronRunsRunOverviewCharts` 同形）
 * @param {{ startIso?: string | null, endIso?: string | null, jobId?: string | null }} opts
 */
export function mockCronRunsRunOverviewCharts(opts = {}) {
  const startIso = opts.startIso != null && String(opts.startIso).trim() ? String(opts.startIso).trim() : null;
  const endIso = opts.endIso != null && String(opts.endIso).trim() ? String(opts.endIso).trim() : null;
  const jobId = opts.jobId != null && String(opts.jobId).trim() ? String(opts.jobId).trim() : null;
  const allRows = getMockCronRunRowsAll();
  const startMs = startIso ? Date.parse(startIso) : null;
  const endMs = endIso ? Date.parse(endIso) : null;
  const list = allRows.filter((r) => {
    if (jobId && String(r.jobId) !== jobId) return false;
    const t = Date.parse(String(r.startedAt));
    if (!Number.isFinite(t)) return false;
    if (startMs != null && Number.isFinite(startMs) && t < startMs) return false;
    if (endMs != null && Number.isFinite(endMs) && t > endMs) return false;
    return true;
  });

  const dayMap = new Map();
  for (const r of list) {
    const d = new Date(String(r.startedAt));
    if (!Number.isFinite(d.getTime())) continue;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dk = `${y}-${m}-${day}`;
    if (!dayMap.has(dk)) {
      dayMap.set(dk, {
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        _durSum: 0,
        _durN: 0,
      });
    }
    const o = dayMap.get(dk);
    o.totalCount += 1;
    if (isOk(r.status)) o.successCount += 1;
    else if (isFail(r.status)) o.failureCount += 1;
    const inTok = tokenInputFromMockRow(r);
    const outTok = tokenOutputFromMockRow(r);
    if (inTok != null && Number.isFinite(inTok)) o.inputTokens += inTok;
    if (outTok != null && Number.isFinite(outTok)) o.outputTokens += outTok;
    const dur = effectiveDurationMsFromMockRun(r);
    if (dur != null && Number.isFinite(dur) && dur >= 0) {
      o._durSum += dur;
      o._durN += 1;
    }
  }
  const trend = [...dayMap.keys()]
    .sort()
    .map((dk) => {
      const o = dayMap.get(dk);
      return {
        day: dk,
        totalCount: o.totalCount,
        successCount: o.successCount,
        failureCount: o.failureCount,
        avgDurationMs: o._durN > 0 ? Math.round(o._durSum / o._durN) : null,
        inputTokens: Math.floor(o.inputTokens),
        outputTokens: Math.floor(o.outputTokens),
      };
    });

  /** 与后端 `tokenTrendByJob` 同形：按日 × 任务 Token 合计（输入+输出） */
  const tokenByDayJob = new Map();
  for (const r of list) {
    const d = new Date(String(r.startedAt));
    if (!Number.isFinite(d.getTime())) continue;
    const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const jid = String(r.jobId ?? "");
    if (!jid) continue;
    const inTok = tokenInputFromMockRow(r);
    const outTok = tokenOutputFromMockRow(r);
    const add = (inTok != null && Number.isFinite(inTok) ? inTok : 0) + (outTok != null && Number.isFinite(outTok) ? outTok : 0);
    if (add <= 0) continue;
    const key = `${dk}\t${jid}`;
    const name = r.jobName != null ? String(r.jobName) : jid;
    const cur = tokenByDayJob.get(key);
    if (cur) cur.totalTokens += Math.floor(add);
    else tokenByDayJob.set(key, { day: dk, jobId: jid, jobName: name, totalTokens: Math.floor(add) });
  }
  const tokenTrendByJob = [...tokenByDayJob.values()];

  const byJob = new Map();
  for (const r of list) {
    const jid = String(r.jobId);
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid).push(r);
  }

  const durSamples = [];
  let okAll = 0;
  let failAll = 0;
  for (const r of list) {
    const d = effectiveDurationMsFromMockRun(r);
    if (d != null && Number.isFinite(d) && d >= 0) durSamples.push(d);
    if (isOk(r.status)) okAll += 1;
    else if (isFail(r.status)) failAll += 1;
  }
  /** 与 Doris 路径一致：时间窗内执行记录的成功/失败笔数 */
  const distribution = { success: okAll, failure: failAll };
  durSamples.sort((a, b) => a - b);
  const medianDurationMs =
    durSamples.length === 0
      ? null
      : durSamples.length % 2 === 1
        ? Math.round(durSamples[(durSamples.length - 1) >> 1])
        : Math.round((durSamples[durSamples.length / 2 - 1] + durSamples[durSamples.length / 2]) / 2);

  let peakDay = null;
  let peakDayRuns = 0;
  for (const [dk, o] of dayMap) {
    if (o.totalCount > peakDayRuns) {
      peakDayRuns = o.totalCount;
      peakDay = dk;
    }
  }

  const totalRuns = list.length;
  const distinctJobs = byJob.size;
  const successRatePct = totalRuns > 0 ? Math.round((okAll / totalRuns) * 1000) / 10 : null;
  const failureRatePct = totalRuns > 0 ? Math.round((failAll / totalRuns) * 1000) / 10 : null;
  const runsPerJobAvg = distinctJobs > 0 ? Math.round((totalRuns / distinctJobs) * 10) / 10 : null;

  const summary = {
    totalRuns,
    distinctJobs,
    successRatePct,
    failureRatePct,
    medianDurationMs,
    peakDay,
    peakDayRuns,
    runsPerJobAvg,
  };

  const byAgent = new Map();
  for (const r of list) {
    const aid = String(r.agentId ?? "").trim() || "__unset__";
    if (!byAgent.has(aid)) byAgent.set(aid, { runCount: 0, successCount: 0, failureCount: 0, totalTokens: 0 });
    const ag = byAgent.get(aid);
    ag.runCount += 1;
    if (isOk(r.status)) ag.successCount += 1;
    else if (isFail(r.status)) ag.failureCount += 1;
    const tt = tokenTotalFromMockRow(r);
    if (tt != null && Number.isFinite(tt)) ag.totalTokens += tt;
  }
  const agentTop10 = [...byAgent.entries()]
    .map(([agentId, v]) => ({
      agentId,
      runCount: v.runCount,
      successCount: v.successCount,
      failureCount: v.failureCount,
      totalTokens: Math.floor(v.totalTokens),
    }))
    .sort((a, b) => b.runCount - a.runCount)
    .slice(0, 10);

  const delMap = new Map();
  for (const r of list) {
    const k = r.deliveryStatus != null && String(r.deliveryStatus).trim() ? String(r.deliveryStatus).trim() : "—";
    delMap.set(k, (delMap.get(k) || 0) + 1);
  }
  const deliveryMix = [...delMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const failRateArr = [];
  for (const [jid, runs] of byJob) {
    if (runs.length < 5) continue;
    let fc = 0;
    for (const rr of runs) {
      if (isFail(rr.status)) fc += 1;
    }
    const ratePct = Math.round((fc / runs.length) * 1000) / 10;
    const jobName = runs[0]?.jobName != null ? String(runs[0].jobName) : jid;
    failRateArr.push({
      jobId: jid,
      jobName,
      runCount: runs.length,
      failureCount: fc,
      failRatePct: ratePct,
    });
  }
  failRateArr.sort((a, b) => b.failRatePct - a.failRatePct || b.failureCount - a.failureCount);
  const failRateTop10 = failRateArr.slice(0, 10);

  const slowArr = [];
  const tokenArr = [];
  for (const [jid, runs] of byJob) {
    let maxD = null;
    let maxDStartedAt = null;
    let maxDStatus = null;
    let tokSum = 0;
    let lastStartedAt = null;
    let lastStatus = null;
    for (const rr of runs) {
      const st = rr.startedAt != null ? String(rr.startedAt).trim() : "";
      const stOk = st !== "" && Number.isFinite(Date.parse(st)) ? st : null;
      if (stOk != null) {
        const ts = Date.parse(stOk);
        if (lastStartedAt == null || ts > Date.parse(String(lastStartedAt))) {
          lastStartedAt = stOk;
          lastStatus = rr?.status != null ? String(rr.status) : null;
        }
      }
      const d = effectiveDurationMsFromMockRun(rr);
      if (d != null && Number.isFinite(d) && d >= 0) {
        const fl = Math.floor(d);
        if (maxD == null || fl > maxD) {
          maxD = fl;
          maxDStartedAt = stOk;
          maxDStatus = rr?.status != null ? String(rr.status) : null;
        } else if (maxD != null && fl === maxD && stOk != null) {
          if (maxDStartedAt == null || Date.parse(stOk) > Date.parse(String(maxDStartedAt))) {
            maxDStartedAt = stOk;
            maxDStatus = rr?.status != null ? String(rr.status) : null;
          }
        }
      }
      const tt = tokenTotalFromMockRow(rr);
      if (tt != null && Number.isFinite(tt)) tokSum += tt;
    }
    const name = runs[0]?.jobName != null ? String(runs[0].jobName) : jid;
    const agentId = runs[0]?.agentId != null && String(runs[0].agentId).trim() ? String(runs[0].agentId) : null;
    const agentName = mockJobAgentNameFromSnapshot(jid, agentId);
    slowArr.push({
      jobId: jid,
      jobName: name,
      jobAgentId: agentId,
      jobAgentName: agentName,
      maxDurationMs: maxD,
      maxDurationRunStartedAt: maxDStartedAt,
      maxDurationRunStatus: maxDStatus,
    });
    tokenArr.push({
      jobId: jid,
      jobName: name,
      jobAgentId: agentId,
      jobAgentName: agentName,
      totalTokens: Math.floor(tokSum),
      lastRunStartedAt: lastStartedAt,
      lastRunStatus: lastStatus,
    });
  }
  slowArr.sort((a, b) => (Number(b.maxDurationMs) || -1) - (Number(a.maxDurationMs) || -1));
  const slowTop10 = slowArr.slice(0, 10).map((x) => ({
    jobId: x.jobId,
    jobName: x.jobName,
    jobAgentId: x.jobAgentId ?? null,
    jobAgentName: x.jobAgentName ?? null,
    maxDurationMs: x.maxDurationMs != null && Number.isFinite(Number(x.maxDurationMs)) ? Math.floor(Number(x.maxDurationMs)) : null,
    maxDurationRunStartedAt: x.maxDurationRunStartedAt != null ? String(x.maxDurationRunStartedAt) : null,
    maxDurationRunStatus: x.maxDurationRunStatus != null ? String(x.maxDurationRunStatus) : null,
  }));
  tokenArr.sort((a, b) => b.totalTokens - a.totalTokens);
  const tokenTop10 = tokenArr.filter((x) => x.totalTokens > 0).slice(0, 10);

  const TOKEN_PIE_TOP_N = 8;
  const tokenPos = tokenArr.filter((x) => x.totalTokens > 0);
  const tokenDistributionByJob = (() => {
    if (!tokenPos.length) return [];
    const top = tokenPos.slice(0, TOKEN_PIE_TOP_N);
    const otherSum = tokenPos.slice(TOKEN_PIE_TOP_N).reduce((s, x) => s + x.totalTokens, 0);
    if (otherSum > 0) {
      return [
        ...top.map(({ jobId, jobName, jobAgentId, totalTokens }) => ({ jobId, jobName, jobAgentId: jobAgentId ?? null, totalTokens })),
        { jobId: "__other__", jobName: "", totalTokens: otherSum },
      ];
    }
    return top.map(({ jobId, jobName, jobAgentId, totalTokens }) => ({ jobId, jobName, jobAgentId: jobAgentId ?? null, totalTokens }));
  })();

  const runCountArr = [];
  const failCountArr = [];
  const avgDurArr = [];
  for (const [jid, runs] of byJob) {
    let failC = 0;
    let durSum = 0;
    let durN = 0;
    for (const rr of runs) {
      if (isFail(rr.status)) failC += 1;
      const d = effectiveDurationMsFromMockRun(rr);
      if (d != null && Number.isFinite(d) && d >= 0) {
        durSum += d;
        durN += 1;
      }
    }
    const name = runs[0]?.jobName != null ? String(runs[0].jobName) : jid;
    const agentId = runs[0]?.agentId != null && String(runs[0].agentId).trim() ? String(runs[0].agentId) : null;
    const agentName = mockJobAgentNameFromSnapshot(jid, agentId);
    runCountArr.push({ jobId: jid, jobName: name, jobAgentId: agentId, jobAgentName: agentName, runCount: runs.length });
    failCountArr.push({ jobId: jid, jobName: name, jobAgentId: agentId, jobAgentName: agentName, failureCount: failC, runCount: runs.length });
    if (durN > 0) {
      avgDurArr.push({ jobId: jid, jobName: name, jobAgentId: agentId, jobAgentName: agentName, avgDurationMs: Math.round(durSum / durN) });
    }
  }
  runCountArr.sort((a, b) => b.runCount - a.runCount);
  failCountArr.sort((a, b) => b.failureCount - a.failureCount || b.runCount - a.runCount);
  avgDurArr.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

  const successRateArr = [];
  for (const [jid, runs] of byJob) {
    if (runs.length < 5) continue;
    let okc = 0;
    let fc = 0;
    for (const rr of runs) {
      if (isOk(rr.status)) okc += 1;
      else if (isFail(rr.status)) fc += 1;
    }
    const name = runs[0]?.jobName != null ? String(runs[0].jobName) : jid;
    const ratePct = runs.length > 0 ? Math.round((okc / runs.length) * 1000) / 10 : 0;
    const srAgentId = runs[0]?.agentId != null && String(runs[0].agentId).trim() ? String(runs[0].agentId) : null;
    successRateArr.push({
      jobId: jid,
      jobName: name,
      jobAgentId: srAgentId,
      jobAgentName: mockJobAgentNameFromSnapshot(jid, srAgentId),
      runCount: runs.length,
      successCount: okc,
      failureCount: fc,
      successRatePct: ratePct,
    });
  }
  successRateArr.sort((a, b) => b.successRatePct - a.successRatePct || b.runCount - a.runCount);

  const jobTop10Analysis = {
    byRunCount: runCountArr.slice(0, 10),
    byFailCount: failCountArr.slice(0, 10),
    byMaxDurationMs: slowTop10,
    byAvgDurationMs: avgDurArr.slice(0, 10),
    bySuccessRate: successRateArr.slice(0, 10),
    byTokenTotal: tokenTop10,
  };

  const aggWinByJob = new Map();
  const lastInWindow = new Map();
  for (const [jid, runs] of byJob) {
    let failCount = 0;
    let maxDurMs = null;
    for (const rr of runs) {
      if (isFail(rr.status)) failCount += 1;
      const d = effectiveDurationMsFromMockRun(rr);
      if (d != null && Number.isFinite(d) && d >= 0) {
        const fl = Math.floor(d);
        maxDurMs = maxDurMs == null ? fl : Math.max(maxDurMs, fl);
      }
    }
    aggWinByJob.set(jid, { failCount, maxDurMs });
    const sorted = [...runs].sort((a, b) => Date.parse(String(b.startedAt)) - Date.parse(String(a.startedAt)));
    lastInWindow.set(jid, sorted[0]);
  }

  const { jobs } = mockCronJobsTaskDetailList();
  const anomalyTasks = [];

  for (const job of jobs) {
    const jid = String(job.id);
    const jobName = String(job.name ?? jid);
    const enabled = job.enabled !== false;
    const consecutiveErrors =
      job.state?.consecutiveErrors != null && Number.isFinite(Number(job.state.consecutiveErrors))
        ? Math.floor(Number(job.state.consecutiveErrors))
        : null;
    const deliveryMode =
      job.delivery?.mode != null && String(job.delivery.mode).trim() ? String(job.delivery.mode).trim() : null;
    const a = aggWinByJob.get(jid);
    const failCount = a?.failCount ?? 0;
    const maxDurMs = a?.maxDurMs ?? null;
    const lastR = lastInWindow.get(jid);
    const lastStatusFail = lastR ? runOverviewStatusIsFailure(lastR.status) : false;

    const reasons = [];
    if (consecutiveErrors != null && consecutiveErrors >= 2) reasons.push("consecutive_fail");
    if (lastStatusFail) reasons.push("recent_fail");
    if (!deliveryMode) reasons.push("no_channel");
    if (maxDurMs != null && maxDurMs > 600000) reasons.push("slow_over_10m");
    if (reasons.length) anomalyTasks.push({ jobId: jid, jobName, reasons });
  }

  anomalyTasks.sort((a, b) => {
    const ra = a.reasons.includes("consecutive_fail") ? 1 : 0;
    const rb = b.reasons.includes("consecutive_fail") ? 1 : 0;
    if (rb !== ra) return rb - ra;
    return String(a.jobName).localeCompare(String(b.jobName), "zh");
  });

  /** 管理员向：规则化异常信号（与 Doris 路径无关时前端可忽略该字段） */
  const adminInsights = [];
  const sevOrder = (s) => ({ high: 0, medium: 1, low: 2 }[s] ?? 3);

  let noAgentRuns = 0;
  for (const r of list) {
    if (r.agentId == null || !String(r.agentId).trim()) noAgentRuns += 1;
  }
  if (totalRuns > 0 && noAgentRuns > 0) {
    const pct = Math.round((noAgentRuns / totalRuns) * 1000) / 10;
    adminInsights.push({
      severity: pct >= 3 ? "high" : "medium",
      code: "NO_AGENT_RUNS",
      payload: { count: noAgentRuns, pct },
    });
  }

  const streakJobs = [];
  for (const [jid, runs] of byJob) {
    if (runs.length < 10) continue;
    const streak = maxConsecutiveFailStreakForRuns(runs);
    if (streak >= 3) {
      streakJobs.push({
        jobId: jid,
        jobName: runs[0]?.jobName != null ? String(runs[0].jobName) : jid,
        streak,
      });
    }
  }
  streakJobs.sort((a, b) => b.streak - a.streak);
  if (streakJobs.length) {
    adminInsights.push({
      severity: streakJobs[0].streak >= 5 ? "high" : "medium",
      code: "FAIL_STREAK_IN_WINDOW",
      payload: { jobs: streakJobs.slice(0, 8) },
    });
  }

  const recentBurstJobs = [];
  for (const [jid, runs] of byJob) {
    if (runs.length < 12) continue;
    const tailFail = recentTailFailureCount(runs, 12);
    if (tailFail >= 5) {
      recentBurstJobs.push({
        jobId: jid,
        jobName: runs[0]?.jobName != null ? String(runs[0].jobName) : jid,
        recentFailures: tailFail,
        windowSize: 12,
      });
    }
  }
  if (recentBurstJobs.length) {
    recentBurstJobs.sort((a, b) => b.recentFailures - a.recentFailures);
    adminInsights.push({
      severity: recentBurstJobs[0].recentFailures >= 8 ? "high" : "medium",
      code: "RECENT_FAIL_BURST",
      payload: { jobs: recentBurstJobs.slice(0, 8) },
    });
  }

  const highFailPick = failRateArr.filter((x) => x.failRatePct >= 18 && x.failureCount >= 5 && x.runCount >= 12).slice(0, 8);
  if (highFailPick.length) {
    adminInsights.push({
      severity: highFailPick[0].failRatePct >= 28 ? "high" : "medium",
      code: "HIGH_JOB_FAILURE_RATE",
      payload: { jobs: highFailPick },
    });
  }

  const deliveryStallJobs = [];
  for (const [jid, runs] of byJob) {
    if (runs.length < 12) continue;
    let stall = 0;
    for (const rr of runs) {
      const ds = String(rr.deliveryStatus ?? "").trim().toLowerCase();
      if (ds === "pending" || ds === "queued" || ds === "skipped") stall += 1;
    }
    const stallPct = Math.round((stall / runs.length) * 1000) / 10;
    if (stallPct >= 38) {
      deliveryStallJobs.push({
        jobId: jid,
        jobName: runs[0]?.jobName != null ? String(runs[0].jobName) : jid,
        stallPct,
        runCount: runs.length,
      });
    }
  }
  if (deliveryStallJobs.length) {
    deliveryStallJobs.sort((a, b) => b.stallPct - a.stallPct);
    adminInsights.push({
      severity: deliveryStallJobs[0].stallPct >= 52 ? "high" : "medium",
      code: "DELIVERY_STALL",
      payload: { jobs: deliveryStallJobs.slice(0, 8) },
    });
  }

  const chronicSlowJobs = [];
  for (const [jid, runs] of byJob) {
    if (runs.length < 12) continue;
    let slowC = 0;
    for (const rr of runs) {
      const d = effectiveDurationMsFromMockRun(rr);
      if (d != null && d >= 30000) slowC += 1;
    }
    if (slowC >= 5) {
      chronicSlowJobs.push({
        jobId: jid,
        jobName: runs[0]?.jobName != null ? String(runs[0].jobName) : jid,
        slowCount: slowC,
        runCount: runs.length,
      });
    }
  }
  if (chronicSlowJobs.length) {
    chronicSlowJobs.sort((a, b) => b.slowCount - a.slowCount);
    adminInsights.push({
      severity: chronicSlowJobs[0].slowCount >= 10 ? "high" : "medium",
      code: "CHRONIC_SLOW_RUNS",
      payload: { jobs: chronicSlowJobs.slice(0, 8) },
    });
  }

  let globalTokens = 0;
  const perJobTok = [];
  for (const [jid, runs] of byJob) {
    let tok = 0;
    for (const rr of runs) {
      const tt = tokenTotalFromMockRow(rr);
      if (tt != null && Number.isFinite(tt)) tok += tt;
    }
    globalTokens += tok;
    perJobTok.push({
      jobId: jid,
      jobName: runs[0]?.jobName != null ? String(runs[0].jobName) : jid,
      totalTokens: Math.floor(tok),
    });
  }
  perJobTok.sort((a, b) => b.totalTokens - a.totalTokens);
  const topTok = perJobTok[0];
  if (topTok && globalTokens > 0 && topTok.totalTokens >= 8000) {
    const sharePct = Math.round((topTok.totalTokens / globalTokens) * 1000) / 10;
    if (sharePct >= 28) {
      adminInsights.push({
        severity: sharePct >= 40 ? "high" : "medium",
        code: "TOKEN_CONCENTRATION",
        payload: {
          jobId: topTok.jobId,
          jobName: topTok.jobName,
          sharePct,
          totalTokens: topTok.totalTokens,
        },
      });
    }
  }

  const snapConsecJobs = jobs
    .filter((j) => j && Number(j.state?.consecutiveErrors) >= 2)
    .map((j) => ({
      jobId: String(j.id),
      jobName: String(j.name ?? j.id),
      consecutiveErrors: Math.floor(Number(j.state.consecutiveErrors)),
    }))
    .slice(0, 10);
  if (snapConsecJobs.length) {
    adminInsights.push({
      severity: "high",
      code: "SNAPSHOT_CONSECUTIVE_ERRORS",
      payload: { jobs: snapConsecJobs },
    });
  }

  adminInsights.sort((a, b) => sevOrder(a.severity) - sevOrder(b.severity));

  const frMap = new Map();
  for (const r of list) {
    if (!isFail(r.status)) continue;
    const em = r.errorMessage != null ? String(r.errorMessage) : "";
    let key = em.trim().replace(/\s+/g, " ");
    if (!key) key = "__EMPTY__";
    else if (key.length > 240) key = `${key.slice(0, 237)}…`;
    frMap.set(key, (frMap.get(key) ?? 0) + 1);
  }
  const failureReasonDistribution = [...frMap.entries()]
    .map(([reasonKey, count]) => ({ reasonKey, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    version: 0,
    range: { startIso, endIso },
    trend,
    tokenTrendByJob,
    slowTop10,
    tokenTop10,
    tokenDistributionByJob,
    jobTop10Analysis,
    failureReasonDistribution,
    distribution,
    anomalyTasks,
    summary,
    agentTop10,
    deliveryMix,
    failRateTop10,
    adminInsights,
    _meta: { mock: true },
  };
}
