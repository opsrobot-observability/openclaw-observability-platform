/**
 * SRE Agent HTTP Handler
 *
 * - POST /api/sre-agent — AG-UI RunAgentInput (JSON)，SSE 流式响应，桥接 OpenClaw Chat API
 * - GET  /api/sre-agent/agents — 与 GET /api/openclaw/agents 等价，代理拉取 OpenClaw 已注册 Agent 列表（JSON）
 */
import { runSreAgent, getConfig } from "./openclaw-client.mjs";

/**
 * 处理 POST /api/sre-agent 请求（原生 node:http req/res）
 */
export async function handleSreAgent(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  // Parse JSON body
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Abort controller for client disconnect
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  const emit = (event) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runSreAgent(body, emit, ac.signal);
  } catch (err) {
    if (err.name !== "AbortError") {
      emit({ type: "RUN_ERROR", message: err.message || String(err) });
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Vite dev middleware 适配器（req/res 为 connect-style）
 */
export function handleSreAgentMiddleware(req, res) {
  return handleSreAgent(req, res);
}

/**
 * POST /api/sre-agent/action — 前端操作按钮事件上报
 * 接收 A2UI userAction payload，转发给 Agent 或记录日志。
 */
export async function handleSreAgentAction(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  let body;
  try { body = await readBody(req); } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  console.log("[sre-agent] userAction:", JSON.stringify(body));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, received: body }));
}

export function handleSreAgentActionMiddleware(req, res) {
  return handleSreAgentAction(req, res);
}

// ─── GET /api/sre-agent/agents | GET /api/openclaw/agents（等价）───

let _agentsCache = null;
let _agentsCacheTs = 0;
const AGENTS_CACHE_TTL = 30_000;

function pickStr(v) {
  if (v == null) return "";
  const s = String(v).trim();
  return s || "";
}

/**
 * 从 OpenClaw JSON 中取出 Agent 数组（不同版本 / 网关字段名不一致）
 */
/** Gateway 常把 agents 做成 `{ [agentId]: { ... } }` 映射 */
function objectMapToAgentRows(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([key, v]) => {
    if (!v || typeof v !== "object") return { slug: key, name: key };
    return { ...v, slug: pickStr(v.slug) || key, name: pickStr(v.name) || key };
  });
}

function extractAgentArray(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json)) return json;

  if (Array.isArray(json.agents)) return json.agents;
  if (json.agents && typeof json.agents === "object") {
    return objectMapToAgentRows(json.agents);
  }

  const nested = [
    json.data,
    json.items,
    json.results,
    json.status,
    json.gateway,
  ];
  for (const c of nested) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === "object") {
      if (Array.isArray(c.agents)) return c.agents;
      if (c.agents && typeof c.agents === "object" && !Array.isArray(c.agents)) {
        return objectMapToAgentRows(c.agents);
      }
    }
  }
  return [];
}

/**
 * 对话时使用的 agent 标识：Gateway UI 多为 slug / name，Mission Control 多为 gateway_agent_id
 */
function resolveAgentId(a) {
  return (
    pickStr(a.gateway_agent_id) ||
    pickStr(a.slug) ||
    pickStr(a.agent_id) ||
    pickStr(a.agentId) ||
    pickStr(a.id) ||
    pickStr(a.name)
  );
}

function mapOpenClawAgent(a) {
  if (!a || typeof a !== "object") return null;
  const id = resolveAgentId(a);
  if (!id) return null;
  const label =
    pickStr(a.name) ||
    pickStr(a.displayName) ||
    pickStr(a.display_name) ||
    pickStr(a.title) ||
    pickStr(a.slug) ||
    id;
  let description;
  const ip = a.identity_profile ?? a.identityProfile;
  if (ip) {
    description = typeof ip === "string" ? ip : JSON.stringify(ip);
  }
  return {
    id,
    label,
    status: pickStr(a.status) || "unknown",
    description,
  };
}

async function fetchJsonWithAuth(baseUrl, path, apiKey) {
  const url = `${baseUrl}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`${path} ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function fetchOpenClawAgents() {
  const now = Date.now();
  if (_agentsCache && now - _agentsCacheTs < AGENTS_CACHE_TTL) {
    return _agentsCache;
  }

  const { baseUrl, apiKey } = getConfig();

  /** @type {unknown[]} */
  let rawList = [];
  let lastErr = null;
  let hadHttpSuccess = false;

  const tryPaths = [
    "/api/v1/agents?limit=100",
    "/api/v1/agents",
    "/v1/agents?limit=100",
    "/v1/agents",
  ];

  // 并行探测各路径，避免 OpenClaw 不可达时串行 4×8s 长时间无响应
  const settled = await Promise.allSettled(
    tryPaths.map((path) => fetchJsonWithAuth(baseUrl, path, apiKey)),
  );
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      hadHttpSuccess = true;
      const list = extractAgentArray(r.value);
      if (list.length > 0) {
        rawList = list;
        break;
      }
    } else {
      lastErr = r.reason;
    }
  }

  if (rawList.length === 0) {
    try {
      const statusJson = await fetchJsonWithAuth(baseUrl, "/api/v1/status", apiKey);
      hadHttpSuccess = true;
      rawList = extractAgentArray(statusJson);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 多数 Gateway 无此接口，404 不记错、不打致命日志
      if (!/\b404\b/.test(msg)) {
        lastErr = e;
      }
    }
  }

  const seen = new Set();
  const agents = [];
  for (const row of rawList) {
    const m = mapOpenClawAgent(row);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    agents.push(m);
  }

  const out = { agents };
  if (agents.length === 0 && !hadHttpSuccess && lastErr) {
    out.error = lastErr instanceof Error ? lastErr.message : String(lastErr);
  }

  _agentsCache = out;
  _agentsCacheTs = now;
  return out;
}

/** 响应体：`{ agents: { id, label, status?, description? }[], error?: string }` */
export async function handleListAgents(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    const data = await fetchOpenClawAgents();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[sre-agent] list agents error:", err.message || err);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ agents: [], error: String(err.message || err) }));
  }
}

export function handleListAgentsMiddleware(req, res) {
  return handleListAgents(req, res);
}

/** 供路由层判断是否为「拉取 OpenClaw Agent 列表」 */
export function isOpenClawAgentsListPath(pathname) {
  return pathname === "/api/sre-agent/agents" || pathname === "/api/openclaw/agents";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
