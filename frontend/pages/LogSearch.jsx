import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import intl from "react-intl-universal";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadCsv, downloadUtf8Text, filenameWithTime } from "../utils/exportCsv.js";
import { downloadExcel } from "../utils/exportExcel.js";
import Icon from "../components/Icon.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import CodeBlock from "../components/CodeBlock.jsx";

const INPUT =
  "w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500";
/** 日志顶部搜索条内控件高度 36px（h-9） */
const FILTER_BAR_H = "h-9 min-h-9 max-h-9";
const FILTER_BAR_OUTER_PY = "py-2";
const FILTER_BAR_GAP = "gap-2";
/** 顶栏数据源：与一体搜索条同高；宽度与侧栏「字段列表」卡片 lg:w-[15rem] 一致以便右缘对齐 */
const INPUT_DATA_SOURCE = `box-border ${FILTER_BAR_H} w-full min-w-0 rounded-lg border border-slate-200/90 bg-white px-3 py-0 text-left text-sm leading-normal text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500 sm:min-w-[10rem]`;
const BTN_ICON =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800";

/** 与表头 th py-3、行高约一致，用于按「每页条数」限制列表可视区最大高度 */
const LOG_TABLE_HEAD_SLOT_PX = 48;
const LOG_TABLE_ROW_SLOT_PX = 44;
function levelBadgeClass(levelGuess) {
  const x = String(levelGuess || "").toLowerCase();
  if (x === "error" || x === "fatal") return "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-500/15 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-500/20";
  if (x === "warn") return "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-500/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/20";
  if (x === "info") return "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-500/15 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-500/20";
  if (x === "debug") return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-400/20 dark:bg-slate-800 dark:text-slate-300";
  if (x === "trace") return "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-500/15 dark:bg-violet-950/40 dark:text-violet-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-400/15 dark:bg-slate-800 dark:text-slate-300";
}

/**
 * 日志详情区：关键字段值的语义色（文本或弱徽章），与表格级别风格一致。
 * @param {typeof ALL_COLUMN_DEF[number]} col
 * @param {Record<string, unknown>} row
 * @param {string} display
 * @param {{ errRaw: unknown, isErr: boolean, isExplicitNo: boolean }} errCtx
 * @returns {string}
 */
function logDetailValueToneClass(col, row, display, errCtx) {
  const raw = rawRow(row);
  const { errRaw, isErr, isExplicitNo } = errCtx;
  const hasVal = display !== "—" && display !== "";

  switch (col.key) {
    case "level": {
      if (!hasVal) return "";
      return `inline-flex max-w-full rounded-md px-1.5 py-0.5 font-semibold capitalize ${levelBadgeClass(row.level)}`;
    }
    case "messageIsError": {
      if (errRaw == null || errRaw === "") return "text-slate-500 dark:text-slate-400";
      if (isErr) return "font-medium text-rose-600 dark:text-rose-400";
      if (isExplicitNo) return "font-medium text-emerald-600 dark:text-emerald-400";
      return "font-medium text-amber-700 dark:text-amber-300";
    }
    case "messageRole": {
      if (!hasVal) return "";
      const r = String(raw.message_role || "").toLowerCase();
      if (r === "assistant") return "font-medium text-violet-700 dark:text-violet-300";
      if (r === "user") return "font-medium text-sky-700 dark:text-sky-300";
      if (r === "system") return "font-medium text-slate-600 dark:text-slate-300";
      if (r.includes("tool")) return "font-medium text-amber-700 dark:text-amber-300";
      return "font-medium text-indigo-700 dark:text-indigo-300";
    }
    case "source": {
      if (!hasVal) return "";
      const s = String(row._source || "").toLowerCase();
      if (s.includes("agent")) return "font-medium text-primary";
      if (s.includes("audit")) return "font-medium text-amber-800 dark:text-amber-300";
      if (s.includes("gateway")) return "font-medium text-cyan-800 dark:text-cyan-300";
      return "font-medium text-slate-700 dark:text-slate-200";
    }
    case "type": {
      if (!hasVal) return "";
      const t = String(raw.type || "").toLowerCase();
      if (t.includes("error")) return "font-medium text-rose-600 dark:text-rose-400";
      if (t.includes("message")) return "font-medium text-violet-700 dark:text-violet-300";
      return "font-medium text-slate-700 dark:text-slate-200";
    }
    case "messageDetailsExitCode": {
      if (!hasVal) return "";
      const v = raw.message_details_exit_code;
      const n = Number(v);
      if (Number.isFinite(n) && n === 0) return "font-medium text-emerald-600 dark:text-emerald-400";
      if (Number.isFinite(n) && n !== 0) return "font-medium text-rose-600 dark:text-rose-400";
      return "font-medium text-amber-700 dark:text-amber-300";
    }
    case "messageDetailsStatus": {
      if (!hasVal) return "";
      const st = String(raw.message_details_status || "").toLowerCase();
      if (st.includes("success") || st === "ok") return "font-medium text-emerald-600 dark:text-emerald-400";
      if (st.includes("fail") || st.includes("error")) return "font-medium text-rose-600 dark:text-rose-400";
      return "font-medium text-sky-700 dark:text-sky-300";
    }
    case "messageStopReason": {
      if (!hasVal) return "";
      const sr = String(raw.message_stop_reason || "").toLowerCase();
      if (sr.includes("error") || sr.includes("length")) return "font-medium text-amber-700 dark:text-amber-300";
      if (sr === "stop" || sr.includes("end")) return "font-medium text-slate-700 dark:text-slate-200";
      return "font-medium text-indigo-700 dark:text-indigo-300";
    }
    case "provider":
      return hasVal ? "font-medium text-teal-800 dark:text-teal-300" : "";
    case "model":
      return hasVal ? "font-medium text-fuchsia-900 dark:text-fuchsia-300" : "";
    case "channel":
      return hasVal ? "font-medium text-cyan-900 dark:text-cyan-300" : "";
    case "subsystem":
    case "module":
      return hasVal ? "font-medium text-slate-800 dark:text-slate-100" : "";
    case "agent":
      return hasVal ? "font-medium text-blue-800 dark:text-blue-300" : "";
    case "session":
    case "trace":
    case "requestId":
      return hasVal ? "font-medium text-indigo-800 dark:text-indigo-200" : "";
    case "toolName":
      return hasVal ? "font-medium text-orange-800 dark:text-orange-300" : "";
    case "thinkingLevel":
      return hasVal ? "font-medium text-purple-800 dark:text-purple-300" : "";
    default:
      return "";
  }
}

/** 相对当前时间的滚动窗口（分钟；秒级用小数） */
const RELATIVE_TIME_PRESETS = [
  { key: "30s", minutes: 0.5 },
  { key: "1m", minutes: 1 },
  { key: "5m", minutes: 5 },
  { key: "15m", minutes: 15 },
  { key: "30m", minutes: 30 },
  { key: "1h", minutes: 60 },
  { key: "4h", minutes: 240 },
  { key: "6h", minutes: 360 },
  { key: "12h", minutes: 720 },
  { key: "24h", minutes: 1440 },
  { key: "3d", minutes: 4320 },
  { key: "7d", minutes: 10080 },
  { key: "30d", minutes: 43200 },
];

const CALENDAR_TIME_KEYS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
];

/** 本地日历：本周一 00:00（周一为一周起始） */
function startOfWeekMonday(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

const DATA_SOURCES = [
  { value: "agent_sessions", labelKey: "logSearch.ds.agentSessions", shortKey: "logSearch.dsShort.agentSessions" },
  { value: "audit_logs", labelKey: "logSearch.ds.auditLogs", shortKey: "logSearch.dsShort.auditLogs" },
  { value: "gateway_logs", labelKey: "logSearch.ds.gatewayLogs", shortKey: "logSearch.dsShort.gatewayLogs" },
  { value: "all", labelKey: "logSearch.ds.all", shortKey: "logSearch.dsShort.all" },
];

/** @param {unknown} v */
function cellStr(v) {
  if (v == null || v === undefined) return "";
  const s = String(v).trim();
  return s;
}

/** @param {Record<string, unknown>} row */
function rawRow(row) {
  const r = row?._raw;
  return r && typeof r === "object" ? /** @type {Record<string, unknown>} */ (r) : {};
}

/** @param {unknown} v */
function previewLogAttributes(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(v).slice(0, 200);
  }
}

/**
 * 列定义：sources 标明该列在哪些日志数据源下展示（与 Doris 表字段 / 归一化行对应）
 * kind: level = 级别徽章；其余为文本
 */
