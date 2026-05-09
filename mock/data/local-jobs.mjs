/**
 * Mock：GET /api/local-jobs、GET /api/local-jobs/:jobId/run-events
 * 形状与 data/jobs.json + jsonl 一致，便于无仓库 data 目录时演示。
 */

const MOCK_JOB = {
  id: "916195cc-5f99-443d-86ca-d3a30115212d",
  agentId: "main",
  sessionKey: "agent:main:main",
  name: "你是智能巡检助手。请执行以下任务：",
  enabled: true,
  createdAtMs: 1773296857773,
  updatedAtMs: 1776301442795,
  schedule: { expr: "0 9 * * *", kind: "cron", tz: "Asia/Shanghai" },
  sessionTarget: "isolated",
  wakeMode: "now",
  payload: {
    kind: "agentTurn",
    message: "Mock：巡检任务说明…",
    model: "minimax-cn/MiniMax-M2.5",
  },
  delivery: { mode: "announce" },
  state: {
    nextRunAtMs: 1776387600000,
    lastRunAtMs: 1776301200042,
    lastRunStatus: "error",
    lastStatus: "error",
    lastDurationMs: 242753,
    lastDeliveryStatus: "unknown",
    consecutiveErrors: 26,
    lastError: "Delivering to Feishu requires target <chatId|user:openId|chat:chatId>",
  },
  listRunSummary: {
    totalLines: 2,
    sampleSize: 2,
    truncated: false,
    okCount: 0,
    failCount: 2,
    neutralCount: 0,
    successRatePct: 0,
    avgDurationMs: (242753 + 279392) / 2,
    maxDurationMs: 279392,
    totalTokensSum: null,
    lastRunTokensTotal: null,
    lastSuccessAtMs: null,
  },
};

export function mockLocalJobsDocument() {
  return { version: 1, jobs: [MOCK_JOB], _meta: { mock: true } };
}

export function mockJobRunEvents(jobId) {
  if (String(jobId) !== MOCK_JOB.id) {
    return { jobId: String(jobId), events: [], totalLines: 0, _meta: { mock: true } };
  }
  return {
    jobId: MOCK_JOB.id,
    totalLines: 2,
    events: [
      {
        ts: 1776301442823,
        jobId: MOCK_JOB.id,
        action: "finished",
        status: "error",
        error: "Delivering to Feishu requires target <chatId|user:openId|chat:chatId>",
        deliveryStatus: "unknown",
        runAtMs: 1776301200042,
        durationMs: 242753,
        nextRunAtMs: 1776387600000,
        sessionId: "05cc7eb6-d855-4e1d-b4f6-3b838b05ac88",
        model: "MiniMax-M2.5",
        provider: "minimax-cn",
      },
      {
        ts: 1776215079437,
        jobId: MOCK_JOB.id,
        action: "finished",
        status: "error",
        error: "Delivering to Feishu requires target <chatId|user:openId|chat:chatId>",
        summary: "Mock summary line",
        deliveryStatus: "unknown",
        runAtMs: 1776214800029,
        durationMs: 279392,
        nextRunAtMs: 1776301200000,
      },
    ],
    _meta: { mock: true },
  };
}
