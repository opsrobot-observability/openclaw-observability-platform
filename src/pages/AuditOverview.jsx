import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function num(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("zh-CN");
}

function pctRatio(x) {
  if (x == null || Number.isNaN(Number(x))) return "—";
  return `${(Number(x) * 100).toFixed(2)}%`;
}

function MetricCard({ title, value, hint, accent }) {
  return (
    <div
      className={[
        "rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60",
        accent ?? "",
      ].join(" ")}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function TopTable({ title, rows, nameKey, countKey }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      {!rows?.length ? (
        <p className="mt-3 text-sm text-gray-500">暂无数据</p>
      ) : (
        <ol className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row, i) => (
            <li key={`${String(row[nameKey])}-${i}`} className="flex justify-between gap-2 py-2 text-sm first:pt-0">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={String(row[nameKey])}>
                <span className="mr-2 tabular-nums text-gray-400">{i + 1}.</span>
                {row[nameKey] ?? "—"}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-100">{num(row[countKey])}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function AuditOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/agent-sessions-audit-overview")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || r.statusText);
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setError(e.message || String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pieData = useMemo(() => {
    const raw = data?.pieRisk ?? [];
    return raw.filter((x) => x && Number(x.value) > 0);
  }, [data]);

  const hasPie = pieData.length > 0;

  return (
    <div className="space-y-8">
      <section className="app-card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">审计概览</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          基于 Doris{" "}
          <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">otel.agent_sessions</code> 与{" "}
          <code className="rounded bg-gray-100 px-1 font-mono text-[11px] dark:bg-gray-800">otel.agent_sessions_logs</code>
          聚合：核心指标（今日/本周/本月）、风险统计、实时态势、近 7 日趋势与 TOP 排行。风险分级为日志行级 SQL 近似，与前端「风险感知」启发式可能略有差异。
        </p>
      </section>

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          无法加载：{error}
          <span className="mt-1 block text-xs">开发环境请使用 npm run dev；预览请先 npm run api 再 npm run preview。</span>
        </p>
      )}

      {loading && !error && <div className="text-sm text-gray-500 w-full h-full flex items-center justify-center">正在加载仪表盘…</div>}

      {!loading && data && (
        <>
          {/* 核心指标：今日 / 本周 / 本月 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">核心指标</h3>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {[
                { label: "今日", w: data.windows?.today },
                { label: "本周", w: data.windows?.week },
                { label: "本月", w: data.windows?.month },
              ].map(({ label, w }) => (
                <div key={label} className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">{label}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MetricCard title="会话总数" value={num(w?.session_total)} hint="started_at 落在窗口内" />
                    <MetricCard title="活跃会话数" value={num(w?.active_sessions)} hint="updated_at 落在窗口内" accent="bg-primary-soft/30 dark:bg-primary/10" />
                    <MetricCard title="用户访问数" value={num(w?.user_access)} hint="账号字段去重" />
                    <MetricCard title="设备连接数" value={num(w?.device_connections)} hint="channel + last_to 去重" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 风险 + 实时 */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-3 xl:col-span-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">风险统计（全库日志行）</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard title="高风险操作" value={num(data.risk?.high)} accent="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30" />
                <MetricCard title="中风险操作" value={num(data.risk?.medium)} accent="border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30" />
                <MetricCard title="低风险操作" value={num(data.risk?.low)} accent="border-sky-200 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-950/30" />
                <MetricCard
                  title="风险会话占比"
                  value={pctRatio(data.risk?.riskSessionRatio)}
                  hint={`本月有风险记录的会话 ${num(data.risk?.riskSessionCount)} / 本月新建会话 ${num(data.risk?.sessionsInMonth)}`}
                />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">实时数据</h3>
              <MetricCard
                title="当前在线会话"
                value={num(data.realtime?.onlineSessions)}
                hint="近 5 分钟有更新且 ended_at 为空"
                accent="border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/25"
              />
              <MetricCard
                title="异常断开会话（24h）"
                value={num(data.realtime?.abnormalDisconnectSessions)}
                hint="aborted_last_run 非 0，近 24 小时有活动"
                accent="border-rose-200 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/25"
              />
            </div>
          </section>

          {/* 饼图 + 趋势 */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="app-card border border-gray-100 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">风险操作结构（饼图）</h3>
              <div className="mt-2 h-[280px] w-full">
                {hasPie ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => num(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">暂无风险样本</div>
                )}
              </div>
            </div>

            <div className="app-card border border-gray-100 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">近 7 日会话量趋势</h3>
              <div className="mt-2 h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trends?.sessions7d ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} activeBar={{ stroke: 'none' }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip labelFormatter={(l) => `日期 ${l}`} formatter={(v) => [num(v), "会话数"]} />
                    <Line type="monotone" dataKey="sessions" name="会话数" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="app-card border border-gray-100 p-4 xl:col-span-2 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">近 7 日风险操作趋势</h3>
              <div className="mt-2 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart activeDot={false} data={data.trends?.risk7d ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => num(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="high" name="高" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="medium" name="中" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="low" name="低" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* TOP */}
          <section>
            <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">TOP 排行（本月）</h3>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              「风险相关」榜仅来自 <code className="rounded bg-gray-100 px-1 font-mono dark:bg-gray-800">agent_sessions_logs</code>
              ；名称优先 <code className="font-mono">message_tool_name</code>，其次尝试从 <code className="font-mono">log_attributes</code> 取{" "}
              <code className="font-mono">$.message.toolName</code>，否则用退出码 / 工具错误 / 助手停止原因等标签。
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <TopTable title="高频用户（按会话创建）" rows={data.tops?.users} nameKey="name" countKey="cnt" />
              <TopTable title="高频访问设备（通道 / 接收方）" rows={data.tops?.devices} nameKey="name" countKey="cnt" />
              <TopTable
                title="高频风险相关（agent_sessions_logs · 本月）"
                rows={data.tops?.riskOps}
                nameKey="name"
                countKey="cnt"
              />
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300">口径说明</p>
            <p className="mt-2">{data.legend?.windows ?? ""}</p>
            <p className="mt-2">{data.legend?.realtime ?? ""}</p>
            <p className="mt-2">{data.legend?.topRiskOps ?? ""}</p>
          </section>
        </>
      )}
    </div>
  );
}