const ALL_COLUMN_DEF = [
  { key: "time", labelKey: "logSearch.col.time", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  { key: "level", labelKey: "logSearch.col.level", kind: "level", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  { key: "source", labelKey: "logSearch.col.source", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  {
    key: "sqlId",
    labelKey: "logSearch.col.sqlId",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).id),
  },
  {
    key: "type",
    labelKey: "logSearch.col.type",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).type),
  },
  {
    key: "messageRole",
    labelKey: "logSearch.col.messageRole",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_role),
  },
  {
    key: "toolName",
    labelKey: "logSearch.col.toolName",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_tool_name),
  },
  {
    key: "provider",
    labelKey: "logSearch.col.provider",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).provider),
  },
  {
    key: "model",
    labelKey: "logSearch.col.model",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).model_id || rawRow(row).message_model),
  },
  {
    key: "channel",
    labelKey: "logSearch.col.channelCol",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).channel),
  },
  {
    key: "version",
    labelKey: "logSearch.col.version",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).version),
  },
  {
    key: "messageParentId",
    labelKey: "logSearch.col.messageParentId",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_parent_id),
  },
  {
    key: "messageId",
    labelKey: "logSearch.col.messageId",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_id),
  },
  {
    key: "messageToolCallId",
    labelKey: "logSearch.col.messageToolCallId",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_tool_call_id),
  },
  {
    key: "thinkingLevel",
    labelKey: "logSearch.col.thinkingLevel",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).thinking_level),
  },
  {
    key: "messageDetailsCwd",
    labelKey: "logSearch.col.messageDetailsCwd",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_details_cwd),
  },
  {
    key: "messageIsError",
    labelKey: "logSearch.col.messageIsError",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_is_error),
  },
  {
    key: "messageDetailsStatus",
    labelKey: "logSearch.col.messageDetailsStatus",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_details_status),
  },
  {
    key: "messageDetailsExitCode",
    labelKey: "logSearch.col.messageDetailsExitCode",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_details_exit_code),
  },
  {
    key: "messageApi",
    labelKey: "logSearch.col.messageApi",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_api),
  },
  {
    key: "messageStopReason",
    labelKey: "logSearch.col.messageStopReason",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_stop_reason),
  },
  {
    key: "usageInput",
    labelKey: "logSearch.col.usageInput",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_usage_input),
  },
  {
    key: "usageOutput",
    labelKey: "logSearch.col.usageOutput",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_usage_output),
  },
  {
    key: "usageCacheRead",
    labelKey: "logSearch.col.usageCacheRead",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_usage_cache_read),
  },
  {
    key: "usageCacheWrite",
    labelKey: "logSearch.col.usageCacheWrite",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_usage_cache_write),
  },
  {
    key: "usageTotalTokens",
    labelKey: "logSearch.col.usageTotalTokens",
    sources: ["agent_sessions", "all"],
    get: (row) => cellStr(rawRow(row).message_usage_total_tokens),
  },
  { key: "subsystem", labelKey: "logSearch.col.subsystem", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  {
    key: "module",
    labelKey: "logSearch.col.moduleCol",
    sources: ["gateway_logs", "all"],
    get: (row) => cellStr(rawRow(row).module || row.subsystem),
  },
  { key: "agent", labelKey: "logSearch.col.agent", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  { key: "session", labelKey: "logSearch.col.session", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  { key: "trace", labelKey: "logSearch.col.trace", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  { key: "requestId", labelKey: "logSearch.col.requestId", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  {
    key: "rowId",
    labelKey: "logSearch.col.rowId",
    sources: ["audit_logs", "gateway_logs", "all"],
    get: (row) => cellStr(rawRow(row).id ?? row._id),
  },
  { key: "summary", labelKey: "logSearch.col.summary", sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"] },
  {
    key: "logAttributes",
    labelKey: "logSearch.col.logAttributes",
    sources: ["agent_sessions", "audit_logs", "gateway_logs", "all"],
    get: (row) => previewLogAttributes(rawRow(row).log_attributes),
  },
];

/** 等宽数字段列（表字段 / ID 类） */
const MONO_COLUMN_KEYS = new Set([
  "sqlId",
  "type",
  "messageRole",
  "toolName",
  "provider",
  "model",
  "channel",
  "version",
  "messageParentId",
  "messageId",
  "messageToolCallId",
  "thinkingLevel",
  "messageDetailsCwd",
  "messageIsError",
  "messageDetailsStatus",
  "messageDetailsExitCode",
  "messageApi",
  "messageStopReason",
  "usageInput",
  "usageOutput",
  "usageCacheRead",
  "usageCacheWrite",
  "usageTotalTokens",
  "session",
  "trace",
  "requestId",
  "rowId",
  "module",
  "logAttributes",
]);

const ALL_COLUMN_ORDER_FOR_MERGED = [
  "time",
  "level",
  "source",
  "sqlId",
  "type",
  "messageRole",
  "toolName",
  "provider",
  "model",
  "channel",
  "version",
  "messageParentId",
  "messageId",
  "messageToolCallId",
  "thinkingLevel",
  "messageDetailsCwd",
  "messageIsError",
  "messageDetailsStatus",
  "messageDetailsExitCode",
  "messageApi",
  "messageStopReason",
  "usageInput",
  "usageOutput",
  "usageCacheRead",
  "usageCacheWrite",
  "usageTotalTokens",
  "subsystem",
  "module",
  "agent",
  "session",
  "trace",
  "requestId",
  "rowId",
  "summary",
  "logAttributes",
];

/** @param {string} ds */
function columnsForDataSource(ds) {
  if (ds === "all") {
    const map = new Map(ALL_COLUMN_DEF.map((c) => [c.key, c]));
    return ALL_COLUMN_ORDER_FOR_MERGED.map((k) => map.get(k)).filter(Boolean);
  }
  return ALL_COLUMN_DEF.filter((c) => c.sources.includes(ds));
}

/**
 * 显示字段列表：六种类型（与 Doris 常见类型对应：字符串/数值/时间/JSON/数组/布尔）
 * @type {Record<string, 'string' | 'number' | 'time' | 'json' | 'array' | 'boolean'>}
 */
const FIELD_KIND_BY_KEY = {
  time: "time",
  level: "string",
  source: "string",
  sqlId: "number",
  type: "string",
  messageRole: "string",
  toolName: "string",
  provider: "string",
  model: "string",
  channel: "string",
  version: "string",
  messageParentId: "string",
  messageId: "string",
  messageToolCallId: "string",
  thinkingLevel: "number",
  messageDetailsCwd: "string",
  messageIsError: "boolean",
  messageDetailsStatus: "string",
  messageDetailsExitCode: "number",
  messageApi: "string",
  messageStopReason: "string",
  usageInput: "number",
  usageOutput: "number",
  usageCacheRead: "number",
  usageCacheWrite: "number",
  usageTotalTokens: "number",
  subsystem: "string",
  module: "string",
  agent: "string",
  session: "string",
  trace: "array",
  requestId: "string",
  rowId: "number",
  summary: "string",
  logAttributes: "json",
};

const FIELD_KIND_ICON = {
  string: "fieldTypeString",
  number: "fieldTypeNumber",
  time: "fieldTypeDatetime",
  json: "fieldTypeJson",
  array: "fieldTypeArray",
  boolean: "fieldTypeBoolean",
};

/**
 * @param {typeof ALL_COLUMN_DEF[number]} col
 * @returns {{ icon: string, title: string }}
 */
function getFieldTypeMeta(col) {
  const kind = FIELD_KIND_BY_KEY[col.key] ?? "string";
  return {
    icon: FIELD_KIND_ICON[kind] ?? "fieldTypeString",
    title: intl.get(`logSearch.fieldKind.${kind}`),
  };
}

/** @param {Record<string, unknown>} row @param {typeof ALL_COLUMN_DEF[number]} col */
function getUnifiedCellText(row, col) {
  if (col.get) return col.get(row);
  switch (col.key) {
    case "time":
      return row.time ? String(row.time).replace("T", " ").slice(0, 23) : "";
    case "level":
      return cellStr(row.level);
    case "source":
      return cellStr(row._source);
    case "subsystem":
      return cellStr(row.subsystem);
    case "agent":
      return cellStr(row.agentId);
    case "session":
      return cellStr(row.sessionId);
    case "trace":
      return cellStr(row.traceId);
    case "requestId":
      return cellStr(row.requestId);
    case "summary":
      return cellStr(row.summary);
    default:
      return "";
  }
}

const FIELD_VALUE_PREVIEW_MAX = 160;

/** @param {string} s */
function truncateFieldValuePreview(s) {
  if (s.length <= FIELD_VALUE_PREVIEW_MAX) return s;
  return `${s.slice(0, FIELD_VALUE_PREVIEW_MAX)}…`;
}

/** @param {string} s */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 顶栏关键字拆分为 OR 匹配（大小写不敏感） */
function buildSearchHighlightRegex(query) {
  const terms = String(query).trim().split(/\s+/).filter((t) => t.length > 0).map(escapeRegExp);
  if (terms.length === 0) return null;
  try {
    return new RegExp(`(${terms.join("|")})`, "gi");
  } catch {
    return null;
  }
}

/**
 * @param {string | number | null | undefined} displayText
 * @param {RegExp | null} re
 */
function highlightSearchMatches(displayText, re) {
  if (re == null) {
    if (displayText == null || displayText === "") return "—";
    return String(displayText);
  }
  const raw = displayText == null || displayText === "" ? "—" : String(displayText);
  const regex = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const parts = [];
  let last = 0;
  let m;
  const s = raw;
  while ((m = regex.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    parts.push(
      <mark
        key={`h-${m.index}-${last}-${m[0].slice(0, 12)}`}
        className="rounded-sm bg-amber-200/90 px-0.5 text-inherit dark:bg-amber-400/35"
      >
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
    if (m[0].length === 0) regex.lastIndex++;
  }
  if (last < s.length) parts.push(s.slice(last));
  if (parts.length === 0) return raw;
  return <>{parts}</>;
}

function newFieldFilterId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `f-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** @param {string} s */
function escapeFilterChipQuoted(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 与「—」展示一致：无原始值时不提供点击加过滤 */
function isFilterableCellValue(text) {
  if (text === null || text === undefined) return false;
  if (typeof text === "number" && Number.isFinite(text)) return true;
  return String(text).trim() !== "";
}

/**
 * 当前页内某字段的去重取值及出现次数（与表格单元格取值逻辑一致）
 * @param {Record<string, unknown>[]} rows
 * @param {typeof ALL_COLUMN_DEF[number]} col
 */
function aggregateFieldValuesForRows(rows, col) {
  const map = new Map();
  for (const row of rows) {
    const text = getUnifiedCellText(row, col);
    map.set(text, (map.get(text) || 0) + 1);
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

/** 当前页内字段取值占比（与 aggregate 合计一致） */
function formatFieldValueSharePct(count, total) {
  if (total <= 0) return "0.0%";
  const p = (count / total) * 100;
  if (p >= 99.95) return "100%";
  return `${p.toFixed(1)}%`;
}

function localValueToIso(local) {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

/** 将时间戳格式化为 `datetime-local` 控件可用的本地字符串（YYYY-MM-DDTHH:mm） */
function msToDatetimeLocalValue(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function logSearchPresetLabel(preset, customStart, customEnd) {
  if (preset === "custom") {
    if (customStart && customEnd) {
      const s = customStart.length >= 16 ? customStart.slice(0, 16) : customStart;
      const e = customEnd.length >= 16 ? customEnd.slice(0, 16) : customEnd;
      return `${s.replace("T", " ")} → ${e.replace("T", " ")}`;
    }
    return intl.get("logSearch.preset.custom");
  }
  const k = `logSearch.preset.${preset}`;
  const t = intl.get(k);
  return t && t !== k ? t : preset;
}

/**
 * Discover 风格：按钮展示当前区间，下拉分组预设 + 自定义起止
 * @param {{ timePreset: string, setTimePreset: (v: string) => void, customStart: string, setCustomStart: (v: string) => void, customEnd: string, setCustomEnd: (v: string) => void, disabled?: boolean, onCommit: () => void }} props
 */
function LogTimeRangePicker({ timePreset, setTimePreset, customStart, setCustomStart, customEnd, setCustomEnd, disabled, onCommit }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState(/** @type {{ top: number, left: number, width: number } | null} */ (null));

  const updatePanelPos = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(window.innerWidth - 16, 22 * 16);
    let left = r.right - maxW;
    if (left < 8) left = Math.min(8, r.left);
    left = Math.max(8, Math.min(left, window.innerWidth - maxW - 8));
    setPanelPos({ top: r.bottom + 4, left, width: maxW });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => updatePanelPos();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = /** @type {Node} */ (e.target);
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const buttonLabel = useMemo(
    () => logSearchPresetLabel(timePreset, customStart, customEnd),
    [timePreset, customStart, customEnd],
  );

  const pickPreset = (key) => {
    setTimePreset(key);
    if (key !== "custom") {
      setOpen(false);
      onCommit();
    }
  };

  const applyCustom = () => {
    setTimePreset("custom");
    setOpen(false);
    onCommit();
  };

  const panelContent = (
    <>
      <div className="border-b border-slate-100 px-3 pb-2 pt-1 dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {intl.get("logSearch.timeGroup.relative")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {RELATIVE_TIME_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(p.key)}
              className={[
                "rounded-md px-2 py-1.5 text-left text-xs font-medium transition",
                timePreset === p.key
                  ? "bg-primary/12 text-primary dark:bg-primary/20"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {intl.get(`logSearch.preset.${p.key}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-400 dark:text-slate-500">
          {intl.get("logSearch.timeGroup.calendar")}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-0.5 sm:grid-cols-3">
          {CALENDAR_TIME_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(key)}
              className={[
                "rounded px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition",
                timePreset === key
                  ? "bg-primary/12 text-primary dark:bg-primary/20"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {intl.get(`logSearch.preset.${key}`)}
            </button>
          ))}
        </div>
      </div>
      <details className="px-3 py-2">
        <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 [&::-webkit-details-marker]:hidden">
          {intl.get("logSearch.timeSection.custom")}
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className={`${INPUT} max-w-full py-1.5 text-xs sm:max-w-[11rem]`}
            />
            <span className="text-slate-400 dark:text-slate-600">—</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className={`${INPUT} max-w-full py-1.5 text-xs sm:max-w-[11rem]`}
            />
          </div>
          <button
            type="button"
            disabled={disabled || !customStart || !customEnd}
            onClick={applyCustom}
            className="app-btn-outline w-fit py-1.5 pl-3 pr-4 text-xs"
          >
            {intl.get("logSearch.timeApply")}
          </button>
        </div>
      </details>
    </>
  );

  return (
    <div className="relative min-h-0 w-auto min-w-[7.5rem] max-w-[15rem] shrink-0 self-stretch">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={intl.get("logSearch.timePickerAria")}
        onClick={() => setOpen((o) => !o)}
        className="box-border flex h-full min-h-9 w-full min-w-0 items-center gap-1 border-0 bg-slate-50 py-0 pl-3 pr-2 text-left text-sm text-slate-800 outline-none ring-0 focus:ring-0 dark:bg-slate-800/90 dark:text-slate-100"
      >
        <span className="min-w-0 flex-1 truncate" title={buttonLabel}>
          {buttonLabel}
        </span>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
            className="fixed z-[200] max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200/90 bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-label={intl.get("logSearch.timeRange")}
          >
            {panelContent}
          </div>,
          document.body,
        )}
    </div>
  );
}

function rowKey(row, index) {
  return `${row._source || "row"}-${row._id || ""}-${row.time || ""}-${index}`;
}

/** 与配置变更列表类似的行背景：展开行高亮，其余白底悬停 */
function logSearchRowBgClass(isExpanded) {
  if (isExpanded) {
    return "bg-primary/5 ring-1 ring-inset ring-primary/25 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/15";
  }
  return "bg-white hover:bg-gray-50/80 dark:bg-gray-900/40 dark:hover:bg-gray-800/60";
}

/**
 * 日志列表分页条：页码 + 省略号（page 为 0-based）
 * @param {number} page0
 * @param {number} totalPages
 */
function getLogPaginationItems(page0, totalPages) {
  const c = page0 + 1;
  const t = totalPages;
  if (t < 1) return [];
  const page = (/** @param {number} n */ n) => ({ type: /** @type {const} */ ("page"), n, key: `p-${n}` });
  const ell = (/** @param {string} k */ k) => ({ type: /** @type {const} */ ("ellipsis"), key: `e-${k}` });

  if (t === 1) return [page(1)];
  if (t <= 9) {
    return Array.from({ length: t }, (_, i) => page(i + 1));
  }

  if (c <= 4) {
    return [...Array.from({ length: 5 }, (_, i) => page(i + 1)), ell("1"), page(t)];
  }
  if (c >= t - 3) {
    return [page(1), ell("2"), ...Array.from({ length: 5 }, (_, i) => page(t - 4 + i))];
  }
  return [page(1), ell("3"), page(c - 1), page(c), page(c + 1), ell("4"), page(t)];
}

/**
 * 解析统一日志行 time（ISO、Doris 常见 "YYYY-MM-DD HH:mm:ss"、毫秒数字等），供直方图分桶与排序对齐。
 * @param {unknown} raw
 */
function parseUnifiedLogTimeMs(raw) {
  if (raw == null) return NaN;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return NaN;
  // 兼容误用 JSON.stringify(Date) 产生的 "\"2026-…\"" 串，避免直方图分桶全为 0
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      const inner = JSON.parse(s);
      if (typeof inner === "string") s = inner.trim();
    } catch {
      s = s.slice(1, -1).trim();
    }
  }
  let t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  // "2026-03-30 20:21:31" / 带微秒等，部分引擎对空格日期解析为 NaN
  if (/^\d{4}-\d{2}-\d{2}[ T]\d/.test(s)) {
    t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2})[ T](.*)$/, "$1T$2"));
    if (!Number.isNaN(t)) return t;
  }
  return NaN;
}

