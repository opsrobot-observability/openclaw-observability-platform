import { useEffect, useMemo, useState } from "react";
import CopyButton from "../components/CopyButton.jsx";
import CodeBlock from "../components/CodeBlock.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import TablePagination, { DEFAULT_TABLE_PAGE_SIZE } from "../components/TablePagination.jsx";
import {
  agentSessionsLogsRowsToLines,
  mapAgentSessionRows,
  sortSessionRows,
  sessionRowId,
  parseSessionJsonl,
  summarizeJsonlLine,
  buildSessionTrace,
  formatDurationMs,
  extractToolInvocations,
  extractNetworkAndFileOps,
  extractMessageLines,
  messageTextContent,
  extractSessionRisks,
  extractIntentRecognitionDetails,
  extractModelInvocationRecords,
  traceRiskLevelLabel,
  computeSessionRiskMaps,
} from "../lib/sessionAudit.js";
import intl from "react-intl-universal";

function formatMs(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return "—";
  try {
    return new Date(Number(ms)).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function num(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("zh-CN");
}

function pct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

/** 溯源时间线节点：与「风险感知」同源（高/中/低/健康） */
function traceTimelineDotClass(level) {
  switch (level) {
    case "high":
      return "bg-red-500 ring-red-400/90 dark:bg-red-600 dark:ring-red-500/60";
    case "medium":
      return "bg-amber-500 ring-amber-400/90 dark:bg-amber-600 dark:ring-amber-500/60";
    case "low":
      return "bg-sky-500 ring-sky-400/90 dark:bg-sky-600 dark:ring-sky-500/60";
    case "healthy":
    default:
      return "bg-emerald-500 ring-emerald-400/90 dark:bg-emerald-600 dark:ring-emerald-500/60";
  }
}

function traceMiniBarDotClass(level) {
  switch (level) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-sky-500";
    case "healthy":
    default:
      return "bg-emerald-500";
  }
}

/** 溯源卡片内风险等级徽章（与时间轴圆点配色一致） */
function traceRiskBadgeClass(level) {
  switch (level) {
    case "high":
      return "bg-red-50 text-red-800 ring-red-200/90 dark:bg-red-950/55 dark:text-red-200 dark:ring-red-400/45";
    case "medium":
      return "bg-amber-50 text-amber-900 ring-amber-200/90 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/30";
    case "low":
      return "bg-sky-50 text-sky-900 ring-sky-200/90 dark:bg-sky-950/45 dark:text-sky-200 dark:ring-sky-500/30";
    case "healthy":
    default:
      return "bg-emerald-50 text-emerald-900 ring-emerald-200/90 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/25";
  }
}

/** 悬停提示：等级 + 原因（与「风险感知」同源） */
function traceRiskHoverTitle(riskLevel, riskReasonText) {
  const label = traceRiskLevelLabel(riskLevel);
  const reason = (riskReasonText ?? "").trim().replace(/\s+/g, " ");
  const flat = reason.replace(/\n/g, "；");
  if (flat) {
    return intl.get("sessionAudit.riskHoverReason", { label, reason: flat });
  }
  return intl.get("sessionAudit.riskHoverNoRule", { label });
}

/** 对话详情：仅高/中/低，与溯源风险配色一致 */
function chatRiskSeverityBadgeClass(severity) {
  switch (severity) {
    case "high":
      return "bg-red-50 text-red-800 ring-red-200/90 dark:bg-red-950/55 dark:text-red-200 dark:ring-red-400/45";
    case "medium":
      return "bg-amber-50 text-amber-900 ring-amber-200/90 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/30";
    case "low":
      return "bg-sky-50 text-sky-900 ring-sky-200/90 dark:bg-sky-950/45 dark:text-sky-200 dark:ring-sky-500/30";
    default:
      return "";
  }
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  if (Math.abs(x) < 1e-6) return x.toFixed(8);
  if (x < 0.01) return x.toFixed(6);
  return x.toFixed(4);
}

function strArgs(obj) {
  try {
    const s = JSON.stringify(obj);
    return s.length > 220 ? `${s.slice(0, 220)}…` : s;
  } catch {
    return "—";
  }
}

const DETAIL_TABS = [
  { id: "trace", labelKey: "sessionAudit.tabTimeline" },
  { id: "chat", labelKey: "sessionAudit.tabConversation" },
  { id: "tools", labelKey: "sessionAudit.keyEvidence" },
  { id: "model", labelKey: "sessionAudit.tabModel" },
];

function summaryStrip(row) {
  const o = { ...row };
  delete o._doris;
  delete o._source;
  delete o.skillsSnapshot;
  if (o.systemPromptReport && typeof o.systemPromptReport === "object") {
    o.systemPromptReport = {
      ...o.systemPromptReport,
      systemPrompt: o.systemPromptReport.systemPrompt ? "[省略]" : undefined,
    };
  }
  return JSON.stringify(o, null, 2);
}

/** 路径：整体统一颜色显示 */
function NetPathHighlight({ path }) {
  if (path == null || path === "") return <span className="text-gray-400">—</span>;
  return <span className="break-all text-gray-800 dark:text-gray-200">{String(path)}</span>;
}

/** URL：协议、主机、路径分段着色 */
function NetUrlHighlight({ url }) {
  const u = String(url ?? "");
  const m = u.match(/^(https?:\/\/)([^/?#]+)([^]*)$/i);
  if (!m) {
    return <span className="break-all font-medium text-sky-800">{u}</span>;
  }
  return (
    <span className="break-all">
      <span className="text-sky-600">{m[1]}</span>
      <span className="font-semibold text-violet-700">{m[2]}</span>
      <span className="text-gray-800">{m[3]}</span>
    </span>
  );
}

/** 命令：首个可执行片段琥珀强调，其余正文色 */
function NetCommandHighlight({ command }) {
  const c = command == null ? "" : String(command);
  if (!c) return <span className="text-gray-400">—</span>;
  const match = c.match(/^(\S+)([\s\S]*)$/);
  if (!match) return <span className="text-gray-900">{c}</span>;
  return (
    <span className="break-all">
      <span className="font-semibold text-amber-800">{match[1]}</span>
      <span className="text-gray-800">{match[2]}</span>
    </span>
  );
}

function netFileOpBadgeClass(op) {
  const o = (op ?? "write").toLowerCase();
  if (o === "edit") return "bg-blue-50 text-blue-800 ring-blue-200/80";
  return "bg-orange-50 text-orange-800 ring-orange-200/80";
}

const RISK_CATEGORY_LABEL = {
  parse_error: "sessionAudit.riskCategory.parseError",
  custom_error: "sessionAudit.riskCategory.customError",
  tool_error: "sessionAudit.riskCategory.toolError",
  exit_code: "sessionAudit.riskCategory.exitCode",
  process_status: "sessionAudit.riskCategory.processStatus",
  stop_reason: "sessionAudit.riskCategory.stopReason",
  sensitive_command: "sessionAudit.riskCategory.sensitiveCommand",
  timeline_gap: "sessionAudit.riskCategory.timelineGap",
  explicit_risk: "sessionAudit.riskCategory.explicitRisk",
};

function riskSeverityPanelClass(sev) {
  switch (sev) {
    case "high":
      return "border-l-red-500 bg-red-50/90";
    case "medium":
      return "border-l-amber-500 bg-amber-50/80";
    default:
      return "border-l-slate-400 bg-slate-50/90";
  }
}

function riskSeverityBadgeClass(sev) {
  switch (sev) {
    case "high":
      return "bg-red-100 text-red-800 ring-red-200/80";
    case "medium":
      return "bg-amber-100 text-amber-900 ring-amber-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

function auditRowView(row) {
  const high = Number(row.riskHigh) || 0;
  const medium = Number(row.riskMedium) || 0;
  const low = Number(row.riskLow) || 0;
  const network = Number(row.networkAccessCount) || 0;
  const file = Number(row.fileOpCount) || 0;
  const exec = Number(row.execCount) || 0;
  const tool = Number(row.toolUseCount) || 0;
  const aborted = Boolean(row.abortedLastRun);
  const worstRiskLevel = high > 0 ? "high" : medium > 0 ? "medium" : low > 0 ? "low" : "clean";
  return {
    high,
    medium,
    low,
    network,
    file,
    exec,
    tool,
    aborted,
    worstRiskLevel,
    riskScore: high * 1000 + medium * 100 + low * 10 + (aborted ? 5 : 0),
    hasNetworkEvidence: network > 0,
    hasFileEvidence: file > 0,
    hasExecEvidence: exec > 0,
    hasToolEvidence: tool > 0,
    hasAbortedSignal: aborted,
  };
}

function auditRiskLabel(level) {
  switch (level) {
    case "high":
      return intl.get("sessionAudit.riskHigh");
    case "medium":
      return intl.get("sessionAudit.riskMedium");
    case "low":
      return intl.get("sessionAudit.riskLow");
    case "clean":
    default:
      return intl.get("sessionAudit.riskClean");
  }
}

function auditRiskBadgeClass(level) {
  switch (level) {
    case "high":
      return "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-400/40";
    case "medium":
      return "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/30";
    case "low":
      return "bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/45 dark:text-sky-200 dark:ring-sky-500/30";
    case "clean":
    default:
      return "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/25";
  }
}

function evidenceBadgeClass(active) {
  return active
    ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100"
    : "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-slate-700";
}

function kindBadgeClass(kind) {
  switch (kind) {
    case "session":
      return "bg-blue-50 text-blue-800 ring-blue-600/15";
    case "user":
      return "bg-slate-100 text-slate-800 ring-slate-500/15";
    case "assistant":
      return "bg-primary-soft text-primary ring-primary/20";
    case "toolResult":
      return "bg-amber-50 text-amber-900 ring-amber-600/15";
    case "model_change":
      return "bg-violet-50 text-violet-800 ring-violet-600/15";
    case "thinking_level_change":
      return "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-600/15";
    case "snapshot":
      return "bg-cyan-50 text-cyan-800 ring-cyan-600/15";
    case "error":
      return "bg-red-50 text-red-800 ring-red-600/20";
    default:
      return "bg-gray-100 text-gray-700 ring-gray-500/15";
  }
}

function ChatAssistantMessageBody({ msg, strArgs }) {
  const content = Array.isArray(msg.content) ? msg.content : [];
  return (
    <div className="space-y-2">
      {content.map((c, i) => {
        if (!c || !c.type) return null;
        if (c.type === "text" && c.text) {
          return (
            <p key={i} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
              {c.text}
            </p>
          );
        }
        if (c.type === "thinking" && c.thinking) {
          return (
            <details key={i} className="rounded-lg border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-xs text-violet-900">
              <summary className="cursor-pointer select-none font-medium text-violet-800">{intl.get("sessionAudit.thinking")}</summary>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{c.thinking}</p>
            </details>
          );
        }
        if (c.type === "toolCall") {
          return (
            <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/90 px-3 pb-2 pt-1">
              <div className="mb-1 text-xs font-semibold text-primary">
                {intl.get("sessionAudit.toolCall")} · <span className="font-mono">{c.name ?? "—"}</span>
              </div>
              <div className="relative pr-8">
                <CodeBlock text={strArgs(c.arguments)} variant="light" height="md" font="mono" className="max-h-48">
                  {strArgs(c.arguments)}
                </CodeBlock>
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/**
 * 图标库 (Inline SVGs for high performance and no dependencies)
 */
const Icons = {
  Risk: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Evidence: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Clock: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Terminal: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Agent: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Model: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Database: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Coins: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Calendar: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Zap: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  File: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
};

/**
 * 单会话下钻：索引元数据 + 拉取 `public/sessions/{session_id}.jsonl` 时间线
 */
function SessionAuditDetail({ row }) {
  const [jsonlLines, setJsonlLines] = useState([]);
  const [jsonlStatus, setJsonlStatus] = useState("idle");
  const [jsonlError, setJsonlError] = useState(null);
  const [rawOpen, setRawOpen] = useState(() => new Set());
  const [detailTab, setDetailTab] = useState("trace");
  /** 溯源回放：enriched 数组下标；null 表示未选中或已结束 */
  const [replayStep, setReplayStep] = useState(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  /** 溯源分析固定按时间先后顺序 */
  const trace = useMemo(() => buildSessionTrace(jsonlLines, "time"), [jsonlLines]);
  const toolData = useMemo(() => extractToolInvocations(jsonlLines), [jsonlLines]);
  const netFileData = useMemo(() => extractNetworkAndFileOps(jsonlLines), [jsonlLines]);
  const chatMessages = useMemo(() => extractMessageLines(jsonlLines), [jsonlLines]);
  const chatRiskMaps = useMemo(() => computeSessionRiskMaps(jsonlLines), [jsonlLines]);
  const riskItems = useMemo(() => extractSessionRisks(jsonlLines), [jsonlLines]);
  const riskMapByLine = useMemo(() => {
    const map = new Map();
    const score = { high: 3, medium: 2, low: 1 };
    riskItems.forEach((r) => {
      const prev = map.get(r.lineIndex);
      if (!prev || (score[r.severity] || 0) > (score[prev.severity] || 0)) {
        map.set(r.lineIndex, r);
      }
    });
    return map;
  }, [riskItems]);
  const modelInvocations = useMemo(() => extractModelInvocationRecords(jsonlLines), [jsonlLines]);
  const rowAudit = useMemo(() => auditRowView(row), [row]);

  useEffect(() => {
    const sid = row.session_id;
    if (!sid) {
      setJsonlStatus("error");
      setJsonlError("该记录缺少 session_id，无法加载会话转写。");
      setJsonlLines([]);
      return;
    }
    let cancelled = false;
    setJsonlStatus("loading");
    setJsonlError(null);

    (async () => {
      try {
        const r = await fetch(`/api/agent-sessions-logs?sessionId=${encodeURIComponent(sid)}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        if (!Array.isArray(data)) throw new Error(intl.get("sessionAudit.invalidResponseFormat"));
        if (cancelled) return;
        setJsonlLines(agentSessionsLogsRowsToLines(data));
        setJsonlStatus("ok");
        setJsonlError(null);
      } catch (e) {
        try {
          const r2 = await fetch(`/sessions/${encodeURIComponent(sid)}.jsonl`);
          if (!r2.ok) throw new Error(String(r2.status));
          const text = await r2.text();
          if (cancelled) return;
          setJsonlLines(parseSessionJsonl(text));
          setJsonlStatus("ok");
          setJsonlError(
            intl.get("sessionAudit.logsFallback", {
              sid,
              error: e.message || String(e),
            }),
          );
        } catch (e2) {
          if (cancelled) return;
          setJsonlLines([]);
          setJsonlStatus("error");
          setJsonlError(
            intl.get("sessionAudit.transcriptLoadFailed", {
              sid,
              error: e.message || String(e),
            }),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [row.session_id]);

  useEffect(() => {
    setRawOpen(new Set());
  }, [jsonlLines]);

  useEffect(() => {
    setDetailTab("trace");
  }, [row.session_id]);

  useEffect(() => {
    setReplayPlaying(false);
    setReplayStep(null);
  }, [jsonlLines]);

  useEffect(() => {
    if (detailTab !== "trace") {
      setReplayPlaying(false);
      setReplayStep(null);
    }
  }, [detailTab]);

  useEffect(() => {
    if (replayStep === null || !replayPlaying) return;
    const el = document.getElementById(`trace-replay-${replayStep}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [replayStep, replayPlaying]);

  useEffect(() => {
    if (!replayPlaying || replayStep === null) return;
    const n = trace.enriched.length;
    if (n === 0) return;
    const isLast = replayStep >= n - 1;
    const delay = isLast ? 1600 : 900;
    const timer = window.setTimeout(() => {
      if (isLast) {
        setReplayPlaying(false);
        setReplayStep(null);
      } else {
        setReplayStep((s) => (s == null ? 0 : s + 1));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [replayPlaying, replayStep, trace.enriched.length]);

  const toggleRaw = (originalIndex) => {
    setRawOpen((prev) => {
      const n = new Set(prev);
      if (n.has(originalIndex)) n.delete(originalIndex);
      else n.add(originalIndex);
      return n;
    });
  };

  /** 风险项 →「溯源分析」时间线对应行并展开原始 JSON，滚动到可视区 */
  const openRiskSourceLine = (lineIndex) => {
    if (lineIndex < 0 || lineIndex >= jsonlLines.length) return;
    setDetailTab("trace");
    setRawOpen((prev) => {
      const n = new Set(prev);
      n.add(lineIndex);
      return n;
    });
    const enrichedIdx = trace.enriched.findIndex((e) => e.originalIndex === lineIndex);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (enrichedIdx >= 0) {
          document.getElementById(`trace-replay-${enrichedIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 80);
    });
  };

  return (
    <div className="space-y-4">
      <section className="app-card overflow-hidden">
        {/* Compact Integrated Header */}
        <div className="flex flex-col border-b border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 lg:flex-row lg:items-stretch">
          {/* Left Side: Info & Tags */}
          <div className="flex flex-1 flex-col justify-between border-gray-100 dark:border-gray-800 lg:border-r lg:pr-6">
            <div className="flex items-start gap-4">
              <div className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm ring-4 ring-white dark:ring-gray-800",
                rowAudit.worstRiskLevel === "high" ? "bg-red-50 text-red-600" :
                  rowAudit.worstRiskLevel === "medium" ? "bg-amber-50 text-amber-600" :
                    "bg-emerald-50 text-emerald-600"].join(" ")}>
                <Icons.Risk />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {row.label || intl.get("sessionAudit.investigationSummary")}
                  </h3>
                  <span
                    className={[
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                      auditRiskBadgeClass(rowAudit.worstRiskLevel),
                    ].join(" ")}
                  >
                    <Icons.Risk />
                    {intl.get("sessionAudit.worstRisk")}: {auditRiskLabel(rowAudit.worstRiskLevel)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary-soft/30 px-2 py-1 font-mono text-[10px] font-semibold text-primary">
                    <Icons.Zap />
                    {row.sessionKey || "—"}
                  </div>
                  {row.session_id && (
                    <div className="flex items-center rounded-md border border-gray-100 bg-gray-50/50 px-2 py-1 font-mono text-[10px] text-gray-500 dark:border-gray-800 dark:bg-gray-900/50">
                      {row.session_id}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: 4 Horizontal Cards */}
          <div className="mt-4 grid shrink-0 gap-3 sm:grid-cols-2 lg:mt-0 lg:flex lg:items-center lg:pl-6">
            <button
              type="button"
              onClick={() => setDetailTab("tools")}
              title={`${intl.get("sessionAudit.tooltip.high")}: H / ${intl.get("sessionAudit.tooltip.medium")}: M / ${intl.get("sessionAudit.tooltip.low")}: L`}
              className="flex h-full min-w-[120px] flex-col items-center justify-center rounded-xl border border-red-50 bg-red-50/30 p-3 text-center transition-all hover:bg-red-50 dark:border-red-900/20 dark:bg-red-950/10"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">{intl.get("sessionAudit.findingCounts")}</p>
              <p className="mt-1 text-sm font-bold">
                <span className="text-red-600">H{rowAudit.high}</span>
                <span className="mx-1 text-gray-300">/</span>
                <span className="text-amber-500">M{rowAudit.medium}</span>
                <span className="mx-1 text-gray-300">/</span>
                <span className="text-sky-600">L{rowAudit.low}</span>
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDetailTab("tools")}
              title={`${intl.get("sessionAudit.tooltip.tool")}: T / ${intl.get("sessionAudit.tooltip.network")}: N / ${intl.get("sessionAudit.tooltip.file")}: F / ${intl.get("sessionAudit.tooltip.exec")}: E`}
              className="flex h-full min-w-[120px] flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50/30 p-3 text-center transition-all hover:bg-white dark:border-gray-800 dark:bg-gray-900/50"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{intl.get("sessionAudit.keyEvidence")}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-gray-100">
                <span>T{rowAudit.tool}</span>
                <span className="text-gray-300">·</span>
                <span>N{rowAudit.network}</span>
                <span className="text-gray-300">·</span>
                <span>F{rowAudit.file}</span>
                <span className="text-gray-300">·</span>
                <span>E{rowAudit.exec}</span>
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDetailTab("trace")}
              className="flex h-full min-w-[120px] flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50/30 p-3 text-center transition-all hover:bg-white dark:border-gray-800 dark:bg-gray-900/50"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{intl.get("sessionAudit.timeSpan")}</p>
              <p className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{formatDurationMs(trace.stats.durationMs ?? row.durationMs)}</p>
            </button>

            <div className="flex h-full min-w-[120px] flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50/30 p-3 text-center dark:border-gray-800 dark:bg-gray-900/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{intl.get("sessionAudit.parseableTotal")}</p>
              <p className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">
                {trace.stats.parseableTime ?? 0} <span className="text-xs font-medium text-gray-300">/ {trace.stats.totalLines ?? jsonlLines.length}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Property Row */}
        <div className="border-t border-gray-50 bg-gray-50/20 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/30">
          <div className="flex flex-wrap items-center justify-between gap-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500">
                <Icons.Agent />
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">{intl.get("sessionAudit.agentName")}</dt>
                <dd className="mt-1 text-xs font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">{row.agentName ?? "—"}</dd>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center text-gray-400">
                <Icons.Model />
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">{intl.get("sessionAudit.model")}</dt>
                <dd className="mt-1 text-xs font-bold text-gray-900 dark:text-gray-100 truncate leading-tight">{row.model ?? "—"}</dd>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center text-gray-400">
                <Icons.Database />
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">{intl.get("sessionAudit.provider")}</dt>
                <dd className="mt-1 text-xs font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">{row.modelProvider ?? "—"}</dd>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center text-gray-400">
                <Icons.Coins />
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">{intl.get("sessionAudit.totalToken")}</dt>
                <dd className="mt-1 text-xs font-bold text-gray-900 dark:text-gray-100 leading-tight">{num(row.totalTokens)}</dd>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500">
                <Icons.Zap />
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">{intl.get("sessionAudit.channel")}</dt>
                <dd className="mt-1 text-xs font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">{row.channel ?? row.lastChannel ?? "—"}</dd>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center text-gray-400">
                <Icons.Calendar />
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">{intl.get("sessionAudit.updateTime")}</dt>
                <dd className="mt-1 text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight">{formatMs(row.updatedAt)}</dd>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="app-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("sessionAudit.transcriptAnalysis")}</h3>

        {jsonlStatus === "loading" && (
          <div className="mt-4">
            <LoadingSpinner message={intl.get("sessionAudit.loadingTranscript")} />
          </div>
        )}
        {jsonlStatus === "error" && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{jsonlError}</p>
        )}
        {jsonlStatus === "ok" && jsonlLines.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">{intl.get("sessionAudit.fileEmpty")}</p>
        )}
        {jsonlStatus === "ok" && jsonlLines.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist" aria-label="会话详情分类">
              {DETAIL_TABS.map((tab) => {
                const active = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDetailTab(tab.id)}
                    className={[
                      "-mb-px rounded-t-md border px-3 py-2 text-sm font-medium transition",
                      active
                        ? "border-gray-200 border-b-white bg-white text-primary dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-primary"
                        : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800",
                    ].join(" ")}
                  >
                    {intl.get(tab.labelKey)}
                  </button>
                );
              })}
            </div>

            {detailTab === "trace" && (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{intl.get("sessionAudit.eventTimeline")}</h4>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                      <span>{intl.get("sessionAudit.dotColor")}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 ring-1 ring-red-300/80" />
                        {intl.get("auditOverview.high")}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 ring-1 ring-amber-300/80" />
                        {intl.get("auditOverview.medium")}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500 ring-1 ring-sky-300/80" />
                        {intl.get("auditOverview.low")}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 ring-1 ring-emerald-300/80" />
                        {intl.get("sessionAudit.healthy")}
                      </span>
                      <span className="text-gray-400">{intl.get("sessionAudit.riskConsistencyHint")}</span>
                    </p>
                  </div>
                  {trace.enriched.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {replayPlaying && replayStep !== null && (
                        <span className="rounded-md bg-primary-soft px-2 py-1 text-xs font-medium tabular-nums text-primary ring-1 ring-primary/20">
                          {intl.get("sessionAudit.replayProgress", { current: replayStep + 1, total: trace.enriched.length })}
                        </span>
                      )}
                      {!replayPlaying && replayStep === null && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplayStep(0);
                            setReplayPlaying(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-primary-hover"
                        >
                          <span aria-hidden>▶</span>
                          {intl.get("sessionAudit.replay")}
                        </button>
                      )}
                      {!replayPlaying && replayStep !== null && (
                        <>
                          <button
                            type="button"
                            onClick={() => setReplayPlaying(true)}
                            className="rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition hover:bg-primary-soft dark:bg-gray-900 dark:hover:bg-primary/20"
                          >
                            {intl.get("sessionAudit.continue")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplayStep(0);
                              setReplayPlaying(true);
                            }}
                            className="app-btn-outline px-3 py-1.5 text-xs font-medium text-gray-800"
                          >
                            {intl.get("sessionAudit.replayFromStart")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplayStep(null)}
                            className="app-btn-outline px-3 py-1.5 text-xs font-medium text-gray-600"
                          >
                            {intl.get("sessionAudit.stop")}
                          </button>
                        </>
                      )}
                      {replayPlaying && (
                        <>
                          <button
                            type="button"
                            onClick={() => setReplayPlaying(false)}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition hover:bg-amber-100"
                          >
                            {intl.get("sessionAudit.pause")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplayPlaying(false);
                              setReplayStep(null);
                            }}
                            className="app-btn-outline px-3 py-1.5 text-xs font-medium text-gray-700"
                          >
                            {intl.get("sessionAudit.stop")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <ul className="mt-3 space-y-0">
                  {trace.enriched.map((item, enrichedIdx) => {
                    const { line, originalIndex, tMs, deltaMs } = item;
                    const riskLevel = item.riskLevel ?? "healthy";
                    const riskReasonText = item.riskReasonText ?? "";
                    const sum = summarizeJsonlLine(line);
                    const raw = rawOpen.has(originalIndex);
                    const gapWarn = deltaMs != null && deltaMs >= 300000;
                    const gapMid = deltaMs != null && deltaMs >= 60000 && deltaMs < 300000;
                    const idStr = line.id != null ? String(line.id) : null;
                    const parentStr = line.parentId != null ? String(line.parentId) : null;
                    const isReplayActive = replayStep === enrichedIdx && replayStep !== null;
                    return (
                      <li
                        id={`trace-replay-${enrichedIdx}`}
                        key={`trace-${originalIndex}-${sum.kind}`}
                        className="relative flex scroll-mt-24 gap-0"
                      >
                        {/* 时间轴左侧：线上时间 */}
                        <div className="w-full max-w-[7.25rem] shrink-0 select-none pr-2 pt-2.5 text-right sm:max-w-[8.5rem] sm:pr-3">
                          {tMs != null ? (
                            <span className="inline-block text-[11px] font-semibold leading-snug tabular-nums text-gray-800 dark:text-gray-200 sm:text-xs">
                              {formatMs(tMs)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700 dark:text-amber-400">{intl.get("sessionAudit.noTimestamp")}</span>
                          )}
                          <span className="mt-0.5 block text-[10px] tabular-nums text-gray-400 dark:text-gray-500">#{originalIndex + 1}</span>
                        </div>
                        <div className="relative min-w-0 flex-1 border-l-2 border-gray-200 pb-4 pl-4 dark:border-gray-700">
                          <span
                            className={[
                              "absolute -left-[5px] top-3 h-3 w-3 rounded-full border-2 border-white transition-transform dark:border-gray-950",
                              isReplayActive
                                ? "scale-125 ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-gray-950"
                                : "ring-1",
                              traceTimelineDotClass(item.riskLevel ?? "healthy"),
                            ].join(" ")}
                            title={traceRiskHoverTitle(riskLevel, riskReasonText)}
                          />
                          <div
                            className={[
                              "rounded-lg border p-3 shadow-sm transition-shadow",
                              isReplayActive
                                ? "border-primary bg-primary-soft/60 ring-2 ring-primary/25 ring-offset-2 ring-offset-white dark:ring-offset-gray-950"
                                : "border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/40",
                            ].join(" ")}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={[
                                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                      kindBadgeClass(sum.kind),
                                    ].join(" ")}
                                  >
                                    {sum.title}
                                  </span>
                                  <span
                                    className={[
                                      "inline-flex cursor-help rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                      traceRiskBadgeClass(riskLevel),
                                    ].join(" ")}
                                    title={traceRiskHoverTitle(riskLevel, riskReasonText)}
                                  >
                                    {intl.get("sessionAudit.riskPrefix")}
                                    {traceRiskLevelLabel(riskLevel)}
                                  </span>
                                  {deltaMs != null && (
                                    <span
                                      className={[
                                        "rounded px-1.5 py-0.5 text-xs tabular-nums ring-1 ring-inset",
                                        gapWarn
                                          ? "bg-rose-50 text-rose-800 ring-rose-200"
                                          : gapMid
                                            ? "bg-amber-50 text-amber-900 ring-amber-200"
                                            : "bg-gray-100 text-gray-600 ring-gray-200",
                                      ].join(" ")}
                                      title={intl.get("sessionAudit.relativeToLast")}
                                    >
                                      +{formatDurationMs(deltaMs)}
                                    </span>
                                  )}
                                </div>
                                {(idStr || parentStr) && (
                                  <p className="mt-1 font-mono text-[10px] text-gray-500">
                                    {parentStr != null ? `parentId ${parentStr}` : "parentId —"}
                                    {" · "}
                                    {idStr != null ? `id ${idStr}` : "id —"}
                                  </p>
                                )}
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{sum.subtitle || "—"}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleRaw(originalIndex)}
                                className="app-btn-outline shrink-0 px-2 py-1 text-xs"
                              >
                                {raw ? intl.get("sessionAudit.hideRawLine") : intl.get("sessionAudit.rawJson")}
                              </button>
                            </div>
                            {raw && (
                              <div className="flex items-start justify-between gap-2">
                                <CodeBlock text={JSON.stringify(line, null, 2)} variant="dark" height="lg" font="mono" className="mt-3 flex-1">
                                  {JSON.stringify(line, null, 2)}
                                </CodeBlock>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {detailTab === "chat" && (
              <div className="mt-4">
                {chatMessages.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">{intl.get("sessionAudit.noMessage")}</p>
                ) : (
                  <div className="mt-4 flex max-h-[min(72vh,880px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#eceff2] shadow-inner">
                    <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5">
                      {chatMessages.map((entry) => {
                        const { line, lineIndex, role, tMs } = entry;
                        const msg = line.message;
                        const timeStr = tMs != null ? formatMs(tMs) : "—";
                        const kid = line.id != null ? String(line.id) : `idx-${lineIndex}`;
                        const riskSev = chatRiskMaps.worstByLine.get(lineIndex);
                        const riskReason = chatRiskMaps.reasonByLine.get(lineIndex) ?? "";

                        const chatMetaRow = (align) => (
                          <div
                            className={[
                              "flex w-full flex-wrap items-center gap-2 font-mono text-[10px] text-gray-500 dark:text-gray-400",
                              align === "end" ? "justify-end" : align === "center" ? "justify-center" : "justify-start",
                            ].join(" ")}
                          >
                            {riskSev && (
                              <span
                                className={[
                                  "inline-flex cursor-help rounded-md px-1.5 py-0.5 font-sans text-[10px] font-bold ring-1 ring-inset",
                                  chatRiskSeverityBadgeClass(riskSev),
                                ].join(" ")}
                                title={traceRiskHoverTitle(riskSev, riskReason)}
                              >
                                {intl.get("sessionAudit.riskPrefix")}
                                {traceRiskLevelLabel(riskSev)}
                              </span>
                            )}
                            <span>
                              #{lineIndex + 1} · {timeStr}
                            </span>
                          </div>
                        );

                        if (role === "user") {
                          return (
                            <div key={`chat-${lineIndex}-${kid}`} className="flex flex-col items-end gap-1">
                              <div className="max-w-[min(92%,640px)] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm text-white shadow-sm">
                                <p className="whitespace-pre-wrap break-words leading-relaxed">{messageTextContent(msg)}</p>
                              </div>
                              {chatMetaRow("end")}
                            </div>
                          );
                        }

                        if (role === "assistant") {
                          return (
                            <div key={`chat-${lineIndex}-${kid}`} className="flex flex-col items-start gap-1">
                              <div className="max-w-[min(92%,720px)] rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                                <ChatAssistantMessageBody msg={msg} strArgs={strArgs} />
                                {msg.stopReason != null && (
                                  <p className="mt-2 border-t border-gray-100 pt-2 text-[10px] text-gray-400">
                                    stopReason: {String(msg.stopReason)}
                                    {msg.usage?.totalTokens != null && ` · ${msg.usage.totalTokens} tok`}
                                  </p>
                                )}
                              </div>
                              {chatMetaRow("start")}
                            </div>
                          );
                        }

                        if (role === "toolResult") {
                          return (
                            <div key={`chat-${lineIndex}-${kid}`} className="flex flex-col items-center gap-1">
                              <div className="w-full max-w-[min(92%,720px)] rounded-2xl border border-amber-200/90 bg-amber-50/95 px-4 py-2.5 text-sm text-gray-900 shadow-sm">
                                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-900">
                                  <span>{intl.get("sessionAudit.toolResult")}</span>
                                  <span className="font-mono">{msg.toolName ?? "—"}</span>
                                  {msg.toolCallId != null && (
                                    <span className="font-mono text-[10px] font-normal text-amber-800/90">id {msg.toolCallId}</span>
                                  )}
                                  {msg.isError && (
                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">{intl.get("sessionAudit.error")}</span>
                                  )}
                                </div>
                                <div className="flex items-start justify-between gap-2">
                                  <pre className="max-h-96 flex-1 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">
                                    {messageTextContent(msg)}
                                  </pre>
                                  <CopyButton text={messageTextContent(msg)} className="shrink-0" />
                                </div>
                              </div>
                              {chatMetaRow("center")}
                            </div>
                          );
                        }

                        return (
                          <div key={`chat-${lineIndex}-${kid}`} className="flex flex-col items-start gap-1">
                            <div className="max-w-[min(92%,720px)] rounded-2xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs text-gray-800">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-600">message · {role}</span>
                                <CopyButton text={JSON.stringify(msg, null, 2)} className="shrink-0" />
                              </div>
                              <pre className="mt-1 max-h-48 overflow-auto text-[11px] leading-relaxed">{JSON.stringify(msg, null, 2)}</pre>
                            </div>
                            {chatMetaRow("start")}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}



            {detailTab === "model" && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">{intl.get("sessionAudit.assistantTurns")}</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">{modelInvocations.assistantCalls.length}</span>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">{intl.get("sessionAudit.modelSigmaTotalTokens")}</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">
                      {num(modelInvocations.totals.totalTokens)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">{intl.get("sessionAudit.modelSigmaInputOutput")}</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">
                      {num(modelInvocations.totals.totalInput)} / {num(modelInvocations.totals.totalOutput)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">{intl.get("sessionAudit.modelSigmaUsageCost")}</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">
                      ${fmtUsd(modelInvocations.totals.totalCost)}
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="h-4 w-1 rounded-full bg-indigo-500" />
                    {intl.get("sessionAudit.configAndSnapshot")}
                  </h4>
                  {modelInvocations.snapshots.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">{intl.get("sessionAudit.noModelSnapshot")}</p>
                  ) : (
                    <ol className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-sm">
                      {modelInvocations.snapshots.map((s, idx) => (
                        <li
                          key={`snap-${s.kind}-${s.lineIndex}-${idx}`}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-gray-100 pb-2 last:border-0 last:pb-0"
                        >
                          <span className="font-mono text-[10px] text-gray-500">#{s.lineIndex + 1}</span>
                          {s.tMs != null && (
                            <span className="tabular-nums text-[10px] text-gray-500">{formatMs(s.tMs)}</span>
                          )}
                          {s.kind === "model_change" && (
                            <>
                              <span className="rounded bg-violet-100 px-1.5 text-xs font-medium text-violet-900">
                                model_change
                              </span>
                              <span className="text-gray-800">
                                {s.provider ?? "—"} / {s.modelId ?? "—"}
                              </span>
                            </>
                          )}
                          {s.kind === "thinking_level" && (
                            <>
                              <span className="rounded bg-fuchsia-100 px-1.5 text-xs font-medium text-fuchsia-900">
                                thinking_level
                              </span>
                              <span className="text-gray-800">{s.thinkingLevel ?? "—"}</span>
                            </>
                          )}
                          {s.kind === "model_snapshot" && (
                            <>
                              <span className="rounded bg-cyan-100 px-1.5 text-xs font-medium text-cyan-900">
                                model_snapshot
                              </span>
                              <span className="text-gray-800">
                                {s.provider ?? "—"} / {s.modelId ?? "—"} · {s.modelApi ?? "—"}
                              </span>
                              {s.dataTimestamp != null && !Number.isNaN(s.dataTimestamp) && (
                                <span className="text-xs text-gray-500">data {formatMs(s.dataTimestamp)}</span>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="h-4 w-1 rounded-full bg-slate-400" />
                    {intl.get("sessionAudit.assistantTurns")}
                  </h4>
                  {modelInvocations.assistantCalls.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">{intl.get("sessionAudit.noAssistantUsage")}</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.time")}</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">provider</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">model</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">api</th>
                            <th className="px-2 py-2 text-right text-xs font-medium text-gray-600">in/out</th>
                            <th className="px-2 py-2 text-right text-xs font-medium text-gray-600">total</th>
                            <th className="px-2 py-2 text-right text-xs font-medium text-gray-600">$</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">stop</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                          {modelInvocations.assistantCalls.map((c, i) => {
                            const u = c.usage && typeof c.usage === "object" ? c.usage : {};
                            const cost =
                              u.cost && typeof u.cost === "object" && u.cost.total != null ? u.cost.total : null;
                            return (
                              <tr key={`${c.lineIndex}-${i}`} className="hover:bg-gray-50/50">
                                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs text-gray-500">
                                  {c.lineIndex + 1}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums text-gray-700">
                                  {c.tMs != null ? formatMs(c.tMs) : "—"}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-xs">{c.provider ?? "—"}</td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-xs">{c.model ?? "—"}</td>
                                <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-xs text-gray-600">
                                  {c.api ?? "—"}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-gray-700">
                                  {u.input != null || u.output != null
                                    ? `${u.input ?? "—"} / ${u.output ?? "—"}`
                                    : "—"}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs font-medium tabular-nums">
                                  {u.totalTokens != null ? num(u.totalTokens) : "—"}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums text-gray-800">
                                  {cost != null ? fmtUsd(cost) : "—"}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs text-gray-600">
                                  {c.stopReason ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailTab === "tools" && (
              <div className="mt-4 space-y-8">

                {/* 1. 风险发现 — 展示所有风险项，与顶部 H/M/L 计数一致 */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="h-4 w-1 rounded-full bg-red-500" />
                    {intl.get("sessionAudit.tabRisk")}
                    {riskItems.length > 0 && (
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        {intl.get("sessionAudit.riskTotal", { count: riskItems.length })}
                      </span>
                    )}
                  </h4>
                  {riskItems.length === 0 ? (
                    <p className="rounded-lg border border-gray-100 bg-gray-50/70 p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
                      {intl.get("sessionAudit.noRiskFound")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.time")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.severity")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.category")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.detailText")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                          {riskItems.map((r, i) => {
                            const sevBadge = traceRiskBadgeClass(r.severity);
                            const sevLabel = r.severity === "high"
                              ? intl.get("sessionAudit.riskLevel.high")
                              : r.severity === "medium"
                                ? intl.get("sessionAudit.riskLevel.medium")
                                : intl.get("sessionAudit.riskLevel.low");
                            const catLabel = RISK_CATEGORY_LABEL[r.category]
                              ? intl.get(RISK_CATEGORY_LABEL[r.category])
                              : r.category;
                            return (
                              <tr
                                key={`risk-${r.lineIndex}-${i}`}
                                className={[
                                  "hover:bg-gray-50/50 transition-colors cursor-pointer",
                                  riskSeverityPanelClass(r.severity),
                                ].join(" ")}
                                onClick={() => openRiskSourceLine(r.lineIndex)}
                                title={intl.get("sessionAudit.viewLog")}
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">
                                  <button
                                    type="button"
                                    className="underline decoration-gray-300 underline-offset-2 hover:text-primary hover:decoration-primary"
                                    onClick={(e) => { e.stopPropagation(); openRiskSourceLine(r.lineIndex); }}
                                  >
                                    {intl.get("sessionAudit.lineNumber", { line: r.lineIndex + 1 })}
                                  </button>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-gray-800">
                                  {r.tMs != null ? formatMs(r.tMs) : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={[
                                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset uppercase",
                                    sevBadge,
                                  ].join(" ")}>
                                    {sevLabel}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                    {catLabel}
                                  </span>
                                </td>
                                <td className="max-w-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                                  <div className="truncate" title={r.detail}>
                                    {r.title}
                                    {r.detail ? ` — ${r.detail}` : ""}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 2. 工具调用 */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="h-4 w-1 rounded-full bg-primary" />
                    {intl.get("sessionAudit.tabTools")}
                  </h4>
                  {Object.keys(toolData.byName).length > 0 && (
                    <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                      <p className="text-xs font-medium text-gray-600">{intl.get("sessionAudit.toolCountByName")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(toolData.byName)
                          .sort((a, b) => b[1] - a[1])
                          .map(([name, c]) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
                            >
                              {name} <span className="ml-1 tabular-nums text-primary">{c}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {toolData.calls.length === 0 ? (
                    <p className="text-sm text-gray-500">{intl.get("sessionAudit.noToolCall")}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.time")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.tool")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.argsSummary")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                          {toolData.calls.map((call, i) => {
                            const risk = riskMapByLine.get(call.lineIndex);
                            const isHigh = risk?.severity === "high";
                            return (
                              <tr
                                key={`${call.lineIndex}-${i}`}
                                className={[
                                  "hover:bg-gray-50/50 transition-colors",
                                  isHigh ? "bg-red-50/40 dark:bg-red-900/10" : "",
                                ].join(" ")}
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{call.lineIndex + 1}</td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-gray-800">
                                  {call.tMs != null ? formatMs(call.tMs) : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-gray-900">{call.name}</span>
                                    {risk && (
                                      <span
                                        className={[
                                          "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase",
                                          traceRiskBadgeClass(risk.severity),
                                        ].join(" ")}
                                        title={risk.detail}
                                      >
                                        {traceRiskLevelLabel(risk.severity)}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="max-w-md px-3 py-2 font-mono text-xs text-gray-700 break-all">{strArgs(call.arguments)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. 网络访问 */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="h-4 w-1 rounded-full bg-sky-500" />
                    {intl.get("sessionAudit.urlNetwork")}
                  </h4>
                  {netFileData.urls.length === 0 ? (
                    <p className="text-sm text-gray-500">{intl.get("sessionAudit.noUrl")}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.time")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">URL / Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                          {netFileData.urls.map((row, i) => {
                            const risk = riskMapByLine.get(row.lineIndex);
                            const isHigh = risk?.severity === "high";
                            return (
                              <tr
                                key={`${row.lineIndex}-${i}`}
                                className={[
                                  "hover:bg-gray-50/50 transition-colors",
                                  isHigh ? "bg-red-50/40 dark:bg-red-900/10" : "",
                                ].join(" ")}
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{row.lineIndex + 1}</td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-gray-800">
                                  {row.tMs != null ? formatMs(row.tMs) : "—"}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <NetUrlHighlight url={row.url} />
                                      {risk && (
                                        <span
                                          className={[
                                            "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase",
                                            traceRiskBadgeClass(risk.severity),
                                          ].join(" ")}
                                          title={risk.detail}
                                        >
                                          {traceRiskLevelLabel(risk.severity)}
                                        </span>
                                      )}
                                    </div>
                                    {row.source && (
                                      <div>
                                        <span className="inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 ring-1 ring-violet-200/80">
                                          Source: {row.source}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. 文件操作 */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="h-4 w-1 rounded-full bg-emerald-500" />
                    {intl.get("sessionAudit.fileOp")}
                  </h4>
                  {netFileData.fileReads.length === 0 && netFileData.fileWrites.length === 0 ? (
                    <p className="text-sm text-gray-500">{intl.get("sessionAudit.noRecord")}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.time")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Op</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Path</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                          {[
                            ...netFileData.fileReads.map((r) => ({ ...r, op: "read" })),
                            ...netFileData.fileWrites,
                          ]
                            .sort((a, b) => a.tMs - b.tMs)
                            .map((fr, i) => {
                              const risk = riskMapByLine.get(fr.lineIndex);
                              const isHigh = risk?.severity === "high";
                              return (
                                <tr
                                  key={`${fr.lineIndex}-${i}`}
                                  className={[
                                    "hover:bg-gray-50/50 transition-colors",
                                    isHigh ? "bg-red-50/40 dark:bg-red-900/10" : "",
                                  ].join(" ")}
                                >
                                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{fr.lineIndex + 1}</td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-gray-800">
                                    {fr.tMs != null ? formatMs(fr.tMs) : "—"}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={[
                                        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
                                        netFileOpBadgeClass(fr.op),
                                      ].join(" ")}
                                    >
                                      {fr.op ?? "write"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs break-all">
                                    <div className="flex items-center gap-1.5">
                                      <NetPathHighlight path={fr.path} />
                                      {risk && (
                                        <span
                                          className={[
                                            "shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase",
                                            traceRiskBadgeClass(risk.severity),
                                          ].join(" ")}
                                          title={risk.detail}
                                        >
                                          {traceRiskLevelLabel(risk.severity)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 5. 执行与进程 */}
                {(netFileData.execs.length > 0 || netFileData.processOps.length > 0) && (
                  <div className="space-y-4">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="h-4 w-1 rounded-full bg-amber-500" />
                      Exec & Process
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{intl.get("sessionAudit.time")}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Operation / Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                          {[
                            ...netFileData.execs.map((e) => ({ ...e, type: "exec" })),
                            ...netFileData.processOps.map((p) => ({ ...p, type: "process" })),
                          ]
                            .sort((a, b) => a.tMs - b.tMs)
                            .map((op, i) => {
                              const risk = riskMapByLine.get(op.lineIndex);
                              const isHigh = risk?.severity === "high";
                              return (
                                <tr
                                  key={`${op.lineIndex}-${i}`}
                                  className={[
                                    "hover:bg-gray-50/50 transition-colors",
                                    isHigh ? "bg-red-50/40 dark:bg-red-900/10" : "",
                                  ].join(" ")}
                                >
                                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{op.lineIndex + 1}</td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-gray-800">
                                    {op.tMs != null ? formatMs(op.tMs) : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-xs relative">
                                    <div className="flex flex-col gap-1">
                                      {op.type === "exec" ? (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-amber-700">EXEC</span>
                                            {risk && (
                                              <span
                                                className={[
                                                  "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase",
                                                  traceRiskBadgeClass(risk.severity),
                                                ].join(" ")}
                                                title={risk.detail}
                                              >
                                                {traceRiskLevelLabel(risk.severity)}
                                              </span>
                                            )}
                                          </div>
                                          <NetCommandHighlight command={op.command} />
                                        </>
                                      ) : (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-primary">PROCESS</span>
                                            <span className="rounded-md bg-primary-soft px-1.5 py-0.5 font-semibold text-primary ring-1 ring-primary/15">
                                              {op.action}
                                            </span>
                                            {risk && (
                                              <span
                                                className={[
                                                  "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold ring-1 ring-inset uppercase",
                                                  traceRiskBadgeClass(risk.severity),
                                                ].join(" ")}
                                                title={risk.detail}
                                              >
                                                {traceRiskLevelLabel(risk.severity)}
                                              </span>
                                            )}
                                          </div>
                                          {op.session_id != null && (
                                            <span className="text-gray-500 font-mono text-[10px]">sessionId: {op.session_id}</span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </section>
    </div>
  );
}

export default function SessionAudit({ setHeaderExtra }) {
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sortKey, setSortKey] = useState("riskScore");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [detailRow, setDetailRow] = useState(null);
  const [riskFilter, setRiskFilter] = useState("all");

  // 数字员工下钻：预填搜索（读取一次即清除），版本 1.0.1
  useEffect(() => {
    try {
      const v = sessionStorage.getItem("openclaw-session-audit-query");
      if (v && String(v).trim()) {
        setQuery(String(v).trim());
        sessionStorage.removeItem("openclaw-session-audit-query");
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (detailRow) {
      setHeaderExtra(
        <div className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => setDetailRow(null)}
            className="rounded-md px-1.5 py-1 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {intl.get("nav.sessionAudit")}
          </button>
          <span className="text-gray-400">/</span>
          <span className="font-mono text-[13px] font-semibold text-violet-700 dark:text-violet-300">
            {detailRow.session_id}
          </span>
          <span className="ml-1 text-xs text-gray-400 font-medium font-sans">{intl.get("sessionAudit.detailView")}</span>
        </div>
      );
    } else {
      setHeaderExtra(null);
    }
  }, [detailRow, setHeaderExtra]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/agent-sessions")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = data && typeof data.error === "string" ? data.error : r.statusText;
          throw new Error(msg || String(r.status));
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) {
          setRows([]);
          setLoadError(intl.get("sessionAudit.invalidResponseFormatArray"));
          return;
        }
        setRows(mapAgentSessionRows(data).map((row) => ({ ...row, ...auditRowView(row) })));
        setLoadError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setRows([]);
        setLoadError(
          intl.get("sessionAudit.loadFailed", {
            error: e.message || String(e),
          }),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDetailRow(null);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (riskFilter !== "all" && r.worstRiskLevel !== riskFilter) return false;
      if (!q) return true;
      const hay = [
        r.sessionKey,
        r.session_id,
        r.agentName,
        r.model,
        r.modelProvider,
        r.originProvider,
        r.chatType,
        r.channel,
        r.lastChannel,
        r.label,
        r.sessionFile,
        r.toolUseCount,
        r.riskHigh,
        r.riskMedium,
        r.riskLow,
        r.networkAccessCount,
        r.fileOpCount,
        r.execCount,
      ]
        .filter((x) => x != null && x !== "")
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, riskFilter]);

  const sorted = useMemo(() => sortSessionRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const p0 = pageSafe - 1;
    return sorted.slice(p0 * pageSize, p0 * pageSize + pageSize);
  }, [sorted, pageSafe, pageSize]);

  const overviewMetrics = useMemo(() => {
    const totalSessions = rows.length;
    const totalTokens = rows.reduce((s, r) => s + (Number.isFinite(Number(r.totalTokens)) ? Number(r.totalTokens) : 0), 0);
    const totalToolCalls = rows.reduce((s, r) => s + (Number.isFinite(Number(r.toolUseCount)) ? Number(r.toolUseCount) : 0), 0);
    const highRiskSessions = rows.filter((r) => (Number(r.riskHigh) || 0) > 0).length;
    const abortedSessions = rows.filter((r) => Boolean(r.abortedLastRun)).length;
    const successRate = totalSessions > 0 ? (totalSessions - abortedSessions) / totalSessions : null;
    return {
      totalSessions,
      totalTokens,
      totalToolCalls,
      highRiskSessions,
      successRate,
    };
  }, [rows]);

  useEffect(() => {
    setPage(1);
  }, [query, sortKey, sortDir, pageSize, riskFilter]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "updatedAt" ||
          key === "startedAt" ||
          key === "endedAt" ||
          key === "durationMs" ||
          key === "totalTokens" ||
          key === "toolUseCount" ||
          key === "riskHigh" ||
          key === "riskMedium" ||
          key === "riskLow" ||
          key === "riskScore" ||
          key === "networkAccessCount" ||
          key === "fileOpCount" ||
          key === "execCount"
          ? "desc"
          : "asc",
      );
    }
  };

  const openDetail = (row) => {
    setDetailRow(row);
  };

  if (detailRow) {
    return <SessionAuditDetail row={detailRow} />;
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{loadError}</p>
      )}

      <section className="app-card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("sessionAudit.overview.coreMetrics")}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("sessionAudit.overview.totalSessions")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{num(overviewMetrics.totalSessions)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("sessionAudit.overview.totalTokens")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{num(overviewMetrics.totalTokens)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("sessionAudit.overview.totalToolCalls")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{num(overviewMetrics.totalToolCalls)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("sessionAudit.overview.highRiskSessions")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-rose-600 dark:text-rose-300">{num(overviewMetrics.highRiskSessions)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("sessionAudit.overview.successRate")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">{pct(overviewMetrics.successRate)}</p>
          </div>
        </div>
      </section>

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("sessionAudit.sessionList")}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{intl.get("sessionAudit.securityQueueHint")}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 lg:w-[22rem] xl:w-[26rem]">
            <label className="sr-only" htmlFor="session-audit-search">
              {intl.get("common.search")}
            </label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-gray-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.1-5.4a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
              </svg>
            </span>
            <input
              id="session-audit-search"
              type="search"
              placeholder={intl.get("sessionAudit.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="app-input w-full py-2.5 pl-9 pr-3 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <label className="relative inline-flex min-w-[11rem] items-center">
              <span className="pointer-events-none absolute left-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                {intl.get("sessionAudit.filterRisk.label")}
              </span>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="app-input w-full appearance-none py-2.5 pl-[4.75rem] pr-9 text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                {["all", "high", "medium", "low", "clean"].map((level) => (
                  <option key={level} value={level}>
                    {intl.get(`sessionAudit.filterRisk.${level}`)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 text-gray-400 dark:text-gray-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-800/80 dark:text-gray-400">
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("riskScore")}>
                    {intl.get("sessionAudit.queue.risk")} {sortKey === "riskScore" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("session_id")}>
                    {intl.get("sessionAudit.queue.session")} {sortKey === "session_id" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("agentName")}>
                    {intl.get("sessionAudit.queue.actor")} {sortKey === "agentName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("startedAt")}>
                    {intl.get("sessionAudit.queue.timeWindow")} {sortKey === "startedAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="px-3 py-3">{intl.get("sessionAudit.queue.evidence")}</th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("totalTokens")}>
                    {intl.get("sessionAudit.queue.modelCost")} {sortKey === "totalTokens" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="px-3 py-3 text-right">{intl.get("sessionAudit.queue.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-0 align-middle">
                      <LoadingSpinner message={intl.get("sessionAudit.loadingList")} className="!py-16" />
                    </td>
                  </tr>
                ) : pageSlice.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      {intl.get("common.noMatch")}
                    </td>
                  </tr>
                ) : (
                  pageSlice.map((row) => {
                    const id = sessionRowId(row);
                    return (
                      <tr
                        key={id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-white hover:bg-primary-soft/50 dark:bg-transparent dark:hover:bg-primary/15"
                        onClick={() => openDetail(row)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            openDetail(row);
                          }
                        }}
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col gap-1.5">
                            <span
                              className={[
                                "inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                                auditRiskBadgeClass(row.worstRiskLevel),
                              ].join(" ")}
                            >
                              {auditRiskLabel(row.worstRiskLevel)}
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              <span className="font-medium text-red-700 dark:text-red-400">H {row.high}</span>
                              <span className="text-gray-300"> / </span>
                              <span className="font-medium text-amber-800 dark:text-amber-300">M {row.medium}</span>
                              <span className="text-gray-300"> / </span>
                              <span className="font-medium text-sky-700 dark:text-sky-300">L {row.low}</span>
                            </span>
                            {row.aborted && (
                              <span className="w-fit rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25">
                                {intl.get("sessionAudit.abortedLastRun")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[18rem] px-3 py-3 align-top">
                          <div className="font-mono text-xs font-semibold text-violet-700 dark:text-violet-300">{row.session_id ?? "—"}</div>
                          <div className="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400" title={row.sessionKey || ""}>
                            {row.sessionKey || "—"}
                          </div>
                          {row.label && (
                            <div className="mt-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300" title={row.label}>
                              {row.label}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[12rem] px-3 py-3 align-top">
                          <div className="truncate font-medium text-gray-900 dark:text-gray-100" title={row.agentName || ""}>{row.agentName ?? "—"}</div>
                          <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={row.channel || row.lastChannel || ""}>
                            {row.channel ?? row.lastChannel ?? "—"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-top">
                          <div className="tabular-nums text-xs text-gray-800 dark:text-gray-200">{formatMs(row.startedAt)}</div>
                          <div className="mt-1 tabular-nums text-xs font-medium text-gray-600 dark:text-gray-400" title={row.durationMs != null ? `${row.durationMs} ms` : ""}>
                            {formatDurationMs(row.durationMs)}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex max-w-[18rem] flex-wrap gap-1.5">
                            {[
                              [intl.get("sessionAudit.evidence.network"), row.network],
                              [intl.get("sessionAudit.evidence.file"), row.file],
                              [intl.get("sessionAudit.evidence.exec"), row.exec],
                              [intl.get("sessionAudit.evidence.tool"), row.tool],
                            ].map(([label, count]) => (
                              <span
                                key={label}
                                className={[
                                  "rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                                  evidenceBadgeClass(Number(count) > 0),
                                ].join(" ")}
                              >
                                {label} {num(count)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="max-w-[12rem] px-3 py-3 align-top">
                          <div className="truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={row.model || ""}>{row.model ?? "—"}</div>
                          <div className="mt-1 tabular-nums text-xs text-gray-500 dark:text-gray-400">{num(row.totalTokens)} tokens</div>
                        </td>
                        <td className="px-3 py-3 text-right align-top">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openDetail(row);
                            }}
                            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-primary-hover"
                          >
                            {intl.get("sessionAudit.openInvestigation")}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <TablePagination
          page={pageSafe}
          pageSize={pageSize}
          total={sorted.length}
          onPageChange={setPage}
          className="mt-6"
          loading={loading}
          trailingControls={
            <label className="ml-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <span className="shrink-0">{intl.get("common.perPage")}</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="app-input min-w-[4.5rem] py-1.5 px-2"
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="shrink-0">{intl.get("common.items")}</span>
            </label>
          }
        />
      </section>
    </div>
  );
}
