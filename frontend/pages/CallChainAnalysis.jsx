import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";
import TablePagination from "../components/TablePagination.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import InstanceDetailView from "./InstanceDetailView.jsx";
import {
  Area,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PAGE_TABS = [
  { key: "overview", labelKey: "callChain.tab.overview" },
  { key: "instance", labelKey: "callChain.tab.instance" },
];

const TIME_RANGE_DEFS = [
  { value: "1h", hours: 1, granularityMinutes: 1, labelKey: "callChain.timeRange.1h", granularityKey: "callChain.granularity.1m" },
  { value: "6h", hours: 6, granularityMinutes: 5, labelKey: "callChain.timeRange.6h", granularityKey: "callChain.granularity.5m" },
  { value: "12h", hours: 12, granularityMinutes: 10, labelKey: "callChain.timeRange.12h", granularityKey: "callChain.granularity.10m" },
  { value: "24h", hours: 24, granularityMinutes: 30, labelKey: "callChain.timeRange.24h", granularityKey: "callChain.granularity.30m" },
  { value: "3d", hours: 72, granularityMinutes: 60, labelKey: "callChain.timeRange.3d", granularityKey: "callChain.granularity.1h" },
  { value: "7d", hours: 168, granularityMinutes: 180, labelKey: "callChain.timeRange.7d", granularityKey: "callChain.granularity.3h" },
];

const SPAN_NAME_LABELS = {
  "openclaw.message.processed": intl.get("callChain.spanNameMessageProcessed"),
  "openclaw.model.usage": intl.get("callChain.spanNameModelUsage"),
  "openclaw.webhook.processed": intl.get("callChain.spanNameWebhookProcessed"),
  "openclaw.webhook.error": intl.get("callChain.spanNameWebhookError"),
  "openclaw.session.stuck": intl.get("callChain.spanNameSessionStuck"),
};

function formatTokenCount(count) {
  if (count >= 1000000) return (count / 1000000).toFixed(2) + "M";
  if (count >= 1000) return (count / 1000).toFixed(1) + "K";
  return count?.toLocaleString() || "0";
}

function formatDuration(ms) {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + "min";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  return ms.toFixed(1) + "ms";
}

function getChangeRateColor(rate, inverse = false) {
  const absRate = Math.abs(rate);
  if (absRate > 50) return "text-red-600 dark:text-red-400";
  if (absRate > 30) return "text-orange-500 dark:text-orange-400";
  if (rate > 0) return inverse ? "text-red-500 dark:text-red-400" : "text-emerald-500 dark:text-emerald-400";
  if (rate < 0) return inverse ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return "text-gray-500 dark:text-gray-400";
}

function MetricCard({ title, value, unit, changeRate, changeLabel, valueColor, inverseChange, icon, iconColor }) {
  const changeRateStr = changeRate != null ? `${changeRate > 0 ? "↑" : "↓"} ${Math.abs(changeRate).toFixed(1)}%` : "";
  const changeColor = changeRate != null ? getChangeRateColor(changeRate, inverseChange) : "";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
      <div className="flex items-start justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">{title}</p>
        {icon && <span className={["shrink-0", iconColor || "text-gray-400 dark:text-gray-500"].join(" ")}><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={["text-2xl font-semibold", valueColor || "text-gray-900 dark:text-gray-100"].join(" ")}>{value}</span>
        {unit && <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>}
      </div>
      {(changeRateStr || changeLabel) && (
        <div className="mt-1.5 flex items-center gap-2">
          {changeRateStr && <span className={["text-xs font-medium", changeColor].join(" ")}>{changeRateStr}</span>}
          {changeLabel && <span className="text-xs text-gray-400 dark:text-gray-500">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}

function HorizontalBarChart({ data, valueFormatter, barColor, thresholdOrange, thresholdRed, maxValue, onItemClick }) {
  if (!data || data.length === 0) return null;
  const max = maxValue || Math.max(...data.map(d => d.value));
  const [pinnedIdx, setPinnedIdx] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const activeIdx = pinnedIdx !== null ? pinnedIdx : hoveredIdx;
  const containerRef = useRef(null);

  useEffect(() => {
    if (pinnedIdx === null) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setPinnedIdx(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pinnedIdx]);

  return (
    <div className="space-y-3" ref={containerRef}>
      {data.map((item, index) => {
        const widthPct = max > 0 ? (item.value / max * 100) : 0;
        let color = barColor || "#3b82f6";
        if (thresholdRed && item.value >= thresholdRed) color = "#ef4444";
        else if (thresholdOrange && item.value >= thresholdOrange) color = "#f59e0b";
        const isActive = activeIdx === index;
        const isPinned = pinnedIdx === index;
        return (
          <div key={index} className="relative"
            onMouseEnter={() => setHoveredIdx(index)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={(e) => { e.stopPropagation(); setPinnedIdx(pinnedIdx === index ? null : index); }}
            style={{ cursor: "pointer" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[55%]">{item.label}</span>
              <span className="text-xs font-medium text-gray-900 dark:text-gray-100 ml-2">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${widthPct}%`, backgroundColor: color }} />
            </div>
            {isActive && (
              <div className={[
                "absolute z-30 w-max min-w-[240px] max-w-[420px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2.5 shadow-xl text-xs",
                isPinned ? "left-0 top-full mt-1" : "left-1/2 -translate-x-1/2 bottom-full mb-2",
              ].join(" ")}
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100 dark:border-gray-800">
                  <span className="shrink-0 text-primary"><Icon name="server" className="h-3.5 w-3.5" /></span>
                  <span className="font-mono text-primary break-all">{item.instanceName || "—"}</span>
                </div>
                <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-800">
                  <span className="shrink-0 text-gray-400"><Icon name="link" className="h-3.5 w-3.5" /></span>
                  <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{item.traceId || "—"}</span>
                </div>
                <div className="flex items-center gap-2 pt-1.5">
                  <span className="shrink-0 text-gray-400"><Icon name="bar-chart" className="h-3.5 w-3.5" /></span>
                  <span className="text-gray-700 dark:text-gray-200">{item.metricLabel || ""}: <span className="font-semibold text-gray-900 dark:text-gray-100">{valueFormatter(item.value)}</span></span>
                </div>
                {onItemClick && (
                  <button type="button" onClick={() => { setPinnedIdx(null); onItemClick(item); }} className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-800 text-primary font-medium w-full text-left hover:text-primary/80 transition-colors inline-flex items-center gap-1">
                    {intl.get("callChain.instance.viewDetail")} →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DurationBarChart({ data }) {
  if (!data || data.length === 0) return null;
  const chartData = data.map(d => ({ bucket: d.bucket, count: d.spanCount, percentage: d.percentage || 0 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsBarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + "K" : v} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(v, name) => [v.toLocaleString(), intl.get("callChain.overview.callCount")]} />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

function DedupTooltip({ active, payload, label, yTickFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  const seen = new Map();
  for (const entry of payload) {
    if (!seen.has(entry.name)) {
      seen.set(entry.name, entry);
    }
  }
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {[...seen.values()].map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 dark:text-gray-300">{entry.name}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100 ml-auto">{yTickFormatter ? yTickFormatter(entry.value) : entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function TrendAreaChart({ data, dataKey, color, name, height = 208, yDomain, yTickFormatter, syncId }) {
  if (!data || data.length === 0) return null;
  const gradientId = `trend-grad-${dataKey}-${Math.random().toString(36).substr(2, 9)}`;
  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };
  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? "");
    if (yTickFormatter) return yTickFormatter(n);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toFixed(n < 10 ? 1 : 0);
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId={syncId}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={48} domain={yDomain} tickFormatter={(v) => formatValue(v)} />
        <Tooltip formatter={(v) => [formatValue(v), ""]} labelFormatter={(d) => d || ""} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Area type="monotone" dataKey={dataKey} stroke="none" fill={`url(#${gradientId})`} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls name={name} />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

function DualLineTrendChart({ data, dataKey1, dataKey2, color1, color2, name1, name2, height = 208, yDomain, yTickFormatter, syncId }) {
  if (!data || data.length === 0) return null;
  const gradientId = `trend-grad-dual-${Math.random().toString(36).substr(2, 9)}`;
  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };
  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? "");
    if (yTickFormatter) return yTickFormatter(n);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toFixed(n < 10 ? 1 : 0);
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId={syncId}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color1} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={48} domain={yDomain} tickFormatter={(v) => formatValue(v)} />
        <Tooltip formatter={(v, n) => [formatValue(v), n === dataKey1 ? name1 : name2]} labelFormatter={(d) => d || ""} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Area type="monotone" dataKey={dataKey1} stroke="none" fill={`url(#${gradientId})`} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey={dataKey1} stroke={color1} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls name={name1} />
        <Line type="monotone" dataKey={dataKey2} stroke={color2} strokeWidth={1.5} strokeDasharray="6 3" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls name={name2} />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

const INSTANCE_LINE_COLORS = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#4f46e5", "#ea580c"];

function MultiInstanceTrendChart({ data, lineKeys, height = 208, yDomain, yTickFormatter, syncId }) {
  if (!data || data.length === 0 || !lineKeys || lineKeys.length === 0) return null;
  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };
  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? "");
    if (yTickFormatter) return yTickFormatter(n);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toFixed(n < 10 ? 1 : 0);
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 28, right: 4, left: 0, bottom: 0 }} syncId={syncId}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={48} domain={yDomain} tickFormatter={(v) => formatValue(v)} />
        <Tooltip formatter={(v) => [formatValue(v), ""]} labelFormatter={(d) => d || ""} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend verticalAlign="top" align="left" height={24} iconType="plain" iconSize={8} wrapperStyle={{ fontSize: 10, lineHeight: "14px", maxHeight: 48, overflowY: "auto" }} />
        {lineKeys.map((lk, i) => (
          <Line key={lk.key} type="monotone" dataKey={lk.key} stroke={INSTANCE_LINE_COLORS[i % INSTANCE_LINE_COLORS.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls name={lk.name} />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

function getInstanceStatusColor(status) {
  switch (status) {
    case "normal": return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning": return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "error": return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300";
    default: return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
  }
}

function getInstanceStatusLabel(status) {
  switch (status) {
    case "normal": return intl.get("callChain.instance.statusNormal");
    case "warning": return intl.get("callChain.instance.statusWarning");
    case "error": return intl.get("callChain.instance.statusError");
    default: return intl.get("callChain.instance.statusOffline");
  }
}

const EMPTY_CELL = "\u2014";
function cellText(v) { return v == null || String(v).trim() === "" ? EMPTY_CELL : String(v); }

function SortTh({ colKey, labelKey, sortKey, sortDir, onSort }) {
  const active = sortKey === colKey;
  return (
    <th scope="col" className="px-4 py-3">
      <button type="button" onClick={() => onSort(colKey)} className="group inline-flex max-w-full items-center gap-1 font-semibold text-gray-700 hover:text-primary dark:text-gray-300 dark:hover:text-primary">
        <span className="truncate">{intl.get(labelKey)}</span>
        <span className={`shrink-0 text-[10px] font-normal ${active ? "text-primary" : "text-gray-400 opacity-60 group-hover:opacity-100"}`} aria-hidden>
          {active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25B4\u25BE"}
        </span>
      </button>
    </th>
  );
}

function sortValueForInstance(inst, key) {
  switch (key) {
    case "instanceId": return String(inst.instanceId || "").toLowerCase();
    case "hostName": return String(inst.hostName || "").toLowerCase();
    case "hostIp": return String(inst.hostIp || "").toLowerCase();
    case "status": return inst.status === "normal" ? 0 : inst.status === "warning" ? 1 : inst.status === "error" ? 2 : 3;
    case "deployEnv": return String(inst.deployEnv || "").toLowerCase();
    case "startTime": return String(inst.startTime || "").toLowerCase();
    case "totalCalls": return Number(inst.totalCalls) || 0;
    case "totalTraces": return Number(inst.totalTraces) || 0;
    case "dailyAvgCalls": return Number(inst.dailyAvgCalls) || 0;
    case "peakCalls": return Number(inst.peakCalls) || 0;
    case "callPercentage": return Number(inst.callPercentage) || 0;
    case "successCount": return Number(inst.successCount) || 0;
    case "errorCount": return Number(inst.errorCount) || 0;
    case "successRate": return Number(inst.successRate) || 0;
    case "errorRate": return Number(inst.errorRate) || 0;
    case "stuckCount": return Number(inst.stuckCount) || 0;
    case "webhookErrorCount": return Number(inst.webhookErrorCount) || 0;
    case "avgDurationMs": return Number(inst.avgDurationMs) || 0;
    case "p50DurationMs": return Number(inst.p50DurationMs) || 0;
    case "p90DurationMs": return Number(inst.p90DurationMs) || 0;
    case "p99DurationMs": return Number(inst.p99DurationMs) || 0;
    case "maxDurationMs": return Number(inst.maxDurationMs) || 0;
    case "minDurationMs": return Number(inst.minDurationMs) || 0;
    case "durationChangeRate": return Number(inst.durationChangeRate) || 0;
    case "channelCount": return Number(inst.channelCount) || 0;
    case "modelCount": return Number(inst.modelCount) || 0;
    case "totalTokens": return Number(inst.totalTokens) || 0;
    case "avgTokenPerCall": return Number(inst.avgTokenPerCall) || 0;
    case "hostArch": return String(inst.hostArch || "").toLowerCase();
    case "processPid": return String(inst.processPid || "").toLowerCase();
    case "runtimeVersion": return String(inst.runtimeVersion || "").toLowerCase();
    case "processOwner": return String(inst.processOwner || "").toLowerCase();
    default: return "";
  }
}

const DEFAULT_PAGE_SIZE = 10;

export default function CallChainAnalysis() {
  const [pageTab, setPageTab] = useState("overview");
  const [selectedTimeRange, setSelectedTimeRange] = useState("1h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [instanceData, setInstanceData] = useState(null);
  const [timeMode, setTimeMode] = useState("quick");
  const [customStartTime, setCustomStartTime] = useState("");
  const [customEndTime, setCustomEndTime] = useState("");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [topN, setTopN] = useState(10);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedInstance, setSelectedInstance] = useState(null);

  const { locale } = useLocale();
  const timeRanges = useMemo(() => TIME_RANGE_DEFS.map((d) => ({ ...d, label: intl.get(d.labelKey), granularityLabel: intl.get(d.granularityKey) })), [locale]);

  const timeRangeConfig = timeRanges.find((r) => r.value === selectedTimeRange);
  const selectedHours = timeRangeConfig?.hours || 1;

  const buildUrlParams = useCallback(() => {
    if (timeMode === "custom" && customStartTime && customEndTime) {
      return `startTime=${encodeURIComponent(customStartTime)}&endTime=${encodeURIComponent(customEndTime)}`;
    }
    return `hours=${selectedHours}`;
  }, [selectedHours, timeMode, customStartTime, customEndTime]);

  const fetchOverviewData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/otel-traces-overview?${buildUrlParams()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      setOverviewData(await res.json());
      setLastUpdated(new Date());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [buildUrlParams]);

  const fetchInstanceData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/otel-traces-instances?${buildUrlParams()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      setInstanceData(await res.json());
      setLastUpdated(new Date());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [buildUrlParams]);

  useEffect(() => {
    if (pageTab === "overview") fetchOverviewData();
    else fetchInstanceData();
  }, [pageTab, fetchOverviewData, fetchInstanceData]);

  const handleManualRefresh = () => {
    if (pageTab === "overview") fetchOverviewData();
    else fetchInstanceData();
  };

  const handleApplyCustomTime = () => {
    if (customStartTime && customEndTime) { setTimeMode("custom"); setShowTimePicker(false); }
  };

  const handleQuickTimeSelect = (value) => {
    setSelectedTimeRange(value); setTimeMode("quick"); setCustomStartTime(""); setCustomEndTime("");
  };

  const granularityLabel = timeRangeConfig?.granularityLabel || intl.get("callChain.granularity.1m");

  if (selectedInstance) {
    const detailFilters = selectedInstance._filterSpanName
      ? { spanNames: [selectedInstance._filterSpanName] }
      : undefined;
    return (
      <InstanceDetailView
        instance={selectedInstance}
        onBack={() => setSelectedInstance(null)}
        initialTimeRange={selectedTimeRange}
        initialFilters={detailFilters}
      />
    );
  }

  if (loading && !overviewData && !instanceData) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{intl.get("callChain.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">{intl.get("callChain.loadErrorTitle")}</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
              <button type="button" onClick={handleManualRefresh} className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200 underline">{intl.get("callChain.clickRetry")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex flex-wrap gap-1" role="tablist">
          {PAGE_TABS.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={pageTab === tab.key}
              onClick={() => setPageTab(tab.key)}
              className={["px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                pageTab === tab.key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              ].join(" ")}>
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {pageTab === "overview" && (
        <OverviewTab
          overviewData={overviewData} topN={topN} setTopN={setTopN}
          timeRanges={timeRanges} selectedTimeRange={selectedTimeRange} timeMode={timeMode}
          handleQuickTimeSelect={handleQuickTimeSelect} granularityLabel={granularityLabel}
          showTimePicker={showTimePicker} setShowTimePicker={setShowTimePicker}
          customStartTime={customStartTime} setCustomStartTime={setCustomStartTime}
          customEndTime={customEndTime} setCustomEndTime={setCustomEndTime}
          handleApplyCustomTime={handleApplyCustomTime}
          loading={loading} handleManualRefresh={handleManualRefresh}
          lastUpdated={lastUpdated}
          onViewInstanceDetail={setSelectedInstance}
        />
      )}
      {pageTab === "instance" && (
        <InstanceTab
          data={instanceData} loading={loading}
          timeRanges={timeRanges} selectedTimeRange={selectedTimeRange} timeMode={timeMode}
          handleQuickTimeSelect={handleQuickTimeSelect} granularityLabel={granularityLabel}
          showTimePicker={showTimePicker} setShowTimePicker={setShowTimePicker}
          customStartTime={customStartTime} setCustomStartTime={setCustomStartTime}
          customEndTime={customEndTime} setCustomEndTime={setCustomEndTime}
          handleApplyCustomTime={handleApplyCustomTime}
          handleManualRefresh={handleManualRefresh}
          lastUpdated={lastUpdated}
          onViewDetail={setSelectedInstance}
        />
      )}
    </div>
  );
}

function OverviewTab({ overviewData, topN, setTopN, timeRanges, selectedTimeRange, timeMode, handleQuickTimeSelect, granularityLabel, showTimePicker, setShowTimePicker, customStartTime, setCustomStartTime, customEndTime, setCustomEndTime, handleApplyCustomTime, loading, handleManualRefresh, lastUpdated, onViewInstanceDetail }) {
  const [trendMode, setTrendMode] = useState("all");
  const od = overviewData || {};
  const overview = od.overview || {};
  const trend = od.trend || [];
  const trendByInstance = od.trendByInstance || [];
  const instances = od.instances || [];
  const instanceDuration = od.instanceDuration || [];
  const topSlow = od.topSlow || [];
  const topSlowDetailMap = od.topSlowDetailMap || {};
  const topLowSuccessDetailMap = od.topLowSuccessDetailMap || {};
  const topErrorDetailMap = od.topErrorDetailMap || {};
  const topLowSuccess = od.topLowSuccess || [];
  const topErrors = od.topErrors || [];
  const channels = od.channels || [];
  const modelTokens = od.modelTokens || [];
  const durationBuckets = od.durationBuckets || [];
  const durationPercentiles = od.durationPercentiles || {};

  const totalCalls = overview.totalCalls || 0;
  const successCount = overview.successCount || 0;
  const errorCount = overview.errorCount || 0;
  const successRate = overview.successRate || 0;
  const avgDurationMs = overview.avgDurationMs || 0;
  const maxDurationMs = overview.maxDurationMs || 0;

  const successRateValueColor = successRate < 90 ? "text-red-600 dark:text-red-400" : successRate < 95 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400";
  const errorCountValueColor = errorCount > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  const topSlowData = topSlow.slice(0, topN).map(r => {
    const detail = topSlowDetailMap[r.spanName] || {};
    return {
      label: SPAN_NAME_LABELS[r.spanName] || r.spanName,
      value: r.maxDurationMs,
      instanceName: detail.instanceId || "",
      instanceId: detail.instanceId || "",
      traceId: detail.traceId || "",
      spanName: r.spanName || "",
      metricLabel: intl.get("callChain.overview.maxDuration"),
    };
  });
  const topSlowMax = topSlow.length > 0 ? Math.max(...topSlow.slice(0, topN).map(d => d.maxDurationMs)) : 1;
  const topLowSuccessData = topLowSuccess.slice(0, topN).map(r => {
    const detail = topLowSuccessDetailMap[r.spanName] || {};
    return {
      label: SPAN_NAME_LABELS[r.spanName] || r.spanName,
      value: r.successRate,
      instanceName: detail.instanceId || "",
      instanceId: detail.instanceId || "",
      traceId: detail.traceId || "",
      spanName: r.spanName || "",
      metricLabel: intl.get("callChain.overview.successRate"),
    };
  });
  const topErrorsData = topErrors.slice(0, topN).map(r => {
    const detail = topErrorDetailMap[r.spanName] || {};
    return {
      label: SPAN_NAME_LABELS[r.spanName] || r.spanName,
      value: r.errorCount,
      instanceName: detail.instanceId || "",
      instanceId: detail.instanceId || "",
      traceId: detail.traceId || "",
      spanName: r.spanName || "",
      metricLabel: intl.get("callChain.colErrorCount"),
    };
  });
  const topErrorsMax = topErrors.length > 0 ? Math.max(...topErrors.slice(0, topN).map(d => d.errorCount)) : 1;

  const { callLineKeys, srLineKeys, durLineKeys, errLineKeys, instanceTrendPivot, instanceSuccessRatePivot, instanceDurationPivot, instanceErrorPivot } = useMemo(() => {
    if (!trendByInstance || trendByInstance.length === 0) {
      return { callLineKeys: [], srLineKeys: [], durLineKeys: [], errLineKeys: [], instanceTrendPivot: [], instanceSuccessRatePivot: [], instanceDurationPivot: [], instanceErrorPivot: [] };
    }
    const instSet = new Set();
    for (const r of trendByInstance) { if (r.instance_id) instSet.add(r.instance_id); }
    const keys = [...instSet].sort();
    const timeMap = new Map();
    for (const r of trendByInstance) {
      const raw = r.time_bucket || "";
      const t = raw.length >= 16 ? raw.substring(11, 16) : raw;
      if (!timeMap.has(t)) timeMap.set(t, { time: t });
      const entry = timeMap.get(t);
      const id = r.instance_id || "unknown";
      const total = Number(r.total_calls) || 0;
      const success = Number(r.success_count) || 0;
      const errors = Number(r.error_count) || 0;
      const avgDur = Number(r.avg_duration_ms) || 0;
      entry[id] = total;
      entry[`${id}_sr`] = total > 0 ? Math.round((success / total * 100) * 100) / 100 : 100;
      entry[`${id}_dur`] = Math.round(avgDur * 100) / 100;
      entry[`${id}_err`] = errors;
    }
    const sortedTimes = [...timeMap.keys()].sort();
    const pivot = sortedTimes.map(t => timeMap.get(t));
    const srPivot = pivot.map(row => {
      const out = { time: row.time };
      for (const k of keys) out[`${k}_sr`] = row[`${k}_sr`];
      return out;
    });
    const durPivot = pivot.map(row => {
      const out = { time: row.time };
      for (const k of keys) out[`${k}_dur`] = row[`${k}_dur`];
      return out;
    });
    const errPivot = pivot.map(row => {
      const out = { time: row.time };
      for (const k of keys) out[`${k}_err`] = row[`${k}_err`];
      return out;
    });
    const cKeys = keys.map(k => ({ key: k, name: k }));
    const sKeys = keys.map(k => ({ key: `${k}_sr`, name: k }));
    const dKeys = keys.map(k => ({ key: `${k}_dur`, name: k }));
    const eKeys = keys.map(k => ({ key: `${k}_err`, name: k }));
    return { callLineKeys: cKeys, srLineKeys: sKeys, durLineKeys: dKeys, errLineKeys: eKeys, instanceTrendPivot: pivot, instanceSuccessRatePivot: srPivot, instanceDurationPivot: durPivot, instanceErrorPivot: errPivot };
  }, [trendByInstance]);

  return (
    <div className="space-y-6">
      <div className="app-card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.headerObserveTime")}</span>
          <div className="flex gap-1.5">
            {timeRanges.slice(0, 6).map((range) => (
              <button key={range.value} type="button" onClick={() => handleQuickTimeSelect(range.value)}
                className={["rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  timeMode === "quick" && selectedTimeRange === range.value ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                ].join(" ")}>{range.label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.granularityWithValue", { label: granularityLabel })}</span>
          <div className="relative">
            <button type="button" onClick={() => setShowTimePicker(!showTimePicker)}
              className={["inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                timeMode === "custom" ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
              ].join(" ")}>
              <Icon name="calendar" className="h-3.5 w-3.5" />{timeMode === "custom" ? intl.get("callChain.customTime") : intl.get("callChain.preciseTime")}
            </button>
            {showTimePicker && (
              <div className="absolute left-0 top-full mt-2 z-50 w-80 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
                <div className="space-y-3">
                  <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{intl.get("timeFilter.startTime")}</label><input type="datetime-local" value={customStartTime} onChange={(e) => setCustomStartTime(e.target.value)} className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
                  <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{intl.get("timeFilter.endTime")}</label><input type="datetime-local" value={customEndTime} onChange={(e) => setCustomEndTime(e.target.value)} className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setShowTimePicker(false)} className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700">{intl.get("callChain.cancel")}</button>
                    <button type="button" onClick={handleApplyCustomTime} disabled={!customStartTime || !customEndTime} className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">{intl.get("callChain.apply")}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
        <button type="button" onClick={handleManualRefresh} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
          <Icon name="refresh" className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />{intl.get("callChain.manualRefresh")}
        </button>
        {lastUpdated && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{intl.get("callChain.lastUpdated")}: {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard title={intl.get("callChain.overview.totalCalls")} value={totalCalls.toLocaleString()} changeRate={overview.totalCallsChangeRate} changeLabel={intl.get("callChain.overview.vsPrevPeriod")} icon="activity" iconColor="text-blue-500" />
        <MetricCard title={intl.get("callChain.overview.successCount")} value={successCount.toLocaleString()} valueColor="text-emerald-600 dark:text-emerald-400" changeLabel={`${intl.get("callChain.overview.successRatio")}: ${totalCalls > 0 ? (successCount / totalCalls * 100).toFixed(1) : 0}%`} icon="check-circle" iconColor="text-emerald-500" />
        <MetricCard title={intl.get("callChain.overview.errorCount")} value={errorCount.toLocaleString()} valueColor={errorCountValueColor} changeLabel={`${intl.get("callChain.overview.errorRatio")}: ${totalCalls > 0 ? (errorCount / totalCalls * 100).toFixed(2) : 0}%`} icon="x-circle" iconColor="text-red-500" />
        <MetricCard title={intl.get("callChain.overview.successRate")} value={successRate.toFixed(2)} unit="%" valueColor={successRateValueColor} changeRate={overview.successRateChangeRate} changeLabel={intl.get("callChain.overview.vsPrevPeriod")} inverseChange icon="shield-check" iconColor="text-emerald-500" />
        <MetricCard title={intl.get("callChain.overview.avgDuration")} value={formatDuration(avgDurationMs)} changeRate={overview.avgDurationChangeRate} changeLabel={intl.get("callChain.overview.vsPrevPeriod")} inverseChange icon="clock" iconColor="text-amber-500" />
        <MetricCard title={intl.get("callChain.overview.maxDuration")} value={formatDuration(maxDurationMs)} valueColor={maxDurationMs > 10000 ? "text-red-600 dark:text-red-400" : undefined} icon="zap" iconColor="text-orange-500" />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("callChain.overview.instanceTrend")}</h3>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 dark:border-gray-600 dark:bg-gray-800/60" role="group">
            <button type="button" onClick={() => setTrendMode("all")} className={["rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors", trendMode === "all" ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"].join(" ")}>{intl.get("callChain.overview.trendModeAll")}</button>
            <button type="button" onClick={() => setTrendMode("instance")} className={["rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors", trendMode === "instance" ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"].join(" ")}>{intl.get("callChain.overview.trendModeInstance")}</button>
          </div>
        </div>
        <div className="grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{intl.get("callChain.overview.callTrend")}</h4>
            <div className="mt-2 h-52">
              {trendMode === "all" ? (
                <TrendAreaChart data={trend} dataKey="totalCalls" color="#3b82f6" name={intl.get("callChain.overview.totalCalls")} syncId="otel-overview-trend-sync" />
              ) : (
                <MultiInstanceTrendChart data={instanceTrendPivot} lineKeys={callLineKeys} syncId="otel-overview-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{intl.get("callChain.overview.successRateTrend")}</h4>
            <div className="mt-2 h-52">
              {trendMode === "all" ? (
                <TrendAreaChart data={trend} dataKey="successRate" color="#10b981" name={intl.get("callChain.overview.successRate")} yDomain={[0, 100]} yTickFormatter={(v) => `${v}%`} syncId="otel-overview-trend-sync" />
              ) : (
                <MultiInstanceTrendChart data={instanceSuccessRatePivot} lineKeys={srLineKeys} yDomain={[0, 100]} yTickFormatter={(v) => `${v}%`} syncId="otel-overview-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{intl.get("callChain.overview.durationTrend")}</h4>
            <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
              <span><span className="inline-block w-3 h-0.5 bg-amber-500 mr-1 align-middle" />{intl.get("callChain.overview.avgDuration")}</span>
              <span><span className="inline-block w-3 h-0.5 bg-red-500 mr-1 align-middle border-dashed" style={{ borderTop: "1px dashed #ef4444" }} />{intl.get("callChain.overview.maxDuration")}</span>
            </div>
            <div className="mt-2 h-52">
              {trendMode === "all" ? (
                <DualLineTrendChart data={trend} dataKey1="avgDurationMs" dataKey2="maxDurationMs" color1="#f59e0b" color2="#ef4444" name1={intl.get("callChain.overview.avgDuration")} name2={intl.get("callChain.overview.maxDuration")} yTickFormatter={(v) => formatDuration(v)} syncId="otel-overview-trend-sync" />
              ) : (
                <MultiInstanceTrendChart data={instanceDurationPivot} lineKeys={durLineKeys} yTickFormatter={(v) => formatDuration(v)} syncId="otel-overview-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{intl.get("callChain.overview.errorTrend")}</h4>
            <div className="mt-2 h-52">
              {trendMode === "all" ? (
                <TrendAreaChart data={trend} dataKey="errorCount" color="#ef4444" name={intl.get("callChain.overview.errorCount")} syncId="otel-overview-trend-sync" />
              ) : (
                <MultiInstanceTrendChart data={instanceErrorPivot} lineKeys={errLineKeys} syncId="otel-overview-trend-sync" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("callChain.overview.instanceAnalysis")}</h3>
        <div className="grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.instanceCallFailure")}</h4>
            {instances.length === 0 ? <p className="text-xs text-gray-400 dark:text-gray-500">{intl.get("callChain.noTraceData")}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-700/60">
                <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.instanceId")}</th>
                <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.callCount")}</th>
                <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.failureRate")}</th>
                <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.avgDuration")}</th>
              </tr></thead><tbody>
                {instances.map((r, i) => (<tr key={i} className="border-b border-gray-50 dark:border-gray-800/60 cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-950/10" onClick={() => onViewInstanceDetail && onViewInstanceDetail(r)}>
                  <td className="py-2 px-2 text-gray-900 dark:text-gray-100"><div className="font-medium">{r.serviceName}</div><div className="text-[10px] text-gray-400 dark:text-gray-500">{r.hostName}</div></td>
                  <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-300">{r.totalCalls.toLocaleString()}</td>
                  <td className={["py-2 px-2 text-right font-medium", r.failureRate > 5 ? "text-red-600 dark:text-red-400" : r.failureRate > 1 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{r.failureRate}%</td>
                  <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-300">{formatDuration(r.avgDurationMs)}</td>
                </tr>))}</tbody></table></div>
            )}
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.instanceDurationSuccess")}</h4>
            {instanceDuration.length === 0 ? <p className="text-xs text-gray-400 dark:text-gray-500">{intl.get("callChain.noTraceData")}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-700/60">
                <th className="py-2 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.instanceId")}</th>
                <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.maxDuration")}</th>
                <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.successRate")}</th>
                <th className="py-2 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.avgDuration")}</th>
              </tr></thead><tbody>
                {instanceDuration.map((r, i) => (<tr key={i} className="border-b border-gray-50 dark:border-gray-800/60 cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-950/10" onClick={() => onViewInstanceDetail && onViewInstanceDetail(r)}>
                  <td className="py-2 px-2 text-gray-900 dark:text-gray-100"><div className="font-medium">{r.serviceName}</div><div className="text-[10px] text-gray-400 dark:text-gray-500">{r.hostName}</div></td>
                  <td className={["py-2 px-2 text-right font-medium", r.maxDurationMs > 10000 ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"].join(" ")}>{formatDuration(r.maxDurationMs)}</td>
                  <td className={["py-2 px-2 text-right font-medium", r.successRate < 90 ? "text-red-600 dark:text-red-400" : r.successRate < 95 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{r.successRate}%</td>
                  <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-300">{formatDuration(r.avgDurationMs)}</td>
                </tr>))}</tbody></table></div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("callChain.overview.topRanking")}</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.showTop")}</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 dark:border-gray-600 dark:bg-gray-800/60" role="group">
              {[5, 10, 20].map((n) => (
                <button key={n} type="button" onClick={() => setTopN(n)}
                  className={["rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    topN === n ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                  ].join(" ")}>Top{n}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.topSlowSpans")}</h4>
            <HorizontalBarChart data={topSlowData} maxValue={topSlowMax} valueFormatter={(v) => formatDuration(v)} barColor="#3b82f6" thresholdOrange={5000} thresholdRed={10000} onItemClick={onViewInstanceDetail ? (item) => { const inst = instances.find(i => i.instanceId === item.instanceId) || { instanceId: item.instanceId || item.instanceName, hostName: "", hostIp: "", status: "normal" }; inst._filterSpanName = item.spanName; onViewInstanceDetail(inst); } : undefined} />
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.topLowSuccess")}</h4>
            <HorizontalBarChart data={topLowSuccessData} maxValue={100} valueFormatter={(v) => v.toFixed(1) + "%"} barColor="#10b981" onItemClick={onViewInstanceDetail ? (item) => { const inst = instances.find(i => i.instanceId === item.instanceId) || { instanceId: item.instanceId || item.instanceName, hostName: "", hostIp: "", status: "normal" }; inst._filterSpanName = item.spanName; onViewInstanceDetail(inst); } : undefined} />
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.topErrorSpans")}</h4>
            <HorizontalBarChart data={topErrorsData} maxValue={topErrorsMax} valueFormatter={(v) => v.toLocaleString()} barColor="#ef4444" onItemClick={onViewInstanceDetail ? (item) => { const inst = instances.find(i => i.instanceId === item.instanceId) || { instanceId: item.instanceId || item.instanceName, hostName: "", hostIp: "", status: "normal" }; inst._filterSpanName = item.spanName; onViewInstanceDetail(inst); } : undefined} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("callChain.overview.businessPerformance")}</h3>
        <div className="grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.channelDist")}</h4>
            {channels.length === 0 ? <p className="text-xs text-gray-400 dark:text-gray-500">{intl.get("callChain.noTraceData")}</p> : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie data={channels.map(r => ({ name: r.name === "__other__" ? intl.get("callChain.overview.channelOther") : r.name, value: r.totalCalls }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30} paddingAngle={2}>
                      {channels.map((_, i) => <Cell key={i} fill={["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"][i % 8]} />)}
                    </Pie>
                    <Tooltip formatter={(v, name) => [v.toLocaleString(), name]} />
                    <Legend iconType="circle" iconSize={8} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
            {channels.length > 0 && (
              <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-700/60">
                <th className="py-1.5 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.channel")}</th>
                <th className="py-1.5 px-2 text-left font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.colInstanceId")}</th>
                <th className="py-1.5 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.callCount")}</th>
                <th className="py-1.5 px-2 text-right font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.overview.successRate")}</th>
              </tr></thead><tbody>
                {channels.map((r, i) => (<tr key={i} className="border-b border-gray-50 dark:border-gray-800/60">
                  <td className="py-1.5 px-2 text-gray-900 dark:text-gray-100">{r.name === "__other__" ? intl.get("callChain.overview.channelOther") : r.name}</td>
                  <td className="py-1.5 px-2 text-primary font-mono">{r.instanceId || "—"}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600 dark:text-gray-300">{r.totalCalls.toLocaleString()}</td>
                  <td className={["py-1.5 px-2 text-right", r.successRate < 95 ? "text-orange-500" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{r.successRate}%</td>
                </tr>))}</tbody></table></div>
            )}
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.modelTokenRank")}</h4>
            {modelTokens.length === 0 ? <p className="text-xs text-gray-400 dark:text-gray-500">{intl.get("callChain.noTraceData")}</p> : (
              <div className="space-y-3">{modelTokens.slice(0, 5).map((r, i) => {
                const inputPct = r.totalTokens > 0 ? (r.inputTokens / r.totalTokens * 100) : 0;
                const outputPct = r.totalTokens > 0 ? (r.outputTokens / r.totalTokens * 100) : 0;
                const cachePct = r.totalTokens > 0 ? (r.cacheTokens / r.totalTokens * 100) : 0;
                return (<div key={i}>
                  <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-700 dark:text-gray-300 truncate">{r.name}</span><span className="text-xs font-medium text-gray-900 dark:text-gray-100">{formatTokenCount(r.totalTokens)}</span></div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${inputPct}%` }} />
                    <div className="h-full bg-orange-500" style={{ width: `${outputPct}%` }} />
                    <div className="h-full bg-gray-400" style={{ width: `${cachePct}%` }} />
                  </div>
                  <div className="flex gap-2 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5" />{intl.get("callChain.overview.inputToken")}: {formatTokenCount(r.inputTokens)}</span>
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-0.5" />{intl.get("callChain.overview.outputToken")}: {formatTokenCount(r.outputTokens)}</span>
                  </div>
                </div>);
              })}</div>
            )}
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-3">{intl.get("callChain.overview.durationDist")}</h4>
            <div className="flex gap-4 mb-3">
              <div className="text-center"><span className="text-[10px] text-gray-500 dark:text-gray-400">P50</span><p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatDuration(durationPercentiles.p50 || 0)}</p></div>
              <div className="text-center"><span className="text-[10px] text-gray-500 dark:text-gray-400">P90</span><p className="text-xs font-semibold text-orange-600 dark:text-orange-400">{formatDuration(durationPercentiles.p90 || 0)}</p></div>
              <div className="text-center"><span className="text-[10px] text-gray-500 dark:text-gray-400">P99</span><p className="text-xs font-semibold text-red-600 dark:text-red-400">{formatDuration(durationPercentiles.p99 || 0)}</p></div>
            </div>
            <DurationBarChart data={durationBuckets} />
          </div>
        </div>
      </div>
    </div>
  );
}

const COLUMN_GROUPS = [
  {
    key: "basic",
    labelKey: "callChain.instance.columnGroupBasic",
    columns: [
      { key: "instanceId", labelKey: "callChain.instance.colInstanceId", fixed: true },
      { key: "hostName", labelKey: "callChain.instance.colHostName", fixed: true },
      { key: "hostIp", labelKey: "callChain.instance.colHostIp", fixed: true },
      { key: "status", labelKey: "callChain.instance.colStatus", fixed: true },
      { key: "deployEnv", labelKey: "callChain.instance.colDeployEnv" },
      { key: "startTime", labelKey: "callChain.instance.colStartTime" },
    ],
  },
  {
    key: "call",
    labelKey: "callChain.instance.columnGroupCall",
    columns: [
      { key: "totalCalls", labelKey: "callChain.instance.colTotalCalls" },
      { key: "totalTraces", labelKey: "callChain.instance.colTotalTraces" },
      { key: "dailyAvgCalls", labelKey: "callChain.instance.colDailyAvgCalls" },
      { key: "peakCalls", labelKey: "callChain.instance.colPeakCalls" },
      { key: "callPercentage", labelKey: "callChain.instance.colCallPercentage" },
    ],
  },
  {
    key: "stability",
    labelKey: "callChain.instance.columnGroupStability",
    columns: [
      { key: "successCount", labelKey: "callChain.instance.colSuccessCount" },
      { key: "errorCount", labelKey: "callChain.instance.colErrorCount" },
      { key: "successRate", labelKey: "callChain.instance.colSuccessRate" },
      { key: "errorRate", labelKey: "callChain.instance.colErrorRate" },
      { key: "stuckCount", labelKey: "callChain.instance.colStuckCount" },
      { key: "webhookErrorCount", labelKey: "callChain.instance.colWebhookErrorCount" },
    ],
  },
  {
    key: "performance",
    labelKey: "callChain.instance.columnGroupPerformance",
    columns: [
      { key: "avgDurationMs", labelKey: "callChain.instance.colAvgDuration" },
      { key: "p50DurationMs", labelKey: "callChain.instance.colP50Duration" },
      { key: "p90DurationMs", labelKey: "callChain.instance.colP90Duration" },
      { key: "p99DurationMs", labelKey: "callChain.instance.colP99Duration" },
      { key: "maxDurationMs", labelKey: "callChain.instance.colMaxDuration" },
      { key: "minDurationMs", labelKey: "callChain.instance.colMinDuration" },
      { key: "durationChangeRate", labelKey: "callChain.instance.colDurationChangeRate" },
    ],
  },
  {
    key: "business",
    labelKey: "callChain.instance.columnGroupBusiness",
    columns: [
      { key: "channelCount", labelKey: "callChain.instance.colChannelCount" },
      { key: "modelCount", labelKey: "callChain.instance.colModelCount" },
      { key: "totalTokens", labelKey: "callChain.instance.colTotalTokens" },
      { key: "avgTokenPerCall", labelKey: "callChain.instance.colAvgTokenPerCall" },
    ],
  },
  {
    key: "resource",
    labelKey: "callChain.instance.columnGroupResource",
    columns: [
      { key: "hostArch", labelKey: "callChain.instance.colHostArch" },
      { key: "processPid", labelKey: "callChain.instance.colProcessPid" },
      { key: "runtimeVersion", labelKey: "callChain.instance.colRuntimeVersion" },
      { key: "processOwner", labelKey: "callChain.instance.colProcessOwner" },
    ],
  },
];

const DEFAULT_VISIBLE = new Set([
  "instanceId", "hostName", "hostIp", "status", "deployEnv",
  "totalCalls", "successRate", "errorCount",
  "avgDurationMs", "maxDurationMs", "totalTokens",
]);

function getDeployEnvColor(env) {
  const e = (env || "").toLowerCase();
  if (e === "production" || e === "生产") return "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-950/40 dark:text-blue-300";
  if (e === "staging" || e === "预发") return "bg-purple-50 text-purple-700 ring-purple-600/15 dark:bg-purple-950/40 dark:text-purple-300";
  if (e === "testing" || e === "测试") return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
  if (e === "development" || e === "开发") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
}

function getDeployEnvLabel(env) {
  const e = (env || "").toLowerCase();
  if (e === "production") return intl.get("callChain.instance.envProduction");
  if (e === "staging") return intl.get("callChain.instance.envStaging");
  if (e === "testing") return intl.get("callChain.instance.envTesting");
  if (e === "development") return intl.get("callChain.instance.envDevelopment");
  return env || EMPTY_CELL;
}

function InstanceTab({ data, loading, timeRanges, selectedTimeRange, timeMode, handleQuickTimeSelect, granularityLabel, showTimePicker, setShowTimePicker, customStartTime, setCustomStartTime, customEndTime, setCustomEndTime, handleApplyCustomTime, handleManualRefresh, lastUpdated, onViewDetail }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [envFilter, setEnvFilter] = useState("all");
  const [sort, setSort] = useState({ key: "totalCalls", dir: "desc" });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [showColSettings, setShowColSettings] = useState(false);

  const summary = data?.summary || {};
  const instances = data?.instances || [];

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const envOptions = useMemo(() => {
    const set = new Set();
    for (const inst of instances) {
      if (inst.deployEnv) set.add(inst.deployEnv);
    }
    return [...set].sort();
  }, [instances]);

  const filteredInstances = useMemo(() => {
    if (!instances || instances.length === 0) return [];
    return instances.filter((inst) => {
      if (statusFilter !== "all" && inst.status !== statusFilter) return false;
      if (envFilter !== "all" && inst.deployEnv !== envFilter) return false;
      if (!normalizedQuery) return true;
      const id = String(inst.instanceId || "").toLowerCase();
      const hn = String(inst.hostName || "").toLowerCase();
      const ip = String(inst.hostIp || "").toLowerCase();
      return id.includes(normalizedQuery) || hn.includes(normalizedQuery) || ip.includes(normalizedQuery);
    });
  }, [instances, statusFilter, envFilter, normalizedQuery]);

  const sortedInstances = useMemo(() => {
    const list = [...filteredInstances];
    const sk = sort.key;
    const sd = sort.dir;
    list.sort((a, b) => {
      const va = sortValueForInstance(a, sk);
      const vb = sortValueForInstance(b, sk);
      const asc = sd === "asc" ? 1 : -1;
      if (typeof va === "number" && typeof vb === "number") return (va < vb ? -1 : va > vb ? 1 : 0) * asc;
      return String(va).localeCompare(String(vb)) * asc;
    });
    return list;
  }, [filteredInstances, sort]);

  const matchedCount = sortedInstances.length;
  const totalPages = Math.max(1, Math.ceil(matchedCount / pageSize));
  const pageIndexClamped = Math.min(pageIndex, Math.max(0, totalPages - 1));
  const pageSafe = pageIndexClamped + 1;

  useEffect(() => { setPageIndex(0); }, [normalizedQuery, statusFilter, envFilter, sort.key, sort.dir]);
  useEffect(() => { setPageIndex((p) => Math.min(p, Math.max(0, totalPages - 1))); }, [totalPages]);

  const pageSlice = useMemo(() => {
    const start = pageIndexClamped * pageSize;
    return sortedInstances.slice(start, start + pageSize);
  }, [sortedInstances, pageIndexClamped, pageSize]);

  const toggleSort = useCallback((key) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }, []);

  const toggleCol = useCallback((key) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupCols) => {
    setVisibleCols((prev) => {
      const allVisible = groupCols.every((c) => prev.has(c.key));
      const next = new Set(prev);
      for (const c of groupCols) {
        if (allVisible) next.delete(c.key); else next.add(c.key);
      }
      return next;
    });
  }, []);

  const activeColumns = useMemo(() => {
    const cols = [];
    for (const group of COLUMN_GROUPS) {
      for (const c of group.columns) {
        if (c.fixed || visibleCols.has(c.key)) cols.push(c);
      }
    }
    return cols;
  }, [visibleCols]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{intl.get("callChain.loading")}</span>
        </div>
      </div>
    );
  }

  const total = instances.length;
  const offlineRatio = total > 0 ? ((summary.offlineCount || 0) / total * 100) : 0;
  const avgSuccessRate = summary.avgSuccessRate || 100;
  const avgDur = summary.avgDurationMs || 0;
  const totalCallsChangeRate = summary.totalCallsChangeRate || 0;

  const cardCls = "rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]";

  return (
    <div className="space-y-4">
      <div className="app-card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("callChain.headerObserveTime")}</span>
          <div className="flex gap-1.5">
            {timeRanges.slice(0, 6).map((range) => (
              <button key={range.value} type="button" onClick={() => handleQuickTimeSelect(range.value)}
                className={["rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  timeMode === "quick" && selectedTimeRange === range.value ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                ].join(" ")}>{range.label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.granularityWithValue", { label: granularityLabel })}</span>
          <div className="relative">
            <button type="button" onClick={() => setShowTimePicker(!showTimePicker)}
              className={["inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                timeMode === "custom" ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
              ].join(" ")}>
              <Icon name="calendar" className="h-3.5 w-3.5" />{timeMode === "custom" ? intl.get("callChain.customTime") : intl.get("callChain.preciseTime")}
            </button>
            {showTimePicker && (
              <div className="absolute left-0 top-full mt-2 z-50 w-80 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
                <div className="space-y-3">
                  <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{intl.get("timeFilter.startTime")}</label><input type="datetime-local" value={customStartTime} onChange={(e) => setCustomStartTime(e.target.value)} className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
                  <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{intl.get("timeFilter.endTime")}</label><input type="datetime-local" value={customEndTime} onChange={(e) => setCustomEndTime(e.target.value)} className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setShowTimePicker(false)} className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700">{intl.get("callChain.cancel")}</button>
                    <button type="button" onClick={handleApplyCustomTime} disabled={!customStartTime || !customEndTime} className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">{intl.get("callChain.apply")}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
        <button type="button" onClick={handleManualRefresh} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
          <Icon name="refresh" className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />{intl.get("callChain.manualRefresh")}
        </button>
        {lastUpdated && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{intl.get("callChain.lastUpdated")}: {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cardCls}>
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.totalInstances")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{summary.totalInstances || 0}</span>
          </div>
          <p className={["mt-1 text-xs", offlineRatio > 30 ? "text-red-600 dark:text-red-400" : offlineRatio > 10 ? "text-orange-500 dark:text-orange-400" : "text-gray-400 dark:text-gray-500"].join(" ")}>
            {intl.get("callChain.instance.running")}: {summary.onlineCount || 0} / {intl.get("callChain.instance.abnormal")}: {summary.warningCount || 0} / {intl.get("callChain.instance.offline")}: {summary.offlineCount || 0}
          </p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.clusterTotalCalls")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{(summary.totalCalls || 0).toLocaleString()}</span>
          </div>
          <p className={["mt-1 text-xs", Math.abs(totalCallsChangeRate) > 50 ? "text-red-600 dark:text-red-400" : Math.abs(totalCallsChangeRate) > 30 ? "text-orange-500 dark:text-orange-400" : "text-gray-400 dark:text-gray-500"].join(" ")}>
            {totalCallsChangeRate !== 0 ? `${totalCallsChangeRate > 0 ? "↑" : "↓"} ${Math.abs(totalCallsChangeRate).toFixed(1)}% ${intl.get("callChain.instance.changeRate")}` : intl.get("callChain.instance.changeRate") + ": —"}
          </p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.clusterAvgSuccessRate")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={["text-2xl font-semibold", avgSuccessRate < 90 ? "text-red-600 dark:text-red-400" : avgSuccessRate < 95 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{avgSuccessRate.toFixed(2)}%</span>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{intl.get("callChain.instance.lowSuccessCount")}: {summary.lowSuccessCount || 0}</p>
        </div>
        <div className={cardCls}>
          <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.clusterAvgDuration")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{formatDuration(avgDur)}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{intl.get("callChain.instance.highDurationCount")}: {summary.highDurationCount || 0}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
        <div className="space-y-0">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between border-b border-gray-100 dark:border-gray-800">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="sr-only" htmlFor="call-chain-instance-search">{intl.get("callChain.instance.searchPlaceholder")}</label>
              <input id="call-chain-instance-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={intl.get("callChain.instance.searchPlaceholder")}
                className="w-full min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:max-w-xs" />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="call-chain-status-filter" className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.filterStatus")}</label>
                <select id="call-chain-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                  <option value="all">{intl.get("callChain.instance.filterAllStatus")}</option>
                  <option value="normal">{intl.get("callChain.instance.statusNormal")}</option>
                  <option value="warning">{intl.get("callChain.instance.statusWarning")}</option>
                  <option value="error">{intl.get("callChain.instance.statusError")}</option>
                </select>
                {envOptions.length > 0 && (
                  <>
                    <label htmlFor="call-chain-env-filter" className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.filterDeployEnv")}</label>
                    <select id="call-chain-env-filter" value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                      <option value="all">{intl.get("callChain.instance.filterAllEnv")}</option>
                      {envOptions.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </>
                )}
                {matchedCount !== total && <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.filterMatch", { matched: matchedCount, total })}</span>}
              </div>
            </div>
            <div className="relative">
              <button type="button" onClick={() => setShowColSettings(!showColSettings)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-800 transition-colors">
                <Icon name="settings" className="h-3.5 w-3.5" />{intl.get("callChain.instance.columnSettings")}
              </button>
              {showColSettings && (
                <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-[70vh] overflow-y-auto p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
                  {COLUMN_GROUPS.map((group) => {
                    const allVisible = group.columns.every((c) => visibleCols.has(c.key));
                    return (
                      <div key={group.key} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <button type="button" onClick={() => toggleGroup(group.columns)}
                            className={["flex items-center gap-1.5 text-xs font-semibold", allVisible ? "text-primary" : "text-gray-500 dark:text-gray-400"].join(" ")}>
                            <span className={["inline-block h-3.5 w-3.5 rounded border transition-colors", allVisible ? "bg-primary border-primary" : "border-gray-300 dark:border-gray-600"].join(" ")} />
                            {intl.get(group.labelKey)}
                          </button>
                        </div>
                        <div className="ml-5 grid grid-cols-2 gap-x-3 gap-y-1">
                          {group.columns.map((col) => (
                            <button key={col.key} type="button" onClick={() => col.fixed ? null : toggleCol(col.key)}
                              className={["flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/80",
                                col.fixed ? "cursor-default" : "cursor-pointer",
                                visibleCols.has(col.key) ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"
                              ].join(" ")}>
                              <span className={["inline-block h-3 w-3 rounded border shrink-0 transition-colors",
                                visibleCols.has(col.key) ? "bg-primary border-primary" : "border-gray-300 dark:border-gray-600"
                              ].join(" ")} />
                              <span className="truncate">{intl.get(col.labelKey)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <Icon name="server" className="mb-3 h-12 w-12 opacity-50" />
              <p>{intl.get("callChain.noTraceData")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                    {activeColumns.map((col) => (
                      <SortTh key={col.key} colKey={col.key} labelKey={col.labelKey} sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    ))}
                    <th scope="col" className="px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 sticky right-0 bg-gray-50/90 dark:bg-gray-800/80">{intl.get("callChain.instance.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
                  {pageSlice.length === 0 ? (
                    <tr><td colSpan={activeColumns.length + 1} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{intl.get("callChain.instance.noMatching")}</td></tr>
                  ) : pageSlice.map((inst) => (
                    <tr key={inst.instanceId} className="cursor-pointer transition-colors duration-200 hover:bg-primary-soft/40 dark:hover:bg-primary/10" onClick={() => onViewDetail && onViewDetail(inst)}>
                      {activeColumns.map((col) => (
                        <td key={col.key} className="whitespace-nowrap px-4 py-3 text-xs">
                          <InstanceCell colKey={col.key} inst={inst} />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-3 sticky right-0 bg-white dark:bg-gray-900/50">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); onViewDetail && onViewDetail(inst); }} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors ring-1 ring-inset ring-primary/20">{intl.get("callChain.instance.viewDetail")}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matchedCount > 0 && (
            <TablePagination page={pageSafe} pageSize={pageSize} total={matchedCount} onPageChange={(p) => setPageIndex(p - 1)}
              className="border-t border-gray-100 px-4 py-3 dark:border-gray-800"
              trailingControls={
                <label className="ml-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                  <span className="shrink-0">{intl.get("common.perPage")}</span>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="app-input min-w-[4.5rem] px-2 py-1.5">
                    {[10, 20, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
                  </select>
                  <span className="shrink-0">{intl.get("common.items")}</span>
                </label>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InstanceCell({ colKey, inst }) {
  switch (colKey) {
    case "instanceId":
      return <span className="font-mono font-medium text-primary cursor-pointer" title={inst.instanceId}>{inst.instanceId}</span>;
    case "hostName":
      return <span className="text-gray-700 dark:text-gray-300" title={inst.hostName}>{cellText(inst.hostName)}</span>;
    case "hostIp":
      return <span className="font-mono text-gray-700 dark:text-gray-300" title={inst.hostIp}>{cellText(inst.hostIp)}</span>;
    case "status":
      return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getInstanceStatusColor(inst.status)}`}>
          {getInstanceStatusLabel(inst.status)}
        </span>
      );
    case "deployEnv":
      return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getDeployEnvColor(inst.deployEnv)}`}>
          {getDeployEnvLabel(inst.deployEnv)}
        </span>
      );
    case "startTime":
      return <span className="text-gray-600 dark:text-gray-400">{cellText(inst.startTime)}</span>;
    case "totalCalls":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.totalCalls.toLocaleString()}</span>;
    case "totalTraces":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.totalTraces.toLocaleString()}</span>;
    case "dailyAvgCalls":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.dailyAvgCalls.toLocaleString()}</span>;
    case "peakCalls":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.peakCalls.toLocaleString()}</span>;
    case "callPercentage":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.callPercentage}%</span>;
    case "successCount":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.successCount.toLocaleString()}</span>;
    case "errorCount":
      return <span className={["font-mono", inst.errorCount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-700 dark:text-gray-300"].join(" ")}>{inst.errorCount.toLocaleString()}</span>;
    case "successRate":
      return <span className={["font-mono font-medium", inst.successRate < 90 ? "text-red-600 dark:text-red-400" : inst.successRate < 95 ? "text-orange-500 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>{inst.successRate}%</span>;
    case "errorRate":
      return <span className={["font-mono font-medium", inst.errorRate > 5 ? "text-red-600 dark:text-red-400" : inst.errorRate > 1 ? "text-orange-500 dark:text-orange-400" : "text-gray-700 dark:text-gray-300"].join(" ")}>{inst.errorRate}%</span>;
    case "stuckCount":
      return <span className={["font-mono", inst.stuckCount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-700 dark:text-gray-300"].join(" ")}>{inst.stuckCount}</span>;
    case "webhookErrorCount":
      return <span className={["font-mono", inst.webhookErrorCount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-700 dark:text-gray-300"].join(" ")}>{inst.webhookErrorCount}</span>;
    case "avgDurationMs":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{formatDuration(inst.avgDurationMs)}</span>;
    case "p50DurationMs":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{formatDuration(inst.p50DurationMs)}</span>;
    case "p90DurationMs":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{formatDuration(inst.p90DurationMs)}</span>;
    case "p99DurationMs":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{formatDuration(inst.p99DurationMs)}</span>;
    case "maxDurationMs":
      return <span className={["font-mono", inst.maxDurationMs > 10000 ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-700 dark:text-gray-300"].join(" ")}>{formatDuration(inst.maxDurationMs)}</span>;
    case "minDurationMs":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{formatDuration(inst.minDurationMs)}</span>;
    case "durationChangeRate":
      return <span className={["font-mono", Math.abs(inst.durationChangeRate) > 30 ? "text-orange-500 dark:text-orange-400 font-medium" : "text-gray-700 dark:text-gray-300"].join(" ")}>{inst.durationChangeRate > 0 ? "+" : ""}{inst.durationChangeRate}%</span>;
    case "channelCount":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.channelCount}</span>;
    case "modelCount":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.modelCount}</span>;
    case "totalTokens":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{formatTokenCount(inst.totalTokens)}</span>;
    case "avgTokenPerCall":
      return <span className="font-mono text-gray-700 dark:text-gray-300">{inst.avgTokenPerCall.toLocaleString()}</span>;
    case "hostArch":
      return <span className="text-gray-600 dark:text-gray-400">{cellText(inst.hostArch)}</span>;
    case "processPid":
      return <span className="font-mono text-gray-600 dark:text-gray-400">{cellText(inst.processPid)}</span>;
    case "runtimeVersion":
      return <span className="text-gray-600 dark:text-gray-400">{cellText(inst.runtimeVersion)}</span>;
    case "processOwner":
      return <span className="text-gray-600 dark:text-gray-400" title={inst.processOwner}>{cellText(inst.processOwner)}</span>;
    default:
      return <span className="text-gray-400">{EMPTY_CELL}</span>;
  }
}
