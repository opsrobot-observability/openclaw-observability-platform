/**
 * Mock：GET /api/cron-runs（定时任务运行记录，结构与 Doris 接口一致）
 */

const DELIVERY_CYCLE = ["delivered", "pending", "skipped", "queued"];

function sampleLogAttrs(kind, i, durationMs) {
  const input = 100 + (i % 20) * 50;
  const output = 10 + (i % 7) * 8;
  return JSON.stringify({
    source: kind,
    kind,
    trace_id: `tr-${10000 + i}`,
    request_id: `req-${20000 + i}`,
    workspace: "/data/jobs",
    timeout_seconds: 300,
    delivery_status: DELIVERY_CYCLE[i % DELIVERY_CYCLE.length],
    labels: { env: "staging" },
    model: `mock-model-${(i % 3) + 1}`,
    provider: "mock",
    usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
    ...(durationMs != null && Number.isFinite(Number(durationMs)) ? { durationMs: Math.floor(Number(durationMs)) } : {}),
    session_id: `mock-sess-${i}-${kind}`,
    nextRunAtMs: Date.now() + (i + 1) * 3_600_000,
    error: i % 2 === 0 ? `mock log_attributes error line ${i}` : "",
    summary: `## 产出摘要（run #${i}）\n\n- 来源：\`cron_runs.log_attributes.summary\`\n- 任务：${kind}`,
  });
}

const BASE = [
  { jobId: "101", jobName: "sync-inventory", cronExpression: "0 */15 * * * *", laKey: "openclaw", agentId: "digital-emp-101" },
  { jobId: "102", jobName: "daily-report", cronExpression: "0 0 8 * * ?", laKey: "k8s", agentId: "digital-emp-102" },
  { jobId: "103", jobName: "health-check", cronExpression: "0 * * * * *", laKey: "sidekiq", agentId: "digital-emp-103" },
  { jobId: "104", jobName: "backup-db", cronExpression: "0 30 2 * * ?", laKey: "celery", agentId: "digital-emp-104" },
  { jobId: "105", jobName: "cache-warmup", cronExpression: "0 */5 * * * *", laKey: "redis", agentId: "digital-emp-105" },
  { jobId: "106", jobName: "metrics-export", cronExpression: "0 15 * * * ?", laKey: "prometheus", agentId: "digital-emp-106" },
  { jobId: "107", jobName: "alert-digest", cronExpression: "0 0 9,18 * * ?", laKey: "openclaw", agentId: "digital-emp-107" },
  { jobId: "108", jobName: "license-audit", cronExpression: "0 0 4 ? * MON", laKey: "sidekiq", agentId: "digital-emp-108" },
  { jobId: "109", jobName: "webhook-retry", cronExpression: "0 */10 * * * *", laKey: "k8s", agentId: "digital-emp-109" },
  { jobId: "110", jobName: "schema-drift-scan", cronExpression: "0 45 3 * * ?", laKey: "systemd", agentId: "digital-emp-110" },
  { jobId: "111", jobName: "token-refresh", cronExpression: "0 0 */6 * * *", laKey: "openclaw", agentId: "digital-emp-111" },
  { jobId: "112", jobName: "log-archive", cronExpression: "0 0 1 * * ?", laKey: "celery", agentId: "digital-emp-112" },
  { jobId: "113", jobName: "quota-reconcile", cronExpression: "0 20 */3 * * ?", laKey: "sidekiq", agentId: "digital-emp-113" },
];

