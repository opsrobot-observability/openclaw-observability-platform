import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";

const SPAN_NAME_LABELS = {
  "openclaw.message.processed": intl.get("callChain.spanNameMessageProcessed"),
  "openclaw.model.usage": intl.get("callChain.spanNameModelUsage"),
  "openclaw.webhook.processed": intl.get("callChain.spanNameWebhookProcessed"),
  "openclaw.webhook.error": intl.get("callChain.spanNameWebhookError"),
  "openclaw.session.stuck": intl.get("callChain.spanNameSessionStuck"),
};

function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return "—";
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "min";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  return ms.toFixed(1) + "ms";
}

function formatDurationShort(ms) {
  if (ms == null || isNaN(ms)) return "—";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms.toFixed(0) + "ms";
}

function truncateId(id, prefixLen = 8, suffixLen = 8) {
  if (!id) return "—";
  if (id.length <= prefixLen + suffixLen + 3) return id;
  return id.substring(0, prefixLen) + "..." + id.substring(id.length - suffixLen);
}

function CopyButton({ text, className = "" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button type="button" onClick={handleCopy} className={["inline-flex items-center justify-center h-5 w-5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-primary", className].join(" ")} title={intl.get("detail.copy")}>
      {copied ? <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-500" /> : <Icon name="link" className="h-3.5 w-3.5" />}
    </button>
  );
}

function getSpanKindLabel(kind) {
  switch (kind) {
    case "SERVER": return { label: "SERVER", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", icon: "server" };
    case "CLIENT": return { label: "CLIENT", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300", icon: "globe" };
    case "INTERNAL": return { label: "INTERNAL", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300", icon: "layers" };
    case "CONSUMER": return { label: "CONSUMER", color: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300", icon: "play" };
    case "PRODUCER": return { label: "PRODUCER", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", icon: "zap" };
    default: return { label: kind || "SPAN", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: "square" };
  }
}

function getDirectionLabel(kind) {
  switch (kind) {
    case "SERVER": return "server";
    case "CLIENT": return "client";
    case "INTERNAL": return "local";
    case "CONSUMER": return "consumer";
    case "PRODUCER": return "producer";
    default: return "local";
  }
}

function buildSpanTree(spans) {
  if (!spans || spans.length === 0) return [];
  const map = new Map();
  const roots = [];
  for (const s of spans) {
    map.set(s.spanId, { ...s, children: [], level: 0 });
  }
  for (const s of spans) {
    const node = map.get(s.spanId);
    if (s.parentSpanId && map.has(s.parentSpanId)) {
      map.get(s.parentSpanId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  function setLevel(nodes, level) {
    for (const n of nodes) {
      n.level = level;
      setLevel(n.children, level + 1);
    }
  }
  setLevel(roots, 0);
  return roots;
}

function flattenTree(roots) {
  const result = [];
  function walk(nodes) {
    for (const n of nodes) {
      result.push(n);
      walk(n.children);
    }
  }
  walk(roots);
  return result;
}

function getOpenClawAttrs(span) {
  const attrs = {};
  if (span.sessionId) attrs["session.id"] = span.sessionId;
  else if (span.sessionKey) attrs["session.id"] = span.sessionKey;
  if (span.channel) attrs["channel"] = span.channel;
  if (span.modelName) attrs["model"] = span.modelName;
  if (span.tokens) attrs["tokens.total"] = span.tokens;
  if (span.inputTokens) attrs["tokens.input"] = span.inputTokens;
  if (span.outputTokens) attrs["tokens.output"] = span.outputTokens;
  if (span.runId) attrs["run.id"] = span.runId;
  if (span.roundId) attrs["round.id"] = span.roundId;
  if (span.version) attrs["version"] = span.version;
  if (span.errorType) attrs["error.type"] = span.errorType;
  if (span.errorMessage) attrs["error.message"] = span.errorMessage;
  return attrs;
}

function computeSelfDuration(node) {
  const childTotal = (node.children || []).reduce((a, c) => a + (c.durationMs || 0), 0);
  return Math.max(0, (node.durationMs || 0) - childTotal);
}

function parseTimeToMs(timeStr) {
  if (!timeStr) return 0;
  try {
    return new Date(timeStr).getTime();
  } catch {
    return 0;
  }
}

export default function SpanDetailView({ traceId, instanceId, onBack, timeParams }) {
  const [spans, setSpans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [searchText, setSearchText] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDrawer, setShowDrawer] = useState(true);
  const ganttRef = useRef(null);

  useEffect(() => {
    if (!traceId || !instanceId) return;
    setLoading(true);
    const baseParams = timeParams || "hours=1";
    fetch(`/api/instance-detail/traces?instanceId=${encodeURIComponent(instanceId)}&${baseParams}&traceId=${encodeURIComponent(traceId)}`)
      .then((res) => res.ok ? res.json() : Promise.reject(res.statusText))
      .then((data) => {
        setSpans(data.spans || []);
        const firstError = (data.spans || []).find((s) => s.status === "error");
        if (firstError) setSelectedSpanId(firstError.spanId);
        else if (data.spans?.length > 0) setSelectedSpanId(data.spans[0].spanId);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [traceId, instanceId, timeParams]);

  const tree = useMemo(() => buildSpanTree(spans), [spans]);
  const flatList = useMemo(() => flattenTree(tree), [tree]);

  const selectedSpan = useMemo(() => spans.find((s) => s.spanId === selectedSpanId), [spans, selectedSpanId]);

  const errorCount = spans.filter((s) => s.status === "error").length;
  const serviceNames = useMemo(() => [...new Set(spans.map((s) => s.serviceName).filter(Boolean))], [spans]);

  const traceStartMs = useMemo(() => {
    if (spans.length === 0) return 0;
    return Math.min(...spans.map((s) => parseTimeToMs(s.startTime)));
  }, [spans]);

  const traceEndMs = useMemo(() => {
    if (spans.length === 0) return 0;
    return Math.max(...spans.map((s) => parseTimeToMs(s.startTime) + (s.durationMs || 0)));
  }, [spans]);

  const traceTotalMs = traceEndMs - traceStartMs;

  const toggleCollapse = (spanId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId); else next.add(spanId);
      return next;
    });
  };

  const collapseAll = () => {
    const ids = new Set();
    for (const s of flatList) {
      if (s.children && s.children.length > 0) ids.add(s.spanId);
    }
    setCollapsedIds(ids);
  };

  const expandAll = () => setCollapsedIds(new Set());

  const locateToError = () => {
    const firstError = spans.find((s) => s.status === "error");
    if (firstError) {
      setSelectedSpanId(firstError.spanId);
      const el = document.getElementById(`gantt-row-${firstError.spanId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const locateToSelected = () => {
    if (selectedSpanId) {
      const el = document.getElementById(`gantt-row-${selectedSpanId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleSearch = useCallback(() => {
    if (!searchText.trim()) return;
    const kw = searchText.toLowerCase();
    const found = flatList.find((s) =>
      (s.spanName || "").toLowerCase().includes(kw) ||
      (s.serviceName || "").toLowerCase().includes(kw) ||
      (s.spanId || "").toLowerCase().includes(kw)
    );
    if (found) {
      setSelectedSpanId(found.spanId);
      const el = document.getElementById(`gantt-row-${found.spanId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchText, flatList]);

  const sessionIds = useMemo(() => {
    const ids = new Set();
    for (const s of spans) {
      if (s.sessionKey) ids.add(s.sessionKey);
      if (s.sessionId) ids.add(s.sessionId);
    }
    return [...ids];
  }, [spans]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className={["flex flex-col h-full bg-white dark:bg-gray-900", isFullscreen ? "fixed inset-0 z-50" : ""].join(" ")}>
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Icon name="server" className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.appCount")}:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{serviceNames.length}</span>
          </div>
          <div className="h-3 w-px bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-1.5 text-xs">
            <Icon name="layers" className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.spanCount")}:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{spans.length}</span>
          </div>
          {errorCount > 0 && (
            <>
              <div className="h-3 w-px bg-gray-200 dark:bg-gray-700" />
              <button type="button" onClick={locateToError} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60 transition-colors cursor-pointer">
                <Icon name="alert" className="h-3 w-3" />{intl.get("spanDetail.errorDetected", { count: errorCount })}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary transition-colors">
            <Icon name="arrow-left" className="h-3.5 w-3.5" />{intl.get("spanDetail.backToTrace")}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M5 8h6M8 5v6" /></svg>
              {spans.length} Spans
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-950/30 px-2 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-900/40">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg>
              {formatDuration(traceTotalMs)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-950/30 px-2 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-100 dark:border-sky-900/40">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="12" height="4" rx="1" /><circle cx="5" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="11" cy="8" r="1" fill="currentColor" /></svg>
              {serviceNames.length} {intl.get("spanDetail.appCount")}
            </span>
            {errorCount > 0 ? (
              <button type="button" onClick={locateToError} className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950/30 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer transition-colors">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><line x1="8" y1="5" x2="8" y2="9" /><circle cx="8" cy="11" r="0.5" fill="currentColor" /></svg>
                {errorCount} {intl.get("spanDetail.errorCount")}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 8l3 3 5-6" /></svg>
                {intl.get("detail.statusOk")}
              </span>
            )}
            {(() => {
              const rootSpan = spans.find((s) => !s.parentSpanId);
              if (!rootSpan) return null;
              return (
                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 dark:bg-gray-800/60 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8h12M8 2v12" /></svg>
                  {SPAN_NAME_LABELS[rootSpan.spanName] || rootSpan.spanName}
                </span>
              );
            })()}
            {(() => {
              const sessionIds = [...new Set(spans.map((s) => s.sessionId || s.sessionKey).filter(Boolean))];
              if (sessionIds.length === 0) return null;
              return (
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-950/30 px-2 py-1 text-xs font-mono text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40" title={sessionIds[0]}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h8v8H4z" /><path d="M6 2v2M10 2v2M6 12v2M10 12v2M2 6h2M2 10h2M12 6h2M12 10h2" /></svg>
                  {truncateId(sessionIds[0], 6, 4)}
                </span>
              );
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative h-5 bg-gray-50 dark:bg-gray-800/50 rounded overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500/20 to-blue-400/20 rounded" style={{ width: "100%" }} />
              {spans.map((s, i) => {
                const startOffset = traceTotalMs > 0 ? (parseTimeToMs(s.startTime) - traceStartMs) / traceTotalMs * 100 : 0;
                const width = traceTotalMs > 0 ? Math.max(0.5, (s.durationMs || 0) / traceTotalMs * 100) : 0;
                const barColor = s.status === "error" ? "bg-red-500/70" : s.durationMs > 10000 ? "bg-amber-500/70" : "bg-blue-500/70";
                return (
                  <div key={i} className={["absolute top-0.5 bottom-0.5 rounded-sm", barColor].join(" ")} style={{ left: `${startOffset}%`, width: `${width}%` }} title={`${SPAN_NAME_LABELS[s.spanName] || s.spanName}: ${formatDuration(s.durationMs)}`} />
                );
              })}
              <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
                <span className="text-[9px] text-gray-500 dark:text-gray-400 font-mono">{formatDuration(traceTotalMs)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder={intl.get("spanDetail.searchPlaceholder")} className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-7 pr-3 py-1 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setSearchText("")} className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary transition-colors" title={intl.get("spanDetail.clearSearch")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
          </button>
          <button type="button" onClick={handleSearch} className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary transition-colors" title={intl.get("spanDetail.search")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><line x1="10.2" y1="10.2" x2="13.5" y2="13.5" /></svg>
          </button>
          <button type="button" onClick={locateToSelected} className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary transition-colors" title={intl.get("spanDetail.locate")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="2" /><circle cx="8" cy="8" r="5.5" /><line x1="8" y1="1" x2="8" y2="3.5" /><line x1="8" y1="12.5" x2="8" y2="15" /><line x1="1" y1="8" x2="3.5" y2="8" /><line x1="12.5" y1="8" x2="15" y2="8" /></svg>
          </button>
          <button type="button" className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary transition-colors" title={intl.get("spanDetail.refresh")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.5-3.8" /><polyline points="13.5 2 13.5 5 10.5 5" /></svg>
          </button>
          <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary transition-colors" title={intl.get("spanDetail.fullscreen")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 2 14 2 14 6" /><polyline points="6 14 2 14 2 10" /><line x1="14" y1="2" x2="9.5" y2="6.5" /><line x1="2" y1="14" x2="6.5" y2="9.5" /></svg>
          </button>
          <button type="button" className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary transition-colors" title={intl.get("spanDetail.settings")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2" /><path d="M13.3 10a1.2 1.2 0 0 0 .2 1.3l.1.1a1.45 1.45 0 1 1-2.05 2.05l-.1-.1a1.2 1.2 0 0 0-1.3-.2 1.2 1.2 0 0 0-.7 1.1v.3a1.45 1.45 0 1 1-2.9 0v-.1a1.2 1.2 0 0 0-.7-1.1 1.2 1.2 0 0 0-1.3.2l-.1.1a1.45 1.45 0 1 1-2.05-2.05l.1-.1a1.2 1.2 0 0 0 .2-1.3 1.2 1.2 0 0 0-1.1-.7h-.3a1.45 1.45 0 0 1 0-2.9h.1a1.2 1.2 0 0 0 1.1-.7 1.2 1.2 0 0 0-.2-1.3l-.1-.1A1.45 1.45 0 1 1 4.15 2.6l.1.1a1.2 1.2 0 0 0 1.3.2h.1a1.2 1.2 0 0 0 .7-1.1v-.3a1.45 1.45 0 0 1 2.9 0v.1a1.2 1.2 0 0 0 .7 1.1 1.2 1.2 0 0 0 1.3-.2l.1-.1a1.45 1.45 0 1 1 2.05 2.05l-.1.1a1.2 1.2 0 0 0-.2 1.3v.1a1.2 1.2 0 0 0 1.1.7h.3a1.45 1.45 0 0 1 0 2.9h-.1a1.2 1.2 0 0 0-1.1.7z" /></svg>
          </button>
        </div>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={expandAll} className="text-[11px] text-primary hover:text-primary/80">{intl.get("spanDetail.expandAll")}</button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button type="button" onClick={collapseAll} className="text-[11px] text-primary hover:text-primary/80">{intl.get("spanDetail.collapseAll")}</button>
        </div>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <button type="button" onClick={() => setShowDrawer(!showDrawer)} className={["inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors", showDrawer ? "text-[#1890ff] dark:text-primary" : "text-[#666] hover:text-[#1890ff] dark:text-gray-400 dark:hover:text-primary"].join(" ")} title={showDrawer ? intl.get("spanDetail.collapseDrawer") : intl.get("spanDetail.expandDrawer")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5" /><line x1="11" y1="2" x2="11" y2="14" /><polyline points="7 6 9 8 7 10" /></svg>
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto" ref={ganttRef}>
          <GanttTreeView
            tree={tree}
            collapsedIds={collapsedIds}
            toggleCollapse={toggleCollapse}
            selectedSpanId={selectedSpanId}
            onSelectSpan={setSelectedSpanId}
            traceStartMs={traceStartMs}
            traceTotalMs={traceTotalMs}
            searchText={searchText}
          />
        </div>

        {showDrawer && (
          <div className="w-[360px] shrink-0 border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 overflow-y-auto">
            {selectedSpan ? (
              <SpanDetailDrawer span={selectedSpan} traceId={traceId} allSpans={spans} onSelectSpan={setSelectedSpanId} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                <Icon name="info" className="h-8 w-8 mb-2 opacity-50" />
                <p>{intl.get("spanDetail.selectSpanHint")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GanttTreeView({ tree, collapsedIds, toggleCollapse, selectedSpanId, onSelectSpan, traceStartMs, traceTotalMs, searchText }) {
  if (tree.length === 0) {
    return <div className="flex items-center justify-center py-12 text-xs text-gray-400">{intl.get("callChain.noTraceData")}</div>;
  }

  const kw = (searchText || "").toLowerCase();

  return (
    <div className="min-w-[900px]">
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm text-[10px] font-medium text-gray-500 dark:text-gray-400">
        <div className="w-[380px] shrink-0 px-3 py-1.5 border-r border-gray-200 dark:border-gray-700">{intl.get("spanDetail.colSpanInfo")}</div>
        <div className="flex-1 px-2 py-1.5 relative">
          {traceTotalMs > 0 && [0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const ms = traceTotalMs * pct;
            return (
              <span key={pct} className="absolute text-[9px] font-mono text-gray-400 dark:text-gray-500 -translate-x-1/2" style={{ left: `${pct * 100}%` }}>
                {formatDurationShort(ms)}
              </span>
            );
          })}
        </div>
        <div className="w-[80px] shrink-0 px-2 py-1.5 text-right border-l border-gray-200 dark:border-gray-700">{intl.get("spanDetail.colDuration")}</div>
      </div>
      <div>
        {tree.map((node) => (
          <GanttRow
            key={node.spanId}
            node={node}
            collapsedIds={collapsedIds}
            toggleCollapse={toggleCollapse}
            selectedSpanId={selectedSpanId}
            onSelectSpan={onSelectSpan}
            traceStartMs={traceStartMs}
            traceTotalMs={traceTotalMs}
            depth={0}
            searchKw={kw}
          />
        ))}
      </div>
    </div>
  );
}

function GanttRow({ node, collapsedIds, toggleCollapse, selectedSpanId, onSelectSpan, traceStartMs, traceTotalMs, depth, searchKw }) {
  const isCollapsed = collapsedIds.has(node.spanId);
  const isSelected = selectedSpanId === node.spanId;
  const isError = node.status === "error";
  const hasChildren = node.children && node.children.length > 0;
  const kind = getSpanKindLabel(node.spanKind);
  const direction = getDirectionLabel(node.spanKind);
  const selfMs = computeSelfDuration(node);
  const selfPct = node.durationMs > 0 ? selfMs / node.durationMs : 1;

  const spanStartOffset = traceTotalMs > 0 ? (parseTimeToMs(node.startTime) - traceStartMs) / traceTotalMs * 100 : 0;
  const spanWidth = traceTotalMs > 0 ? Math.max(0.3, (node.durationMs || 0) / traceTotalMs * 100) : 0;
  const selfWidth = spanWidth * selfPct;
  const selfOffset = (() => {
    if (!hasChildren || node.children.length === 0) return 0;
    const firstChildStart = traceTotalMs > 0 ? (parseTimeToMs(node.children[0].startTime) - traceStartMs) / traceTotalMs * 100 : 0;
    return firstChildStart - spanStartOffset;
  })();

  const isMatch = searchKw && (
    (node.spanName || "").toLowerCase().includes(searchKw) ||
    (node.serviceName || "").toLowerCase().includes(searchKw) ||
    (node.spanId || "").toLowerCase().includes(searchKw)
  );

  let barColor = "bg-blue-500";
  if (isError) barColor = "bg-red-500";
  else if (node.durationMs > 10000) barColor = "bg-red-400";
  else if (node.durationMs > 5000) barColor = "bg-amber-400";

  let selfBarColor = "bg-gray-800/60 dark:bg-gray-200/60";
  if (isError) selfBarColor = "bg-red-900/70 dark:bg-red-200/70";

  return (
    <>
      <div
        id={`gantt-row-${node.spanId}`}
        onClick={() => onSelectSpan(node.spanId)}
        className={["flex items-center border-b border-gray-50 dark:border-gray-800/60 cursor-pointer transition-colors hover:bg-blue-50/30 dark:hover:bg-blue-950/10",
          isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : isError ? "bg-red-50/20 dark:bg-red-950/10" : "",
          isMatch ? "ring-1 ring-inset ring-yellow-400" : ""
        ].join(" ")}
      >
        <div className="w-[380px] shrink-0 flex items-center px-2 py-1.5 border-r border-gray-50 dark:border-gray-800/40">
          <div style={{ paddingLeft: `${depth * 20}px` }} className="flex items-center gap-1 shrink-0">
            {hasChildren ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleCollapse(node.spanId); }} className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-primary transition-colors">
                <Icon name="chevron" className={["h-3 w-3 transition-transform", isCollapsed ? "" : "rotate-180"].join(" ")} />
                <span className="font-medium">{node.children.length}</span>
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
          </div>

          <div className="flex-1 min-w-0 ml-1">
            <div className="flex items-center gap-1">
              <span className={["text-xs truncate font-medium", isError ? "text-red-700 dark:text-red-400" : "text-gray-900 dark:text-gray-100"].join(" ")} title={node.spanName}>
                {SPAN_NAME_LABELS[node.spanName] || node.spanName}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-gray-600 dark:text-gray-400">{node.serviceName || "—"}</span>
              <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${kind.color}`}>{kind.label}</span>
              <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">nodejs</span>
              <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{direction}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 relative h-8 px-1">
          <div className="absolute inset-y-1 left-0 right-0">
            {depth > 0 && <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" style={{ left: `${spanStartOffset}%` }} />}
            <div
              className={["absolute top-0.5 bottom-0.5 rounded-sm", barColor, "opacity-80 hover:opacity-100 transition-opacity"].join(" ")}
              style={{ left: `${spanStartOffset}%`, width: `${spanWidth}%` }}
              title={`${SPAN_NAME_LABELS[node.spanName] || node.spanName}: ${formatDuration(node.durationMs)}`}
            >
              {hasChildren && node.children.length > 0 && selfMs > 0 && selfWidth > 0.5 && (
                <div
                  className={["absolute top-0 bottom-0 rounded-sm", selfBarColor].join(" ")}
                  style={{ left: `${selfOffset / spanWidth * 100}%`, width: `${Math.max(1, selfWidth / spanWidth * 100)}%` }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="w-[80px] shrink-0 px-2 py-1.5 text-right border-l border-gray-50 dark:border-gray-800/40">
          <span className={["font-mono text-[11px]",
            isError ? "text-red-600 dark:text-red-400 font-semibold" : node.durationMs > 10000 ? "text-red-600 dark:text-red-400 font-semibold" : node.durationMs > 5000 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-gray-700 dark:text-gray-300"
          ].join(" ")}>{formatDuration(node.durationMs)}</span>
        </div>
      </div>

      {!isCollapsed && hasChildren && node.children.map((child) => (
        <GanttRow
          key={child.spanId}
          node={child}
          collapsedIds={collapsedIds}
          toggleCollapse={toggleCollapse}
          selectedSpanId={selectedSpanId}
          onSelectSpan={onSelectSpan}
          traceStartMs={traceStartMs}
          traceTotalMs={traceTotalMs}
          depth={depth + 1}
          searchKw={searchKw}
        />
      ))}
    </>
  );
}

function SpanDetailDrawer({ span, traceId, allSpans, onSelectSpan }) {
  const [showAttributes, setShowAttributes] = useState(true);
  const isError = span.status === "error";
  const kind = getSpanKindLabel(span.spanKind);
  const ocAttrs = useMemo(() => getOpenClawAttrs(span), [span]);

  const parentSpan = useMemo(() => allSpans.find((s) => s.spanId === span.parentSpanId), [allSpans, span.parentSpanId]);
  const childSpans = useMemo(() => allSpans.filter((s) => s.parentSpanId === span.spanId), [allSpans, span.spanId]);

  const avgDuration = allSpans.length > 0 ? allSpans.reduce((a, s) => a + s.durationMs, 0) / allSpans.length : 0;
  const durationPercentile = allSpans.length > 0 ? allSpans.filter((s) => s.durationMs <= span.durationMs).length / allSpans.length * 100 : 0;
  const isSlowOutlier = span.durationMs > avgDuration * 3;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{intl.get("spanDetail.basicInfo")}</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <Icon name="server" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500 dark:text-gray-400 shrink-0">{intl.get("spanDetail.appName")}:</span>
            <span className="text-gray-900 dark:text-gray-100">{span.serviceName || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Icon name="layers" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500 dark:text-gray-400 shrink-0">{intl.get("detail.colSpanName")}:</span>
            <span className={isError ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-900 dark:text-gray-100"}>{SPAN_NAME_LABELS[span.spanName] || span.spanName}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Icon name="monitor" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500 dark:text-gray-400 shrink-0">{intl.get("spanDetail.host")}:</span>
            <span className="text-gray-900 dark:text-gray-100">{span.hostName || "—"}</span>
            {span.hostIp && <span className="font-mono text-gray-500 dark:text-gray-400">({span.hostIp})</span>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Icon name="clock" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500 dark:text-gray-400 shrink-0">{intl.get("detail.colStartTime")}:</span>
            <span className="text-gray-900 dark:text-gray-100">{span.startTime || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Icon name="link" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500 dark:text-gray-400 shrink-0">SpanID:</span>
            <span className="font-mono text-primary text-[11px]" title={span.spanId}>{truncateId(span.spanId)}</span>
            <CopyButton text={span.spanId || ""} className="!h-4 !w-4" />
          </div>
          {span.parentSpanId && (
            <div className="flex items-center gap-2 text-xs">
              <Icon name="git-branch" className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="text-gray-500 dark:text-gray-400 shrink-0">{intl.get("spanDetail.parentSpanId")}:</span>
              <span className="font-mono text-primary text-[11px] cursor-pointer" title={span.parentSpanId} onClick={() => parentSpan && onSelectSpan(span.parentSpanId)}>{truncateId(span.parentSpanId)}</span>
              <CopyButton text={span.parentSpanId || ""} className="!h-4 !w-4" />
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            {isError ? <Icon name="alert" className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            <span className="text-gray-500 dark:text-gray-400 shrink-0">{intl.get("detail.colStatus")}:</span>
            <span className={isError ? "text-red-600 dark:text-red-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>{isError ? intl.get("detail.statusError") : intl.get("detail.statusOk")}</span>
            {span.statusMessage && <span className="text-gray-400 dark:text-gray-500 ml-1">({span.statusMessage})</span>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${kind.color}`}>{kind.label}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{intl.get("spanDetail.performanceContext")}</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{intl.get("detail.colDuration")}:</span>
            <span className={["font-mono font-semibold", span.durationMs > 10000 ? "text-red-600 dark:text-red-400" : span.durationMs > 5000 ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-gray-100"].join(" ")}>{formatDuration(span.durationMs)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.avgTraceDuration")}:</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{formatDuration(avgDuration)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.durationPercentile")}:</span>
            <span className={["font-mono font-medium", durationPercentile > 95 ? "text-red-600 dark:text-red-400" : durationPercentile > 80 ? "text-amber-600 dark:text-amber-400" : "text-gray-700 dark:text-gray-300"].join(" ")}>P{Math.round(durationPercentile)}</span>
          </div>
          {isSlowOutlier && (
            <div className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
              <Icon name="alert-triangle" className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="text-amber-700 dark:text-amber-300 font-medium">{intl.get("spanDetail.slowOutlier")}</span>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.durationDistribution")}</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className={["h-full rounded-full", span.durationMs > 10000 ? "bg-red-500" : span.durationMs > 5000 ? "bg-amber-500" : "bg-blue-500"].join(" ")} style={{ width: `${Math.min(durationPercentile, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>0</span>
              <span>{formatDuration(avgDuration)}</span>
              <span>{formatDuration(span.durationMs > avgDuration * 3 ? span.durationMs : avgDuration * 3)}</span>
            </div>
          </div>
        </div>
      </div>

      {Object.keys(ocAttrs).length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-3">
          <h4 className="text-xs font-semibold text-primary mb-2">{intl.get("spanDetail.openClawAttrs")}</h4>
          <div className="space-y-1.5">
            {ocAttrs["session.id"] && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="link" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.sessionId")}:</span>
                <span className="font-mono text-primary text-[11px]" title={ocAttrs["session.id"]}>{truncateId(ocAttrs["session.id"], 10, 10)}</span>
                <CopyButton text={ocAttrs["session.id"]} className="!h-4 !w-4" />
              </div>
            )}
            {ocAttrs["run.id"] && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="play" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.runId")}:</span>
                <span className="font-mono text-primary text-[11px]" title={ocAttrs["run.id"]}>{truncateId(ocAttrs["run.id"], 8, 8)}</span>
                <CopyButton text={ocAttrs["run.id"]} className="!h-4 !w-4" />
              </div>
            )}
            {ocAttrs["round.id"] && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="refresh" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.roundId")}:</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">{ocAttrs["round.id"]}</span>
              </div>
            )}
            {ocAttrs.version && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="info" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.version")}:</span>
                <span className="text-gray-900 dark:text-gray-100">{ocAttrs.version}</span>
              </div>
            )}
            {ocAttrs.channel && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="globe" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.channel")}:</span>
                <span className="text-gray-900 dark:text-gray-100">{ocAttrs.channel}</span>
              </div>
            )}
            {ocAttrs.model && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="zap" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.model")}:</span>
                <span className="text-gray-900 dark:text-gray-100">{ocAttrs.model}</span>
              </div>
            )}
            {ocAttrs["tokens.total"] > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="bar-chart-2" className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.tokens")}:</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">{Number(ocAttrs["tokens.total"]).toLocaleString()}</span>
              </div>
            )}
            {ocAttrs["tokens.input"] > 0 && (
              <div className="flex items-center gap-2 text-xs pl-5">
                <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.inputTokens")}:</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{Number(ocAttrs["tokens.input"]).toLocaleString()}</span>
              </div>
            )}
            {ocAttrs["tokens.output"] > 0 && (
              <div className="flex items-center gap-2 text-xs pl-5">
                <span className="text-gray-500 dark:text-gray-400">{intl.get("spanDetail.outputTokens")}:</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{Number(ocAttrs["tokens.output"]).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isError && (ocAttrs["error.type"] || ocAttrs["error.message"]) && (
        <div className="rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 p-3">
          <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">{intl.get("spanDetail.errorInfo")}</h4>
          <div className="space-y-1.5">
            {ocAttrs["error.type"] && (
              <div className="flex items-center gap-2 text-xs">
                <Icon name="alert" className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.errorType")}:</span>
                <span className="text-red-700 dark:text-red-300 font-medium">{ocAttrs["error.type"]}</span>
              </div>
            )}
            {ocAttrs["error.message"] && (
              <div className="text-xs">
                <span className="text-gray-600 dark:text-gray-400">{intl.get("spanDetail.errorMessage")}:</span>
                <p className="mt-1 text-red-700 dark:text-red-300 font-mono text-[11px] break-all bg-red-100/50 dark:bg-red-950/30 rounded px-2 py-1">{ocAttrs["error.message"]}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <button type="button" onClick={() => setShowAttributes(!showAttributes)} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-primary transition-colors">
          <Icon name="chevron" className={["h-3 w-3 transition-transform", showAttributes ? "rotate-180" : ""].join(" ")} />
          {intl.get("spanDetail.attributes")}
        </button>
        {showAttributes && (
          <div className="mt-2 space-y-3">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-2 text-xs space-y-1">
              <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">{intl.get("spanDetail.basicAttrs")}</h5>
              <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">span_name:</span><span className="text-gray-900 dark:text-gray-100 break-all">{span.spanName}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">span_kind:</span><span className="text-gray-900 dark:text-gray-100">{span.spanKind || "—"}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">duration_ms:</span><span className="font-mono text-gray-900 dark:text-gray-100">{span.durationMs}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">status_code:</span><span className={isError ? "text-red-600" : "text-emerald-600"}>{span.status}</span></div>
              {span.statusMessage && <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">status_message:</span><span className="text-gray-900 dark:text-gray-100 break-all">{span.statusMessage}</span></div>}
              {span.serviceName && <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">service_name:</span><span className="text-gray-900 dark:text-gray-100">{span.serviceName}</span></div>}
              {span.hostName && <div className="flex gap-2"><span className="text-gray-500 dark:text-gray-400 shrink-0 w-24">host_name:</span><span className="text-gray-900 dark:text-gray-100">{span.hostName}</span></div>}
            </div>
            {span.spanAttributes && (() => {
              let parsed = null;
              try { parsed = typeof span.spanAttributes === "string" ? JSON.parse(span.spanAttributes) : span.spanAttributes; } catch { parsed = null; }
              if (!parsed || typeof parsed !== "object") return null;
              const entries = Object.entries(parsed);
              if (entries.length === 0) return null;
              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <h5 className="text-[11px] font-semibold text-primary">{intl.get("spanDetail.rawAttributes")} ({entries.length})</h5>
                    <CopyButton text={JSON.stringify(parsed, null, 2)} className="!h-4 !w-4" />
                  </div>
                  <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                    {entries.map(([key, value]) => {
                      const isExpanded = typeof value === "object" && value !== null;
                      return (
                        <div key={key} className="text-xs">
                          <div className="flex gap-1.5">
                            <span className="text-primary/70 dark:text-primary/60 shrink-0 font-mono text-[11px]">{key}:</span>
                            {isExpanded ? (
                              <span className="text-gray-500 dark:text-gray-400 text-[10px]">{intl.get("spanDetail.objectExpand")}</span>
                            ) : (
                              <span className="text-gray-900 dark:text-gray-100 break-all font-mono text-[11px]">{String(value)}</span>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="ml-3 mt-0.5 pl-2 border-l border-primary/20">
                              {Object.entries(value).map(([k2, v2]) => (
                                <div key={k2} className="flex gap-1.5 text-[11px]">
                                  <span className="text-primary/60 dark:text-primary/50 shrink-0 font-mono">{k2}:</span>
                                  {typeof v2 === "object" && v2 !== null ? (
                                    <span className="text-gray-500 dark:text-gray-400 font-mono">{JSON.stringify(v2)}</span>
                                  ) : (
                                    <span className="text-gray-900 dark:text-gray-100 break-all font-mono">{String(v2)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {childSpans.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{intl.get("spanDetail.childSpans")} ({childSpans.length})</h4>
          <div className="space-y-1">
            {childSpans.map((cs) => (
              <div key={cs.spanId} onClick={() => onSelectSpan(cs.spanId)} className="flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                {cs.status === "error" ? <Icon name="alert" className="h-3 w-3 text-red-500 shrink-0" /> : <Icon name="check-circle" className="h-3 w-3 text-emerald-500 shrink-0" />}
                <span className={cs.status === "error" ? "text-red-600 dark:text-red-400 truncate" : "text-gray-900 dark:text-gray-100 truncate"}>{SPAN_NAME_LABELS[cs.spanName] || cs.spanName}</span>
                <span className={["font-mono ml-auto", cs.durationMs > 10000 ? "text-red-500" : cs.durationMs > 5000 ? "text-amber-500" : "text-gray-400 dark:text-gray-500"].join(" ")}>{formatDuration(cs.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        {parentSpan && (
          <button type="button" onClick={() => onSelectSpan(span.parentSpanId)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
            <Icon name="arrow-left" className="h-3 w-3" />{intl.get("spanDetail.goParent")}
          </button>
        )}
      </div>
    </div>
  );
}
