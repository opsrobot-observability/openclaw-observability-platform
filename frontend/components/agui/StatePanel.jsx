/**
 * StatePanel — AG-UI State Snapshot 渲染
 * 将 Agent 发送的结构化状态渲染为可视化面板
 */
export default function StatePanel({ state }) {
  if (!state || !Object.keys(state).length) return null;

  if (state.clusterHealth) return <ClusterHealthPanel state={state} />;
  if (state.metrics) return <MetricsPanel metrics={state.metrics} />;

  return null;
}

function ClusterHealthPanel({ state }) {
  const healthColor = {
    healthy: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40",
    degraded: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40",
    critical: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40",
  };
  const alertColor = {
    critical: "text-rose-600 dark:text-rose-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">集群状态</h4>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${healthColor[state.clusterHealth] ?? healthColor.degraded}`}>
          {state.clusterHealth === "healthy" ? "健康" : state.clusterHealth === "degraded" ? "亚健康" : "异常"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="节点" value={state.nodesReady} sub={`/ ${state.nodesTotal}`} />
        <Stat label="异常 Pod" value={state.podsAbnormal} warn={state.podsAbnormal > 0} />
        <Stat label="告警" value={state.alerts?.length ?? 0} warn={(state.alerts?.length ?? 0) > 0} />
      </div>
      {state.alerts?.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 dark:border-gray-800">
          {state.alerts.map((a, i) => (
            <li key={i} className={`text-xs ${alertColor[a.level] ?? alertColor.info}`}>
              <span className="font-semibold">[{a.level.toUpperCase()}]</span> {a.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricsPanel({ metrics }) {
  const statusIcon = {
    normal: "✅",
    warning: "⚠️",
    critical: "🔴",
  };
  const entries = Object.entries(metrics);
  if (!entries.length) return null;

  const labels = { cpu: "CPU", memory: "内存", errorRate: "错误率", qps: "QPS" };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">实时指标</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map(([key, m]) => (
          <div key={key} className="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{labels[key] ?? key}</p>
            <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">
              {typeof m.value === "number" && m.value >= 1000 ? m.value.toLocaleString() : m.value}
              <span className="ml-0.5 text-xs font-normal text-gray-400">{m.unit}</span>
            </p>
            <p className="mt-0.5 text-xs">{statusIcon[m.status] ?? ""} {m.status === "normal" ? "正常" : m.status === "warning" ? "偏高" : "异常"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, warn }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-bold ${warn ? "text-amber-600 dark:text-amber-400" : "text-gray-800 dark:text-gray-100"}`}>
        {value}
        {sub && <span className="text-sm font-normal text-gray-400">{sub}</span>}
      </p>
    </div>
  );
}