function row(i) {
  const b = BASE[i % BASE.length];
  const runId = 5000 + i;
  const started = new Date(Date.now() - (i + 1) * 37 * 60 * 1000).toISOString();
  const ok = i % 5 !== 0;
  /** 第 3 条为成功且墙钟耗时约 11 分钟，用于运行概览「慢任务」mock 验证 */
  const slowMock = i === 3 && ok;
  const finished = ok
    ? new Date(new Date(started).getTime() + (slowMock ? 11 * 60 : 2 + (i % 4)) * 1000).toISOString()
    : null;
  const durationMs = finished ? new Date(finished).getTime() - new Date(started).getTime() : null;
  const la = sampleLogAttrs(b.laKey, i, durationMs);
  let parsed;
  try {
    parsed = JSON.parse(la);
  } catch {
    parsed = {};
  }
  const u = parsed.usage && typeof parsed.usage === "object" ? parsed.usage : null;
  const usageIn = u ? u.input_tokens ?? u.prompt_tokens : null;
  const usageOut = u ? u.output_tokens ?? u.completion_tokens : null;
  const usageTot = u ? u.total_tokens ?? u.totalTokens : null;
  return {
    runId,
    jobId: b.jobId,
    jobName: b.jobName,
    agentId: b.agentId != null && String(b.agentId).trim() ? String(b.agentId).trim() : null,
    cronExpression: b.cronExpression,
    jobSource: parsed.source || parsed.kind || null,
    jobTraceId: parsed.trace_id || parsed.traceId || null,
    jobRequestId: parsed.request_id || parsed.requestId || null,
    jobSessionId: parsed.session_id || parsed.sessionId || null,
    jobWorkspace: parsed.workspace || parsed.cwd || null,
    jobTimeoutSeconds: parsed.timeout_seconds != null ? String(parsed.timeout_seconds) : null,
    deliveryStatus: parsed.delivery_status ?? parsed.deliveryStatus ?? null,
    status: ok ? "success" : "failed",
    startedAt: started,
    finishedAt: finished,
    errorMessage: ok ? null : "connection reset by peer",
    durationMs,
    run_usage_in_raw: usageIn != null ? String(usageIn) : null,
    run_usage_out_raw: usageOut != null ? String(usageOut) : null,
    run_usage_total_raw: usageTot != null ? String(usageTot) : null,
    usage: u
      ? {
          input_tokens: u.input_tokens ?? u.prompt_tokens,
          output_tokens: u.output_tokens ?? u.completion_tokens,
          total_tokens: u.total_tokens ?? u.totalTokens,
        }
      : null,
    model: parsed.model != null ? String(parsed.model) : null,
    provider: parsed.provider != null ? String(parsed.provider) : null,
    run_duration_ms_raw:
      parsed.durationMs != null && String(parsed.durationMs).trim() !== ""
        ? parsed.durationMs
        : parsed.duration_ms != null
          ? parsed.duration_ms
          : null,
    run_log_session_id_raw: parsed.session_id ?? parsed.sessionId ?? null,
    run_log_next_run_raw: parsed.nextRunAtMs ?? parsed.next_run_at_ms ?? null,
    run_log_error_raw: parsed.error != null && String(parsed.error).trim() !== "" ? parsed.error : null,
    run_log_summary_raw:
      parsed.summary != null && String(parsed.summary).trim() !== "" ? String(parsed.summary) : null,
  };
}

/** 每个任务 100 条运行记录（与产品 mock 需求对齐） */
const ALL_ROWS = Array.from({ length: BASE.length * 100 }, (_, i) => row(i));

/** 供聚合类 mock（cron-jobs 列表、图表）使用全量行，避免受分页 pageSize 截断 */
export function getMockCronRunRowsAll() {
  return ALL_ROWS;
}

