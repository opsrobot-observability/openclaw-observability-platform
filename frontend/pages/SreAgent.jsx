import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import XMarkdown from "@ant-design/x-markdown";
import { MockAgent, HttpAgent, uid } from "../lib/agui.js";
import { matchScenario } from "../lib/agui-mock-scenarios.js";
import useAgui from "../lib/useAgui.js";
import { dispatchUserAction } from "../lib/a2ui.js";
import { fetchAgentCatalog, STATIC_FALLBACK_CATALOG, readStoredAgentId, writeStoredAgentId } from "../lib/sreAgentCatalog.js";
import WorkspaceRenderer from "../components/agui/WorkspaceRenderer.jsx";

const USE_MOCK = import.meta.env.VITE_SRE_AGENT_MOCK === "true"
  || import.meta.env.VITE_MOCK === "true";

const SKILLS = [
  { key: "k8s",      label: "巡检 K8s",  icon: "cube",    prompt: "请对当前 K8s 集群做一次巡检，列出异常 Pod 和关键事件" },
  { key: "prom",     label: "查监控",     icon: "chart",   prompt: "查询当前集群 CPU 使用率、内存使用率和 5xx 错误率" },
  { key: "diagnose", label: "诊断故障",   icon: "bug",     prompt: "有服务响应变慢，请帮我诊断可能的原因" },
  { key: "report",   label: "出报告",     icon: "doc",     prompt: "请生成一份今日集群巡检报告" },
];

const REFRESH_INTERVAL = 60_000;

function useAgentCatalog() {
  const [catalog, setCatalog] = useState(STATIC_FALLBACK_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromRemote, setFromRemote] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchAgentCatalog();
      setCatalog(result.agents);
      setFromRemote(result.fromRemote);
      setError(result.fromRemote ? null : "使用本地列表");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [load]);

  return { catalog, loading, error, fromRemote };
}

/**
 * SRE Agent — 左侧聊天框(意图层) + 右侧工作区(执行层)
 *
 * 双模式：
 * - OpenClaw 模式（默认）：POST /api/sre-agent → 后端桥接 OpenClaw Chat API
 * - Mock 模式（VITE_SRE_AGENT_MOCK=true）：前端 MockAgent 演示
 */
