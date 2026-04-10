/**
 * 大屏专用：与 digital-employee-service.buildDigitalEmployeeOverview 口径一致，
 * 但会话拉取走 monitor-doris-cache（不修改 digital-employee 模块实现）。
 */
import { mapAgentSessionRows } from "../../frontend/lib/sessionAudit.js";
import { DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS } from "../../frontend/lib/digitalEmployeeRows.js";
import { buildOverviewPayload } from "../digital-employee/digital-employee-overview-builder.mjs";
import { monitorCachedAgentSessionsWithLogTokens } from "./monitor-doris-cache.mjs";

function clampDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) return DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS;
  return Math.min(90, Math.floor(n));
}

function clampHours(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(168, Math.floor(n));
}

/**
 * @returns {{ cutoffMs: number, billingDays: number, displayDays: number|null, displayHours: number|null }}
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
 * @param {number|string|undefined} days
 * @param {number|string|undefined|null} hours
 */
export async function buildMonitorDigitalEmployeeOverview(days, hours) {
  const win = resolveWindow(days, hours);
  const raw = await monitorCachedAgentSessionsWithLogTokens();
  const inWindow = raw.filter((r) => {
    const u = Number(r.updated_at);
    return Number.isFinite(u) && u >= win.cutoffMs;
  });
  const rows = mapAgentSessionRows(inWindow);
  const payload = buildOverviewPayload(rows, {
    days: win.billingDays,
    windowStartMs: win.cutoffMs,
    hasHours: win.displayHours != null,
  });
  return {
    source: "doris",
    ...payload,
    days: win.displayDays ?? win.billingDays,
    hours: win.displayHours,
  };
}