/** @param {Record<string, unknown>} r */
function effectiveDurationMsFromMockRow(r) {
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

/** @param {unknown} st */
function isOkStatus(st) {
  const s = String(st ?? "").toLowerCase();
  return s === "success" || s === "succeeded" || s === "ok" || s === "completed";
}

/** @param {unknown} st */
function isFailStatus(st) {
  const s = String(st ?? "").toLowerCase();
  return s === "error" || s === "failed" || s === "failure";
}

/**
 * Mock：GET /api/cron-runs-overview（与 Doris `queryCronRunsOverviewMetrics` 同形）
 * @param {{ startIso?: string | null, endIso?: string | null }} opts
 */
export function mockCronRunsOverviewMetrics(opts = {}) {
  const startIso = opts.startIso != null && String(opts.startIso).trim() ? String(opts.startIso).trim() : null;
  const endIso = opts.endIso != null && String(opts.endIso).trim() ? String(opts.endIso).trim() : null;
  const startMs = startIso ? Date.parse(startIso) : null;
  const endMs = endIso ? Date.parse(endIso) : null;

  const list = ALL_ROWS.filter((r) => {
    const t = Date.parse(String(r.startedAt));
    if (!Number.isFinite(t)) return false;
    if (startMs != null && Number.isFinite(startMs) && t < startMs) return false;
    if (endMs != null && Number.isFinite(endMs) && t > endMs) return false;
    return true;
  });

  const now = Date.now();
  const h24 = now - 24 * 3600000;
  let runsTotal = 0;
  let runsSuccess = 0;
  let runsFailure = 0;
  const failJobsInRange = new Set();
  const failJobs24 = new Set();
  const slowJobs = new Set();

  for (const r of list) {
    runsTotal += 1;
    if (isOkStatus(r.status)) runsSuccess += 1;
    else if (isFailStatus(r.status)) {
      runsFailure += 1;
      failJobsInRange.add(String(r.jobId));
      const st = Date.parse(String(r.startedAt));
      if (Number.isFinite(st) && st >= h24) failJobs24.add(String(r.jobId));
    }
    const d = effectiveDurationMsFromMockRow(r);
    if (d != null && d > 600000) slowJobs.add(String(r.jobId));
  }

  return {
    version: 0,
    range: { startIso, endIso },
    runs: {
      total: runsTotal,
      success: runsSuccess,
      failure: runsFailure,
    },
    alerts: {
      jobsWithFailureInRange: failJobsInRange.size,
      jobsWithFailureLast24h: failJobs24.size,
      slowJobsInRange: slowJobs.size,
    },
    meta: { slowThresholdMs: 600000 },
  };
}

/**
 * @param {{
 *   page?: number,
 *   pageSize?: number,
 *   jobId?: string | null,
 *   agentId?: string | null,
 *   status?: string | null,
 *   q?: string | null,
 * }} opts
 */
export function mockCronRunsPage(opts = {}) {
  const page = Number.isFinite(Number(opts.page)) ? Math.max(1, Math.floor(Number(opts.page))) : 1;
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  let list = ALL_ROWS;
  const jobId = opts.jobId != null && String(opts.jobId).trim() ? String(opts.jobId).trim() : null;
  if (jobId) {
    list = list.filter((r) => String(r.jobId) === jobId);
  }
  const agentId = opts.agentId != null && String(opts.agentId).trim() ? String(opts.agentId).trim() : null;
  if (agentId) {
    list = list.filter((r) => String(r.agentId ?? "").trim() === agentId);
  }
  const status = opts.status != null && String(opts.status).trim() ? String(opts.status).trim().toLowerCase() : "";
  if (status === "success") list = list.filter((r) => isOkStatus(r.status));
  if (status === "failure") list = list.filter((r) => isFailStatus(r.status));
  const q = opts.q != null && String(opts.q).trim() ? String(opts.q).trim().slice(0, 200) : "";
  if (q) {
    const low = q.toLowerCase();
    list = list.filter((r) => {
      const hay = [String(r.runId ?? ""), String(r.jobId ?? ""), String(r.jobName ?? ""), String(r.errorMessage ?? "")]
        .join(" ")
        .toLowerCase();
      return hay.includes(low);
    });
  }
  const total = list.length;
  const start = (page - 1) * pageSize;
  const rows = list.slice(start, start + pageSize);
  return {
    total,
    page,
    pageSize,
    rows,
    meta: {
      database: "mock",
      jobsTable: "cron_jobs",
      runsTable: "cron_runs",
      cronJobsLogAttributes: true,
      cronJobsLogAttributesColumn: "log_attributes",
      cronRunsLogAttributes: true,
      cronRunsLogAttributesColumn: "log_attributes",
    },
  };
}
