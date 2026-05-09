import intl from "react-intl-universal";

/**
 * 将运行事件 status 显示为当前语言文案（成功/失败/进行中）；未知值回传原始字符串。
 * @param {unknown} status
 */
export function formatRunStatusLabel(status) {
  const raw = status == null ? "" : String(status).trim();
  if (!raw) return "";
  const s = raw.toLowerCase();
  if (s === "success" || s === "succeeded" || s === "ok" || s === "completed") {
    return intl.get("scheduledTasks.execution.filterStatusSuccess");
  }
  if (s === "failed" || s === "error" || s === "failure") {
    return intl.get("scheduledTasks.execution.filterStatusFailure");
  }
  if (s === "running" || s === "pending" || s === "started") {
    return intl.get("scheduledTasks.taskDetail.runStatus.inProgress");
  }
  return raw;
}
