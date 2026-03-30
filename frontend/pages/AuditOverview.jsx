import { useEffect, useMemo, useState } from "react";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
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
      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          无法加载：{error}
          <span className="mt-1 block text-xs">开发环境请使用 npm run dev；预览请先 npm run api 再 npm run preview。</span>
        </p>
      )}

      {loading && !error && <LoadingSpinner message="正在加载仪表盘…" />}

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
              {loading ? (
                <LoadingSpinner message="" className="py-8" />
              ) : (
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
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">实时数据</h3>
              {loading ? (
                <LoadingSpinner message="" className="py-6" />
              ) : (
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
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
              )}
            </div>
          </section>

          {/* 饼图 + 趋势 */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="app-card border border-gray-100 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">风险操作结构（饼图）</h3>
              <div className="mt-2 h-[280px] w-full">
                {loading ? (
                  <LoadingSpinner message="" className="h-full" />
                ) : hasPie ? (
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
                {loading ? (
                  <LoadingSpinner message="" className="h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trends?.sessions7d ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} activeBar={{ stroke: 'none' }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(l) => `日期 ${l}`} formatter={(v) => [num(v), "会话数"]} />
                      <Line type="monotone" dataKey="sessions" name="会话数" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="app-card border border-gray-100 p-4 xl:col-span-2 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">近 7 日风险操作趋势</h3>
              <div className="mt-2 h-[300px] w-full">
                {loading ? (
                  <LoadingSpinner message="" className="h-full" />
                ) : (
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
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
