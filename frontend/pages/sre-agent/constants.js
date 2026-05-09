export const USE_MOCK =
  import.meta.env.VITE_SRE_AGENT_MOCK === "true" || import.meta.env.VITE_MOCK === "true";

/**
 * 与 OpenClaw `chat.send` + `sessionKey` 一致：每次 run 只发本轮用户句，由服务端用 `X-OpenClaw-Session-Key` 恢复历史。
 * 设置 `VITE_SRE_AGENT_FULL_MESSAGES=true` 可回退为拼接完整 messages（直连无会话语义的后端时可用）。
 */
export const SRE_SESSION_SCOPED_USER_MESSAGES =
  import.meta.env.VITE_SRE_AGENT_FULL_MESSAGES !== "true";

/** 默认使用 WebSocket `/api/sre-agent/ws`；设置 `VITE_SRE_AGENT_TRANSPORT=sse` 回退为 HTTP+SSE */
export const SRE_USE_WEBSOCKET =
  import.meta.env.VITE_SRE_AGENT_TRANSPORT !== "sse";

export const SKILLS = [
  { key: "claw-task", label: "任务管理", icon: "check-square", prompt: "查看OpenClaw所有执行任务状态、进度与历史记录" },
  { key: "claw-config", label: "配置管理", icon: "settings", prompt: "巡检OpenClaw系统配置，检查参数、权限与接入状态是否正常" },
  { key: "claw-monitor", label: "平台监控", icon: "eye", prompt: "监控OpenClaw自身服务状态、接口可用性与资源占用" },
  { key: "claw-dashboard", label: "全景看板", icon: "grid", prompt: "生成OpenClaw运维平台全景数据看板与健康度评分" }
];

export const REFRESH_INTERVAL = 60_000;

/** 会话页（聊天 + 工作区）左侧宽度，可拖拽调整并写入 localStorage */
export const CHAT_SPLIT_STORAGE_KEY = "sre-agent-chat-left-px";
export const CHAT_SPLIT_DEFAULT = 380;
export const CHAT_SPLIT_MIN = 280;
export const CHAT_SPLIT_HARD_MAX = 920;
export const WORKSPACE_MIN_WIDTH = 280;
