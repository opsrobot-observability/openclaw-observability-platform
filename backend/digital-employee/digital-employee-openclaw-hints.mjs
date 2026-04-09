/**
 * 从 Doris 读取数字员工画像所需配置摘要（openclaw_config + agent_models）。
 * 不再从本地文件读取兜底。版本 1.2.0
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "../agentSessionsQuery.mjs";

/** @param {unknown} v */
function toBoolOrNull(v) {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  return null;
}

/** @param {unknown} v */
function toObjOrNull(v) {
  if (v && typeof v === "object") return /** @type {Record<string, unknown>} */ (v);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      if (p && typeof p === "object") return /** @type {Record<string, unknown>} */ (p);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** @param {unknown} v */
function toStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

/** @param {Record<string, unknown>|null} cfg */
function extractGatewayDenyCommands(cfg) {
  if (!cfg) return [];
  const csv = String(cfg.gateway_deny_commands_csv ?? "").trim();
  if (csv) {
    const fromCsv = csv.split(",").map((x) => x.trim()).filter(Boolean);
    if (fromCsv.length > 0) return fromCsv;
  }
  const la = toObjOrNull(cfg.log_attributes);
  if (!la) return [];
  const candidates = [
    la.gateway,
    la.gatewayConfig,
    la.gateway_config,
    la,
  ];
  for (const c of candidates) {
    const o = toObjOrNull(c);
    if (!o) continue;
    const fromGatewayNodes = toStringArray(toObjOrNull(toObjOrNull(o.gateway)?.nodes)?.denyCommands);
    if (fromGatewayNodes.length > 0) return fromGatewayNodes;

    const arrCandidates = [
      toStringArray(o.denyCommands),
      toStringArray(o.deny_commands),
      toStringArray(toObjOrNull(o.nodes)?.denyCommands),
      toStringArray(toObjOrNull(o.nodes)?.deny_commands),
      toStringArray(toObjOrNull(o.deny)?.commands),
      toStringArray(toObjOrNull(o.deny_commands)?.commands),
    ];
    const hit = arrCandidates.find((x) => x.length > 0);
    if (hit) return hit;
  }
  return [];
}

/**
 * @param {string|null|undefined} preferredAgentName
 */
async function queryAgentModels(preferredAgentName) {
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 25000,
  });
  try {
    const [rows] = await conn.query(
      `
SELECT
  agent_name,
  provider,
  model_id,
  display_name,
  reasoning,
  context_window,
  max_tokens,
  cost_input,
  cost_output
FROM agent_models
ORDER BY collected_at DESC
`,
    );

    const all = Array.isArray(rows) ? rows : [];
    const wanted = String(preferredAgentName ?? "").trim();
    const byWanted = wanted ? all.filter((r) => String(r.agent_name ?? "") === wanted) : [];
    const byMain = all.filter((r) => String(r.agent_name ?? "") === "main");
    const chosen = byWanted.length > 0 ? byWanted : byMain.length > 0 ? byMain : all;

    const uniq = new Map();
    for (const r of chosen) {
      const p = String(r.provider ?? "").trim();
      const m = String(r.model_id ?? "").trim();
      if (!p || !m) continue;
      const k = `${p}/${m}`;
      if (!uniq.has(k)) uniq.set(k, r);
    }

    return [...uniq.values()].map((r) => ({
      provider: String(r.provider ?? ""),
      id: String(r.model_id ?? ""),
      name: String(r.display_name ?? r.model_id ?? ""),
      reasoning: toBoolOrNull(r.reasoning),
      contextWindow: Number.isFinite(Number(r.context_window)) ? Number(r.context_window) : null,
      maxTokens: Number.isFinite(Number(r.max_tokens)) ? Number(r.max_tokens) : null,
      unitCostInput: Number.isFinite(Number(r.cost_input)) ? Number(r.cost_input) : null,
      unitCostOutput: Number.isFinite(Number(r.cost_output)) ? Number(r.cost_output) : null,
    }));
  } finally {
    await conn.end();
  }
}

