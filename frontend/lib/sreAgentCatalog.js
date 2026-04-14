/**
 * SRE Agent 可选 Agent 列表（对话目标 OpenClaw agent_id）。
 *
 * 优先从后端 GET /api/openclaw/agents（与 /api/sre-agent/agents 等价）拉取 OpenClaw 已注册 Agent；
 * 若接口不可用，回退到 VITE_SRE_AGENT_CATALOG 环境变量（离线 fallback）。
 */

const LS_KEY = "sre-ui-selected-agent-id";

// ─── 静态 fallback（环境变量 / 默认值） ─────────────────────────

function parseCatalog() {
  const raw = import.meta.env.VITE_SRE_AGENT_CATALOG;
  if (raw && typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      if (
        Array.isArray(arr) &&
        arr.length > 0 &&
        arr.every((x) => x && typeof x.id === "string" && x.id.trim() && typeof x.label === "string")
      ) {
        return arr.map((x) => ({
          id: x.id.trim(),
          label: x.label.trim(),
          description: typeof x.description === "string" ? x.description : undefined,
        }));
      }
    } catch {
      /* fall through */
    }
  }
  return [{ id: "sre-agent", label: "内置 SRE Agent", description: "平台默认（与后端 OPENCLAW_AGENT_ID 可一致）" }];
}

export const STATIC_FALLBACK_CATALOG = parseCatalog();

// ─── 动态拉取 ──────────────────────────────────────────────────

/**
 * 从后端代理接口获取 OpenClaw 已注册 Agent 列表。
 * 成功时返回 Agent 数组；失败时 fallback 到静态列表。
 * @returns {Promise<{ agents: Array<{id:string, label:string, status?:string, description?:string}>, fromRemote: boolean }>}
 */
export async function fetchAgentCatalog() {
  try {
    const resp = await fetch("/api/openclaw/agents", {
      signal: AbortSignal.timeout(6_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const list = Array.isArray(json.agents) ? json.agents : [];
    if (list.length > 0) {
      return { agents: list, fromRemote: true };
    }
    if (json.error) {
      console.warn("[sreAgentCatalog] remote returned empty with error:", json.error);
    }
  } catch (err) {
    console.warn("[sreAgentCatalog] fetch failed, using static fallback:", err.message || err);
  }
  return { agents: STATIC_FALLBACK_CATALOG, fromRemote: false };
}

// ─── localStorage 持久化 ───────────────────────────────────────

/**
 * @param {Array<{id:string}>} catalog 当前有效的 agent 列表
 */
export function readStoredAgentId(catalog) {
  const list = Array.isArray(catalog) && catalog.length > 0 ? catalog : STATIC_FALLBACK_CATALOG;
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s && list.some((a) => a.id === s)) return s;
  } catch {
    /* noop */
  }
  return list[0]?.id ?? "sre-agent";
}

export function writeStoredAgentId(id) {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    /* noop */
  }
}
