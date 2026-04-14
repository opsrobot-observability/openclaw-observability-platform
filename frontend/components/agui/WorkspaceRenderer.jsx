/**
 * WorkspaceRenderer — AG-UI / A2UI 右侧工作区渲染器
 *
 * 支持两类面板：
 * 1. 静态面板（terminal / metrics / pods / table / ...）— Agent 一次推送
 * 2. 实时面板（metrics_live / pods_live / actions_live）— Canvas 动画 + 操作交互
 *
 * A2UI 交互流：
 *   Agent → surfaceUpdate/dataModelUpdate → 面板实时刷新
 *   用户按钮点击 → onAction(action) → 上报 Agent
 */
import { useState, useEffect, useRef, useCallback } from "react";
import CanvasChart from "./CanvasChart.jsx";

export default function WorkspaceRenderer({ panels, onAction }) {
  if (!panels.length) return <WorkspaceEmpty />;
  return (
    <div className="space-y-4">
      {panels.map((panel) => (
        <WorkspacePanel key={panel.id} panel={panel} onAction={onAction} />
      ))}
    </div>
  );
}

function WorkspacePanel({ panel, onAction }) {
  switch (panel.type) {
    // ── Static panels ──
    case "terminal":    return <TerminalBlock panel={panel} />;
    case "metrics":     return <MetricsGrid panel={panel} />;
    case "pods":        return <PodTable panel={panel} onAction={onAction} />;
    case "alerts":      return <AlertTimeline panel={panel} />;
    case "table":       return <DataTable panel={panel} />;
    case "report":      return <DiagReport panel={panel} />;
    case "actions":     return <ActionsPanel panel={panel} onAction={onAction} />;
    case "checklist":   return <Checklist panel={panel} />;
    // ── Live / Canvas panels (A2UI) ──
    case "metrics_live": return <LiveMetrics panel={panel} />;
    case "pods_live":    return <LivePodGrid panel={panel} onAction={onAction} />;
    case "actions_live": return <LiveActions panel={panel} onAction={onAction} />;
    default:             return null;
  }
}

// ═════════════════════════════════════════════════════════════════
//  A2UI Live Panels
// ═════════════════════════════════════════════════════════════════

// ─── Live Metrics (Canvas real-time charts) ──────────────────────
function LiveMetrics({ panel }) {
  const { series: initSeries = [], interval = 2000, maxPoints = 30 } = panel;
  const [series, setSeries] = useState(() =>
    initSeries.map((s) => ({ label: s.label, color: s.color, data: s.data || [] }))
  );

  // Sync with external data pushes (surfaceUpdate)
  useEffect(() => {
    if (initSeries.some((s) => s.data?.length)) {
      setSeries(initSeries.map((s) => ({ label: s.label, color: s.color, data: s.data || [] })));
    }
  }, [initSeries]);

  // Simulate real-time data when dataSource is "mock"
  useEffect(() => {
    if (panel.dataSource !== "live_mock") return;
    const bases = initSeries.map((s) => s.base ?? 50);
    const tick = () => {
      setSeries((prev) =>
        prev.map((s, i) => ({
          ...s,
          data: [
            ...s.data.slice(-(maxPoints - 1)),
            { t: Date.now(), v: bases[i] + (Math.random() - 0.5) * 20 },
          ],
        }))
      );
    };
    tick();
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [panel.dataSource, initSeries, interval, maxPoints]);

  return (
    <PanelShell title={panel.title} icon="chart" accent="blue">
      {/* Summary cards */}
      {panel.cards && (
        <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {panel.cards.map((c, i) => (
            <MetricMiniCard key={i} card={c} />
          ))}
        </div>
      )}
      <CanvasChart series={series} maxPoints={maxPoints} height={panel.height || 180} yLabel={panel.yLabel || "%"} />
    </PanelShell>
  );
}

function MetricMiniCard({ card }) {
  const statusCls = {
    normal: "border-emerald-200 dark:border-emerald-800",
    warning: "border-amber-200 dark:border-amber-800",
    danger: "border-rose-200 dark:border-rose-800",
  };
  const dotCls = {
    normal: "bg-emerald-500",
    warning: "bg-amber-500 animate-pulse",
    danger: "bg-rose-500 sre-blink",
  };
  return (
    <div className={`rounded-lg border bg-white px-3 py-2 dark:bg-gray-900 ${statusCls[card.status] ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dotCls[card.status] ?? dotCls.normal}`} />
        <span className="text-[10px] text-gray-500 dark:text-gray-400">{card.label}</span>
      </div>
      <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">{card.value}</p>
    </div>
  );
}

// ─── Live Pod Grid (animated cards) ──────────────────────────────
function LivePodGrid({ panel, onAction }) {
  return (
    <PanelShell title={panel.title} icon="pod" accent="rose">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(panel.pods || []).map((pod, i) => (
          <PodCard key={pod.name || i} pod={pod} onAction={onAction} />
        ))}
      </div>
    </PanelShell>
  );
}

