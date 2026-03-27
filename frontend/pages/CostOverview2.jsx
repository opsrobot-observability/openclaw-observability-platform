import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Area,
  AreaChart,
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
import SortableTableTh from "../components/SortableTableTh.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";

const TIME_PRESETS = [
  { label: "今日", days: 0 },
  { label: "昨日", days: 1 },
  { label: "近7天", days: 7 },
  { label: "近30天", days: 30 },
  { label: "本月", days: "month" },
  { label: "自然月", days: "naturalMonth" },
];

const MODEL_OPTIONS = [
  { value: "all", label: "全部模型" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-3", label: "Claude 3" },
  { value: "llama-3", label: "Llama 3" },
  { value: "qwen", label: "通义千问" },
  { value: "other", label: "其他" },
];

const ENV_OPTIONS = [
  { value: "all", label: "全部环境" },
  { value: "prod", label: "生产" },
  { value: "test", label: "测试" },
  { value: "dev", label: "开发" },
];

const USER_TYPE_OPTIONS = [
  { value: "all", label: "全部用户" },
  { value: "normal", label: "普通用户" },
  { value: "agent", label: "Agent" },
  { value: "system", label: "系统调用" },
];

const CARD_COLORS = [
  "from-primary/10 to-blue-50 dark:from-primary/20 dark:to-gray-900",
  "from-emerald-50 to-emerald-50/50 dark:from-emerald-950/50 dark:to-gray-900",
  "from-sky-50 to-indigo-50/80 dark:from-sky-950/40 dark:to-gray-900",
  "from-amber-50 to-orange-50/70 dark:from-amber-950/40 dark:to-gray-900",
  "from-violet-50 to-purple-50/70 dark:from-violet-950/40 dark:to-gray-900",
  "from-rose-50 to-pink-50/70 dark:from-rose-950/40 dark:to-gray-900",
];

const PIE_COLORS = ["#165DFF", "#00B42A", "#FF7D00", "#F53FAD", "#722ED1", "#14CBD3", "#F7BA1E", "#BD69F3"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function TrendBadge({ pct }) {
  if (pct == null) return null;
  const pos = pct >= 0;
  return (
    <span
      className={[
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
        pos
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
      ].join(" ")}
    >
      {pos ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    normal: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    error: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    "over-token": "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  };
  const labels = {
    normal: "正常",
    warning: "预警",
    error: "超支",
    "over-token": "超Token",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${styles[status] || styles.normal}`}>
      {labels[status] || status}
    </span>
  );
}

function KpiCard({ title, value, unit, trend, status, accent }) {
  const statusStyles = {
    normal: "",
    warning: "ring-2 ring-amber-400/50",
    error: "ring-2 ring-rose-400/50",
  };
  return (
    <article className={`relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition dark:border-gray-800 dark:bg-gray-900 ${statusStyles[status] || ""}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-80`} />
      <div className="relative">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{value}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{unit}</span>
        </div>
        {trend !== undefined && trend !== null && (
          <div className="mt-1 flex items-center gap-1">
            <TrendBadge pct={trend} />
            <span className="text-[10px] text-gray-400">较上期</span>
          </div>
        )}
      </div>
    </article>
  );
}

function GlobalFilterBar({ filters, onChange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const getTimeRange = useCallback((preset) => {
    const now = new Date();
    if (preset === "naturalMonth") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(now) };
    }
    if (preset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDate() + 1);
      return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(now) };
    }
    if (preset === 1) {
      const start = new Date(now.getTime() - 86400000);
      return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(now) };
    }
    const start = new Date(now.getTime() - preset * 86400000);
    return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(now) };
  }, []);

  const handlePreset = (preset) => {
    if (preset === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      const range = getTimeRange(preset);
      onChange({ ...filters, timePreset: preset, timeStart: range.start, timeEnd: range.end });
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      onChange({ ...filters, timePreset: "custom", timeStart: customStart, timeEnd: customEnd });
    }
  };

  useEffect(() => {
    if (filters.timePreset === "custom") {
      setShowCustom(true);
      setCustomStart(filters.timeStart);
      setCustomEnd(filters.timeEnd);
    }
  }, []);

  const handleSelectChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">时间范围</span>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePreset(p.days)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filters.timePreset === p.days
                    ? "bg-primary text-white"
                    : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-primary-soft hover:text-primary dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {showCustom && (
            <div className="ml-2 flex items-center gap-2">
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="app-input w-auto px-2 py-1 text-xs"
              />
              <span className="text-gray-400">至</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="app-input w-auto px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={applyCustomRange}
                className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90"
              >
                应用
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filters.model}
            onChange={(e) => handleSelectChange("model", e.target.value)}
            className="app-input min-w-[120px] px-2 py-1.5 text-xs"
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filters.env}
            onChange={(e) => handleSelectChange("env", e.target.value)}
            className="app-input min-w-[100px] px-2 py-1.5 text-xs"
          >
            {ENV_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filters.userType}
            onChange={(e) => handleSelectChange("userType", e.target.value)}
            className="app-input min-w-[100px] px-2 py-1.5 text-xs"
          >
            {USER_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="项目/应用ID"
            value={filters.projectId}
            onChange={(e) => handleSelectChange("projectId", e.target.value)}
            className="app-input min-w-[100px] px-2 py-1.5 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function SessionTable({ data, onSort, sortField, sortDir }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
            <SortableTableTh field="sessionId" label="会话ID" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-[140px]" />
            <SortableTableTh field="model" label="模型" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-[100px]" />
            <SortableTableTh field="tokenM" label="Token(M)" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-[90px]" numeric />
            <SortableTableTh field="cost" label="消耗(元)" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-[100px]" numeric />
            <SortableTableTh field="agentName" label="Agent" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-[100px]" />
            <SortableTableTh field="createTime" label="发起时间" sortField={sortField} sortDir={sortDir} onSort={onSort} className="w-[150px]" />
            <th className="w-[80px] px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
          {data.map((row, i) => (
            <tr
              key={row.sessionId}
              className={`transition-colors hover:bg-primary-soft/30 dark:hover:bg-primary/10 ${i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/30" : ""}`}
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-primary">{row.sessionId}</td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{row.model}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{typeof row.tokenM === "number" ? row.tokenM.toFixed(2) : row.tokenM}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">¥{typeof row.cost === "number" ? row.cost.toFixed(4) : row.cost}</td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{row.agentName}</td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">{row.createTime}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function CostOverview2() {
  const [filters, setFilters] = useState({
    timePreset: 7,
    timeStart: "",
    timeEnd: "",
    model: "all",
    env: "all",
    userType: "all",
    projectId: "",
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState("cost");
  const [sortDir, setSortDir] = useState("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("timePreset", String(filters.timePreset));
      if (filters.timeStart) params.append("timeStart", filters.timeStart);
      if (filters.timeEnd) params.append("timeEnd", filters.timeEnd);
      if (filters.model) params.append("model", filters.model);
      if (filters.env) params.append("env", filters.env);
      if (filters.userType) params.append("userType", filters.userType);
      if (filters.projectId) params.append("projectId", filters.projectId);

      const response = await fetch(`/api/cost-overview-2?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const sortedSessionData = useMemo(() => {
    if (!data?.sessionData) return [];
    return [...data.sessionData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const modifier = sortDir === "asc" ? 1 : -1;
      if (typeof aVal === "string") {
        return aVal.localeCompare(bVal) * modifier;
      }
      return ((aVal || 0) - (bVal || 0)) * modifier;
    });
  }, [data?.sessionData, sortField, sortDir]);

  if (loading) {
    return (
      <div className="space-y-6">
        <GlobalFilterBar filters={filters} onChange={handleFilterChange} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="app-card h-20 animate-pulse bg-gray-100/80 dark:bg-gray-800/80" />
          ))}
        </div>
        <LoadingSpinner message="正在加载成本数据..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <GlobalFilterBar filters={filters} onChange={handleFilterChange} />
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          加载失败：{error}
        </div>
      </div>
    );
  }

  const kpiCards = data?.kpiCards || [];
  const modelCostData = data?.modelCostData || [];
  const modelTrendData = data?.modelTrendData || [];
  const tokenTrendData = data?.tokenTrendData || [];
  const tokenRatioByModel = data?.tokenRatioByModel || [];
  const tokenRatioByEnv = data?.tokenRatioByEnv || [];

  return (
    <div className="space-y-6">
      <GlobalFilterBar filters={filters} onChange={handleFilterChange} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpiCards.map((card, i) => (
          <KpiCard key={i} {...card} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="app-card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">模型成本占比</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">各模型成本分布情况</p>
          <div className="mt-3 h-[180px]">
            {modelCostData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modelCostData}
                    dataKey="costAmount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ name, costRatio }) => `${name} ${costRatio}%`}
                    labelLine={false}
                  >
                    {modelCostData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [`¥${Number(v).toFixed(2)}`, "成本"]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>

        <div className="app-card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Token消耗占比：输入/输出</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">输入与输出Token消耗对比</p>
          <div className="mt-3 h-[180px]">
            {tokenTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "输入Token", value: data?.inputPct || 0, fill: "#165DFF" },
                      { name: "输出Token", value: data?.outputPct || 0, fill: "#00B42A" },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ name, value }) => `${name} ${value}%`}
                    labelLine={false}
                  >
                    <Cell fill="#165DFF" stroke="#fff" strokeWidth={2} />
                    <Cell fill="#00B42A" stroke="#fff" strokeWidth={2} />
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}%`, "占比"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="app-card p-4 sm:p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Token日消耗趋势</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">输入/输出Token消耗对比</p>
          <div className="mt-3 h-[160px]">
            {tokenTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tokenTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inputFill2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#165DFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#165DFF" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outputFill2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00B42A" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#00B42A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickMargin={8} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={40} tickFormatter={(v) => `${v}M`} />
                  <Tooltip
                    formatter={(v, name) => [`${Number(v).toFixed(3)}M`, name === "input" ? "输入Token" : "输出Token"]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(l) => `日期 ${l}`}
                  />
                  <Legend formatter={(v) => (v === "input" ? "输入Token" : v === "output" ? "输出Token" : v)} />
                  <Area type="monotone" dataKey="input" name="input" stroke="#165DFF" strokeWidth={2} fill="url(#inputFill2)" connectNulls />
                  <Area type="monotone" dataKey="output" name="output" stroke="#00B42A" strokeWidth={2} fill="url(#outputFill2)" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>

        <div className="app-card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Token消耗占比（按模型）</h2>
          <div className="mt-3 h-[160px]">
            {tokenRatioByModel.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tokenRatioByModel}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                  >
                    {tokenRatioByModel.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}%`, "占比"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="app-card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">模型成本趋势</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">各模型成本走势</p>
          <div className="mt-3 h-[180px]">
            {modelTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={modelTrendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickMargin={8} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={50} tickFormatter={(v) => `¥${v}`} />
                  <Tooltip
                    formatter={(v) => [`¥${Number(v).toFixed(2)}`, ""]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(l) => `日期 ${l}`}
                  />
                  <Legend />
                  {modelCostData.slice(0, 4).map((model, i) => (
                    <Line
                      key={model.name}
                      type="monotone"
                      dataKey={model.name}
                      name={model.name}
                      stroke={PIE_COLORS[i]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>

        <div className="app-card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Token消耗占比（按环境）</h2>
          <div className="mt-3 h-[180px]">
            {tokenRatioByEnv.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tokenRatioByEnv}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {tokenRatioByEnv.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}%`, "占比"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-gray-100 p-4 dark:border-gray-800 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">会话/Agent成本归因</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">高成本会话排行，点击表头可排序</p>
        </div>
        <SessionTable data={sortedSessionData} onSort={handleSort} sortField={sortField} sortDir={sortDir} />
      </section>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        数据来源：Doris · otel 库 · {data?.source || ""}
      </p>
    </div>
  );
}