export default function SreAgent() {
  const [input, setInput] = useState("");
  const { catalog, loading: catalogLoading, error: catalogError, fromRemote } = useAgentCatalog();
  const [selectedAgentId, setSelectedAgentId] = useState(() => readStoredAgentId(STATIC_FALLBACK_CATALOG));
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const prevAgentIdRef = useRef(null);

  const threadId = useMemo(() => uid("thread"), [selectedAgentId]);

  const agent = useMemo(() => {
    if (USE_MOCK) {
      return new MockAgent({
        scenario: (msgs) => {
          const userText = msgs[msgs.length - 1]?.content ?? "";
          return matchScenario(userText)(msgs);
        },
      });
    }
    return new HttpAgent({
      url: "/api/sre-agent",
      agentId: selectedAgentId,
      threadId,
    });
  }, [selectedAgentId, threadId]);

  const {
    messages, toolCalls, steps, workspacePanels, confirm,
    status, error, sendMessage, respondConfirm, cancel, reset,
  } = useAgui(agent);

  useEffect(() => {
    if (catalog.length > 0 && !catalog.some((a) => a.id === selectedAgentId)) {
      const fallbackId = readStoredAgentId(catalog);
      setSelectedAgentId(fallbackId);
      writeStoredAgentId(fallbackId);
    }
  }, [catalog, selectedAgentId]);

  useEffect(() => {
    if (prevAgentIdRef.current === null) {
      prevAgentIdRef.current = selectedAgentId;
      return;
    }
    if (prevAgentIdRef.current === selectedAgentId) return;
    prevAgentIdRef.current = selectedAgentId;
    reset();
  }, [selectedAgentId, reset]);

  const handleAgentChange = useCallback((id) => {
    setSelectedAgentId(id);
    writeStoredAgentId(id);
  }, []);

  const isRunning = status === "running";
  const hasConversation = messages.length > 0;
  const toolCallList = Object.values(toolCalls);

  const handleAction = useCallback((action) => {
    dispatchUserAction(action);
    sendMessage(`[用户操作] ${action.type}: ${action.action || action.label || action.actionId || JSON.stringify(action)}`);
  }, [sendMessage]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, steps, toolCalls, confirm]);

  const handleSend = (text) => {
    const t = (text ?? input).trim();
    if (!t || isRunning) return;
    setInput("");
    sendMessage(t);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Empty state (no conversation yet) ───────────────────────
  if (!hasConversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
            <RobotIcon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">SRE Agent</h2>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            智能运维助手 — 左侧下达指令，右侧实时展示执行结果。
            基于 <span className="font-medium text-primary">OpenClaw</span> +
            <span className="font-medium text-primary"> AG-UI 协议</span>驱动。
          </p>
          {USE_MOCK && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              Demo 模式
            </span>
          )}
        </div>

        <div className="grid w-full max-w-lg grid-cols-2 gap-3">
          {SKILLS.map((s) => (
            <button
              key={s.key}
              onClick={() => handleSend(s.prompt)}
              className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary/40 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary/40"
            >
              <SkillIcon name={s.icon} />
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-primary dark:text-gray-100">{s.label}</p>
                <p className="mt-0.5 text-xs text-gray-400">{s.prompt.slice(0, 24)}…</p>
              </div>
            </button>
          ))}
        </div>

        <div className="w-full max-w-lg">
          <div className="flex items-end gap-2">
            {!USE_MOCK && (
              <AgentPicker
                value={selectedAgentId}
                onChange={handleAgentChange}
                catalog={catalog}
                loading={catalogLoading}
                error={catalogError}
                compact
              />
            )}
            <div className="flex-1">
              <InputBar
                input={input}
                setInput={setInput}
                onSend={() => handleSend()}
                onKeyDown={handleKeyDown}
                isRunning={false}
                inputRef={inputRef}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main: split layout ──────────────────────────────────────
  return (
    <div className="flex gap-0 -m-6" style={{ height: "calc(100% + 48px)" }}>
      {/* ── 左侧：聊天框 (意图层) ── */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-950/30">
        {/* Chat header */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
          <div className="min-w-0 flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <RobotIcon className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">SRE Agent</span>
              {isRunning && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  执行中
                </span>
              )}
            </div>
            {!USE_MOCK && (
              <p className="truncate text-[10px] text-gray-400 dark:text-gray-500" title={selectedAgentId}>
                Agent: <span className="font-mono">{catalog.find((a) => a.id === selectedAgentId)?.label || selectedAgentId}</span>
              </p>
            )}
          </div>
          <button onClick={reset} className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300" title="新对话">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Agent 思考过程：固定在会话区顶部，可点击展开详情 */}
        {steps.length > 0 && (
          <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
            <AgentThinkingPanel steps={steps} isRunning={isRunning} />
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, idx) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} text={msg.content} />
            ) : msg.role === "assistant" ? (
              <div key={msg.id} className="space-y-2">
                {(() => {
                  const parenGroups = extractParenChoiceGroups(msg.content);
                  const bubbleText =
                    msg.streaming || parenGroups.length === 0
                      ? msg.content
                      : stripParenChoiceBlocks(msg.content);
                  return (
                    <>
                      <AssistantBubble text={bubbleText} streaming={msg.streaming} />
                      {!msg.streaming && parenGroups.length > 0 && (
                        <ParenChoiceSelectors groups={parenGroups} onSelect={handleSend} />
                      )}
                      {!msg.streaming && !isRunning && idx === messages.length - 1 && (
                        <ChoiceCards
                          text={msg.content}
                          onSelect={handleSend}
                          setInput={setInput}
                          inputRef={inputRef}
                          excludeNums={new Set(parenGroups.map((g) => g.num))}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            ) : null
          )}

          {/* Tool call indicators */}
          {toolCallList.length > 0 && (
            <div className="space-y-1.5">
              {toolCallList.map((tc) => (
                <ToolCallIndicator key={tc.id} tc={tc} />
              ))}
            </div>
          )}

          {/* Human confirmation */}
          {confirm && (
            <ConfirmCard confirm={confirm} onRespond={respondConfirm} />
          )}

          {/* Running dots */}
          {isRunning && messages.every((m) => !m.streaming) && steps.every((s) => s.status === "done") && (
            <div className="flex gap-1 px-1 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar + Agent picker */}
        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <div className="flex items-end gap-2">
            {!USE_MOCK && (
              <AgentPicker
                value={selectedAgentId}
                onChange={handleAgentChange}
                disabled={isRunning}
                catalog={catalog}
                loading={catalogLoading}
                error={catalogError}
                compact
              />
            )}
            <div className="flex-1">
              <InputBar
                input={input}
                setInput={setInput}
                onSend={() => handleSend()}
                onKeyDown={handleKeyDown}
                isRunning={isRunning}
                onCancel={cancel}
                inputRef={inputRef}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 右侧：工作区 (执行层) ── */}
      <div className="flex-1 overflow-y-auto bg-gray-100/50 p-5 dark:bg-gray-950/50">
        <WorkspaceRenderer panels={workspacePanels} onAction={handleAction} />
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function AgentPicker({ value, onChange, disabled, className = "", catalog, loading, error, compact }) {
  if (compact) {
    return (
      <div className="relative shrink-0">
        <select
          value={value}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.value)}
          title="切换 Agent"
          className={`h-9 w-[110px] cursor-pointer appearance-none rounded-xl border border-gray-300 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-gray-700 outline-none transition hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-primary ${loading ? "opacity-50" : ""}`}
        >
          {loading && <option value="">加载…</option>}
          {!loading && catalog.map((a) => (
            <option key={a.id} value={a.id} title={a.description || a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
        {error && !loading && (
          <span
            className="absolute -right-1 -top-1 flex h-3 w-3 cursor-help items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-white"
            title={`同步异常: ${error}`}
          >!</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(e) => onChange(e.target.value)}
        title="选择要对话的 Agent（对应 OpenClaw agent_id）"
        className={`app-input min-w-0 flex-1 py-1.5 pr-8 text-xs ${loading ? "opacity-50" : ""}`}
      >
        {loading && <option value="">加载中…</option>}
        {!loading && catalog.map((a) => (
          <option key={a.id} value={a.id} title={[a.description, a.status ? `状态: ${a.status}` : ""].filter(Boolean).join(" · ") || a.id}>
            {a.label}{a.status && a.status !== "unknown" ? ` (${a.status})` : ""}
          </option>
        ))}
      </select>
      {error && !loading && (
        <span
          className="shrink-0 cursor-help text-amber-500"
          title={`Agent 列表同步异常: ${error}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </span>
      )}
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-[13px] leading-relaxed text-white">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ text, streaming }) {
  return (
    <div className="flex justify-start">
      <div className="sre-markdown max-w-[95%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100">
        <XMarkdown
          content={text || ""}
          streaming={streaming ? { hasNextChunk: true } : { hasNextChunk: false }}
        />
        {streaming && <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-primary/60 align-middle" />}
      </div>
    </div>
  );
}

/**
 * Agent 思考过程：步骤列表 + 点击展开查看详情（detail、时间）
 */
function AgentThinkingPanel({ steps, isRunning }) {
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (steps.length === 0) setExpanded({});
  }, [steps.length]);

  useEffect(() => {
    const running = steps.filter((s) => s.status === "running").pop();
    if (running?.id) {
      setExpanded((e) => ({ ...e, [running.id]: true }));
    }
  }, [steps]);

  const toggle = (id) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  };

  const formatTime = (ts) => {
    if (ts == null) return "";
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="rounded-lg border border-gray-200/80 bg-white/90 shadow-sm dark:border-gray-600/60 dark:bg-gray-900/80">
      <div className="flex items-center justify-between border-b border-gray-100 px-2.5 py-1.5 dark:border-gray-700/80">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Agent 思考过程
        </p>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {steps.filter((s) => s.status === "done").length}/{steps.length} 步
          {isRunning && <span className="ml-1 text-primary">· 进行中</span>}
        </span>
      </div>
      <div className="max-h-44 space-y-0.5 overflow-y-auto px-1 py-1">
        {steps.map((step) => {
          const id = step.id ?? step.name;
          const open = !!expanded[id];
          const hasDetail = Boolean(step.detail && String(step.detail).trim());
          return (
            <div key={id} className="rounded-md border border-transparent hover:border-gray-200/90 dark:hover:border-gray-600/80">
              <button
                type="button"
                onClick={() => toggle(id)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                aria-expanded={open}
              >
                {step.status === "running" ? (
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${step.status === "running" ? "text-primary" : "text-gray-700 dark:text-gray-200"}`}>
                      {step.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                      {open ? "▲" : "▼"}
                    </span>
                    {!hasDetail && !open && (
                      <span className="text-[10px] text-gray-400">点击展开</span>
                    )}
                  </div>
                  {!open && hasDetail && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400 dark:text-gray-500">{step.detail}</p>
                  )}
                </div>
              </button>
              {open && (
                <div className="border-t border-gray-100 px-2 pb-2 pt-1 dark:border-gray-700/80">
                  <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                    <span>开始 {formatTime(step.ts)}</span>
                    {step.status === "done" && step.finishedAt != null && (
                      <span>结束 {formatTime(step.finishedAt)}</span>
                    )}
                    {step.status === "done" && step.finishedAt != null && step.ts != null && (
                      <span className="tabular-nums">
                        耗时 {Math.max(0, step.finishedAt - step.ts)} ms
                      </span>
                    )}
                  </div>
                  {hasDetail ? (
                    <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
                      {step.detail}
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-gray-400 dark:text-gray-500">本步骤暂无详细说明</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolCallIndicator({ tc }) {
  let parsedCmd = null;
  try { parsedCmd = JSON.parse(tc.args)?.command; } catch { /* noop */ }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs dark:bg-gray-800">
      {tc.status === "running" ? (
        <svg className="h-3 w-3 animate-spin text-primary shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="h-3 w-3 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">{tc.name}</span>
      {parsedCmd && <span className="truncate text-gray-400">{parsedCmd}</span>}
    </div>
  );
}

function ConfirmCard({ confirm: c, onRespond }) {
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-950/30">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{c.title}</p>
      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{c.message}</p>
      {c.command && (
        <code className="mt-1.5 block rounded bg-amber-100 px-2 py-1 text-[10px] font-mono text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          {c.command}
        </code>
      )}
      <div className="mt-2.5 flex gap-2">
        {c.actions?.map((a) => (
          <button
            key={a.id}
            onClick={() => onRespond(a.id === "approve")}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              a.variant === "primary"
                ? "bg-primary text-white hover:bg-primary/90"
                : "border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InputBar({ input, setInput, onSend, onKeyDown, isRunning, onCancel, inputRef }) {
  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="输入运维指令…"
        className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
      />
      {isRunning ? (
        <button
          onClick={onCancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white transition hover:bg-rose-600"
          title="取消"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── 括号内多选项 → 选择框（/ 或 ? 分隔）──────────────────────────

function stripOptionNoise(s) {
  return String(s)
    .replace(/[)）]+$/, "")
    .replace(/^[（(]+/, "")
    .trim();
}

/** 解析括号内的选项：优先按 / 或全角／ 分割，否则按 ? 分割（如 a? b? c） */
function splitOptionsInsideParens(inside) {
  let s = inside.trim().replace(/\uFF0F/g, "/");
  if (!s) return [];
  if (/\s*[/／]\s*/.test(s)) {
    const parts = s.split(/\s*[/／]\s*/).map(stripOptionNoise).filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  const byQ = s.split("?").map(stripOptionNoise).filter(Boolean);
  if (byQ.length >= 2) return byQ;
  const one = stripOptionNoise(s);
  return one ? [one] : [];
}

function normalizeNumberedLine(line) {
  return line.trim().replace(/^\*{2}/, "").replace(/\*{2}$/, "").trim();
}

/**
 * 提取 `1. 问题？(A / B / C)` 或 `(A? B? C)` 形式的选项组（至少 2 个选项）
 */
function extractParenChoiceGroups(text) {
  if (!text) return [];
  const groups = [];
  for (const line of text.split("\n")) {
    const t = normalizeNumberedLine(line);
    let num;
    let rest;
    let m = t.match(/^(\d)\uFE0F?\u20E3\s+(.+)$/);
    if (m) {
      num = m[1];
      rest = m[2];
    }
    if (!m) {
      m = t.match(/^(\d)[.)]\s+(.+)$/);
      if (m) {
        num = m[1];
        rest = m[2];
      }
    }
    if (!num || !rest) continue;
    rest = rest.replace(/\*{1,2}/g, "").replace(/`([^`]*)`/g, "$1").trim();
    const pm = rest.match(/^(.+?)\s*[（(]([^)）]+)[)）]\s*$/);
    if (!pm) continue;
    const prompt = pm[1].trim();
    const options = splitOptionsInsideParens(pm[2]);
    if (options.length < 2) continue;
    groups.push({ num, prompt, options });
  }
  return groups;
}

/** 从正文中去掉已转为选择框的括号段，避免 Markdown 里重复展示 */
function stripParenChoiceBlocks(text) {
  return text
    .split("\n")
    .map((line) => {
      const t = normalizeNumberedLine(line);
      const m = t.match(/^(\d)(?:[.)]|\uFE0F?\u20E3\s+)\s*(.+)$/);
      if (!m) return line;
      let rest = m[2].replace(/\*{1,2}/g, "").replace(/`([^`]*)`/g, "$1").trim();
      const pm = rest.match(/^(.+?)\s*[（(]([^)）]+)[)）]\s*$/);
      if (!pm) return line;
      const options = splitOptionsInsideParens(pm[2]);
      if (options.length < 2) return line;
      const stripped = line.replace(/\s*[（(][^)）]+[)）]\s*$/u, "").trimEnd();
      return stripped;
    })
    .join("\n");
}

function ParenChoiceSelectors({ groups, onSelect }) {
  if (!groups.length) return null;
  return (
    <div className="mt-1 space-y-2.5 pl-0.5">
      {groups.map((g) => (
        <div
          key={`${g.num}-${g.prompt.slice(0, 20)}`}
          className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-600 dark:bg-gray-800/90"
        >
          <p className="mb-2.5 text-[13px] font-medium leading-snug text-gray-800 dark:text-gray-100">
            <span className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary dark:bg-primary/20">
              {g.num}
            </span>
            {g.prompt}
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={g.prompt}>
            {g.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const head = g.prompt.replace(/[？?]\s*$/, "").trim();
                  onSelect(`${head}：${opt}`);
                }}
                className="min-h-[36px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-[0.98] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-primary dark:hover:bg-primary/10"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Choice Cards (detect numbered options in agent responses) ───

/**
 * 从 Agent 回复中提取编号选项。
 * 支持格式：1️⃣ text / 1. text / 1) text / **1. text**
 * 至少检测到 2 项才返回。
 * @param {Set<string>} [excludeNums] 已由括号选择框处理的题号，不再生成卡片
 */
function extractChoices(text, excludeNums) {
  if (!text) return [];
  const choices = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    let num, rest;

    // 1️⃣ text (keycap emoji)
    let m = t.match(/^(\d)\uFE0F?\u20E3\s+(.+)$/);
    if (m) { num = m[1]; rest = m[2]; }

    // 1. text  or  1) text  (plain numbered)
    if (!num) {
      m = t.match(/^(\d)[.)]\s+(.+)$/);
      if (m) { num = m[1]; rest = m[2]; }
    }

    // **1. text** (fully bold)
    if (!num) {
      m = t.match(/^\*{2}(\d)[.)]\s*(.+?)\*{2}$/);
      if (m) { num = m[1]; rest = m[2]; }
    }

    if (num && rest) {
      if (excludeNums?.has(num)) continue;
      const clean = rest.replace(/\*{1,2}/g, "").replace(/`([^`]*)`/g, "$1").trim();
      if (clean.length > 1 && clean.length < 150) {
        const isQuestion = /[？?]/.test(clean);
        // For questions, extract the key term before the question mark
        let fillHint = "";
        if (isQuestion) {
          fillHint = clean
            .split(/[？?]/)[0]
            .replace(/是多少|是什么|有哪些|怎么样/g, "")
            .replace(/[（(].+?[)）]/g, "")
            .trim();
        }
        choices.push({ num, label: clean, isQuestion, fillHint });
      }
    }
  }
  return choices.length >= 2 ? choices : [];
}

function ChoiceCards({ text, onSelect, setInput, inputRef, excludeNums }) {
  const choices = extractChoices(text, excludeNums);
  if (choices.length === 0) return null;

  const handleClick = (c) => {
    if (c.isQuestion && setInput) {
      setInput(c.fillHint ? `${c.fillHint}: ` : "");
      setTimeout(() => inputRef?.current?.focus(), 0);
    } else {
      onSelect(c.label);
    }
  };

  return (
    <div className="flex flex-col gap-2 pl-1">
      {choices.map((c, i) => (
        <button
          key={i}
          onClick={() => handleClick(c)}
          className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left text-[13px] transition hover:border-primary/40 hover:bg-primary/5 hover:shadow-md active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary/40 dark:hover:bg-primary/10"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:bg-primary/20">
            {c.num}
          </span>
          <span className="flex-1 font-medium text-gray-700 dark:text-gray-200">{c.label}</span>
          {c.isQuestion ? (
            <svg className="ml-auto h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          ) : (
            <svg className="ml-auto h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}


// ─── Icons ───────────────────────────────────────────────────────
function RobotIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="5" y="6" width="14" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 14.5h5" />
    </svg>
  );
}

function SkillIcon({ name }) {
  const cls = "h-8 w-8 rounded-lg bg-primary/10 p-1.5 text-primary dark:bg-primary/20 shrink-0";
  switch (name) {
    case "cube":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
      );
    case "chart":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
      );
    case "bug":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-3.83-7.44M12 12.75c-2.883 0-5.647.508-8.208 1.44a23.91 23.91 0 003.832-7.44" />
          </svg>
        </div>
      );
    case "doc":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}
