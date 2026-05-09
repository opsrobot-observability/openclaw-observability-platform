/** 与「执行稳定性」页签相关的纯计算（便于单测与复用） */

/** @param {unknown} status */
export function isRunSuccessStatus(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "success" || s === "succeeded" || s === "ok" || s === "completed";
}

/** @param {unknown} status */
export function isRunFailureStatus(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "error" || s === "failed" || s === "failure";
}

const PUNCTUALITY_TOLER_MS = 120_000;

/** @param {Date} d */
function dayKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {number} ms */
function dayKeyFromMs(ms) {
  return dayKeyFromDate(new Date(Number(ms)));
}

/**
 * 最近 n 个自然日（含今天）的日期键，本地时区 0 点。
 * @param {number} n
 */
export function rollingCalendarDayKeys(n) {
  const keys = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    keys.push(dayKeyFromDate(d));
  }
  return keys;
}

/**
 * @param {object[]} events
 * @param {number} dayCount 7 或 30
 */
export function buildDailyTrend(events, dayCount) {
  const keys = rollingCalendarDayKeys(dayCount);
  const map = new Map(keys.map((k) => [k, { ok: 0, fail: 0 }]));
  const list = Array.isArray(events) ? events : [];
  const keySet = new Set(keys);
  for (const ev of list) {
    const ms = Number(ev?.runAtMs ?? ev?.ts ?? 0);
    if (!Number.isFinite(ms)) continue;
    const k = dayKeyFromMs(ms);
    if (!keySet.has(k)) continue;
    const b = map.get(k);
    if (!b) continue;
    if (isRunSuccessStatus(ev?.status)) b.ok += 1;
    else if (isRunFailureStatus(ev?.status)) b.fail += 1;
  }
  return keys.map((date) => ({ date, ok: map.get(date).ok, fail: map.get(date).fail }));
}

/**
 * @param {object[]} events
 * @param {{ state?: object } | null} job
 * @param {number} fileTotalLines API 返回的文件总行数
 */
export function analyzeJobStability(events, job, fileTotalLines) {
  const list = Array.isArray(events) ? [...events] : [];
  const loaded = list.length;
  const fileTotal = Math.max(0, Number(fileTotalLines) || 0);
  const partial = fileTotal > 0 && loaded < fileTotal;

  let ok = 0;
  let bad = 0;
  let neutral = 0;
  for (const ev of list) {
    if (isRunSuccessStatus(ev?.status)) ok += 1;
    else if (isRunFailureStatus(ev?.status)) bad += 1;
    else neutral += 1;
  }
  const denom = ok + bad + neutral;
  const successRatePct = denom > 0 ? Math.round((ok / denom) * 1000) / 10 : null;

  const byTsDesc = [...list].sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0));
  let consecutiveFailFromNewest = 0;
  for (const ev of byTsDesc) {
    if (isRunFailureStatus(ev?.status)) consecutiveFailFromNewest += 1;
    else break;
  }

  let lastEv = null;
  let maxRun = -Infinity;
  for (const ev of list) {
    const r = Number(ev?.runAtMs);
    if (Number.isFinite(r) && r >= maxRun) {
      maxRun = r;
      lastEv = ev;
    }
  }
  const lastRunAtMs = lastEv?.runAtMs != null && Number.isFinite(Number(lastEv.runAtMs)) ? Number(lastEv.runAtMs) : null;
  const lastEventTs = lastEv?.ts != null && Number.isFinite(Number(lastEv.ts)) ? Number(lastEv.ts) : null;
  const lastStatus = lastEv?.status ?? null;
  const lastIsSuccess = isRunSuccessStatus(lastStatus);
  const lastIsFailure = isRunFailureStatus(lastStatus);

  const chrono = [...list]
    .filter((e) => e?.runAtMs != null && Number.isFinite(Number(e.runAtMs)))
    .sort((a, b) => Number(a.runAtMs) - Number(b.runAtMs));

  /** @type {{ kind: string, deltaMs: number | null }} */
  let lastPunctuality = { kind: "unknown", deltaMs: null };
  if (chrono.length >= 2) {
    const last = chrono[chrono.length - 1];
    const prev = chrono[chrono.length - 2];
    const expected = Number(prev?.nextRunAtMs);
    const actual = Number(last.runAtMs);
    if (Number.isFinite(expected) && Number.isFinite(actual)) {
      const delta = actual - expected;
      if (Math.abs(delta) <= PUNCTUALITY_TOLER_MS) {
        lastPunctuality = { kind: "on_time", deltaMs: delta };
      } else if (delta > PUNCTUALITY_TOLER_MS) {
        lastPunctuality = { kind: "delayed", deltaMs: delta };
      } else {
        lastPunctuality = { kind: "early", deltaMs: delta };
      }
    }
  }

  const trend7 = buildDailyTrend(list, 7);
  const trend30 = buildDailyTrend(list, 30);

  const schedErr = job?.state?.consecutiveErrors;
  const schedErrN = schedErr != null && Number.isFinite(Number(schedErr)) ? Number(schedErr) : null;

  /** @type {"ok" | "warn" | "danger"} */
  let verdict = "ok";
  const reasons = [];

  if (lastIsFailure) {
    verdict = "danger";
    reasons.push("lastRunFail");
  }
  if (consecutiveFailFromNewest >= 3) {
    verdict = "danger";
    reasons.push("failStreak3");
  }
  if (successRatePct != null && denom >= 5 && successRatePct < 70) {
    verdict = "danger";
    reasons.push("lowSuccess");
  }
  if (schedErrN != null && schedErrN >= 5) {
    verdict = "danger";
    reasons.push("schedulerErrors");
  }

  if (verdict !== "danger") {
    if (consecutiveFailFromNewest >= 2) {
      verdict = "warn";
      reasons.push("failStreak2");
    }
    if (successRatePct != null && denom >= 5 && successRatePct < 90) {
      verdict = "warn";
      reasons.push("mediumSuccess");
    }
    if (lastPunctuality.kind === "delayed") {
      verdict = "warn";
      reasons.push("delayedStart");
    }
    if (neutral > 0 && denom >= 5 && neutral / denom > 0.2) {
      verdict = "warn";
      reasons.push("manyUnknown");
    }
  }

  const uniqueReasons = [...new Set(reasons)];

  return {
    loaded,
    fileTotal,
    partial,
    ok,
    bad,
    neutral,
    successRatePct,
    consecutiveFailFromNewest,
    lastRunAtMs,
    lastEventTs,
    lastStatus,
    lastIsSuccess,
    lastIsFailure,
    lastPunctuality,
    trend7,
    trend30,
    verdict,
    verdictReasons: uniqueReasons,
    schedulerConsecutiveErrors: schedErrN,
    schedulerLastRunStatus: job?.state?.lastRunStatus ?? null,
  };
}
