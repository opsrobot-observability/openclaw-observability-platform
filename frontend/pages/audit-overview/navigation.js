/**
 * 行为审计概览 → 会话链路溯源 下钻导航
 */
export function navigateToSessionAudit(params = {}) {
  window.dispatchEvent(new CustomEvent("openclaw-nav", {
    detail: { id: "session-audit", params },
  }));
}
