/**
 * 将 OpenClaw `sessions.json` 根对象转为行数组（每项含 `sessionKey`）。
 * @param {Record<string, object>} index
 * @returns {object[]}
 */
export function parseSessionsIndex(index) {
  if (!index || typeof index !== "object") return [];
  return Object.entries(index).map(([sessionKey, v]) => ({
    sessionKey,
    ...(v && typeof v === "object" ? v : {}),
  }));
}

/**
 * @param {object[]} rows
 * @param {string} sortKey
 * @param {"asc"|"desc"} sortDir
 */
export function sortSessionRows(rows, sortKey, sortDir) {
  if (!sortKey) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  const list = [...rows];
  list.sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (
      sortKey === "updatedAt" ||
      sortKey === "startedAt" ||
      sortKey === "endedAt" ||
      sortKey === "durationMs" ||
      sortKey === "totalTokens" ||
      sortKey === "inputTokens" ||
      sortKey === "outputTokens" ||
      sortKey === "toolUseCount" ||
      sortKey === "riskHigh" ||
      sortKey === "riskMedium" ||
      sortKey === "riskLow" ||
      sortKey === "networkAccessCount" ||
      sortKey === "fileOpCount" ||
      sortKey === "execCount"
    ) {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else {
      va = va == null ? "" : String(va);
      vb = vb == null ? "" : String(vb);
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return list;
}

export function sessionRowId(row) {
  return row.sessionKey || row.session_id || "";
}

/**
 * 解析 Doris `variant` / JSON 字符串为对象
 * @param {unknown} v
 * @returns {Record<string, unknown>}
 */
export function parseVariantField(v) {
  if (v == null) return {};
  if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) return /** @type {Record<string, unknown>} */ (v);
  if (typeof v === "string") {
    try {
      const o = JSON.parse(v);
      return typeof o === "object" && o !== null && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    try {
      const o = JSON.parse(v.toString("utf8"));
      return typeof o === "object" && o !== null && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** @param {Record<string, unknown>} row @param {string} key */
export function getRowValue(row, key) {
  if (!row || typeof row !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return undefined;
}

/**
 * 将 Doris `otel.agent_sessions` 一行映射为会话审计列表/详情使用的行（对齐 `sessions.json` 派生字段）。
 * @param {Record<string, unknown>} raw
 */
export function mapAgentSessionRow(raw) {
  const nested = parseVariantField(raw.log_attributes);
  const n = nested;

  /** 列表接口由服务端关联 agent_sessions_logs 聚合写入 */
  const totalTokensFromLogs = pickNum(raw, ["total_tokens_from_logs", "totalTokensFromLogs"]);
  const totalTokens =
    totalTokensFromLogs ??
    pickNum(n, ["totalTokens", "total_tokens"]) ??
    (typeof n.usage === "object" && n.usage !== null
      ? pickNum(/** @type {Record<string, unknown>} */ (n.usage), ["totalTokens", "total_tokens"])
      : null);

  const model = pickStr(n, ["model", "openaiModel"]) ?? null;
  const modelProvider = pickStr(n, ["modelProvider", "model_provider"]) ?? null;
  const originProvider =
    raw.origin_provider != null && String(raw.origin_provider) !== ""
      ? String(raw.origin_provider)
      : pickStr(n, ["originProvider", "origin_provider"]) ?? null;
  const sessionFile = pickStr(n, ["sessionFile", "session_file"]) ?? null;

  const updatedAt =
    raw.updated_at != null ? Number(raw.updated_at) : pickNum(n, ["updatedAt", "updated_at"]);
  const startedAt =
    raw.started_at != null ? Number(raw.started_at) : pickNum(n, ["startedAt", "started_at"]);
  const endedAt = raw.ended_at != null ? Number(raw.ended_at) : pickNum(n, ["endedAt", "ended_at"]);

  const label =
    (raw.display_name != null && String(raw.display_name) !== "")
      ? String(raw.display_name)
      : raw.origin_label != null && String(raw.origin_label) !== ""
        ? String(raw.origin_label)
        : pickStr(n, ["label"]) ?? null;
  const originLabel =
  raw.origin_label != null && String(raw.origin_label) !== ""
    ? String(raw.origin_label)
    : (typeof n.origin === "object" && n.origin != null
        ? pickStr(/** @type {Record<string, unknown>} */ (n.origin), ["label", "name"])
        : null);
  const abortedLastRun =
    raw.aborted_last_run != null
      ? Number(raw.aborted_last_run) !== 0
      : typeof n.abortedLastRun === "boolean"
        ? n.abortedLastRun
        : n.aborted_last_run != null
          ? Number(n.aborted_last_run) !== 0
          : false;

  const systemSent =
    raw.system_sent != null
      ? Number(raw.system_sent) !== 0
      : typeof n.systemSent === "boolean"
        ? n.systemSent
        : n.system_sent != null
          ? Number(n.system_sent) !== 0
          : false;

  /** 持续时长（毫秒）：有结束时间用 ended−started；否则用 updated−started（未结束会话按最后活动估算） */
  let durationMs = null;
  if (startedAt != null && !Number.isNaN(Number(startedAt))) {
    const s = Number(startedAt);
    const end =
      endedAt != null && !Number.isNaN(Number(endedAt))
        ? Number(endedAt)
        : updatedAt != null && !Number.isNaN(Number(updatedAt))
          ? Number(updatedAt)
          : null;
    if (end != null) {
      const d = end - s;
      if (d >= 0) durationMs = d;
    }
  }

  return {
    ...n,
    sessionKey: raw.session_key != null ? String(raw.session_key) : pickStr(n, ["sessionKey"]) ?? "",
    session_id: raw.session_id != null ? String(raw.session_id) : pickStr(n, ["session_id"]) ?? null,
    updatedAt: updatedAt ?? null,
    startedAt: startedAt ?? null,
    endedAt: endedAt ?? null,
    durationMs,
    chatType: raw.chat_type != null ? String(raw.chat_type) : pickStr(n, ["chatType"]) ?? null,
    lastChannel: raw.last_channel != null ? String(raw.last_channel) : pickStr(n, ["lastChannel"]) ?? null,
    channel: raw.channel != null ? String(raw.channel) : pickStr(n, ["channel"]) ?? null,
    label,
    model,
    originLabel,
    modelProvider,
    originProvider,
    totalTokens,
    sessionFile,
    systemSent,
    abortedLastRun,
    agentName:
      raw.agent_name != null && String(raw.agent_name) !== ""
        ? String(raw.agent_name)
        : pickStr(n, ["agentName", "agent_name"]) ?? null,
    toolUseCount: pickNum(raw, ["tool_use_count", "toolUseCount"]) ?? 0,
    riskHigh: pickNum(raw, ["risk_high", "riskHigh"]) ?? 0,
    toolErrorCount: pickNum(raw, ["tool_error_count", "toolErrorCount"]) ?? 0,
    execCommandErrorCount: pickNum(raw, ["exec_command_error_count", "execCommandErrorCount"]) ?? 0,
    riskMedium: pickNum(raw, ["risk_medium", "riskMedium"]) ?? 0,
    riskLow: pickNum(raw, ["risk_low", "riskLow"]) ?? 0,
    networkAccessCount: pickNum(raw, ["network_access_count", "networkAccessCount"]) ?? 0,
    fileOpCount: pickNum(raw, ["file_op_count", "fileOpCount"]) ?? 0,
    execCount: pickNum(raw, ["exec_count", "execCount"]) ?? 0,
    _source: "doris",
    _doris: raw,
  };
}

/**
 * @param {Record<string, unknown>} o
 * @param {string[]} keys
 */
function pickStr(o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "") return String(v);
  }
  return null;
}

/**
 * @param {Record<string, unknown>} o
 * @param {string[]} keys
 */
function pickNum(o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/**
 * @param {object[]} rawRows
 */
export function mapAgentSessionRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map((r) => mapAgentSessionRow(r));
}

/**
 * 从 `agent_sessions_logs` 扁平列拼装 OpenClaw 风格的 `message`（`log_attributes` 不完整时兜底）。
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown>} la
 */
function buildMessageShapeFromDbRow(raw, la) {
  const fromLa = la && typeof la.message === "object" && la.message !== null ? { ...la.message } : {};
  const role = getRowValue(raw, "message_role");
  if (role) fromLa.role = role;
  const model = getRowValue(raw, "message_model");
  if (model) fromLa.model = model;
  const stop = getRowValue(raw, "message_stop_reason");
  if (stop != null && String(stop) !== "") fromLa.stopReason = stop;
  const api = getRowValue(raw, "message_api");
  if (api) fromLa.modelApi = api;
  const cwd = getRowValue(raw, "message_details_cwd");
  const status = getRowValue(raw, "message_details_status");
  const exitCode = getRowValue(raw, "message_details_exit_code");
  if (cwd || status != null || exitCode != null) {
    fromLa.details = { ...(typeof fromLa.details === "object" ? fromLa.details : {}) };
    if (cwd) fromLa.details.cwd = cwd;
    if (status != null) fromLa.details.status = status;
    if (exitCode != null) fromLa.details.exitCode = exitCode;
  }
  const toolName = getRowValue(raw, "message_tool_name");
  const toolCallId = getRowValue(raw, "message_tool_call_id");
  if (toolName) fromLa.toolName = toolName;
  if (toolCallId) fromLa.toolCallId = toolCallId;
  const err = getRowValue(raw, "message_is_error");
  if (err != null) fromLa.isError = Number(err) !== 0;
  const usage = { ...(typeof fromLa.usage === "object" && fromLa.usage ? fromLa.usage : {}) };
  const u = [
    ["message_usage_input", "input"],
    ["message_usage_output", "output"],
    ["message_usage_cache_read", "cacheRead"],
    ["message_usage_cache_write", "cacheWrite"],
    ["message_usage_total_tokens", "totalTokens"],
  ];
  for (const [col, uk] of u) {
    const v = getRowValue(raw, col);
    if (v != null && !Number.isNaN(Number(v))) usage[uk] = Number(v);
  }
  if (Object.keys(usage).length) fromLa.usage = usage;
  return fromLa;
}

/**
 * 单条 `agent_sessions_logs` 行 → 与 JSONL 解析结果同形的对象（供时间线/对话等复用）。
 * @param {Record<string, unknown>} raw
 */
export function lineFromAgentSessionsLogRow(raw) {
  const la = parseVariantField(getRowValue(raw, "log_attributes"));
  if (la && typeof la === "object" && la.type != null && typeof la.type === "string") {
    return /** @type {object} */ (la);
  }
  const type = getRowValue(raw, "type") ?? "custom";
  const ts = getRowValue(raw, "timestamp");
  /** @type {Record<string, unknown>} */
  const line = {
    type,
    timestamp: ts != null ? String(ts) : "",
  };
  const id = getRowValue(raw, "id");
  const version = getRowValue(raw, "version");
  const parentId = getRowValue(raw, "parent_id");
  if (id != null) line.id = id;
  if (version != null) line.version = version;
  if (parentId != null) line.parentId = parentId;
  const provider = getRowValue(raw, "provider");
  const modelId = getRowValue(raw, "model_id");
  const thinkingLevel = getRowValue(raw, "thinking_level");
  if (provider != null) line.provider = provider;
  if (modelId != null) line.modelId = modelId;
  if (thinkingLevel != null) line.thinkingLevel = thinkingLevel;
  if (type === "message" || getRowValue(raw, "message_role")) {
    line.message = buildMessageShapeFromDbRow(raw, la);
  }
  if (la && typeof la === "object") {
    for (const k of Object.keys(la)) {
      if (line[k] === undefined && k !== "log_attributes") line[k] = la[k];
    }
  }
  return line;
}

/**
 * @param {object[]} rawRows
 */
export function agentSessionsLogsRowsToLines(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map((r) => lineFromAgentSessionsLogRow(/** @type {Record<string, unknown>} */ (r)));
}

const T_MAX = 280;

function trunc(s, n = T_MAX) {
  if (s == null) return "";
  const t = String(s);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/**
 * 从文本开头提取第一个完整 JSON 对象或数组（处理字符串内的引号与转义）。
 * @param {string} text
 * @returns {{ value: object; rest: string } | null}
 */
function extractFirstJsonValue(text) {
  const t = text.trimStart();
  if (!t.length) return null;
  const startChar = t[0];
  if (startChar !== "{" && startChar !== "[") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        const slice = t.slice(0, i + 1);
        try {
          return { value: JSON.parse(slice), rest: t.slice(i + 1) };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const MAX_JSONL_BUFFER = 5_000_000;

/**
 * 解析会话 JSONL 文本为对象数组（坏行记为 parse_error）。
 * 支持：① 每行一条紧凑 JSON（常见）；② 一条记录跨多行（pretty-print）；③ 同一物理行内连续多条 JSON。
 * @param {string} text
 * @returns {object[]}
 */
export function parseSessionJsonl(text) {
  if (text == null || text === "") return [];
  const normalized = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return [];
  const rawLines = normalized.split("\n");
  const out = [];
  let buf = "";
  let recordStartLine = 0;

  function flushBuffer(remainder, startLine) {
    let b = remainder;
    while (b.trim()) {
      const trimmed = b.trim();
      try {
        out.push(JSON.parse(trimmed));
        return;
      } catch {
        const extracted = extractFirstJsonValue(trimmed);
        if (extracted) {
          out.push(extracted.value);
          b = extracted.rest;
          continue;
        }
        if (trimmed.length > MAX_JSONL_BUFFER) {
          out.push({ type: "parse_error", lineIndex: startLine, raw: trunc(trimmed, 200) });
          return;
        }
        out.push({ type: "parse_error", lineIndex: startLine, raw: trunc(trimmed, 200) });
        return;
      }
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!buf.trim() && !line.trim()) continue;
    if (!buf.trim()) recordStartLine = i;
    buf = buf ? `${buf}\n${line}` : line;

    while (buf.trim()) {
      const trimmed = buf.trim();
      try {
        out.push(JSON.parse(trimmed));
        buf = "";
        break;
      } catch {
        const extracted = extractFirstJsonValue(trimmed);
        if (extracted) {
          out.push(extracted.value);
          buf = extracted.rest;
          continue;
        }
        if (trimmed.length > MAX_JSONL_BUFFER) {
          out.push({ type: "parse_error", lineIndex: recordStartLine, raw: trunc(trimmed, 200) });
          buf = "";
        }
        break;
      }
    }
  }

  if (buf.trim()) flushBuffer(buf, recordStartLine);
  return out;
}

/**
 * 单行摘要，用于时间线列表（不含大段正文全文）。
 * @param {object} line
 * @returns {{ kind: string; title: string; subtitle: string; timeLabel: string }}
 */
export function summarizeJsonlLine(line) {
  const timeLabel = line.timestamp
    ? String(line.timestamp)
    : line.message?.timestamp != null
      ? String(line.message.timestamp)
      : "";

  if (line.type === "parse_error") {
    return { kind: "error", title: "解析失败", subtitle: line.raw || "", timeLabel };
  }
  if (line.type === "session") {
    return {
      kind: "session",
      title: "会话头",
      subtitle: `id ${line.id ?? "—"} · 版本 ${line.version ?? "—"} · cwd`,
      timeLabel: line.timestamp || timeLabel,
    };
  }
  if (line.type === "model_change") {
    return {
      kind: "model_change",
      title: "模型切换",
      subtitle: `${line.provider ?? "—"} · ${line.modelId ?? "—"}`,
      timeLabel: line.timestamp || timeLabel,
    };
  }
  if (line.type === "thinking_level_change") {
    return {
      kind: "thinking_level_change",
      title: "思考档位",
      subtitle: line.thinkingLevel ?? "—",
      timeLabel: line.timestamp || timeLabel,
    };
  }
  if (line.type === "custom" && line.customType === "model-snapshot") {
    const d = line.data || {};
    return {
      kind: "snapshot",
      title: "模型快照",
      subtitle: `${d.provider ?? "—"} · ${d.modelId ?? "—"} · ${d.modelApi ?? "—"}`,
      timeLabel: line.timestamp || timeLabel,
    };
  }
  if (line.type === "custom") {
    return {
      kind: "custom",
      title: `自定义 · ${line.customType ?? "?"}`,
      subtitle: trunc(JSON.stringify(line.data), 120),
      timeLabel: line.timestamp || timeLabel,
    };
  }
  if (line.type === "message" && line.message) {
    const m = line.message;
    if (m.role === "user") {
      const text = Array.isArray(m.content)
        ? m.content
            .filter((c) => c && c.type === "text" && c.text)
            .map((c) => c.text)
            .join("\n")
        : "";
      return {
        kind: "user",
        title: "用户",
        subtitle: trunc(text, T_MAX),
        timeLabel: line.timestamp || timeLabel,
      };
    }
    if (m.role === "assistant") {
      const parts = [];
      const content = Array.isArray(m.content) ? m.content : [];
      for (const c of content) {
        if (!c || !c.type) continue;
        if (c.type === "thinking") parts.push("思考");
        else if (c.type === "toolCall") parts.push(`工具 ${c.name || "?"}`);
        else if (c.type === "text") parts.push("文本");
      }
      const stop = m.stopReason ? ` · ${m.stopReason}` : "";
      const usage = m.usage?.totalTokens != null ? ` · ${m.usage.totalTokens} tok` : "";
      return {
        kind: "assistant",
        title: "助手",
        subtitle: (parts.length ? parts.join(" · ") : "（无片段）") + stop + usage,
        timeLabel: line.timestamp || timeLabel,
      };
    }
    if (m.role === "toolResult") {
      const text = Array.isArray(m.content)
        ? m.content
            .filter((c) => c && c.type === "text" && c.text)
            .map((c) => c.text)
            .join("\n")
        : "";
      const err = m.isError ? " · 错误语义" : "";
      return {
        kind: "toolResult",
        title: `工具结果 · ${m.toolName ?? "—"}`,
        subtitle: trunc(text, T_MAX) + err,
        timeLabel: line.timestamp || timeLabel,
      };
    }
    return {
      kind: "message",
      title: `message · ${m.role ?? "?"}`,
      subtitle: trunc(JSON.stringify(m).slice(0, 400), 200),
      timeLabel: line.timestamp || timeLabel,
    };
  }
  return {
    kind: "unknown",
    title: line.type || "未知",
    subtitle: trunc(JSON.stringify(line).slice(0, 300), T_MAX),
    timeLabel,
  };
}

/**
 * 从 JSONL 行提取统一毫秒时间（用于排序与间隔）。无法解析时返回 null。
 * @param {object} line
 * @returns {number | null}
 */
export function getJsonlLineTimeMs(line) {
  if (!line || line.type === "parse_error") return null;
  if (line.timestamp) {
    const t = Date.parse(line.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  if (line.type === "message" && line.message?.timestamp != null) {
    const m = Number(line.message.timestamp);
    if (!Number.isNaN(m)) return m;
  }
  if (line.type === "custom" && line.customType === "model-snapshot" && line.data?.timestamp != null) {
    const m = Number(line.data.timestamp);
    if (!Number.isNaN(m)) return m;
  }
  return null;
}

/**
 * @param {number | null} ms
 */
export function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} 秒`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m < 60) return `${m} 分 ${s} 秒`;
  const h = Math.floor(ms / 3600000);
  const m2 = Math.floor((ms % 3600000) / 60000);
  return `${h} 小时 ${m2} 分`;
}

/**
 * 构建时间溯源：按时间或文件顺序，附间隔与统计。
 * @param {object[]} lines
 * @param {"time"|"file"} order
 */
export function buildSessionTrace(lines, order = "time") {
  const withIdx = lines.map((line, originalIndex) => ({
    line,
    originalIndex,
    tMs: getJsonlLineTimeMs(line),
  }));

  let ordered;
  if (order === "file") {
    ordered = [...withIdx];
  } else {
    ordered = [...withIdx].sort((a, b) => {
      if (a.tMs == null && b.tMs == null) return a.originalIndex - b.originalIndex;
      if (a.tMs == null) return 1;
      if (b.tMs == null) return -1;
      return a.tMs - b.tMs || a.originalIndex - b.originalIndex;
    });
  }

  const { worstByLine, reasonByLine } = computeSessionRiskMaps(lines);

  const enriched = ordered.map((item, i) => {
    const deltaMs =
      i > 0 && item.tMs != null && ordered[i - 1].tMs != null ? item.tMs - ordered[i - 1].tMs : null;
    /** @type {"high"|"medium"|"low"|"healthy"} */
    const riskLevel = worstByLine.get(item.originalIndex) ?? "healthy";
    const riskReasonText = reasonByLine.get(item.originalIndex) ?? "";
    return { ...item, deltaMs, riskLevel, riskReasonText };
  });

  const times = withIdx.map((x) => x.tMs).filter((t) => t != null);
  const tMin = times.length ? Math.min(...times) : null;
  const tMax = times.length ? Math.max(...times) : null;
  const durationMs = tMin != null && tMax != null ? tMax - tMin : null;

  const byKind = {};
  for (const { line } of withIdx) {
    const { kind } = summarizeJsonlLine(line);
    byKind[kind] = (byKind[kind] || 0) + 1;
  }

  let maxGapMs = 0;
  let maxGapAfterOriginalIndex = -1;
  for (let i = 1; i < enriched.length; i++) {
    const d = enriched[i].deltaMs;
    if (d != null && d > maxGapMs) {
      maxGapMs = d;
      maxGapAfterOriginalIndex = enriched[i].originalIndex;
    }
  }

  const unparseableTime = withIdx.filter((x) => x.tMs == null).length;

  return {
    enriched,
    stats: {
      tMin,
      tMax,
      durationMs,
      byKind,
      maxGapMs,
      maxGapAfterOriginalIndex,
      unparseableTime,
      totalLines: lines.length,
      parseableTime: times.length,
    },
  };
}

/** 从 message 信封中提取纯文本块（工具结果、用户消息等）。 */
export function messageTextContent(msg) {
  if (!msg || !Array.isArray(msg.content)) return "";
  return msg.content
    .filter((c) => c && c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

/**
 * 提取 `type===message` 的对话行（按 JSONL 文件顺序）。
 * @param {object[]} lines
 * @returns {{ lineIndex: number; line: object; role: string; tMs: number | null }[]}
 */
export function extractMessageLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type !== "message" || !line.message) continue;
    const role = line.message.role;
    if (!role) continue;
    out.push({ lineIndex: i, line, role, tMs: getJsonlLineTimeMs(line) });
  }
  return out;
}

/**
 * 从文本中提取 http(s) URL（去重前原始列表）
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrlsFromString(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s"'<>)\]]+/gi;
  const out = [];
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    const u = m[0].replace(/[.,;:!?)]+$/g, "");
    out.push(u);
  }
  return [...new Set(out)];
}

/**
 * 提取助手发起的工具调用（按时间先后排序）。
 * @param {object[]} lines
 * @returns {{ calls: object[]; byName: Record<string, number> }}
 */
export function extractToolInvocations(lines) {
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type !== "message" || !line.message) continue;
    const msg = line.message;
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const tMs = getJsonlLineTimeMs(line);
    for (const c of msg.content) {
      if (c && c.type === "toolCall" && c.name) {
        calls.push({
          lineIndex: i,
          tMs,
          toolCallId: c.id != null ? String(c.id) : null,
          name: c.name,
          arguments: c.arguments && typeof c.arguments === "object" ? c.arguments : {},
        });
      }
    }
  }
  calls.sort((a, b) => {
    if (a.tMs == null && b.tMs == null) return a.lineIndex - b.lineIndex;
    if (a.tMs == null) return 1;
    if (b.tMs == null) return -1;
    return a.tMs - b.tMs || a.lineIndex - b.lineIndex;
  });
  const byName = {};
  for (const c of calls) {
    byName[c.name] = (byName[c.name] || 0) + 1;
  }
  return { calls, byName };
}

/**
 * 网络 URL、读/写文件路径、exec 命令、process 子操作。
 * @param {object[]} lines
 */
export function extractNetworkAndFileOps(lines) {
  const fileReads = [];
  const fileWrites = [];
  const execs = [];
  const processOps = [];
  const urlRows = [];

  function pushUrls(text, tMs, lineIndex, source) {
    for (const url of extractUrlsFromString(text)) {
      urlRows.push({ url, tMs, lineIndex, source });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type !== "message" || !line.message) continue;
    const msg = line.message;
    const tMs = getJsonlLineTimeMs(line);

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (!c || c.type !== "toolCall" || !c.name) continue;
        const args = c.arguments && typeof c.arguments === "object" ? c.arguments : {};
        const name = c.name;
        if (name === "read" && args.path != null) {
          fileReads.push({ path: String(args.path), tMs, lineIndex: i });
        }
        if (name === "write" && args.path != null) {
          fileWrites.push({ path: String(args.path), tMs, lineIndex: i, op: "write" });
        }
        if (name === "edit" && args.path != null) {
          fileWrites.push({ path: String(args.path), tMs, lineIndex: i, op: "edit" });
        }
        if (name === "exec" && args.command != null) {
          const cmd = String(args.command);
          execs.push({ command: cmd, tMs, lineIndex: i });
          pushUrls(cmd, tMs, i, "exec 命令");
        }
        if (name === "process") {
          processOps.push({
            action: args.action != null ? String(args.action) : "—",
            session_id: args.session_id != null ? String(args.session_id) : null,
            tMs,
            lineIndex: i,
          });
        }
      }
    }
    if (msg.role === "toolResult") {
      pushUrls(messageTextContent(msg), tMs, i, `工具结果 · ${msg.toolName || "?"}`);
    }
    if (msg.role === "user") {
      pushUrls(messageTextContent(msg), tMs, i, "用户消息");
    }
  }

  const seen = new Set();
  const urls = urlRows.filter((r) => {
    const k = `${r.lineIndex}:${r.url}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  urls.sort((a, b) => {
    if (a.tMs == null && b.tMs == null) return a.lineIndex - b.lineIndex;
    if (a.tMs == null) return 1;
    if (b.tMs == null) return -1;
    return a.tMs - b.tMs || a.lineIndex - b.lineIndex;
  });

  return { fileReads, fileWrites, execs, processOps, urls };
}

/** 相邻可解析时间戳间隔超过此值则记为「时间线异常间隔」（毫秒） */
const RISK_TIMELINE_GAP_MS = 5 * 60 * 1000;

const RISKY_ASSISTANT_STOP = new Set(["error", "max_tokens", "content_filter", "refusal", "model_error"]);

/**
 * 会话风险感知项（启发式，供审计参考）。
 * @param {object[]} lines
 * @returns {{ severity: "high"|"medium"|"low"; category: string; title: string; detail: string; lineIndex: number; tMs: number | null }[]}
 */
export function extractSessionRisks(lines) {
  const risks = [];

  function push(r) {
    risks.push(r);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tMs = getJsonlLineTimeMs(line);

    if (line.type === "parse_error") {
      push({
        severity: "high",
        category: "parse_error",
        title: "JSONL 行解析失败",
        detail: line.raw ? String(line.raw) : "无法解析为 JSON",
        lineIndex: i,
        tMs,
      });
      continue;
    }

    if (line.type === "custom" && line.customType != null && String(line.customType).toLowerCase().includes("error")) {
      const d = line.data && typeof line.data === "object" ? line.data : {};
      let errDetail = "";
      if (d.error != null) {
        errDetail = typeof d.error === "string" ? d.error : JSON.stringify(d.error);
      } else {
        errDetail = summarizeJsonlLine(line).subtitle || "";
      }
      push({
        severity: "high",
        category: "custom_error",
        title: `扩展事件 · ${line.customType}`,
        detail: trunc(errDetail, 500),
        lineIndex: i,
        tMs,
      });
    }

    if (line.type !== "message" || !line.message) continue;
    const msg = line.message;

    if (msg.role === "toolResult" && msg.isError === true) {
      const preview = trunc(messageTextContent(msg), 400);
      push({
        severity: "high",
        category: "tool_error",
        title: `工具结果标记为错误 · ${msg.toolName ?? "?"}`,
        detail: preview || "（无文本内容）",
        lineIndex: i,
        tMs,
      });
    }

    if (msg.role === "toolResult" && msg.details && typeof msg.details === "object") {
      const det = msg.details;
      if (det.exitCode != null && Number(det.exitCode) !== 0) {
        push({
          severity: "medium",
          category: "exit_code",
          title: `非零退出码 · ${msg.toolName ?? "?"}`,
          detail: `exitCode = ${det.exitCode}`,
          lineIndex: i,
          tMs,
        });
      }
      const st = det.status != null ? String(det.status).toLowerCase() : "";
      if (st === "killed" || st === "failed") {
        push({
          severity: "medium",
          category: "process_status",
          title: `进程状态异常 · ${msg.toolName ?? "?"}`,
          detail: `status = ${det.status}`,
          lineIndex: i,
          tMs,
        });
      }
    }

    if (msg.role === "assistant") {
      if (msg.stopReason != null && RISKY_ASSISTANT_STOP.has(String(msg.stopReason).toLowerCase())) {
        push({
          severity: "medium",
          category: "stop_reason",
          title: `助手停止原因 · ${msg.stopReason}`,
          detail: "模型未按常规完成本轮输出",
          lineIndex: i,
          tMs,
        });
      }
      if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c && c.type === "toolCall" && c.name === "exec" && c.arguments && typeof c.arguments.command === "string") {
            const cmd = c.arguments.command;
            if (/-Password\s+\S|password\s*[=:]\s*['"]\S|api[_-]?key\s*[=:]\s*['"]\S/i.test(cmd)) {
              push({
                severity: "low",
                category: "sensitive_command",
                title: "命令行疑似含明文凭证",
                detail: "建议在审计与导出中对敏感参数脱敏",
                lineIndex: i,
                tMs,
              });
              break;
            }
          }
        }
      }
    }
  }

  let prevT = null;
  let prevIdx = -1;
  let maxGap = 0;
  let maxGapAfter = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = getJsonlLineTimeMs(lines[i]);
    if (t == null) continue;
    if (prevT != null) {
      const gap = t - prevT;
      if (gap > maxGap) {
        maxGap = gap;
        maxGapAfter = prevIdx;
      }
    }
    prevT = t;
    prevIdx = i;
  }
  if (maxGap > RISK_TIMELINE_GAP_MS && maxGapAfter >= 0) {
    push({
      severity: "low",
      category: "timeline_gap",
      title: "会话时间线异常间隔",
      detail: `相邻可解析时间戳最大间隔 ${formatDurationMs(maxGap)}（约第 ${maxGapAfter + 1} 行之后）`,
      lineIndex: maxGapAfter,
      tMs: getJsonlLineTimeMs(lines[maxGapAfter]),
    });
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => {
    const so = severityOrder[a.severity] - severityOrder[b.severity];
    if (so !== 0) return so;
    return a.lineIndex - b.lineIndex;
  });

  return risks;
}

/**
 * @param {{ title?: string; detail?: string }} r
 */
function formatRiskDetailLine(r) {
  const title = r.title != null ? String(r.title) : "";
  const detail = r.detail != null ? String(r.detail).trim() : "";
  const d = detail.length > 320 ? `${detail.slice(0, 320)}…` : detail;
  return d ? `${title}：${d}` : title;
}

/**
 * 单次扫描 `extractSessionRisks`，得到每行最严重等级 + 该行全部风险的原因文案（供溯源卡片悬停）。
 * @param {object[]} lines
 * @returns {{
 *   worstByLine: Map<number, "high"|"medium"|"low">;
 *   reasonByLine: Map<number, string>;
 * }}
 */
export function computeSessionRiskMaps(lines) {
  const risks = extractSessionRisks(lines);
  const order = { high: 0, medium: 1, low: 2 };
  /** @type {Map<number, "high"|"medium"|"low">} */
  const worstByLine = new Map();
  /** @type {Map<number, string[]>} */
  const partsByLine = new Map();
  for (const r of risks) {
    const prev = worstByLine.get(r.lineIndex);
    if (!prev || order[r.severity] < order[prev]) {
      worstByLine.set(r.lineIndex, r.severity);
    }
    if (!partsByLine.has(r.lineIndex)) partsByLine.set(r.lineIndex, []);
    partsByLine.get(r.lineIndex).push(formatRiskDetailLine(r));
  }
  /** @type {Map<number, string>} */
  const reasonByLine = new Map();
  for (const [idx, arr] of partsByLine) {
    reasonByLine.set(idx, arr.join("\n"));
  }
  return { worstByLine, reasonByLine };
}

/**
 * 按文件行号汇总每条 JSONL 的最严重风险等级（与「风险感知」同源，一行多条风险取最高）。
 * @param {object[]} lines
 * @returns {Map<number, "high"|"medium"|"low">}
 */
export function worstRiskSeverityByLineIndex(lines) {
  return computeSessionRiskMaps(lines).worstByLine;
}

/**
 * @param {"high"|"medium"|"low"|"healthy"} level
 */
export function traceRiskLevelLabel(level) {
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    case "healthy":
    default:
      return "健康";
  }
}

/**
 * 由 `agent_sessions_logs` 原始行（单会话，内部按 timestamp 排序）计算与详情页一致的用量与风险汇总。
 * @param {Record<string, unknown>[]} rawRows
 * @returns {{
 *   total_tokens_from_logs: number | null;
 *   tool_use_count: number;
 *   risk_high: number;
 *   tool_error_count: number;
 *   exec_command_error_count: number;
 *   risk_medium: number;
 *   risk_low: number;
 *   network_access_count: number;
 *   file_op_count: number;
 *   exec_count: number;
 * }}
 */
export function computeSessionAggregatesFromLogRows(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return {
      total_tokens_from_logs: null,
      tool_use_count: 0,
      risk_high: 0,
      risk_medium: 0,
      tool_error_count: 0,
      exec_command_error_count: 0,
      risk_low: 0,
      network_access_count: 0,
      file_op_count: 0,
      exec_count: 0,
    };
  }
  const sorted = [...rawRows].sort((a, b) => {
    const ta = getRowValue(a, "timestamp") ?? "";
    const tb = getRowValue(b, "timestamp") ?? "";
    return String(ta).localeCompare(String(tb), undefined, { numeric: true });
  });
  let tokenSum = 0;
  let hasToken = false;
  for (const r of sorted) {
    const v = getRowValue(r, "message_usage_total_tokens");
    if (v != null && v !== "" && !Number.isNaN(Number(v))) {
      tokenSum += Number(v);
      hasToken = true;
    }
  }
  const lines = agentSessionsLogsRowsToLines(sorted);
  const tools = extractToolInvocations(lines);
  const net = extractNetworkAndFileOps(lines);
  const risks = extractSessionRisks(lines);
  let tool_error_count = 0;
  let exec_command_error_count = 0;
  for (const line of lines) {
    if (line?.type !== "message" || !line.message || line.message.role !== "toolResult") continue;
    const msg = line.message;
    const details = msg.details && typeof msg.details === "object" ? msg.details : {};
    const isError = msg.isError === true;
    const exitNonZero = details.exitCode != null && Number(details.exitCode) !== 0;
    const status = details.status != null ? String(details.status).toLowerCase() : "";
    const badStatus = status === "failed" || status === "killed";
    const hasError = isError || exitNonZero || badStatus;
    if (!hasError) continue;
    tool_error_count += 1;
    if (String(msg.toolName ?? "").toLowerCase() === "exec") {
      exec_command_error_count += 1;
    }
  }
  let risk_high = 0;
  let risk_medium = 0;
  let risk_low = 0;
  for (const r of risks) {
    if (r.severity === "high") risk_high++;
    else if (r.severity === "medium") risk_medium++;
    else risk_low++;
  }
  return {
    total_tokens_from_logs: hasToken ? tokenSum : null,
    tool_use_count: tools.calls.length,
    tool_error_count,
    exec_command_error_count,
    risk_high,
    risk_medium,
    risk_low,
    network_access_count: net.urls.length,
    file_op_count: net.fileReads.length + net.fileWrites.length,
    exec_count: net.execs.length,
  };
}

/**
 * 意图识别：首条用户消息摘要 + 助手 `thinking` 推理块（按文件顺序）。
 * @param {object[]} lines
 * @returns {{ userSummary: { lineIndex: number; text: string; tMs: number | null } | null; thinkingBlocks: { lineIndex: number; tMs: number | null; thinking: string; signature: string | null }[] }}
 */
export function extractIntentRecognitionDetails(lines) {
  let userSummary = null;
  const thinkingBlocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type !== "message" || !line.message) continue;
    const msg = line.message;
    if (msg.role === "user" && userSummary == null) {
      const text = messageTextContent(msg);
      if (text && String(text).trim()) {
        userSummary = {
          lineIndex: i,
          text: trunc(String(text).trim(), 800),
          tMs: getJsonlLineTimeMs(line),
        };
      }
    }
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const tMs = getJsonlLineTimeMs(line);
      for (const c of msg.content) {
        if (c && c.type === "thinking" && c.thinking) {
          thinkingBlocks.push({
            lineIndex: i,
            tMs,
            thinking: String(c.thinking),
            signature: c.thinkingSignature != null ? String(c.thinkingSignature) : null,
          });
        }
      }
    }
  }

  return { userSummary, thinkingBlocks };
}

