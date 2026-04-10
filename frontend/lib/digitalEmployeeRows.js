/**
 * 数字员工列表：主键与去重（与 Doris / 画像选中态一致）
 * 版本 1.1.0
 */

/**
 * 概览与监控大屏「员工总数 / 数字员工总数」默认统计窗口：最近一个月（滚动 30 天）。
 * 服务端按会话 `updated_at >= now - 30d` 筛选后按 `agent_name` 去重，与 `GET /api/digital-employees/overview` 默认参数一致。
 */
export const DIGITAL_EMPLOYEE_OVERVIEW_DEFAULT_DAYS = 30;

/** 列表主键：优先 `agentName`，否则回落 `session_key` / `session_id` / `sessionId` */
export function rowSessionKey(row) {
  const agentName = row?.agentName != null && String(row.agentName).trim() ? String(row.agentName).trim() : "";
  if (agentName) return agentName;
  const sk = row?.sessionKey != null && String(row.sessionKey).trim() ? String(row.sessionKey).trim() : "";
  if (sk) return sk;
  const sid =
    (row?.session_id != null && String(row.session_id).trim() ? String(row.session_id).trim() : "") ||
    (row?.sessionId != null && String(row.sessionId).trim() ? String(row.sessionId).trim() : "");
  return sid || "";
}

/**
 * 按 `rowSessionKey` 去重：同一 session_key 仅保留一行；
 * 当前口径下优先按 agent_name 去重，无 key 时以 `rowId` / 索引区分，不合并。
 * 冲突时保留 `lastUpdatedAt` 较新的行（与概览 Builder 策略一致）。
 * @param {object[]} rows
 */
export function dedupeEmployeesBySessionKey(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const map = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sk = rowSessionKey(row);
    const dedupKey =
      sk || `__noid__:${row.rowId ?? row.session_id ?? row.sessionId ?? `i${i}`}`;
    const existing = map.get(dedupKey);
    if (!existing) {
      map.set(dedupKey, row);
      continue;
    }
    const prevU = Number(existing.lastUpdatedAt) || 0;
    const curU = Number(row.lastUpdatedAt) || 0;
    if (curU >= prevU) map.set(dedupKey, row);
  }
  return [...map.values()];
}