function bucketRowsForHistogram(rows, startMs, endMs, bucketCount) {
  const labels = [];
  const counts = Array.from({ length: bucketCount }, () => 0);
  if (!(endMs > startMs) || bucketCount < 1) {
    return { labels, counts, max: 0 };
  }
  const step = (endMs - startMs) / bucketCount;
  for (let i = 0; i < bucketCount; i++) {
    const t = new Date(startMs + i * step);
    labels.push(t.toISOString().slice(5, 16).replace("T", " "));
  }
  for (const r of rows) {
    const t = parseUnifiedLogTimeMs(r.time);
    if (Number.isNaN(t)) continue;
    let idx = Math.floor((t - startMs) / step);
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1;
    counts[idx]++;
  }
  const max = Math.max(1, ...counts);
  return { labels, counts, max };
}

/** 直方图桶数量：按 Discover 的「按分钟/小时/天」近似划分 */
function histogramBucketCount(startMs, endMs, mode) {
  const span = endMs - startMs;
  if (!(span > 0)) return 32;
  if (mode === "minute") return Math.min(120, Math.max(12, Math.ceil(span / 60_000)));
  if (mode === "hour") return Math.min(72, Math.max(12, Math.ceil(span / 3_600_000)));
  if (mode === "day") return Math.min(60, Math.max(7, Math.ceil(span / 86_400_000)));
  return 32;
}