function PodCard({ pod, onAction }) {
  const isError = /Error|CrashLoop|OOMKilled|Failed|ImagePull/.test(pod.status);
  const isWarn = /Pending|ContainerCreating|Terminating/.test(pod.status);

  const borderCls = isError
    ? "border-rose-300 dark:border-rose-800 sre-blink-border"
    : isWarn
    ? "border-amber-300 dark:border-amber-800"
    : "border-gray-200 dark:border-gray-700";
  const bgCls = isError
    ? "bg-rose-50/80 dark:bg-rose-950/30"
    : isWarn
    ? "bg-amber-50/80 dark:bg-amber-950/30"
    : "bg-white dark:bg-gray-900";
  const dotCls = isError
    ? "bg-rose-500 sre-blink"
    : isWarn
    ? "bg-amber-500 animate-pulse"
    : "bg-emerald-500";

  const statusBadgeCls = isError
    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
    : isWarn
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";

  const handleAction = (action) => {
    onAction?.({
      type: "pod_action",
      action,
      pod: pod.name,
      namespace: pod.namespace,
    });
  };

  return (
    <div className={`rounded-xl border p-3 transition-all ${borderCls} ${bgCls}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotCls}`} />
          <span className="max-w-[180px] truncate font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
            {pod.name}
          </span>
        </div>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeCls}`}>
          {pod.status}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
        <span>{pod.namespace}</span>
        {pod.restarts > 0 && (
          <span className="font-semibold text-rose-600 dark:text-rose-400">重启 {pod.restarts}</span>
        )}
        {pod.node && <span className="truncate">{pod.node}</span>}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {(pod.actions || ["logs", "describe", "restart"]).map((a) => (
          <button
            key={a}
            onClick={() => handleAction(a)}
            className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 transition hover:border-primary hover:text-primary active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {ACTION_LABELS[a] ?? a}
          </button>
        ))}
      </div>
    </div>
  );
}

const ACTION_LABELS = { logs: "查看日志", describe: "详情", restart: "重启", events: "事件", scale: "扩容", delete: "删除" };

// ─── Live Actions Bar ────────────────────────────────────────────
function LiveActions({ panel, onAction }) {
  const [states, setStates] = useState({});

  const handleClick = async (action) => {
    setStates((p) => ({ ...p, [action.id]: "loading" }));
    const ok = onAction?.({
      type: "action_execute",
      actionId: action.id,
      command: action.command,
      label: action.label,
    });
    setTimeout(() => {
      setStates((p) => ({ ...p, [action.id]: ok !== false ? "done" : "error" }));
    }, 800);
  };

  const variantCls = {
    primary: "bg-primary text-white hover:bg-primary/90",
    danger: "bg-rose-500 text-white hover:bg-rose-600",
    warning: "bg-amber-500 text-white hover:bg-amber-600",
    secondary: "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800",
  };

  return (
    <PanelShell title={panel.title} icon="action" accent="blue">
      <div className="flex flex-wrap gap-2">
        {(panel.actions || []).map((a) => {
          const st = states[a.id];
          return (
            <button
              key={a.id}
              onClick={() => handleClick(a)}
              disabled={st === "loading"}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                st === "done"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : st === "loading"
                  ? "cursor-wait opacity-60 " + (variantCls[a.variant] ?? variantCls.secondary)
                  : variantCls[a.variant] ?? variantCls.secondary
              }`}
            >
              {st === "loading" && <Spinner />}
              {st === "done" ? "✓ 已执行" : a.label}
            </button>
          );
        })}
      </div>
      {panel.hint && <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">{panel.hint}</p>}
    </PanelShell>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════
//  Original Static Panels (preserved)
// ═════════════════════════════════════════════════════════════════

function TerminalBlock({ panel }) {
  const clsMap = {
    head: "text-blue-300 font-semibold",
    ok: "text-green-400",
    warn: "text-yellow-400",
    error: "text-red-400 font-semibold",
    dim: "text-gray-500",
    comment: "text-gray-500 italic",
  };
  return (
    <PanelShell title={panel.title} icon="terminal" accent="emerald">
      <div className="rounded-lg bg-gray-950 p-3 font-mono text-xs leading-relaxed overflow-x-auto">
        {(panel.lines || []).map((line, i) => (
          <div key={i} className={clsMap[line.cls] ?? "text-gray-300"}>{line.text}</div>
        ))}
      </div>
    </PanelShell>
  );
}

function MetricsGrid({ panel }) {
  const statusStyle = { normal: "border-emerald-200 dark:border-emerald-800", warning: "border-amber-200 dark:border-amber-800", danger: "border-rose-200 dark:border-rose-800" };
  const dotStyle = { normal: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500" };
  return (
    <PanelShell title={panel.title} icon="chart" accent="blue">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(panel.items || []).map((m, i) => (
          <div key={i} className={`rounded-xl border bg-white p-3 dark:bg-gray-900 ${statusStyle[m.status] ?? ""}`}>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${dotStyle[m.status] ?? dotStyle.normal}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{m.label}</span>
            </div>
            <p className="mt-1.5 text-xl font-bold text-gray-800 dark:text-gray-100">{m.value}</p>
            {m.sub && <p className="text-xs text-gray-400 dark:text-gray-500">{m.sub}</p>}
            {m.chart && <MiniSparkline data={m.chart} color={m.status === "warning" ? "#f59e0b" : m.status === "danger" ? "#ef4444" : "#10b981"} />}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function MiniSparkline({ data, color = "#10b981" }) {
  const h = 24, w = 80;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg className="mt-1.5" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function PodTable({ panel, onAction }) {
  const statusBadge = (s) => {
    const cls = s === "Running" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      : s === "Pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400";
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
  };
  return (
    <PanelShell title={panel.title} icon="pod" accent="rose">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="pb-2 pr-3 font-medium">命名空间</th><th className="pb-2 pr-3 font-medium">Pod</th>
              <th className="pb-2 pr-3 font-medium">状态</th><th className="pb-2 pr-3 font-medium">重启</th>
              <th className="pb-2 pr-3 font-medium">节点</th><th className="pb-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 dark:text-gray-200">
            {(panel.pods || []).map((pod, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-mono text-gray-500">{pod.namespace}</td>
                <td className="py-2 pr-3 font-mono font-medium">{pod.name}</td>
                <td className="py-2 pr-3">{statusBadge(pod.status)}</td>
                <td className="py-2 pr-3">{pod.restarts > 0 ? <span className="font-semibold text-rose-600 dark:text-rose-400">{pod.restarts}</span> : 0}</td>
                <td className="py-2 pr-3 font-mono text-gray-500">{pod.node}</td>
                <td className="py-2"><div className="flex flex-wrap gap-1">{(pod.actions || []).map((a) => (
                  <button key={a} onClick={() => onAction?.({ type: "pod_action", action: a, pod: pod.name, namespace: pod.namespace })}
                    className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 transition hover:border-primary hover:text-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {ACTION_LABELS[a] ?? a}
                  </button>
                ))}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

function AlertTimeline({ panel }) {
  const dotCls = { critical: "bg-rose-500 ring-rose-200 dark:ring-rose-900", warning: "bg-amber-500 ring-amber-200 dark:ring-amber-900", info: "bg-blue-500 ring-blue-200 dark:ring-blue-900" };
  const textCls = { critical: "text-rose-700 dark:text-rose-300", warning: "text-amber-700 dark:text-amber-300", info: "text-blue-700 dark:text-blue-300" };
  return (
    <PanelShell title={panel.title} icon="alert" accent="amber">
      <div className="space-y-0">
        {(panel.alerts || []).map((a, i) => (
          <div key={i} className="flex gap-3 py-1.5">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ring-2 ${dotCls[a.level] ?? dotCls.info}`} />
              {i < panel.alerts.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-200 dark:bg-gray-700" />}
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-gray-400">{a.time}</span>
                <span className={`text-xs font-medium ${textCls[a.level] ?? ""}`}>{a.text}</span>
              </div>
              {a.source && <span className="text-[10px] text-gray-400">{a.source}</span>}
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function DataTable({ panel }) {
  return (
    <PanelShell title={panel.title} icon="table" accent="blue">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-200 dark:border-gray-700">
            {(panel.columns || []).map((col, i) => <th key={i} className="pb-2 pr-3 text-left font-medium text-gray-500 dark:text-gray-400">{col}</th>)}
          </tr></thead>
          <tbody className="text-gray-700 dark:text-gray-200">
            {(panel.rows || []).map((row, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                {row.map((cell, j) => <td key={j} className="py-1.5 pr-3">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

function DiagReport({ panel }) {
  return (
    <PanelShell title={panel.title} icon="report" accent="rose">
      <div className="space-y-3">
        <div><h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">根因</h4>
          <p className="mt-1 text-sm font-medium text-rose-700 dark:text-rose-300">{panel.rootCause}</p></div>
        <div><h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">影响</h4>
          <ul className="mt-1 space-y-1">{(panel.impact || []).map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />{item}</li>
          ))}</ul></div>
        {panel.timeline && (
          <div><h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">时间线</h4>
            <div className="mt-1 space-y-1">{panel.timeline.map((t, i) => (
              <div key={i} className="flex gap-2 text-xs"><span className="shrink-0 font-mono text-gray-400">{t.time}</span><span className="text-gray-700 dark:text-gray-300">{t.text}</span></div>
            ))}</div></div>
        )}
      </div>
    </PanelShell>
  );
}

function ActionsPanel({ panel, onAction }) {
  const [executed, setExecuted] = useState({});
  const variantCls = { primary: "bg-primary text-white hover:bg-primary/90", warning: "bg-amber-500 text-white hover:bg-amber-600", secondary: "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800" };
  return (
    <PanelShell title={panel.title} icon="action" accent="blue">
      <div className="space-y-3">
        {(panel.groups || []).map((g, gi) => (
          <div key={gi} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{g.label}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{g.desc}</p>
            {g.actions.map((a) => (
              <div key={a.id} className="mt-2 flex items-center gap-2">
                <button onClick={() => { setExecuted((p) => ({ ...p, [a.id]: true })); onAction?.({ type: "action_execute", actionId: a.id, command: a.command }); }}
                  disabled={executed[a.id]}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${executed[a.id] ? "cursor-default bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : variantCls[a.variant] ?? variantCls.secondary}`}>
                  {executed[a.id] ? "✓ 已执行" : a.label}
                </button>
                {a.command && <code className="max-w-xs truncate text-[10px] text-gray-400">{a.command}</code>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function Checklist({ panel }) {
  const [checked, setChecked] = useState({});
  const prioBadge = { high: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
  return (
    <PanelShell title={panel.title} icon="checklist" accent="blue">
      <div className="space-y-1.5">
        {(panel.items || []).map((item, i) => (
          <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 transition hover:bg-gray-50 dark:hover:bg-gray-800">
            <input type="checkbox" checked={checked[i] || item.done} onChange={() => setChecked((p) => ({ ...p, [i]: !p[i] }))} className="h-4 w-4 rounded border-gray-300 text-primary accent-primary" />
            <span className={`flex-1 text-xs ${checked[i] || item.done ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-200"}`}>{item.text}</span>
            {item.priority && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${prioBadge[item.priority] ?? ""}`}>{item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}</span>}
          </label>
        ))}
      </div>
    </PanelShell>
  );
}

// ═════════════════════════════════════════════════════════════════
//  Shared Components
// ═════════════════════════════════════════════════════════════════

function WorkspaceEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-400 dark:text-gray-500">
      <svg className="mb-3 h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
      </svg>
      <p className="text-sm font-medium">工作区</p>
      <p className="mt-1 text-xs">Agent 执行结果将在此实时展示</p>
    </div>
  );
}

const accentBorderMap = { emerald: "border-l-emerald-500", blue: "border-l-blue-500", amber: "border-l-amber-500", rose: "border-l-rose-500" };

const ICONS = {
  terminal: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M3.75 3h16.5A2.25 2.25 0 0122.5 5.25v13.5A2.25 2.25 0 0120.25 21H3.75A2.25 2.25 0 011.5 18.75V5.25A2.25 2.25 0 013.75 3z" /></svg>,
  chart: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  pod: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>,
  alert: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
  table: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125" /></svg>,
  report: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  action: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
  checklist: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

function PanelShell({ title, icon, accent = "blue", children }) {
  return (
    <div className={`rounded-xl border border-gray-200 border-l-[3px] bg-white p-4 dark:border-gray-700 dark:bg-gray-900 ${accentBorderMap[accent] ?? accentBorderMap.blue}`}>
      <div className="mb-3 flex items-center gap-2 text-gray-600 dark:text-gray-300">
        {ICONS[icon]}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
