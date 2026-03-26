import { useEffect, useMemo, useState } from "react";
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
  getJsonlLineTimeMs,
  extractMessageLines,
  messageTextContent,
  extractSessionRisks,
  extractIntentRecognitionDetails,
  extractModelInvocationRecords,
  traceRiskLevelLabel,
  computeSessionRiskMaps,
} from "../lib/sessionAudit.js";

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

function formatLineTimeLabel(s) {
  if (s == null || s === "") return "—";
  const str = String(s);
  if (/^\d{10,}$/.test(str)) return formatMs(Number(str));
  return str;
}

function num(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("zh-CN");
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
    return `风险·${label} — 原因：${flat}`;
  }
  return `风险·${label} — 本行未命中风险感知规则（无具体原因）`;
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
  { id: "trace", label: "溯源分析" },
  { id: "flow", label: "会话过程" },
  { id: "chat", label: "对话详情" },
  { id: "intent", label: "意图识别" },
  { id: "model", label: "模型调用" },
  { id: "tools", label: "工具调用" },
  { id: "network", label: "网络和文件" },
  { id: "risk", label: "风险感知" },
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
  parse_error: "解析失败",
  custom_error: "扩展错误",
  tool_error: "工具错误",
  exit_code: "非零退出码",
  process_status: "进程状态",
  stop_reason: "停止原因",
  sensitive_command: "敏感命令",
  timeline_gap: "时间间隔",
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
              <summary className="cursor-pointer select-none font-medium text-violet-800">思考</summary>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{c.thinking}</p>
            </details>
          );
        }
        if (c.type === "toolCall") {
          return (
            <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/90 px-3 py-2">
              <div className="text-xs font-semibold text-primary">
                工具调用 · <span className="font-mono">{c.name ?? "—"}</span>
              </div>
              <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-gray-700">{strArgs(c.arguments)}</pre>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/**
 * 单会话下钻：索引元数据 + 拉取 `public/sessions/{sessionId}.jsonl` 时间线
 */
function SessionAuditDetail({ row, onBack }) {
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
  const intentDetail = useMemo(() => extractIntentRecognitionDetails(jsonlLines), [jsonlLines]);
  const modelInvocations = useMemo(() => extractModelInvocationRecords(jsonlLines), [jsonlLines]);

  useEffect(() => {
    const sid = row.sessionId;
    if (!sid) {
      setJsonlStatus("error");
      setJsonlError("该记录缺少 sessionId，无法加载会话转写。");
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
        if (!Array.isArray(data)) throw new Error("接口返回格式异常");
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
            `Doris agent_sessions_logs 不可用，已回退本地文件 public/sessions/${sid}.jsonl。原因：${e.message || e}`,
          );
        } catch (e2) {
          if (cancelled) return;
          setJsonlLines([]);
          setJsonlStatus("error");
          setJsonlError(
            `无法加载会话转写：${e.message || e}。请确认 Doris 表 otel.agent_sessions_logs 含 sessionId=${sid}，或放置 public/sessions/${sid}.jsonl。`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [row.sessionId]);

  useEffect(() => {
    setRawOpen(new Set());
  }, [jsonlLines]);

  useEffect(() => {
    setDetailTab("trace");
  }, [row.sessionId]);

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

  /** 风险项 →「会话过程」对应行并展开原始 JSON，滚动到可视区 */
  const openRiskSourceLine = (lineIndex) => {
    if (lineIndex < 0 || lineIndex >= jsonlLines.length) return;
    setDetailTab("flow");
    setRawOpen((prev) => {
      const n = new Set(prev);
      n.add(lineIndex);
      return n;
    });
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        document.getElementById(`session-line-${lineIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="app-btn-outline inline-flex items-center gap-2 px-3 py-2 text-sm"
        >
          ← 返回会话列表
        </button>
        <span className="text-sm text-gray-400">|</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">会话详情</h2>
      </div>

      <section className="app-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">索引元数据</h3>
        <p className="mt-2 rounded-lg border border-primary/20 bg-primary-soft/50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-primary break-all ring-1 ring-primary/10">
          {row.sessionKey}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">会话 ID</dt>
            <dd className="mt-0.5 flex items-start gap-1.5">
              <span className="break-all font-mono text-xs font-semibold text-violet-700 dark:text-violet-300">{row.sessionId ?? "—"}</span>
              {row.sessionId && (
                <button
                  type="button"
                  title="复制会话 ID"
                  onClick={() => {
                    navigator.clipboard?.writeText(row.sessionId).then(() => {
                      setIdCopied(true);
                      setTimeout(() => setIdCopied(false), 1500);
                    }).catch(() => {});
                  }}
                  className="mt-0.5 shrink-0 text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition"
                >
                  {idCopied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                      <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                    </svg>
                  )}
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">更新时间</dt>
            <dd className="mt-0.5 tabular-nums text-sm font-medium text-emerald-800 dark:text-emerald-300">{formatMs(row.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">模型</dt>
            <dd className="mt-0.5 font-semibold text-indigo-800 dark:text-indigo-300">{row.model ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">提供方</dt>
            <dd className="mt-0.5 font-medium text-sky-800 dark:text-sky-300">{row.modelProvider ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">总 Token</dt>
            <dd className="mt-0.5 tabular-nums text-sm font-semibold text-amber-800 dark:text-amber-300">{num(row.totalTokens)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">会话文件</dt>
            <dd className="mt-0.5 font-mono text-xs">
              {row.sessionFile != null && row.sessionFile !== "" ? (
                <NetPathHighlight path={row.sessionFile} />
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
          {row.label && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">标签</dt>
              <dd className="mt-2 rounded-r-md border-l-4 border-amber-400 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
                {row.label}
              </dd>
            </div>
          )}
        </dl>
        <details className="mt-4 rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/50">
          <summary className="cursor-pointer text-xs font-medium text-indigo-800 hover:text-indigo-950 dark:text-indigo-300 dark:hover:text-indigo-200">
            完整索引 JSON（已省略技能快照等大字段）
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-gray-800 dark:text-gray-200">{summaryStrip(row)}</pre>
        </details>
      </section>

      <section className="app-card p-4 sm:p-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">会话转写分析</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            溯源按时间先后；会话过程按记录行序；对话详情为聊天视图；意图识别为用户与 thinking 推理；模型调用汇总各轮用量；工具与网络/文件为结构化汇总；风险感知为启发式审计项。转写数据优先来自 Doris{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">otel.agent_sessions_logs</code>
            （列 <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">log_attributes</code>
            存完整 JSONL 行）；失败时可回退 <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">public/sessions/{`{sessionId}`}.jsonl</code>。
          </p>
        </div>

        {jsonlStatus === "loading" && <p className="mt-4 text-sm text-gray-500">正在加载转写…</p>}
        {jsonlStatus === "error" && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{jsonlError}</p>
        )}
        {jsonlStatus === "ok" && jsonlLines.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">文件为空。</p>
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
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {detailTab === "trace" && (
              <>
            <div className="mt-4 grid gap-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-gray-500">首条可解析时间</p>
                <p className="mt-0.5 tabular-nums text-sm text-gray-900">{trace.stats.tMin != null ? formatMs(trace.stats.tMin) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">末条可解析时间</p>
                <p className="mt-0.5 tabular-nums text-sm text-gray-900">{trace.stats.tMax != null ? formatMs(trace.stats.tMax) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">时间跨度</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{formatDurationMs(trace.stats.durationMs)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">可解析 / 总行</p>
                <p className="mt-0.5 tabular-nums text-sm text-gray-900">
                  {trace.stats.parseableTime} / {trace.stats.totalLines}
                  {trace.stats.unparseableTime > 0 && (
                    <span className="ml-1 text-amber-700">（{trace.stats.unparseableTime} 行无时间戳）</span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <p className="text-xs font-medium text-gray-500">相邻事件最大间隔</p>
                <p className="mt-0.5 text-sm text-gray-900">
                  <span className="font-medium tabular-nums">{formatDurationMs(trace.stats.maxGapMs)}</span>
                  {trace.stats.maxGapAfterOriginalIndex >= 0 && (
                    <span className="ml-2 text-xs text-gray-500">（发生在文件第 {trace.stats.maxGapAfterOriginalIndex + 1} 行附近）</span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <p className="text-xs font-medium text-gray-500">事件类型分布</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(trace.stats.byKind).map(([k, c]) => (
                    <span
                      key={k}
                      className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
                    >
                      {k} <span className="ml-1 tabular-nums text-primary">{c}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {trace.stats.tMin != null && trace.stats.tMax != null && trace.stats.durationMs > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-600">相对时间分布（可解析时间的记录在跨度上的位置）</p>
                <div className="relative mt-2 h-8 rounded-md bg-gray-100">
                  {trace.enriched
                    .filter((e) => e.tMs != null)
                    .map((e) => {
                      const p = ((e.tMs - trace.stats.tMin) / trace.stats.durationMs) * 100;
                      const left = Math.min(100, Math.max(0, p));
                      const rl = e.riskLevel ?? "healthy";
                      return (
                        <span
                          key={`dot-${e.originalIndex}`}
                          title={`行 ${e.originalIndex + 1} · ${formatMs(e.tMs)} · 风险 ${traceRiskLevelLabel(rl)}`}
                          className={[
                            "absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-900",
                            traceMiniBarDotClass(rl),
                          ].join(" ")}
                          style={{ left: `${left}%` }}
                        />
                      );
                    })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                  <span>0%</span>
                  <span>100% 跨度</span>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">事件时间线</h4>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                  <span>圆点颜色：</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 ring-1 ring-red-300/80" />
                    高
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 ring-1 ring-amber-300/80" />
                    中
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500 ring-1 ring-sky-300/80" />
                    低
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 ring-1 ring-emerald-300/80" />
                    健康
                  </span>
                  <span className="text-gray-400">（与「风险感知」规则一致）</span>
                </p>
              </div>
              {trace.enriched.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {replayPlaying && replayStep !== null && (
                    <span className="rounded-md bg-primary-soft px-2 py-1 text-xs font-medium tabular-nums text-primary ring-1 ring-primary/20">
                      回放 {replayStep + 1} / {trace.enriched.length}
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
                      回放
                    </button>
                  )}
                  {!replayPlaying && replayStep !== null && (
                    <>
                      <button
                        type="button"
                        onClick={() => setReplayPlaying(true)}
                        className="rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition hover:bg-primary-soft dark:bg-gray-900 dark:hover:bg-primary/20"
                      >
                        继续
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplayStep(0);
                          setReplayPlaying(true);
                        }}
                        className="app-btn-outline px-3 py-1.5 text-xs font-medium text-gray-800"
                      >
                        从头回放
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplayStep(null)}
                        className="app-btn-outline px-3 py-1.5 text-xs font-medium text-gray-600"
                      >
                        停止
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
                        暂停
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayStep(null);
                        }}
                        className="app-btn-outline px-3 py-1.5 text-xs font-medium text-gray-700"
                      >
                        停止
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
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">无时间戳</span>
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
                              风险·{traceRiskLevelLabel(riskLevel)}
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
                                title="相对上一条（当前排序下）"
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
                          {raw ? "隐藏原始行" : "原始 JSON"}
                        </button>
                      </div>
                      {raw && (
                        <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-gray-900/90 p-3 font-mono text-[11px] leading-relaxed text-gray-100">
                          {JSON.stringify(line, null, 2)}
                        </pre>
                      )}
                    </div>
                    </div>
                  </li>
                );
              })}
            </ul>
              </>
            )}

            {detailTab === "flow" && (
              <div className="mt-4">
                <p className="text-xs text-gray-600">
                  按 JSONL 写入顺序展示每条记录，共 <span className="tabular-nums font-medium">{jsonlLines.length}</span> 个事件。
                </p>
                <ul className="mt-4 space-y-3 border-l-2 border-gray-200 pl-4">
                  {jsonlLines.map((line, originalIndex) => {
                    const sum = summarizeJsonlLine(line);
                    const tMs = getJsonlLineTimeMs(line);
                    const raw = rawOpen.has(originalIndex);
                    return (
                      <li
                        id={`session-line-${originalIndex}`}
                        key={`flow-${originalIndex}-${sum.kind}`}
                        className="relative scroll-mt-24"
                      >
                        <span className="absolute -left-[21px] top-3 h-3 w-3 rounded-full border-2 border-white bg-gray-300 ring-1 ring-gray-200 dark:border-gray-950" />
                        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/40">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs tabular-nums text-gray-400">#{originalIndex + 1}</span>
                                <span className="font-mono text-[10px] text-gray-500">{line.type ?? "—"}</span>
                                <span
                                  className={[
                                    "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                    kindBadgeClass(sum.kind),
                                  ].join(" ")}
                                >
                                  {sum.title}
                                </span>
                                {tMs != null ? (
                                  <span className="text-xs font-medium tabular-nums text-gray-800">{formatMs(tMs)}</span>
                                ) : (
                                  <span className="text-xs text-gray-500">
                                    {sum.timeLabel ? formatLineTimeLabel(sum.timeLabel) : "无时间戳"}
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{sum.subtitle || "—"}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleRaw(originalIndex)}
                              className="app-btn-outline shrink-0 px-2 py-1 text-xs"
                            >
                              {raw ? "隐藏原始行" : "原始 JSON"}
                            </button>
                          </div>
                          {raw && (
                            <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-gray-900/90 p-3 font-mono text-[11px] leading-relaxed text-gray-100">
                              {JSON.stringify(line, null, 2)}
                            </pre>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {detailTab === "chat" && (
              <div className="mt-4">
                <p className="text-xs text-gray-600">
                  仅展示 <code className="rounded bg-gray-100 px-1 font-mono text-[11px]">type: message</code> 的对话，共{" "}
                  <span className="tabular-nums font-medium">{chatMessages.length}</span> 条；命中风险规则的条目在下方以{" "}
                  <span className="font-medium text-red-800">风险·高</span> /{" "}
                  <span className="font-medium text-amber-900">中</span> /{" "}
                  <span className="font-medium text-sky-900">低</span> 标记（与「风险感知」一致，悬停可看原因）。
                </p>
                {chatMessages.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">暂无对话消息。</p>
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
                                风险·{traceRiskLevelLabel(riskSev)}
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
                                  <span>工具结果</span>
                                  <span className="font-mono">{msg.toolName ?? "—"}</span>
                                  {msg.toolCallId != null && (
                                    <span className="font-mono text-[10px] font-normal text-amber-800/90">id {msg.toolCallId}</span>
                                  )}
                                  {msg.isError && (
                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">错误</span>
                                  )}
                                </div>
                                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">
                                  {messageTextContent(msg)}
                                </pre>
                              </div>
                              {chatMetaRow("center")}
                            </div>
                          );
                        }

                        return (
                          <div key={`chat-${lineIndex}-${kid}`} className="flex flex-col items-start gap-1">
                            <div className="max-w-[min(92%,720px)] rounded-2xl border border-gray-300 bg-gray-100 px-4 py-2 text-xs text-gray-800">
                              <span className="font-medium text-gray-600">message · {role}</span>
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

            {detailTab === "intent" && (
              <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-gray-600">
                  来源：首条用户消息（任务上下文）与助手消息中的{" "}
                  <code className="rounded bg-gray-100 px-1 font-mono text-[11px]">thinking</code>{" "}
                  推理块（模型对意图与步骤的理解）。
                </p>
                {intentDetail.userSummary ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-medium text-slate-600">用户输入（首条）</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-900">{intentDetail.userSummary.text}</p>
                    <p className="mt-2 font-mono text-[10px] text-gray-500">
                      第 {intentDetail.userSummary.lineIndex + 1} 行
                      {intentDetail.userSummary.tMs != null && ` · ${formatMs(intentDetail.userSummary.tMs)}`}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">未解析到首条用户消息。</p>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">推理链（thinking）</h4>
                  {intentDetail.thinkingBlocks.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">本会话无 thinking 推理块。</p>
                  ) : (
                    <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
                      {intentDetail.thinkingBlocks.map((tb, idx) => (
                        <li
                          key={`think-${tb.lineIndex}-${idx}`}
                          className="rounded-lg border border-violet-200/80 bg-violet-50/60 px-3 py-2"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="font-mono text-[10px]">第 {tb.lineIndex + 1} 行</span>
                            {tb.tMs != null && (
                              <span className="tabular-nums font-mono text-[10px]">{formatMs(tb.tMs)}</span>
                            )}
                            {tb.signature && (
                              <span className="font-mono text-[10px] text-violet-700" title="thinkingSignature">
                                {tb.signature.length > 24 ? `${tb.signature.slice(0, 20)}…` : tb.signature}
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{tb.thinking}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}

            {detailTab === "model" && (
              <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-gray-600">
                  汇总助手各轮的 model / provider / api、Token 与费用；下列出会话中的模型切换、思考档位与模型快照。
                </p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">助手轮次</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">{modelInvocations.assistantCalls.length}</span>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">Σ totalTokens</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">
                      {num(modelInvocations.totals.totalTokens)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">Σ input / output</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">
                      {num(modelInvocations.totals.totalInput)} / {num(modelInvocations.totals.totalOutput)}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                    <span className="text-gray-500">Σ 费用 (usage.cost.total)</span>{" "}
                    <span className="font-semibold tabular-nums text-gray-900">
                      ${fmtUsd(modelInvocations.totals.totalCost)}
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">配置与快照</h4>
                  {modelInvocations.snapshots.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">无 model_change / thinking_level / model-snapshot 等记录。</p>
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
                  <h4 className="text-sm font-semibold text-gray-900">助手轮次</h4>
                  {modelInvocations.assistantCalls.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">无助手用量记录。</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
                      <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50/80">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">#</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">时间</th>
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
              <div className="mt-4 space-y-4">
                {Object.keys(toolData.byName).length > 0 && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                    <p className="text-xs font-medium text-gray-600">按工具名计数</p>
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
                  <p className="text-sm text-gray-500">本会话 JSONL 中未解析到工具调用记录。</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50/80">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">时间</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">工具</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">参数摘要</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/40">
                        {toolData.calls.map((call, i) => (
                          <tr key={`${call.lineIndex}-${i}`} className="hover:bg-gray-50/50">
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{call.lineIndex + 1}</td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-gray-800">
                              {call.tMs != null ? formatMs(call.tMs) : "—"}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">{call.name}</td>
                            <td className="max-w-md px-3 py-2 font-mono text-xs text-gray-700 break-all">{strArgs(call.arguments)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailTab === "network" && (
              <div className="mt-4 space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">URL / 网络相关</h4>
                  {netFileData.urls.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">未解析到 URL。</p>
                  ) : (
                    <ul className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 font-mono text-xs break-all">
                      {netFileData.urls.map((row, i) => (
                        <li key={`${row.lineIndex}-${row.url}-${i}`} className="leading-relaxed">
                          {row.tMs != null && (
                            <span className="mr-2 tabular-nums text-slate-500">{formatMs(row.tMs)}</span>
                          )}
                          <NetUrlHighlight url={row.url} />
                          {row.source && (
                            <span className="ml-2 inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200/80">
                              {row.source}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">读文件</h4>
                  {netFileData.fileReads.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">无记录。</p>
                  ) : (
                    <ul className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 font-mono text-xs break-all">
                      {netFileData.fileReads.map((fr, i) => (
                        <li key={`r-${i}-${fr.path}`} className="leading-relaxed">
                          {fr.tMs != null && (
                            <span className="mr-2 tabular-nums text-slate-500">{formatMs(fr.tMs)}</span>
                          )}
                          <NetPathHighlight path={fr.path} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">写文件</h4>
                  {netFileData.fileWrites.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">无记录。</p>
                  ) : (
                    <ul className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 font-mono text-xs break-all">
                      {netFileData.fileWrites.map((fw, i) => (
                        <li key={`w-${i}-${fw.path}`} className="leading-relaxed">
                          {fw.tMs != null && (
                            <span className="mr-2 tabular-nums text-slate-500">{formatMs(fw.tMs)}</span>
                          )}
                          <span
                            className={[
                              "mr-1.5 inline-flex rounded px-1.5 py-0.5 align-middle text-[11px] font-semibold ring-1 ring-inset",
                              netFileOpBadgeClass(fw.op),
                            ].join(" ")}
                          >
                            {fw.op ?? "write"}
                          </span>
                          <NetPathHighlight path={fw.path} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">exec</h4>
                  {netFileData.execs.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">无记录。</p>
                  ) : (
                    <ul className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 font-mono text-xs break-all">
                      {netFileData.execs.map((ex, i) => (
                        <li key={`e-${i}`} className="leading-relaxed">
                          {ex.tMs != null && (
                            <span className="mr-2 tabular-nums text-slate-500">{formatMs(ex.tMs)}</span>
                          )}
                          <NetCommandHighlight command={ex.command} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">process</h4>
                  {netFileData.processOps.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">无记录。</p>
                  ) : (
                    <ul className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 font-mono text-xs break-all">
                      {netFileData.processOps.map((po, i) => (
                        <li key={`p-${i}`} className="leading-relaxed">
                          {po.tMs != null && (
                            <span className="mr-2 tabular-nums text-slate-500">{formatMs(po.tMs)}</span>
                          )}
                          <span className="rounded-md bg-primary-soft px-1.5 py-0.5 font-semibold text-primary ring-1 ring-primary/15">
                            {po.action}
                          </span>
                          {po.sessionId != null && (
                            <span className="ml-2 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-900 ring-1 ring-emerald-200/80">
                              sessionId {po.sessionId}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {detailTab === "risk" && (
              <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  基于 JSONL 的启发式风险项：解析失败、工具/扩展错误、非零退出码、进程异常、停止原因、异常时间间隔、可疑命令行等。仅供参考，请结合业务复核。
                  <span className="mt-1 block text-gray-700 dark:text-gray-300">点击任意条目将跳转至「会话过程」中对应行，并自动展开该条原始 JSON。</span>
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-800 ring-1 ring-red-200/80">
                    高 {riskItems.filter((x) => x.severity === "high").length}
                  </span>
                  <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900 ring-1 ring-amber-200/80">
                    中 {riskItems.filter((x) => x.severity === "medium").length}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200/80">
                    低 {riskItems.filter((x) => x.severity === "low").length}
                  </span>
                  <span className="text-gray-500">共 {riskItems.length} 条</span>
                </div>
                {riskItems.length === 0 ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
                    当前未发现匹配上述规则的风险项。
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {riskItems.map((r, idx) => (
                      <li
                        key={`${r.category}-${r.lineIndex}-${idx}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`查看第 ${r.lineIndex + 1} 行日志：${r.title}`}
                        className={[
                          "rounded-r-lg border border-l-4 border-gray-200 p-3 shadow-sm transition hover:ring-2 hover:ring-primary/25 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-gray-700",
                          riskSeverityPanelClass(r.severity),
                        ].join(" ")}
                        onClick={() => openRiskSourceLine(r.lineIndex)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            openRiskSourceLine(r.lineIndex);
                          }
                        }}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                  riskSeverityBadgeClass(r.severity),
                                ].join(" ")}
                              >
                                {r.severity === "high" ? "高" : r.severity === "medium" ? "中" : "低"}
                              </span>
                              <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 ring-1 ring-gray-200/80">
                                {RISK_CATEGORY_LABEL[r.category] ?? r.category}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">{r.title}</span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{r.detail}</p>
                          </div>
                          <div className="shrink-0 text-right text-[10px] text-gray-500 dark:text-gray-400">
                            <div className="font-mono">第 {r.lineIndex + 1} 行</div>
                            <div className="tabular-nums">{r.tMs != null ? formatMs(r.tMs) : "—"}</div>
                            <div className="mt-1 font-sans text-primary">点击查看日志 →</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function SessionAudit() {
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sortKey, setSortKey] = useState("durationMs");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [detailRow, setDetailRow] = useState(null);

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
          setLoadError("接口返回格式异常（应为数组）。");
          return;
        }
        setRows(mapAgentSessionRows(data));
        setLoadError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setRows([]);
        setLoadError(
          `无法加载 Doris 会话列表：${e.message || String(e)}。开发环境请使用 npm run dev（内置 /api/agent-sessions）；预览请先另开终端执行 npm run api 再 npm run preview。`,
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
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.sessionKey,
        r.sessionId,
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
  }, [rows, query]);

  const sorted = useMemo(() => sortSessionRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const p0 = pageSafe - 1;
    return sorted.slice(p0 * pageSize, p0 * pageSize + pageSize);
  }, [sorted, pageSafe, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, sortKey, sortDir, pageSize]);

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
    return <SessionAuditDetail row={detailRow} onBack={() => setDetailRow(null)} />;
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{loadError}</p>
      )}

      <section className="app-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">会话索引审计</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              点击行<strong>下钻</strong>查看会话详情（索引元数据 + JSONL 转写时间线）。列表主表来自{" "}
              <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">otel.agent_sessions</code>
              ；总 Token、工具/网络/文件/exec 次数及风险分级由{" "}
              <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">otel.agent_sessions_logs</code>
              汇总，规则与详情页「工具调用 / 网络和文件 / 风险感知」一致。
            </p>
          </div>
          <div className="min-w-[200px] flex-1 sm:max-w-sm">
            <label className="sr-only" htmlFor="session-audit-search">
              搜索
            </label>
            <input
              id="session-audit-search"
              type="search"
              placeholder="搜索会话键、会话 ID、Agent、通道、来源、模型…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="app-input w-full py-2 px-3 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>

        <TablePagination page={pageSafe} pageSize={pageSize} total={sorted.length} onPageChange={setPage} className="mt-4" />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="app-input py-1.5 px-2"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>条</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1880px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-800/80 dark:text-gray-400">
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("sessionId")}>
                    会话 ID {sortKey === "sessionId" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("agentName")}>
                    Agent 名称 {sortKey === "agentName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("startedAt")}>
                    开始时间 {sortKey === "startedAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("endedAt")}>
                    结束时间 {sortKey === "endedAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("durationMs")}>
                    持续时间 {sortKey === "durationMs" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("chatType")}>
                    聊天类型 {sortKey === "chatType" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("channel")}>
                    通道 {sortKey === "channel" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("originProvider")}>
                    来源提供方 {sortKey === "originProvider" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer px-3 py-3" onClick={() => toggleSort("model")}>
                    模型 {sortKey === "model" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("totalTokens")}>
                    总 Token {sortKey === "totalTokens" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("toolUseCount")}>
                    工具使用 {sortKey === "toolUseCount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("riskHigh")} title="按「高」风险条数排序">
                    风险 (高/中/低) {sortKey === "riskHigh" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("networkAccessCount")}>
                    网络访问 {sortKey === "networkAccessCount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("fileOpCount")}>
                    文件操作 {sortKey === "fileOpCount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="cursor-pointer whitespace-nowrap px-3 py-3" onClick={() => toggleSort("execCount")}>
                    exec {sortKey === "execCount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="px-3 py-3">上轮中止</th>
                  <th className="max-w-[200px] px-3 py-3">标签</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pageSlice.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-4 py-10 text-center text-gray-500">
                      无匹配记录
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
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{row.sessionId ?? "—"}</td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-gray-800 dark:text-gray-200" title={row.agentName || ""}>
                          {row.agentName ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{formatMs(row.startedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{formatMs(row.endedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200" title={row.durationMs != null ? `${row.durationMs} ms` : ""}>
                          {formatDurationMs(row.durationMs)}
                        </td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{row.chatType ?? "—"}</td>
                        <td className="max-w-[7rem] truncate px-3 py-2 text-gray-800 dark:text-gray-200" title={row.channel || ""}>
                          {row.channel ?? "—"}
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-gray-800 dark:text-gray-200" title={row.originProvider || ""}>
                          {row.originProvider ?? "—"}
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-gray-800 dark:text-gray-200">{row.model ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{num(row.totalTokens)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{num(row.toolUseCount)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          <span className="font-medium text-red-700 dark:text-red-400">高 {row.riskHigh ?? 0}</span>
                          <span className="text-gray-400"> · </span>
                          <span className="font-medium text-amber-800 dark:text-amber-300">中 {row.riskMedium ?? 0}</span>
                          <span className="text-gray-400"> · </span>
                          <span className="font-medium text-slate-600 dark:text-slate-400">低 {row.riskLow ?? 0}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{num(row.networkAccessCount)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{num(row.fileOpCount)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200">{num(row.execCount)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              row.abortedLastRun
                                ? "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25"
                                : "bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/20",
                            ].join(" ")}
                          >
                            {row.abortedLastRun ? "是" : "否"}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-xs text-gray-600 dark:text-gray-400" title={row.label || ""}>
                          {row.label || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