/**
 * 模型调用：model_change、thinking_level、model-snapshot，以及 assistant 各轮的 model/provider/api/usage/cost。
 * @param {object[]} lines
 * @returns {{ snapshots: object[]; assistantCalls: object[]; totals: { totalTokens: number; totalInput: number; totalOutput: number; totalCost: number } }}
 */
export function extractModelInvocationRecords(lines) {
  const snapshots = [];
  const assistantCalls = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tMs = getJsonlLineTimeMs(line);

    if (line.type === "model_change") {
      snapshots.push({
        kind: "model_change",
        lineIndex: i,
        tMs,
        provider: line.provider != null ? String(line.provider) : null,
        modelId: line.modelId != null ? String(line.modelId) : null,
      });
    }

    if (line.type === "thinking_level_change") {
      snapshots.push({
        kind: "thinking_level",
        lineIndex: i,
        tMs,
        thinkingLevel: line.thinkingLevel != null ? String(line.thinkingLevel) : null,
      });
    }

    if (line.type === "custom" && line.customType === "model-snapshot" && line.data && typeof line.data === "object") {
      const d = line.data;
      snapshots.push({
        kind: "model_snapshot",
        lineIndex: i,
        tMs,
        provider: d.provider != null ? String(d.provider) : null,
        modelApi: d.modelApi != null ? String(d.modelApi) : null,
        modelId: d.modelId != null ? String(d.modelId) : null,
        dataTimestamp: d.timestamp != null ? Number(d.timestamp) : null,
      });
    }

    if (line.type === "message" && line.message?.role === "assistant") {
      const msg = line.message;
      if (msg.model || msg.provider || msg.api || msg.usage) {
        assistantCalls.push({
          lineIndex: i,
          tMs,
          api: msg.api != null ? String(msg.api) : null,
          provider: msg.provider != null ? String(msg.provider) : null,
          model: msg.model != null ? String(msg.model) : null,
          usage: msg.usage,
          stopReason: msg.stopReason != null ? String(msg.stopReason) : null,
        });
      }
    }
  }

  let totalTokens = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  for (const c of assistantCalls) {
    const u = c.usage;
    if (!u || typeof u !== "object") continue;
    if (u.totalTokens != null) totalTokens += Number(u.totalTokens) || 0;
    if (u.input != null) totalInput += Number(u.input) || 0;
    if (u.output != null) totalOutput += Number(u.output) || 0;
    if (u.cost && typeof u.cost === "object" && u.cost.total != null) {
      totalCost += Number(u.cost.total) || 0;
    }
  }

  return {
    snapshots,
    assistantCalls,
    totals: { totalTokens, totalInput, totalOutput, totalCost },
  };
}