async function queryOpenclawConfig() {
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 25000,
  });
  try {
    const [rows] = await conn.query(
      `
SELECT
  source_path,
  sandbox_mode,
  workspace_default,
  subagents_max_concurrent,
  exec_security,
  exec_ask,
  fs_workspace_only,
  channel_group_policy,
  gateway_auth_mode,
  gateway_deny_commands_count,
  gateway_deny_commands_csv,
  elevated_allow_from_summary
FROM openclaw_config
ORDER BY collected_at DESC
LIMIT 1
`,
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } finally {
    await conn.end();
  }
}

/**
 * @returns {{
 *   openclawPath: string|null,
 *   sandboxMode: string|null,
 *   workspaceDefault: string|null,
 *   subagentsMaxConcurrent: number|null,
 *   execSecurity: string|null,
 *   execAsk: string|null,
 *   fsWorkspaceOnly: boolean|null,
 *   channelGroupPolicy: string|null,
 *   gatewayAuthMode: string|null,
 *   gatewayDenyCommandsCount: number|null,
 *   gatewayDenyCommandsList: string[],
 *   elevatedAllowFromSummary: string|null,
 *   modelCatalog: Array<{
 *     provider: string,
 *     id: string,
 *     name: string,
 *     reasoning: boolean|null,
 *     contextWindow: number|null,
 *     maxTokens: number|null,
 *     unitCostInput: number|null,
 *     unitCostOutput: number|null,
 *   }>,
 * }}
 */
export async function readOpenclawHintsBundle(preferredAgentName) {
  const [cfg, modelCatalog] = await Promise.all([
    queryOpenclawConfig(),
    queryAgentModels(preferredAgentName),
  ]);

  return {
    openclawPath: cfg?.source_path != null ? String(cfg.source_path) : null,
    sandboxMode: cfg?.sandbox_mode != null ? String(cfg.sandbox_mode) : null,
    workspaceDefault: cfg?.workspace_default != null ? String(cfg.workspace_default) : null,
    subagentsMaxConcurrent:
      cfg?.subagents_max_concurrent != null && Number.isFinite(Number(cfg.subagents_max_concurrent))
        ? Number(cfg.subagents_max_concurrent)
        : null,
    execSecurity: cfg?.exec_security != null ? String(cfg.exec_security) : null,
    execAsk: cfg?.exec_ask != null ? String(cfg.exec_ask) : null,
    fsWorkspaceOnly: toBoolOrNull(cfg?.fs_workspace_only),
    channelGroupPolicy: cfg?.channel_group_policy != null ? String(cfg.channel_group_policy) : null,
    gatewayAuthMode: cfg?.gateway_auth_mode != null ? String(cfg.gateway_auth_mode) : null,
    gatewayDenyCommandsCount:
      cfg?.gateway_deny_commands_count != null && Number.isFinite(Number(cfg.gateway_deny_commands_count))
        ? Number(cfg.gateway_deny_commands_count)
        : null,
    gatewayDenyCommandsList: extractGatewayDenyCommands(cfg),
    elevatedAllowFromSummary:
      cfg?.elevated_allow_from_summary != null ? String(cfg.elevated_allow_from_summary) : null,
    modelCatalog,
  };
}

/**
 * 按模型 id / 展示名在目录中查找一条（用于上下文窗口等）。
 * @param {Array<{id: string, name: string}>} catalog
 * @param {string|null|undefined} modelIdOrLabel
 */
export function lookupModelMeta(catalog, modelIdOrLabel) {
  if (!Array.isArray(catalog) || !modelIdOrLabel || !catalog.length) return null;
  const q = String(modelIdOrLabel).trim().toLowerCase();
  if (!q) return null;
  return (
    catalog.find((m) => String(m.id ?? "").toLowerCase() === q) ||
    catalog.find((m) => String(m.name ?? "").toLowerCase() === q) ||
    catalog.find((m) => q.includes(String(m.id ?? "").toLowerCase()) || String(m.id ?? "").toLowerCase().includes(q)) ||
    catalog.find((m) => q.includes(String(m.name ?? "").toLowerCase())) ||
    null
  );
}