/** Doris SUBSTR(timestamp,1,13) 如 "2026-03-18 05" → 该小时起始时间戳 */
function agentTrendBucketToMs(bucket) {
  const raw = String(bucket ?? "").trim();
  if (raw.length >= 10) {
    const day = raw.slice(0, 10);
    let hour = 0;
    if (raw.length >= 13) {
      const rest = raw.slice(11, 13);
      const h = Number.parseInt(rest, 10);
      if (!Number.isNaN(h)) hour = h;
    }
    const d = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00`);
    if (!Number.isNaN(d)) return d;
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? NaN : t;
}

function formatAgentTrendHourLabel(bucket) {
  const ms = agentTrendBucketToMs(bucket);
  if (Number.isNaN(ms)) return String(bucket ?? "");
  return new Date(ms).toISOString().slice(5, 16).replace("T", " ");
}

/**
 * 服务端按小时聚合的 trend，在前端按 histInterval 重采样（天合并、自动均分区间、分钟粒度不细于小时）。
 * @param {Array<{ bucket?: string; count?: number }>} agentTrend
 * @param {string} histInterval
 * @param {number} startMs
 * @param {number} endMs
 */
function resampleAgentTrendBars(agentTrend, histInterval, startMs, endMs) {
  const sorted = [...agentTrend]
    .map((r) => ({
      bucket: String(r.bucket ?? ""),
      count: Number(r.count) || 0,
      ms: agentTrendBucketToMs(r.bucket),
    }))
    .filter((r) => !Number.isNaN(r.ms))
    .sort((a, b) => a.ms - b.ms);
  if (sorted.length === 0) return [];

  const hourBucketEnd = (ms) => Math.min(ms + 3_600_000 - 1, endMs);

  if (histInterval === "day") {
    const byDay = new Map();
    for (const r of sorted) {
      const day = r.bucket.slice(0, 10);
      if (day.length < 10) continue;
      byDay.set(day, (byDay.get(day) || 0) + r.count);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => {
        const parts = day.split("-").map(Number);
        if (parts.length < 3) return { label: day, count, startMs: NaN, endMs: NaN };
        const [yy, mm, dd] = parts;
        const s = new Date(yy, mm - 1, dd, 0, 0, 0, 0).getTime();
        const e = new Date(yy, mm - 1, dd, 23, 59, 59, 999).getTime();
        return { label: day, count, startMs: s, endMs: e };
      });
  }

  if (histInterval === "hour" || histInterval === "minute") {
    return sorted.map((r) => ({
      label: formatAgentTrendHourLabel(r.bucket),
      count: r.count,
      startMs: r.ms,
      endMs: Math.max(r.ms, hourBucketEnd(r.ms)),
    }));
  }

  if (!(endMs > startMs)) {
    return sorted.map((r) => ({
      label: formatAgentTrendHourLabel(r.bucket),
      count: r.count,
      startMs: r.ms,
      endMs: Math.max(r.ms, hourBucketEnd(r.ms)),
    }));
  }
  const n = histogramBucketCount(startMs, endMs, "auto");
  const step = (endMs - startMs) / n;
  const counts = Array.from({ length: n }, () => 0);
  for (const r of sorted) {
    let idx = Math.floor((r.ms - startMs) / step);
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    counts[idx] += r.count;
  }
  const labels = Array.from({ length: n }, (_, i) => {
    const t = new Date(startMs + i * step);
    return t.toISOString().slice(5, 16).replace("T", " ");
  });
  return labels.map((label, i) => {
    const bucketStart = startMs + i * step;
    const bucketEndEx = startMs + (i + 1) * step;
    const endIncl = Math.min(bucketEndEx - 1, endMs);
    return { label, count: counts[i] ?? 0, startMs: bucketStart, endMs: Math.max(bucketStart, endIncl) };
  });
}

function formatIsoForSummary(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 展开区「原始 JSON」展示用 */
function formatLogRawForDetail(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

/** Discover 风格：OR / AND / NOT 词法高亮（与输入同步滚动） */
function splitQueryHighlight(text) {
  const s = String(text ?? "");
  if (!s) return [];
  const parts = [];
  const re = /\b(OR|AND|NOT)\b/gi;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index), kw: false });
    parts.push({ text: m[0], kw: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last), kw: false });
  return parts.length ? parts : [{ text: s, kw: false }];
}

function DiscoverQueryInput({ id, value, onChange, placeholder, disabled }) {
  const inputRef = useRef(null);
  const hlRef = useRef(null);
  const syncScroll = () => {
    const a = inputRef.current;
    const b = hlRef.current;
    if (a && b) b.scrollLeft = a.scrollLeft;
  };
  const parts = useMemo(() => splitQueryHighlight(value), [value]);
  const showHl = value.length > 0;

  useEffect(() => {
    const a = inputRef.current;
    const b = hlRef.current;
    if (a && b) b.scrollLeft = a.scrollLeft;
  }, [value]);

  return (
    <div className="relative h-full min-h-0 min-w-0 flex-1">
      {showHl && (
        <div
          ref={hlRef}
          className="pointer-events-none absolute inset-0 z-0 overflow-x-auto overflow-y-hidden"
          aria-hidden
        >
          <div className="flex h-full min-h-9 min-w-full items-center whitespace-nowrap px-4 font-mono text-sm leading-none">
            {parts.map((p, i) => (
              <span key={i} className={p.kw ? "text-amber-600 dark:text-amber-500" : "text-slate-800 dark:text-slate-100"}>
                {p.text}
              </span>
            ))}
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        id={id}
        type="search"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={onChange}
        onScroll={syncScroll}
        placeholder={placeholder}
        className={`relative z-[1] box-border h-full min-h-9 w-full min-w-0 border-0 bg-transparent px-4 font-mono text-sm outline-none ring-0 focus:ring-0 dark:placeholder:text-slate-500 ${
          showHl ? "text-transparent caret-slate-800 dark:caret-slate-200" : "text-slate-900 dark:text-slate-100"
        }`}
      />
    </div>
  );
}

/**
 * 单条日志「事件详情」：与配置变更展开区一致的键值网格。
 * md 及以上为四列（标签|值|标签|值），避免两列等分导致的中间留白过大；小屏仍为单列逐行展示。
 * 展示当前数据源下的全部列，不受表格「显示列」勾选影响。
 * @param {{
 *   row: Record<string, unknown>,
 *   columns: typeof ALL_COLUMN_DEF[number][],
 *   onAddFieldFilter?: (colKey: string, rawValue: string) => void,
 *   canAddFieldFilter?: boolean,
 * }} props
 */
/** @template T @param {T[]} arr @returns {[T, T | null][]} */
function chunkPairs(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 2) out.push([arr[i], arr[i + 1] ?? null]);
  return out;
}

function LogDetailListView({ row, columns, onAddFieldFilter, canAddFieldFilter = false, highlightRe = null }) {
  const allMain = columns;
  const raw = rawRow(row);
  const errRaw = raw.message_is_error;
  const isErr =
    errRaw === true || errRaw === 1 || String(errRaw).toLowerCase() === "true" || String(errRaw) === "1";
  const isExplicitNo =
    errRaw === false || errRaw === 0 || String(errRaw).toLowerCase() === "false" || String(errRaw) === "0";
  const errLabel =
    errRaw == null || errRaw === ""
      ? "—"
      : isErr
        ? intl.get("common.yes")
        : isExplicitNo
          ? intl.get("common.no")
          : String(errRaw);

  const filterValueBtnClass =
    "rounded-md text-left transition hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-primary/10";

  /**
   * @param {string} colKey
   * @param {string} rawVal
   * @param {import("react").ReactNode} children
   * @param {boolean} [block]
   */
  const wrapFilterValue = (colKey, rawVal, children, block = false) => {
    if (!canAddFieldFilter || !onAddFieldFilter) return children;
    if (!isFilterableCellValue(rawVal)) return children;
    return (
      <button
        type="button"
        className={[
          filterValueBtnClass,
          block ? "block w-full" : "inline-flex min-w-0 max-w-full",
        ].join(" ")}
        title={intl.get("logSearch.fieldValueClickToFilter")}
        onClick={(e) => {
          e.stopPropagation();
          onAddFieldFilter(colKey, rawVal);
        }}
      >
        {children}
      </button>
    );
  };

  const detailLabelClass =
    "shrink-0 pt-px text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400 sm:w-24 md:w-auto";

  /** @param {typeof ALL_COLUMN_DEF[number]} col */
  const renderFieldValueNode = (col) => {
    const text = getUnifiedCellText(row, col);
    const display = col.key === "messageIsError" ? errLabel : text || "—";
    const filterRaw = text;
    const errCtx = { errRaw, isErr, isExplicitNo };
    let valueInner;
    if (col.key === "summary") {
      valueInner = (
        <span className="whitespace-pre-wrap break-words text-[11px] leading-tight text-gray-900 dark:text-gray-100">
          {highlightSearchMatches(display, highlightRe)}
        </span>
      );
    } else {
      const mono = MONO_COLUMN_KEYS.has(col.key) || col.key === "time";
      const toneClasses = logDetailValueToneClass(col, row, display, errCtx);
      const fallbackColor =
        display === "—" ? "text-slate-500 dark:text-slate-400" : "text-gray-900 dark:text-gray-100";
      valueInner = (
        <span
          className={`break-words break-all text-[11px] leading-tight ${toneClasses || fallbackColor} ${mono ? "font-mono" : ""}`}
        >
          {highlightSearchMatches(display, highlightRe)}
        </span>
      );
    }
    return wrapFilterValue(col.key, filterRaw, valueInner, col.key === "summary");
  };

  const renderCell = (col) => (
    <div key={col.key} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-1">
      <span className={detailLabelClass}>{intl.get(col.labelKey)}</span>
      <span className="min-w-0">{renderFieldValueNode(col)}</span>
    </div>
  );

  return (
    <div className="max-h-[28rem] min-w-0 space-y-1 overflow-y-auto overflow-x-hidden text-xs" role="tabpanel">
      <div className="min-w-0 space-y-1 md:hidden">{allMain.map((c) => renderCell(c))}</div>
      <div className="hidden min-w-0 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-x-1.5 md:gap-y-1">
        {chunkPairs(allMain).map(([left, right], i) => (
          <Fragment key={`detail-pair-${i}`}>
            <span className={detailLabelClass}>{intl.get(left.labelKey)}</span>
            <span className="min-w-0">{renderFieldValueNode(left)}</span>
            {right ? (
              <>
                <span className={detailLabelClass}>{intl.get(right.labelKey)}</span>
                <span className="min-w-0">{renderFieldValueNode(right)}</span>
              </>
            ) : (
              <>
                <span className="min-w-0" aria-hidden />
                <span className="min-w-0" aria-hidden />
              </>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 进程与工作目录：从原始行抽取常见字段 */
function LogDetailProcView({ row }) {
  const raw = rawRow(row);
  const pairs = [
    [intl.get("logSearch.col.messageDetailsCwd"), cellStr(raw.message_details_cwd) || "—"],
    [intl.get("logSearch.col.messageDetailsStatus"), cellStr(raw.message_details_status) || "—"],
    [intl.get("logSearch.col.messageDetailsExitCode"), cellStr(raw.message_details_exit_code) || "—"],
    [intl.get("logSearch.col.session"), cellStr(row.sessionId) || "—"],
    [intl.get("logSearch.col.trace"), cellStr(row.traceId) || "—"],
    [intl.get("logSearch.col.requestId"), cellStr(row.requestId) || "—"],
  ];
  return (
    <div className="min-w-0 space-y-2.5 overflow-x-hidden text-xs" role="tabpanel">
      <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
        {pairs.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
            <span className="shrink-0 pt-px text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400 sm:w-24 md:w-28">{k}</span>
            <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-tight text-gray-900 dark:text-gray-100">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscoverHistogram({
  bars,
  loading,
  histInterval,
  onHistInterval,
  rangeSummary,
  histSelectTitle,
  onBucketClick,
}) {
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const chartData = useMemo(() => {
    if (bars.length > 0) {
      return bars.map((b) => ({
        label: String(b.label ?? ""),
        count: Number(b.count) || 0,
        startMs: b.startMs,
        endMs: b.endMs,
      }));
    }
    return [{ label: "—", count: 0, placeholder: true }];
  }, [bars]);

  const manyBuckets = chartData.length > 18;

  return (
    <section className="min-w-0 app-card px-4 pb-2 pt-2 sm:px-6 sm:pb-3 sm:pt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <button
            type="button"
            className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-expanded={!chartCollapsed}
            aria-label={
              chartCollapsed
                ? intl.get("logSearch.histogramExpandChart")
                : intl.get("logSearch.histogramCollapseChart")
            }
            title={
              chartCollapsed
                ? intl.get("logSearch.histogramExpandChart")
                : intl.get("logSearch.histogramCollapseChart")
            }
            onClick={() => setChartCollapsed((c) => !c)}
          >
            <Icon
              name="chevron"
              className={`h-4 w-4 transition-transform duration-200 ${chartCollapsed ? "" : "rotate-180"}`}
            />
          </button>
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{rangeSummary}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:pt-0.5">
          <label htmlFor="log-hist-interval" className="sr-only">
            {intl.get("logSearch.histInterval.label")}
          </label>
          <select
            id="log-hist-interval"
            value={histInterval}
            onChange={(e) => onHistInterval(e.target.value)}
            className="app-input w-auto max-w-[10rem] py-1.5 pl-2 pr-8 text-[11px]"
            title={histSelectTitle || intl.get("logSearch.histInterval.label")}
          >
            <option value="auto">{intl.get("logSearch.histInterval.auto")}</option>
            <option value="minute">{intl.get("logSearch.histInterval.minute")}</option>
            <option value="hour">{intl.get("logSearch.histInterval.hour")}</option>
            <option value="day">{intl.get("logSearch.histInterval.day")}</option>
          </select>
        </div>
      </div>

      <div
        className={`mt-4 h-32 w-full min-w-0 min-h-0 ${chartCollapsed ? "hidden" : ""}`}
        title={onBucketClick ? intl.get("logSearch.histogramClickDrillHint") : undefined}
      >
        {loading ? (
          <LoadingSpinner message={intl.get("logSearch.loading")} className="!py-4" />
        ) : (
          <ResponsiveContainer width="100%" height={128} minWidth={0}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: manyBuckets ? 20 : 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:opacity-30" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                interval="preserveStartEnd"
                minTickGap={manyBuckets ? 2 : 8}
                angle={manyBuckets ? -35 : 0}
                textAnchor={manyBuckets ? "end" : "middle"}
                height={manyBuckets ? 36 : 24}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value) => [`${value}`, intl.get("logSearch.histogramTooltipRows")]}
                labelFormatter={(label) => label || "—"}
              />
              <Bar
                dataKey="count"
                name={intl.get("logSearch.histogramTitle")}
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                cursor={onBucketClick ? "pointer" : "default"}
                onClick={(a, b) => {
                  if (!onBucketClick) return;
                  const fromPayload = a && typeof a === "object" && "payload" in a ? /** @type {{ payload?: unknown }} */ (a).payload : null;
                  const fromIndex = typeof b === "number" ? chartData[b] : null;
                  const direct = a && typeof a === "object" && "startMs" in a ? a : null;
                  const item = /** @type {{ placeholder?: boolean; startMs?: number; endMs?: number } | null} */ (
                    (fromPayload && typeof fromPayload === "object" ? fromPayload : null) ||
                    fromIndex ||
                    direct
                  );
                  if (!item || item.placeholder) return;
                  const sm = item.startMs;
                  const em = item.endMs;
                  if (typeof sm !== "number" || typeof em !== "number" || !Number.isFinite(sm) || !Number.isFinite(em)) return;
                  onBucketClick({ startMs: sm, endMs: em });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export default function LogSearch() {
  const [timePreset, setTimePreset] = useState("24h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [dataSource, setDataSource] = useState("agent_sessions");
  const [q, setQ] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [traceId, setTraceId] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [expanded, setExpanded] = useState("");
  /** 展开行：日志详情（字段网格）/ 原始 JSON */
  const [logDetailMode, setLogDetailMode] = useState(/** @type {"list" | "raw"} */ ("list"));
  const [searchTick, setSearchTick] = useState(0);
  const [colVisible, setColVisible] = useState(() =>
    Object.fromEntries(columnsForDataSource("agent_sessions").map((c) => [c.key, true])),
  );
  const [fieldFilter, setFieldFilter] = useState("");
  /** 侧栏「字段列表」卡片：收折仅隐藏列表与筛选框，不影响右侧取值面板 */
  const [fieldsListCollapsed, setFieldsListCollapsed] = useState(false);
  /** 会话表精确字段条件（多条件 AND）；审计/网关数据源下不生效 */
  const [serverFieldFilters, setServerFieldFilters] = useState(
    /** @type {{ id: string; key: string; value: string; exclude?: boolean; pinned?: boolean }[]} */ ([]),
  );
  const [filterOpsOpen, setFilterOpsOpen] = useState(false);
  /** 侧栏「字段列表」中点击字段名展开：展示当前页该字段取值分布 */
  const [fieldValuesOpenKey, setFieldValuesOpenKey] = useState(/** @type {string | null} */ (null));
  const [histInterval, setHistInterval] = useState("auto");
  /** 表头「列显示」下拉：与侧栏勾选同步 */
  const [colPickerOpen, setColPickerOpen] = useState(false);
  /** 列选择面板挂到 body 时用 fixed 定位（避免表格 overflow 裁剪） */
  const colPickerAnchorRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [colPickerFixedRect, setColPickerFixedRect] = useState(
    /** @type {{ top: number; left: number; width: number } | null} */ (null),
  );
  /** 顶栏数据源：自定义下拉，便于选项悬停使用主题淡蓝（原生 select 无法改选项样式） */
  const [dataSourceMenuOpen, setDataSourceMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  /** lg+：主区与左侧「字段列表」同高，表格在卡片内滚动 */
  const [lgUp, setLgUp] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  );

  const activeColumns = useMemo(() => columnsForDataSource(dataSource), [dataSource]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setLgUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const cols = columnsForDataSource(dataSource);
    setColVisible(Object.fromEntries(cols.map((c) => [c.key, true])));
  }, [dataSource]);

  useEffect(() => {
    if (dataSource === "audit_logs") {
      setServerFieldFilters([]);
    }
  }, [dataSource]);

  useEffect(() => {
    if (!filterOpsOpen) return;
    const onDoc = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest?.("[data-log-filter-ops]")) return;
      setFilterOpsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpsOpen]);

  useEffect(() => {
    if (!colPickerOpen) return;
    const onDoc = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest?.("[data-log-col-picker]")) return;
      setColPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colPickerOpen]);

  useLayoutEffect(() => {
    if (!colPickerOpen) {
      setColPickerFixedRect(null);
      return;
    }
    const el = colPickerAnchorRef.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      const width = Math.min(window.innerWidth - 16, 256); // 与 w-[min(...,16rem)] 一致
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
      if (left < 8) left = 8;
      setColPickerFixedRect({ top: r.bottom + 4, left, width });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [colPickerOpen]);

  useEffect(() => {
    if (!dataSourceMenuOpen) return;
    const onDoc = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest?.("[data-log-ds-select]")) return;
      setDataSourceMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [dataSourceMenuOpen]);

  useEffect(() => {
    if (!dataSourceMenuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDataSourceMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dataSourceMenuOpen]);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const onDoc = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest?.("[data-log-download]")) return;
      setDownloadMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [downloadMenuOpen]);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDownloadMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [downloadMenuOpen]);

  useEffect(() => {
    if (serverFieldFilters.length === 0) setFilterOpsOpen(false);
  }, [serverFieldFilters.length]);

  useEffect(() => {
    setLogDetailMode("list");
  }, [expanded]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const computeRangeIso = useCallback(() => {
    const now = Date.now();
    if (timePreset === "custom") {
      const startIso = localValueToIso(customStart);
      const endIso = localValueToIso(customEnd);
      return { startIso, endIso };
    }
    if (timePreset === "today") {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      return { startIso: s.toISOString(), endIso: new Date().toISOString() };
    }
    if (timePreset === "yesterday") {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const end = new Date(dayStart.getTime() - 1);
      const start = new Date(dayStart);
      start.setDate(start.getDate() - 1);
      return { startIso: start.toISOString(), endIso: end.toISOString() };
    }
    if (timePreset === "thisWeek") {
      const s = startOfWeekMonday(new Date());
      return { startIso: s.toISOString(), endIso: new Date(now).toISOString() };
    }
    if (timePreset === "lastWeek") {
      const thisMonday = startOfWeekMonday(new Date());
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      const lastSundayEnd = new Date(thisMonday.getTime() - 1);
      return { startIso: lastMonday.toISOString(), endIso: lastSundayEnd.toISOString() };
    }
    if (timePreset === "thisMonth") {
      const s = new Date();
      s.setDate(1);
      s.setHours(0, 0, 0, 0);
      return { startIso: s.toISOString(), endIso: new Date(now).toISOString() };
    }
    if (timePreset === "lastMonth") {
      const n = new Date();
      const s = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      s.setHours(0, 0, 0, 0);
      const e = new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59, 999);
      return { startIso: s.toISOString(), endIso: e.toISOString() };
    }
    if (timePreset === "thisYear") {
      const n = new Date();
      const s = new Date(n.getFullYear(), 0, 1);
      s.setHours(0, 0, 0, 0);
      return { startIso: s.toISOString(), endIso: new Date(now).toISOString() };
    }
    if (timePreset === "lastYear") {
      const y = new Date().getFullYear() - 1;
      const s = new Date(y, 0, 1);
      s.setHours(0, 0, 0, 0);
      const e = new Date(y, 11, 31, 23, 59, 59, 999);
      return { startIso: s.toISOString(), endIso: e.toISOString() };
    }
    const def = RELATIVE_TIME_PRESETS.find((x) => x.key === timePreset);
    const minutes = def?.minutes ?? 60;
    const startIso = new Date(now - minutes * 60_000).toISOString();
    const endIso = new Date(now).toISOString();
    return { startIso, endIso };
  }, [timePreset, customStart, customEnd]);

  const buildSearchParams = useCallback(() => {
    const { startIso, endIso } = computeRangeIso();
    const offset = page * pageSize;
    const sp = new URLSearchParams();
    sp.set("startIso", startIso);
    sp.set("endIso", endIso);
    sp.set("dataSource", dataSource);
    if (q.trim()) sp.set("q", q.trim());
    if (serverFieldFilters.length > 0) {
      sp.set(
        "fieldFilters",
        JSON.stringify(
          serverFieldFilters.map(({ key, value, exclude }) => ({
            key,
            value,
            ...(exclude ? { exclude: true } : {}),
          })),
        ),
      );
    }
    if (sessionId.trim()) sp.set("sessionId", sessionId.trim());
    if (traceId.trim()) sp.set("traceId", traceId.trim());
    sp.set("sortKey", "time");
    sp.set("sortDir", "desc");
    sp.set("limit", String(pageSize));
    sp.set("offset", String(offset));
    return sp.toString();
  }, [
    computeRangeIso,
    dataSource,
    q,
    serverFieldFilters,
    sessionId,
    traceId,
    pageSize,
    page,
  ]);

  const fetchLogs = useCallback(async () => {
    const { startIso, endIso } = computeRangeIso();
    if (!startIso || !endIso) {
      setError(intl.get("logSearch.error.badTime"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/logs-search?${buildSearchParams()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || intl.get("logSearch.error.generic"));
        setPayload(null);
        return;
      }
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [buildSearchParams, computeRangeIso]);

  useEffect(() => {
    void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [searchTick, page, pageSize]);

  const toggleCol = useCallback((key) => {
    setColVisible((prev) => {
      const wasVisible = prev[key] !== false;
      if (wasVisible) {
        const visibleCount = activeColumns.filter((c) => prev[c.key] !== false).length;
        if (visibleCount <= 1) return prev;
      }
      return { ...prev, [key]: !wasVisible };
    });
  }, [activeColumns]);

  const selectAllColumns = useCallback(() => {
    setColVisible((prev) => {
      const next = { ...prev };
      for (const c of activeColumns) next[c.key] = true;
      return next;
    });
  }, [activeColumns]);

  const leaveFirstColumnOnly = useCallback(() => {
    const fk = activeColumns[0]?.key;
    if (!fk) return;
    setColVisible(Object.fromEntries(activeColumns.map((c) => [c.key, c.key === fk])));
  }, [activeColumns]);

  const unifiedRows = payload?.unifiedRows ?? [];
  const lgTableHasRows = unifiedRows.length > 0;
  const total = Number(payload?.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const paginationBarItems = useMemo(() => getLogPaginationItems(page, totalPages), [page, totalPages]);

  const histogramData = useMemo(() => {
    const agentTrend = payload?.meta?.agent?.trend;
    const { startIso, endIso } = computeRangeIso();
    const s = Date.parse(startIso);
    const e = Date.parse(endIso);

    const buildHistogramFromCurrentRows = () => {
      if (!(e > s)) {
        return { bars: [], histSelectTitle: undefined };
      }
      const nBuckets = histogramBucketCount(s, e, histInterval);
      const { labels, counts } = bucketRowsForHistogram(unifiedRows, s, e, nBuckets);
      const step = (e - s) / nBuckets;
      let bars = labels.map((label, i) => {
        const bucketStart = s + i * step;
        const bucketEndEx = s + (i + 1) * step;
        const endIncl = Math.min(bucketEndEx - 1, e);
        return {
          count: counts[i] ?? 0,
          label,
          startMs: bucketStart,
          endMs: Math.max(bucketStart, endIncl),
        };
      });
      if (bars.length === 0 && nBuckets > 0) {
        bars = Array.from({ length: nBuckets }, (_, i) => {
          const t = new Date(s + i * step);
          const bucketStart = s + i * step;
          const bucketEndEx = s + (i + 1) * step;
          const endIncl = Math.min(bucketEndEx - 1, e);
          return {
            count: 0,
            label: t.toISOString().slice(5, 16).replace("T", " "),
            startMs: bucketStart,
            endMs: Math.max(bucketStart, endIncl),
          };
        });
      }
      return { bars, histSelectTitle: undefined };
    };

    /** 仅 agent_sessions 接口带按小时 trend；合并数据源或非 agent 列表不应强依赖 agent trend，避免有表无图 */
    const preferAgentTrend =
      dataSource === "agent_sessions" &&
      Array.isArray(agentTrend) &&
      agentTrend.length > 0 &&
      e > s;

    if (preferAgentTrend) {
      const bars = resampleAgentTrendBars(agentTrend, histInterval, s, e);
      const sum = bars.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
      if (sum === 0 && unifiedRows.length > 0) {
        return buildHistogramFromCurrentRows();
      }
      const histSelectTitle =
        histInterval === "minute" ? intl.get("logSearch.histInterval.minuteCoarseHint") : undefined;
      return { bars, histSelectTitle };
    }

    return buildHistogramFromCurrentRows();
  }, [payload, unifiedRows, computeRangeIso, histInterval, dataSource]);

  const visibleColCount = useMemo(
    () => activeColumns.filter((c) => colVisible[c.key] !== false).length,
    [activeColumns, colVisible],
  );
  const allColumnsVisible = useMemo(
    () =>
      activeColumns.length > 0 && activeColumns.every((c) => colVisible[c.key] !== false),
    [activeColumns, colVisible],
  );
  /** 仅首列可见（「全部取消」后的状态），用于禁用重复点击 */
  const onlyFirstColumnVisible = useMemo(() => {
    if (activeColumns.length <= 1) return true;
    const fk = activeColumns[0].key;
    for (const c of activeColumns) {
      const on = colVisible[c.key] !== false;
      if (c.key === fk) {
        if (!on) return false;
      } else if (on) return false;
    }
    return true;
  }, [activeColumns, colVisible]);
  /** 与当前表格可见列一致，用于导出当前页 CSV / Excel */
  const visibleExportColumns = useMemo(
    () => activeColumns.filter((c) => colVisible[c.key] !== false),
    [activeColumns, colVisible],
  );
  const rangeSummaryText = useMemo(() => {
    const { startIso, endIso } = computeRangeIso();
    return intl.get("logSearch.rangeSummary", {
      start: formatIsoForSummary(startIso),
      end: formatIsoForSummary(endIso),
      total,
    });
  }, [computeRangeIso, total]);

  /** 点击柱状图某一柱：将时间范围收窄为该桶并重新检索 */
  const onHistogramBucketClick = useCallback(({ startMs, endMs }) => {
    setTimePreset("custom");
    setCustomStart(msToDatetimeLocalValue(startMs));
    setCustomEnd(msToDatetimeLocalValue(endMs));
    setPage(0);
    setSearchTick((t) => t + 1);
  }, []);

  /** 小屏：表体可视区高度上限（按当前页条数估算，与 85vh 取小） */
  const logTableScrollMaxHeight = useMemo(() => {
    const rows = unifiedRows.length > 0 ? unifiedRows.length : pageSize;
    const px = LOG_TABLE_HEAD_SLOT_PX + rows * LOG_TABLE_ROW_SLOT_PX;
    return `min(${px}px, 85vh)`;
  }, [pageSize, unifiedRows.length]);

  /** 小屏：卡片最小高度（无数据时仍保留一定占位） */
  const logTableCardMinHeight = useMemo(() => {
    const rows = unifiedRows.length > 0 ? unifiedRows.length : pageSize;
    const px = LOG_TABLE_HEAD_SLOT_PX + rows * LOG_TABLE_ROW_SLOT_PX;
    return `min(${px * 2}px, 170vh)`;
  }, [pageSize, unifiedRows.length]);

  /** 大屏：无数据时铺满与左侧字段栏底对齐；有数据时按当前页实际行数限制表体高度 */
  const logTableScrollAreaProps = useMemo(() => {
    if (!lgUp) {
      return {
        className: "log-table-scroll min-h-0 min-w-0 overflow-auto lg:flex-1 lg:min-h-0",
        style: { maxHeight: logTableScrollMaxHeight },
      };
    }
    const hasRows = unifiedRows.length > 0;
    if (!hasRows) {
      return {
        className:
          "log-table-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-auto lg:min-h-0",
        style: undefined,
      };
    }
    /** 大屏有数据：表格纵向随内容增高，由右侧 main 统一出现页面级纵向滚动条，避免套双层竖向滚动 */
    return {
      className: "log-table-scroll min-h-0 min-w-0 overflow-x-auto !overflow-y-visible",
      style: undefined,
    };
  }, [lgUp, logTableScrollMaxHeight, unifiedRows.length]);

  const filteredActiveColumns = useMemo(() => {
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return activeColumns;
    return activeColumns.filter(
      (c) => intl.get(c.labelKey).toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  }, [activeColumns, fieldFilter]);

  const fieldValuesAggregation = useMemo(() => {
    if (!fieldValuesOpenKey) return [];
    const col = activeColumns.find((c) => c.key === fieldValuesOpenKey);
    if (!col) return [];
    return aggregateFieldValuesForRows(unifiedRows, col);
  }, [fieldValuesOpenKey, unifiedRows, activeColumns]);

  const fieldValuesTotalCount = useMemo(() => {
    return fieldValuesAggregation.reduce((s, x) => s + x.count, 0);
  }, [fieldValuesAggregation]);

  const selectedFieldColumn = useMemo(
    () => (fieldValuesOpenKey ? activeColumns.find((c) => c.key === fieldValuesOpenKey) ?? null : null),
    [activeColumns, fieldValuesOpenKey],
  );

  const labelForFieldKey = useCallback(
    (key) => {
      const c = activeColumns.find((x) => x.key === key);
      return c ? intl.get(c.labelKey) : key;
    },
    [activeColumns],
  );

  const addFieldValueAsFilter = useCallback((colKey, rawValue) => {
    setServerFieldFilters((prev) => {
      if (prev.some((x) => x.key === colKey && x.value === rawValue && !x.exclude)) return prev;
      return [...prev, { id: newFieldFilterId(), key: colKey, value: rawValue }];
    });
    setPage(0);
    setSearchTick((t) => t + 1);
  }, []);

  const setFieldFilterPositive = useCallback((id) => {
    setServerFieldFilters((prev) => prev.map((x) => (x.id === id ? { ...x, exclude: false } : x)));
    setPage(0);
    setSearchTick((t) => t + 1);
  }, []);

  const setFieldFilterNegative = useCallback((id) => {
    setServerFieldFilters((prev) => prev.map((x) => (x.id === id ? { ...x, exclude: true } : x)));
    setPage(0);
    setSearchTick((t) => t + 1);
  }, []);

  const toggleFieldFilterPin = useCallback((id) => {
    setServerFieldFilters((prev) => prev.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)));
  }, []);

  const removeServerFieldFilter = useCallback((id) => {
    setServerFieldFilters((prev) => prev.filter((x) => x.id !== id));
    setPage(0);
    setSearchTick((t) => t + 1);
  }, []);

  const clearAllServerFieldFilters = useCallback(() => {
    setServerFieldFilters((prev) => prev.filter((x) => x.pinned));
    setFilterOpsOpen(false);
    setPage(0);
    setSearchTick((t) => t + 1);
  }, []);

  const canApplyServerFieldFilter =
    dataSource === "agent_sessions" || dataSource === "all" || dataSource === "gateway_logs";

  useEffect(() => {
    if (!fieldValuesOpenKey) return;
    if (!filteredActiveColumns.some((c) => c.key === fieldValuesOpenKey)) {
      setFieldValuesOpenKey(null);
    }
  }, [filteredActiveColumns, fieldValuesOpenKey]);

  const buildCurrentPageExport = useCallback(() => {
    const headers = visibleExportColumns.map((c) => intl.get(c.labelKey));
    const rows = unifiedRows.map((row) =>
      visibleExportColumns.map((col) => {
        const t = getUnifiedCellText(row, col);
        return t == null ? "" : String(t);
      }),
    );
    return { headers, rows };
  }, [unifiedRows, visibleExportColumns]);

  const downloadCurrentPageCsv = useCallback(() => {
    const { headers, rows } = buildCurrentPageExport();
    downloadCsv(filenameWithTime(`logs-p${page + 1}`), headers, rows);
    setDownloadMenuOpen(false);
  }, [buildCurrentPageExport, page]);

  const downloadCurrentPageExcel = useCallback(() => {
    const { headers, rows } = buildCurrentPageExport();
    downloadExcel(filenameWithTime(`logs-p${page + 1}`, "xlsx"), headers, rows);
    setDownloadMenuOpen(false);
  }, [buildCurrentPageExport, page]);

  /** NDJSON：每条日志一行，行为当前页 unified 行对象的 JSON */
  const downloadCurrentPageTxtJsonLines = useCallback(() => {
    const text = unifiedRows.map((row) => JSON.stringify(row)).join("\n");
    downloadUtf8Text(filenameWithTime(`logs-p${page + 1}`, "txt"), text);
    setDownloadMenuOpen(false);
  }, [unifiedRows, page]);

  const triggerSearch = () => {
    setPage(0);
    setSearchTick((t) => t + 1);
  };

  /** 列表格：悬停高亮 + 点击添加字段过滤（与详情区一致）；空值不响应 */
  const logTableFilterBtnClass =
    "w-full max-w-full rounded-md px-1 py-0.5 text-left text-gray-800 transition hover:bg-primary/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 dark:text-gray-200 dark:hover:bg-primary/15";
  const logTableFilterBtnClassLevel =
    "inline-flex max-w-full rounded-md px-0.5 py-0.5 text-left transition hover:bg-primary/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 dark:hover:bg-primary/15";

  const searchHighlightRe = useMemo(() => buildSearchHighlightRegex(q), [q]);

  const renderUnifiedColumnTd = (row, col) => {
    const text = getUnifiedCellText(row, col);
    const display = text || "—";
    const rawForFilter = text == null || text === undefined ? "" : typeof text === "number" ? String(text) : String(text);
    const canFilterCell = canApplyServerFieldFilter && isFilterableCellValue(text);
    const tdBase = "px-3 py-2 align-middle";

    const wrapFilterButton = (tdExtraClass, inner) =>
      canFilterCell ? (
        <td key={col.key} className={`${tdBase} ${tdExtraClass} group/cell`}>
          <button
            type="button"
            className={`${logTableFilterBtnClass} ${tdExtraClass.includes("truncate") ? "min-w-0 truncate" : ""}`}
            title={intl.get("logSearch.fieldValueClickToFilter")}
            onClick={(e) => {
              e.stopPropagation();
              addFieldValueAsFilter(col.key, rawForFilter);
            }}
          >
            {inner}
          </button>
        </td>
      ) : (
        <td key={col.key} className={`${tdBase} ${tdExtraClass}`} title={display}>
          {inner}
        </td>
      );

    if (col.kind === "level") {
      const badge = (
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${levelBadgeClass(row.level)}`}>
          {highlightSearchMatches(row.level || "—", searchHighlightRe)}
        </span>
      );
      return canFilterCell ? (
        <td key={col.key} className={`${tdBase} group/cell`}>
          <button
            type="button"
            className={logTableFilterBtnClassLevel}
            title={intl.get("logSearch.fieldValueClickToFilter")}
            onClick={(e) => {
              e.stopPropagation();
              addFieldValueAsFilter(col.key, rawForFilter);
            }}
          >
            {badge}
          </button>
        </td>
      ) : (
        <td key={col.key} className={tdBase}>
          {badge}
        </td>
      );
    }
    if (col.key === "time") {
      return wrapFilterButton(
        "whitespace-nowrap font-mono text-[11px] text-gray-800 dark:text-gray-200",
        <span className="font-mono">{highlightSearchMatches(display, searchHighlightRe)}</span>,
      );
    }
    if (col.key === "summary") {
      return wrapFilterButton(
        "max-w-md truncate text-gray-800 dark:text-gray-200",
        <span className="block min-w-0 truncate">{highlightSearchMatches(display, searchHighlightRe)}</span>,
      );
    }
    if (col.key === "logAttributes") {
      return wrapFilterButton(
        "max-w-lg truncate font-mono text-[11px] text-gray-800 dark:text-gray-200",
        <span className="block min-w-0 truncate font-mono">{highlightSearchMatches(display, searchHighlightRe)}</span>,
      );
    }
    const mono = MONO_COLUMN_KEYS.has(col.key);
    return wrapFilterButton(
      `max-w-[200px] truncate text-gray-800 dark:text-gray-200 ${mono ? "font-mono text-[11px]" : "text-xs"}`,
      <span className={`block min-w-0 truncate ${mono ? "font-mono text-[11px]" : "text-xs"}`}>
        {highlightSearchMatches(display, searchHighlightRe)}
      </span>,
    );
  };

  const tableBusy = loading && !!payload;

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col gap-0 px-2 sm:px-3 md:px-4 lg:px-5">
      <div
        className={`sticky top-0 z-20 overflow-visible border-b border-slate-200/80 bg-white/90 ${FILTER_BAR_OUTER_PY} shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]`}
      >
        <form
          className={`flex w-full min-w-0 flex-col ${FILTER_BAR_GAP}`}
          onSubmit={(e) => {
            e.preventDefault();
            triggerSearch();
          }}
        >
          <div className={`flex flex-col ${FILTER_BAR_GAP}`}>
            <div className={`flex flex-col ${FILTER_BAR_GAP} sm:flex-row sm:items-center sm:gap-2`}>
              <div className="w-full shrink-0 text-left sm:max-w-[15rem] lg:w-[15rem] lg:shrink-0">
                <label htmlFor="log-search-ds" className="sr-only">
                  {intl.get("logSearch.dataSource")}
                </label>
                <div className="relative w-full min-w-0" data-log-ds-select>
                  <button
                    type="button"
                    id="log-search-ds"
                    className={`${INPUT_DATA_SOURCE} flex w-full items-center justify-between gap-2`}
                    aria-expanded={dataSourceMenuOpen}
                    aria-haspopup="listbox"
                    aria-label={intl.get("logSearch.dataSource")}
                    title={intl.get("logSearch.dataSource")}
                    onClick={() => setDataSourceMenuOpen((o) => !o)}
                  >
                    <span className="min-w-0 truncate">
                      {intl.get(DATA_SOURCES.find((d) => d.value === dataSource)?.shortKey ?? "logSearch.dsShort.agentSessions")}
                    </span>
                    <Icon
                      name="chevron"
                      className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${dataSourceMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {dataSourceMenuOpen ? (
                    <div
                      className="absolute left-0 right-0 top-full z-[45] mt-1 overflow-hidden rounded-lg border border-slate-200/90 bg-white py-1 shadow-lg ring-1 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/5"
                      role="listbox"
                      aria-label={intl.get("logSearch.dataSource")}
                    >
                      {DATA_SOURCES.map((d) => {
                        const selected = dataSource === d.value;
                        return (
                          <button
                            key={d.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={[
                              "flex w-full items-center px-3 py-2 text-left text-sm transition-colors",
                              selected
                                ? "bg-primary/12 font-medium text-primary hover:bg-primary/16 dark:bg-primary/18 dark:text-primary dark:hover:bg-primary/22"
                                : "text-slate-900 hover:bg-primary/10 hover:text-slate-900 dark:text-slate-100 dark:hover:bg-primary/15 dark:hover:text-slate-50",
                            ].join(" ")}
                            onClick={() => {
                              setDataSource(d.value);
                              setPage(0);
                              setSearchTick((t) => t + 1);
                              setDataSourceMenuOpen(false);
                            }}
                          >
                            {intl.get(d.shortKey)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <label htmlFor="log-search-q" className="sr-only">
                  {intl.get("logSearch.queryLabel")}
                </label>
                <div
                  className={`flex min-h-0 items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-slate-600 dark:bg-slate-950 dark:ring-white/5 ${FILTER_BAR_H}`}
                >
                  <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-l-lg border-r border-slate-200/90 bg-white focus-within:ring-2 focus-within:ring-primary/20 dark:border-slate-600 dark:bg-slate-950 dark:focus-within:ring-primary/25">
                    <DiscoverQueryInput
                      id="log-search-q"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={intl.get("logSearch.discoverQueryPlaceholder")}
                      disabled={loading}
                    />
                  </div>
                  <div className="w-px shrink-0 self-stretch bg-slate-200 dark:bg-slate-600" aria-hidden />
                  <LogTimeRangePicker
                    timePreset={timePreset}
                    setTimePreset={setTimePreset}
                    customStart={customStart}
                    setCustomStart={setCustomStart}
                    customEnd={customEnd}
                    setCustomEnd={setCustomEnd}
                    disabled={loading}
                    onCommit={() => {
                      setPage(0);
                      setSearchTick((t) => t + 1);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className={`flex ${FILTER_BAR_H} w-11 shrink-0 items-center justify-center rounded-r-lg border-0 bg-blue-600 text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500`}
                    title={intl.get("logSearch.search")}
                    aria-label={intl.get("logSearch.search")}
                  >
                    {loading ? (
                      <Icon name="loading" className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Icon name="search" className="h-4 w-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {serverFieldFilters.length > 0 && (
              <div className="flex w-full flex-wrap items-center justify-start gap-2 border-t border-slate-200/70 pt-2 dark:border-slate-700/80">
                {serverFieldFilters.map((f) => {
                  const isExclude = !!f.exclude;
                  const isPinned = !!f.pinned;
                  const displayQuoted =
                    f.value === ""
                      ? intl.get("logSearch.fieldValueBlank")
                      : truncateFieldValuePreview(f.value);
                  const titleFull = `${isExclude ? "NOT " : ""}${labelForFieldKey(f.key)}: "${f.value === "" ? "" : f.value}"`;
                  const chipTint = isExclude
                    ? "bg-amber-700 ring-amber-500/40 dark:bg-amber-800 dark:ring-amber-500/30"
                    : "bg-blue-600 ring-blue-400/30 dark:bg-blue-600 dark:ring-blue-400/25";
                  const overlayTint = isExclude
                    ? "bg-amber-800/92 dark:bg-amber-900/90"
                    : "bg-blue-700/92 dark:bg-blue-800/90";
                  const iconBtn =
                    "flex min-h-[1.6rem] min-w-0 flex-1 items-center justify-center px-1.5 text-white transition hover:bg-white/15 active:bg-white/25 sm:min-h-[1.4rem]";
                  const actionBar = (
                    <span
                      className={[
                        "flex w-full min-w-0 items-stretch divide-x divide-white/40",
                        overlayTint,
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className={[iconBtn, !isExclude ? "bg-white/10" : ""].join(" ")}
                        title={intl.get("logSearch.filterChipInclude")}
                        aria-label={intl.get("logSearch.filterChipInclude")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFieldFilterPositive(f.id);
                        }}
                      >
                        <Icon name="filterInclude" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={[iconBtn, isPinned ? "bg-white/10" : ""].join(" ")}
                        title={intl.get("logSearch.filterChipPin")}
                        aria-label={intl.get("logSearch.filterChipPin")}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFieldFilterPin(f.id);
                        }}
                      >
                        <Icon name="filterPin" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={[iconBtn, isExclude ? "bg-white/10" : ""].join(" ")}
                        title={intl.get("logSearch.filterChipExclude")}
                        aria-label={intl.get("logSearch.filterChipExclude")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFieldFilterNegative(f.id);
                        }}
                      >
                        <Icon name="filterExclude" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        title={intl.get("logSearch.filterChipDelete")}
                        aria-label={intl.get("logSearch.filterChipDelete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeServerFieldFilter(f.id);
                        }}
                      >
                        <Icon name="filterTrash" className="h-4 w-4" />
                      </button>
                    </span>
                  );
                  return (
                    <span
                      key={f.id}
                      role="group"
                      tabIndex={0}
                      className={[
                        "group/chip relative flex max-w-full min-w-[10.5rem] flex-col overflow-hidden rounded-md text-[11px] font-mono font-medium leading-tight text-white shadow-sm ring-1 ring-inset transition sm:inline-flex sm:min-h-[1.4rem]",
                        chipTint,
                      ].join(" ")}
                    >
                      <span
                        className="relative z-0 flex w-full min-w-0 max-w-[min(100vw-10rem,26rem)] flex-1 items-center justify-center gap-x-1 truncate px-2.5 py-[calc(0.3rem*1.12)] text-center transition-opacity duration-150 sm:group-hover/chip:opacity-[0.28] sm:group-focus-within/chip:opacity-[0.28]"
                        title={titleFull}
                      >
                        {isPinned ? (
                          <Icon name="filterPin" className="h-3 w-3 shrink-0 text-white/90" />
                        ) : null}
                        {isExclude ? (
                          <span className="shrink-0 font-sans text-[10px] font-semibold uppercase text-amber-100/95">
                            {intl.get("logSearch.filterChipNotBadge")}
                          </span>
                        ) : null}
                        {labelForFieldKey(f.key)}: &quot;{escapeFilterChipQuoted(displayQuoted)}&quot;
                      </span>
                      <span className="relative z-[11] flex w-full justify-center sm:hidden">{actionBar}</span>
                      <span
                        className={[
                          "pointer-events-none invisible absolute inset-0 z-10 hidden opacity-0 transition-opacity duration-150 sm:flex",
                          "sm:group-hover/chip:pointer-events-auto sm:group-hover/chip:visible sm:group-hover/chip:opacity-100",
                          "sm:group-focus-within/chip:pointer-events-auto sm:group-focus-within/chip:visible sm:group-focus-within/chip:opacity-100",
                        ].join(" ")}
                      >
                        {actionBar}
                      </span>
                    </span>
                  );
                })}
                <div className="relative shrink-0" data-log-filter-ops>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-[calc(0.25rem*1.12)] text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-expanded={filterOpsOpen}
                    aria-haspopup="menu"
                    onClick={() => setFilterOpsOpen((o) => !o)}
                  >
                    {intl.get("logSearch.filterOps")}
                    <Icon name="chevron" className={`h-3.5 w-3.5 text-slate-500 transition dark:text-slate-400 ${filterOpsOpen ? "rotate-180" : ""}`} />
                  </button>
                  {filterOpsOpen && (
                    <div
                      className="absolute left-0 top-full z-[120] mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={clearAllServerFieldFilters}
                      >
                        {intl.get("logSearch.filterOpsClearAll")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch gap-0 overflow-hidden lg:min-h-0 lg:flex-1 lg:flex-row">
        <aside className="flex min-h-0 max-h-[min(40vh,320px)] w-full shrink-0 flex-col overflow-hidden border-slate-200/90 bg-slate-50/40 pl-0 lg:max-h-none lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0 lg:max-w-[min(100%,32rem)] lg:shrink-0 lg:self-stretch lg:border-r dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col gap-3 py-4 pl-0 pr-3 sm:pr-4 lg:flex-row lg:items-stretch lg:gap-2 lg:pr-3">
            <div
              className={[
                "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm transition-[width,min-width,max-width,padding] duration-200 ease-out dark:border-slate-700 dark:bg-slate-900/60",
                fieldsListCollapsed
                  ? "w-full flex-1 p-3 lg:h-full lg:min-h-0 lg:w-11 lg:min-w-[2.75rem] lg:max-w-[2.75rem] lg:flex-none lg:self-stretch lg:p-1.5"
                  : "w-full flex-1 p-3 lg:h-full lg:min-h-0 lg:w-[15rem] lg:max-w-[15rem] lg:flex-none lg:shrink-0 lg:self-stretch",
              ].join(" ")}
            >
              <button
                type="button"
                className={[
                  "flex w-full shrink-0 items-center gap-2 rounded-lg py-0.5 text-left -mx-0.5 px-0.5 transition hover:bg-slate-100/80 dark:hover:bg-slate-800/50",
                  fieldsListCollapsed
                    ? "mb-0 justify-center lg:mb-0 lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-start lg:gap-3 lg:px-0 lg:py-2"
                    : "mb-2 justify-between",
                ].join(" ")}
                aria-expanded={!fieldsListCollapsed}
                aria-controls="log-field-list-body"
                title={fieldsListCollapsed ? intl.get("common.expand") : intl.get("common.collapse")}
                onClick={() => setFieldsListCollapsed((c) => !c)}
              >
                <span
                  className={[
                    "text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500",
                    fieldsListCollapsed ? "lg:sr-only" : "",
                  ].join(" ")}
                >
                  {intl.get("logSearch.fieldsTitle")}
                </span>
                <Icon
                  name="chevron"
                  className={[
                    "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500",
                    fieldsListCollapsed ? "max-lg:rotate-0 lg:-rotate-90" : "rotate-180",
                  ].join(" ")}
                  aria-hidden
                />
              </button>
              <div
                id="log-field-list-body"
                className={
                  fieldsListCollapsed
                    ? "hidden"
                    : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                }
              >
                <input
                  type="search"
                  value={fieldFilter}
                  onChange={(e) => setFieldFilter(e.target.value)}
                  placeholder={intl.get("logSearch.fieldsFilterPlaceholder")}
                  className={`${INPUT} mb-2 shrink-0 py-1.5 text-xs`}
                  autoComplete="off"
                />
                <ul className="field-list-scroll max-h-[min(50vh,22rem)] min-w-0 space-y-0.5 text-sm lg:max-h-none lg:min-h-0 lg:flex-1">
                {filteredActiveColumns.map((c) => {
                  const panelOpen = fieldValuesOpenKey === c.key;
                  const colChecked = colVisible[c.key] !== false;
                  const disableColUncheck = colChecked && visibleColCount <= 1;
                  const ft = getFieldTypeMeta(c);
                  return (
                    <li key={c.key}>
                      <div
                        className={[
                          "flex items-start gap-1 rounded-lg px-1.5 py-1 transition",
                          panelOpen
                            ? "bg-primary/[0.12] ring-1 ring-inset ring-primary/25 dark:bg-primary/[0.18] dark:ring-primary/35"
                            : "hover:bg-slate-100/80 dark:hover:bg-slate-800/50",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={colChecked}
                          disabled={disableColUncheck}
                          onChange={() => toggleCol(c.key)}
                          className="mt-0.5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500"
                          aria-label={intl.get(c.labelKey)}
                          title={disableColUncheck ? intl.get("logSearch.tableKeepOneColumn") : undefined}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span
                          className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500"
                          title={ft.title}
                          aria-hidden={true}
                        >
                          <Icon name={ft.icon} className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setFieldValuesOpenKey((k) => (k === c.key ? null : c.key))}
                            aria-expanded={panelOpen}
                            className={[
                              "w-full rounded-md px-1 py-0.5 text-left font-mono text-[11px] leading-snug transition",
                              panelOpen
                                ? "font-semibold text-primary dark:text-primary"
                                : "text-slate-600 hover:bg-white/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/90 dark:hover:text-slate-100",
                            ].join(" ")}
                          >
                            {intl.get(c.labelKey)}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              </div>
            </div>

            {selectedFieldColumn && (
              <div
                className="flex min-h-[10rem] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 lg:min-h-0 lg:w-[13.5rem] lg:min-w-[12rem] lg:max-w-[17rem]"
                role="region"
                aria-label={intl.get("logSearch.fieldValuesPanelAria")}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/90 px-2.5 py-2 dark:border-slate-700">
                  <h4
                    className="min-w-0 truncate font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                    title={intl.get(selectedFieldColumn.labelKey)}
                  >
                    {intl.get(selectedFieldColumn.labelKey)}
                  </h4>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    aria-label={intl.get("common.close")}
                    onClick={() => setFieldValuesOpenKey(null)}
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </div>
                <div className="scrollbar-ui min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
                  {unifiedRows.length === 0 ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{intl.get("logSearch.fieldValuesEmpty")}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100/80 pr-0.5 dark:divide-slate-700/80">
                      {fieldValuesAggregation.map(({ value, count }, idx) => {
                        const isBlank = value === "";
                        const displayLine = isBlank ? intl.get("logSearch.fieldValueBlank") : truncateFieldValuePreview(value);
                        const titleText = isBlank ? intl.get("logSearch.fieldValueBlank") : value;
                        const sharePct =
                          fieldValuesTotalCount > 0 ? Math.min(100, (count / fieldValuesTotalCount) * 100) : 0;
                        const pctLabel = formatFieldValueSharePct(count, fieldValuesTotalCount);
                        const statTitle = `${count} · ${pctLabel}`;
                        return (
                          <li key={`${value}-${idx}`}>
                            <button
                              type="button"
                              disabled={!canApplyServerFieldFilter}
                              className={[
                                "group/fv relative flex w-full items-start gap-3 rounded-md py-0.5 pl-0.5 pr-0.5 text-left font-mono text-[10px] leading-tight transition",
                                canApplyServerFieldFilter
                                  ? "cursor-pointer text-slate-700 hover:bg-primary/[0.08] hover:ring-1 hover:ring-primary/15 dark:text-slate-300 dark:hover:bg-primary/10 dark:hover:ring-primary/25"
                                  : "cursor-not-allowed opacity-45 dark:opacity-50",
                              ].join(" ")}
                              title={
                                canApplyServerFieldFilter
                                  ? `${intl.get("logSearch.fieldValueClickToFilter")}${titleText ? ` — ${titleText} (${statTitle})` : ` (${statTitle})`}`
                                  : intl.get("logSearch.fieldFilterNotSupported")
                              }
                              onClick={() => addFieldValueAsFilter(selectedFieldColumn.key, value)}
                            >
                              <span
                                className="min-w-0 flex-1 break-words [word-break:break-word]"
                                title={titleText}
                              >
                                {displayLine}
                              </span>
                              <div className="relative ml-auto flex shrink-0 flex-col items-end gap-0.5">
                                {canApplyServerFieldFilter ? (
                                  <span className="pointer-events-none absolute right-full top-0 z-[1] mr-0.5 whitespace-nowrap rounded bg-primary/90 px-1 py-px text-[9px] font-medium text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover/fv:opacity-100 dark:bg-primary">
                                    {intl.get("logSearch.fieldValueHoverHint")}
                                  </span>
                                ) : null}
                                <div
                                  className="relative h-[0.6rem] w-[4rem] shrink-0 overflow-hidden rounded-full bg-sky-100/90 dark:bg-slate-700/70"
                                  title={statTitle}
                                  aria-hidden
                                >
                                  <div
                                    className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300 ease-out dark:bg-primary"
                                    style={{ width: `${sharePct}%` }}
                                  />
                                </div>
                                <div
                                  className="flex w-[4rem] flex-wrap items-baseline justify-between gap-x-1 gap-y-0 tabular-nums text-xs leading-snug text-slate-600 dark:text-slate-400"
                                  title={statTitle}
                                >
                                  <span className="font-medium text-slate-700 dark:text-slate-300">{pctLabel}</span>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">{count}</span>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="scrollbar-ui flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto pb-0 pt-4 lg:min-h-0">
          <div className="shrink-0">
            <DiscoverHistogram
              bars={histogramData.bars}
              histSelectTitle={histogramData.histSelectTitle}
              loading={loading && !payload}
              histInterval={histInterval}
              onHistInterval={setHistInterval}
              rangeSummary={rangeSummaryText}
              onBucketClick={histogramData.bars.length > 0 ? onHistogramBucketClick : undefined}
            />
          </div>

          {error && (
            <div className="shrink-0 rounded-xl border border-rose-200/90 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
              {error}
            </div>
          )}

          <section
            className="relative flex min-w-0 shrink-0 flex-col app-card px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:min-h-0 lg:shrink-0"
            style={lgUp ? undefined : { minHeight: logTableCardMinHeight }}
          >
            {tableBusy && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-gray-200 dark:bg-gray-700">
                <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary to-transparent bg-[length:200%_100%]" />
              </div>
            )}

            <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:gap-0">
                <div className="flex items-center whitespace-nowrap py-0.5">
                  <select
                    aria-label={intl.get("logSearch.pageSize")}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(0);
                    }}
                    className="app-input min-w-[5.25rem] py-1.5 pl-2 pr-7 text-xs"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {intl.get("logSearch.pageSizeOption", { n })}
                      </option>
                    ))}
                  </select>
                </div>

                <nav
                  className="inline-flex items-center gap-0.5 border-gray-200 sm:border-l sm:pl-3 dark:border-gray-700"
                  aria-label={intl.get("logSearch.paginationNav")}
                >
                  <button
                    type="button"
                    disabled={page <= 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 transition-colors ${
                      page <= 0 || loading
                        ? "cursor-not-allowed text-gray-300 dark:text-gray-600"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`}
                    aria-label={intl.get("logSearch.prev")}
                  >
                    <Icon name="chevronLeft" className="h-4 w-4" />
                  </button>
                  {paginationBarItems.map((item) =>
                    item.type === "ellipsis" ? (
                      <span key={item.key} className="px-1.5 text-sm text-gray-400 dark:text-gray-500" aria-hidden>
                        …
                      </span>
                    ) : (
                      <button
                        key={item.key}
                        type="button"
                        disabled={loading}
                        onClick={() => setPage(item.n - 1)}
                        aria-current={page + 1 === item.n ? "page" : undefined}
                        className={
                          page + 1 === item.n
                            ? "inline-flex min-h-8 min-w-8 items-center justify-center border border-primary px-2 text-sm font-medium text-primary dark:border-primary"
                            : "inline-flex min-h-8 min-w-8 items-center justify-center border border-transparent px-2 text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                        }
                      >
                        {item.n}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={page + 1 >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 transition-colors ${
                      page + 1 >= totalPages || loading
                        ? "cursor-not-allowed text-gray-300 dark:text-gray-600"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`}
                    aria-label={intl.get("logSearch.next")}
                  >
                    <Icon name="chevronRight" className="h-4 w-4" />
                  </button>
                </nav>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <div className="relative shrink-0" data-log-download>
                  <button
                    type="button"
                    aria-expanded={downloadMenuOpen}
                    aria-haspopup="menu"
                    aria-label={intl.get("logSearch.downloadMenuAria")}
                    disabled={unifiedRows.length === 0}
                    className="app-btn-outline inline-flex items-center gap-1.5 py-1.5 pl-2.5 pr-2 text-xs"
                    title={intl.get("logSearch.downloadPage")}
                    onClick={() => setDownloadMenuOpen((o) => !o)}
                  >
                    <Icon name="download" className="h-3.5 w-3.5" />
                    {intl.get("logSearch.downloadPage")}
                    <Icon
                      name="chevron"
                      className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 ${downloadMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {downloadMenuOpen ? (
                    <div
                      className="absolute right-0 top-full z-[45] mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-gray-900/5 dark:border-gray-600 dark:bg-gray-900 dark:ring-white/5"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-800 transition hover:bg-primary/10 dark:text-gray-100 dark:hover:bg-primary/15"
                        onClick={downloadCurrentPageCsv}
                      >
                        {intl.get("logSearch.downloadCsv")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-800 transition hover:bg-primary/10 dark:text-gray-100 dark:hover:bg-primary/15"
                        onClick={downloadCurrentPageExcel}
                      >
                        {intl.get("logSearch.downloadExcel")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-800 transition hover:bg-primary/10 dark:text-gray-100 dark:hover:bg-primary/15"
                        onClick={downloadCurrentPageTxtJsonLines}
                      >
                        {intl.get("logSearch.downloadTxtJsonLines")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSearchTick((t) => t + 1)}
                  disabled={loading}
                  className="app-btn-outline inline-flex shrink-0 items-center gap-1.5 py-1.5 pl-2.5 pr-3 text-xs"
                  title={intl.get("logSearch.manualRefresh")}
                >
                  <Icon name="refresh" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  {intl.get("logSearch.manualRefresh")}
                </button>
              </div>
            </div>

            <div
              className={[
                "flex shrink-0 flex-col overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800 lg:min-h-0",
                lgUp && !lgTableHasRows ? "lg:flex-1" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div {...logTableScrollAreaProps}>
                <table
                  className={[
                    "w-full min-w-[1000px] border-collapse text-left text-sm",
                    lgUp && !lgTableHasRows ? "h-full min-h-full" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <thead className="sticky top-0 z-[1]">
                    <tr className="border-b border-gray-100 bg-gray-50/95 text-xs font-medium text-gray-500 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-800/95 dark:text-gray-400">
                      <th className="w-14 min-w-[3.25rem] py-2 pl-3.5 pr-1 align-bottom" scope="col">
                        <div ref={colPickerAnchorRef} className="relative flex justify-center pt-1" data-log-col-picker>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-200/90 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                            aria-expanded={colPickerOpen}
                            aria-haspopup="listbox"
                            aria-label={intl.get("logSearch.tableColumnPicker")}
                            title={intl.get("logSearch.tableColumnPicker")}
                            onClick={() => setColPickerOpen((o) => !o)}
                          >
                            <Icon name="viewColumns" className="h-4 w-4" />
                          </button>
                          {colPickerOpen &&
                            colPickerFixedRect &&
                            createPortal(
                              <div
                                data-log-col-picker
                                style={{
                                  position: "fixed",
                                  top: colPickerFixedRect.top,
                                  left: colPickerFixedRect.left,
                                  width: colPickerFixedRect.width,
                                }}
                                className="z-[200] max-h-[min(70vh,18rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg dark:border-gray-600 dark:bg-gray-900"
                                role="listbox"
                                aria-label={intl.get("logSearch.tableColumnPicker")}
                              >
                                <div className="border-b border-gray-100 dark:border-gray-700">
                                  <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    {intl.get("logSearch.tableColumnPicker")}
                                  </p>
                                  <div className="flex flex-wrap gap-2 px-2.5 pb-2">
                                    <button
                                      type="button"
                                      className="rounded-md px-2 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-primary/15"
                                      disabled={allColumnsVisible || activeColumns.length === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectAllColumns();
                                      }}
                                    >
                                      {intl.get("logSearch.colPickerSelectAll")}
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                                      disabled={activeColumns.length <= 1 || onlyFirstColumnVisible}
                                      title={intl.get("logSearch.colPickerDeselectAllHint")}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        leaveFirstColumnOnly();
                                      }}
                                    >
                                      {intl.get("logSearch.colPickerDeselectAll")}
                                    </button>
                                  </div>
                                </div>
                                <ul className="space-y-0.5 px-1.5 pt-1">
                                  {activeColumns.map((c) => {
                                    const checked = colVisible[c.key] !== false;
                                    const disableUncheck = checked && visibleColCount <= 1;
                                    return (
                                      <li key={c.key}>
                                        <label
                                          className={[
                                            "flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5",
                                            disableUncheck ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50 dark:hover:bg-gray-800/80",
                                          ].join(" ")}
                                          title={disableUncheck ? intl.get("logSearch.tableKeepOneColumn") : undefined}
                                        >
                                          <input
                                            type="checkbox"
                                            className="mt-0.5 shrink-0 rounded border-gray-300 text-primary focus:ring-primary/30 dark:border-gray-600"
                                            checked={checked}
                                            disabled={disableUncheck}
                                            onChange={() => toggleCol(c.key)}
                                          />
                                          <span className="min-w-0 break-words font-mono text-[11px] leading-snug text-gray-800 dark:text-gray-100">
                                            {intl.get(c.labelKey)}
                                          </span>
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>,
                              document.body,
                            )}
                        </div>
                      </th>
                      {activeColumns
                        .filter((c) => colVisible[c.key] !== false)
                        .map((c) => (
                          <th key={c.key} className="group/th relative max-w-[18rem] px-2 py-2 align-bottom">
                            <div className="relative flex min-h-[1.5rem] items-center">
                              <span
                                className={`min-w-0 flex-1 truncate leading-tight text-gray-600 dark:text-gray-300 ${visibleColCount > 1 ? "pr-7" : ""}`}
                                title={intl.get(c.labelKey)}
                              >
                                {intl.get(c.labelKey)}
                              </span>
                              {visibleColCount > 1 ? (
                                <button
                                  type="button"
                                  className={[
                                    "pointer-events-none absolute right-0 top-1/2 z-[2] inline-flex -translate-y-1/2 shrink-0 rounded-md p-1 text-gray-500 opacity-0 shadow-md ring-1 ring-gray-200/90 transition-all duration-150",
                                    "bg-white hover:bg-gray-50 hover:text-gray-800 dark:bg-gray-800 dark:ring-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-100",
                                    "group-hover/th:pointer-events-auto group-hover/th:opacity-100",
                                    "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                                  ].join(" ")}
                                  title={intl.get("logSearch.tableHideColumn")}
                                  aria-label={`${intl.get("logSearch.tableHideColumn")}: ${intl.get(c.labelKey)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCol(c.key);
                                  }}
                                >
                                  <Icon name="eyeSlash" className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y divide-gray-100 transition-opacity duration-200 dark:divide-gray-800 ${tableBusy ? "opacity-55" : "opacity-100"} ${lgUp && !lgTableHasRows ? "lg:h-full" : ""}`}
                  >
                    {unifiedRows.length === 0 && !loading && (
                      <tr className={lgUp ? "lg:h-full" : ""}>
                        <td
                          colSpan={visibleColCount + 1}
                          className={`px-4 py-10 text-center text-gray-500 dark:text-gray-400 ${lgUp ? "lg:h-full lg:align-middle lg:py-0" : ""}`}
                        >
                          <div>
                            <p className="text-sm">{intl.get("logSearch.empty")}</p>
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{intl.get("logSearch.emptyHint")}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {loading && unifiedRows.length === 0 && (
                      <tr className={lgUp ? "lg:h-full" : ""}>
                        <td
                          colSpan={visibleColCount + 1}
                          className={`px-4 py-16 text-center align-middle text-gray-500 dark:text-gray-400 ${lgUp ? "lg:h-full lg:min-h-[12rem]" : ""}`}
                        >
                          <Icon name="refresh" className="mx-auto h-7 w-7 animate-spin opacity-70" aria-hidden />
                        </td>
                      </tr>
                    )}
                    {unifiedRows.map((row, idx) => {
                      const id = rowKey(row, idx);
                      const isOpen = expanded === id;
                      return (
                        <Fragment key={id}>
                          <tr
                            role="button"
                            tabIndex={0}
                            aria-expanded={isOpen}
                            className={`cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 ${logSearchRowBgClass(isOpen)}`}
                            onClick={(e) => {
                              if (e.target.closest("button,a")) return;
                              setExpanded((ex) => (ex === id ? "" : id));
                            }}
                            onKeyDown={(ev) => {
                              if (ev.target !== ev.currentTarget) return;
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                setExpanded((ex) => (ex === id ? "" : id));
                              }
                            }}
                          >
                            <td className="py-0.5 pl-3.5 pr-1 align-middle" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-label={isOpen ? intl.get("logSearch.collapseDoc") : intl.get("logSearch.expandDoc")}
                                onClick={() => setExpanded((ex) => (ex === id ? "" : id))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                              >
                                <Icon name={isOpen ? "chevron" : "chevronRight"} className="h-4 w-4 transition-transform duration-200" />
                              </button>
                            </td>
                            {activeColumns.filter((c) => colVisible[c.key] !== false).map((col) => renderUnifiedColumnTd(row, col))}
                          </tr>
                          {isOpen && (
                            <tr className="bg-gray-50/90 dark:bg-gray-900/70">
                              <td colSpan={visibleColCount + 1} className="border-t border-gray-200 p-0 align-top dark:border-gray-700">
                                <div
                                  className="box-border min-w-0 max-w-[min(100%,calc(100vw-1rem))] p-4 sm:max-w-[min(100%,calc(100vw-2rem))]"
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 dark:border-gray-700">
                                    <div
                                      className="flex flex-wrap gap-1"
                                      role="tablist"
                                      aria-label={intl.get("logSearch.detailTitle")}
                                    >
                                      <button
                                        type="button"
                                        role="tab"
                                        aria-selected={logDetailMode === "list"}
                                        className={[
                                          "rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition",
                                          logDetailMode === "list"
                                            ? "border-gray-200 bg-white text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-primary"
                                            : "border-transparent bg-transparent text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-100",
                                        ].join(" ")}
                                        onClick={() => setLogDetailMode("list")}
                                      >
                                        {intl.get("logSearch.detailModeList")}
                                      </button>
                                      <button
                                        type="button"
                                        role="tab"
                                        aria-selected={logDetailMode === "raw"}
                                        className={[
                                          "rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition",
                                          logDetailMode === "raw"
                                            ? "border-gray-200 bg-white text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-primary"
                                            : "border-transparent bg-transparent text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-100",
                                        ].join(" ")}
                                        onClick={() => setLogDetailMode("raw")}
                                      >
                                        {intl.get("logSearch.detailModeRaw")}
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setExpanded("")}
                                      className="app-btn-outline shrink-0 px-3 py-1.5 text-xs"
                                    >
                                      {intl.get("common.collapse")}
                                    </button>
                                  </div>
                                  <div className="min-h-[12rem] min-w-0 max-w-full overflow-x-hidden rounded-b-lg border border-t-0 border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
                                    <div className="mb-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="app-btn-outline px-2.5 py-1.5 text-xs"
                                        onClick={() => {
                                          setSessionId(row.sessionId || "");
                                          setPage(0);
                                          setSearchTick((t) => t + 1);
                                        }}
                                        disabled={!row.sessionId}
                                      >
                                        {intl.get("logSearch.action.sameSession")}
                                      </button>
                                      <button
                                        type="button"
                                        className="app-btn-outline px-2.5 py-1.5 text-xs"
                                        onClick={() => {
                                          setTraceId(row.traceId || "");
                                          setPage(0);
                                          setSearchTick((t) => t + 1);
                                        }}
                                        disabled={!row.traceId}
                                      >
                                        {intl.get("logSearch.action.sameTrace")}
                                      </button>
                                    </div>
                                    {logDetailMode === "list" ? (
                                      <LogDetailListView
                                        row={row}
                                        columns={activeColumns}
                                        onAddFieldFilter={addFieldValueAsFilter}
                                        canAddFieldFilter={canApplyServerFieldFilter}
                                        highlightRe={searchHighlightRe}
                                      />
                                    ) : (
                                      (() => {
                                        const rawText = formatLogRawForDetail(row._raw);
                                        return (
                                          <div className="min-w-0 max-w-full overflow-x-hidden" role="tabpanel">
                                            <p className="mb-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                              {intl.get("logSearch.documentJson")}
                                            </p>
                                            <CodeBlock
                                              text={rawText}
                                              variant="auto"
                                              height="2xl"
                                              className="text-left [&_pre]:break-all [&_pre]:overflow-x-hidden [&_pre]:!max-h-[27rem]"
                                            >
                                              {rawText}
                                            </CodeBlock>
                                          </div>
                                        );
                                      })()
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
            {loading && !payload && (
              <div className="mt-4 shrink-0 border-t border-gray-100 px-2 py-3 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {intl.get("logSearch.loading")}
              </div>
            )}
          </section>
        </main>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
