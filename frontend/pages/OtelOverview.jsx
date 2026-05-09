import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";

const PAGE_TAB_KEYS = [
  { key: "overview", labelKey: "otelOverview.pageTab.overview" },
  { key: "session", labelKey: "otelOverview.pageTab.session" },
  { key: "token", labelKey: "otelOverview.pageTab.token" },
  { key: "cost", labelKey: "otelOverview.pageTab.cost" },
  { key: "message", labelKey: "otelOverview.pageTab.message" },
  { key: "queue", labelKey: "otelOverview.pageTab.queue" },
];

const INSTANCE_DETAIL_TAB_KEYS = [
  { key: "overview", labelKey: "otelOverview.detailTab.overview" },
  { key: "session", labelKey: "otelOverview.detailTab.session" },
  { key: "token", labelKey: "otelOverview.detailTab.token" },
  { key: "cost", labelKey: "otelOverview.detailTab.cost" },
  { key: "message", labelKey: "otelOverview.detailTab.message" },
  { key: "queue", labelKey: "otelOverview.detailTab.queue" },
];

const TIME_RANGE_DEFS = [
  { value: "1h", hours: 1, granularityMinutes: 1, labelKey: "otelOverview.timeRange.1h", granularityKey: "otelOverview.granularity.1m" },
  { value: "6h", hours: 6, granularityMinutes: 5, labelKey: "otelOverview.timeRange.6h", granularityKey: "otelOverview.granularity.5m" },
  { value: "12h", hours: 12, granularityMinutes: 10, labelKey: "otelOverview.timeRange.12h", granularityKey: "otelOverview.granularity.10m" },
  { value: "24h", hours: 24, granularityMinutes: 30, labelKey: "otelOverview.timeRange.24h", granularityKey: "otelOverview.granularity.30m" },
  { value: "3d", hours: 72, granularityMinutes: 60, labelKey: "otelOverview.timeRange.3d", granularityKey: "otelOverview.granularity.1h" },
  { value: "7d", hours: 168, granularityMinutes: 180, labelKey: "otelOverview.timeRange.7d", granularityKey: "otelOverview.granularity.3h" },
];

const REFRESH_INTERVAL_DEFS = [
  { value: 0, labelKey: "otelOverview.refresh.off" },
  { value: 10, labelKey: "otelOverview.refresh.10s" },
  { value: 30, labelKey: "otelOverview.refresh.30s" },
  { value: 60, labelKey: "otelOverview.refresh.1m" },
  { value: 300, labelKey: "otelOverview.refresh.5m" },
];

function LineChart({ data, color, height = 120 }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  
  if (!data || data.length === 0) return null;
  
  const values = data.map((d) => d.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const width = 100;
  const padding = 5;
  
  const points = data.map((item, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((item.value - minValue) / range) * (height - 2 * padding);
    return { x, y, value: item.value, time: item.time };
  });
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(2)} ${height - padding} L ${padding} ${height - padding} Z`;
  
  const gradientId = `gradient-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 9)}`;
  
  const displayPoints = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 6)) === 0 || i === points.length - 1);

  const formatValue = (val) => {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val.toLocaleString();
  };
  
  return (
    <div className="relative">
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        className="w-full overflow-visible" 
        style={{ height: `${height}px` }} 
        preserveAspectRatio="none"
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradientId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredPoint === i ? 4 : 0}
            fill={color}
            stroke="white"
            strokeWidth={1}
            className="transition-all duration-150"
            style={{ opacity: hoveredPoint === i ? 1 : 0 }}
          />
        ))}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={(e) => {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const svgWidth = rect.width;
            const mouseX = e.clientX - rect.left;
            const relativeX = (mouseX / svgWidth) * width;
            const index = Math.round((relativeX - padding) / (width - 2 * padding) * (data.length - 1));
            const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
            setHoveredPoint(clampedIndex);
          }}
        />
      </svg>
      {hoveredPoint !== null && points[hoveredPoint] && (
        <div 
          className="absolute pointer-events-none bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 text-xs px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap"
          style={{
            left: `${(points[hoveredPoint].x / width) * 100}%`,
            top: `${(points[hoveredPoint].y / height) * 100 - 15}%`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="font-medium">{points[hoveredPoint].time}</div>
          <div className="font-bold">{formatValue(points[hoveredPoint].value)}</div>
        </div>
      )}
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
        {displayPoints.map((p, i) => (
          <span key={i}>{p.time}</span>
        ))}
      </div>
    </div>
  );
}

function PieChart({ data, size = 120 }) {
  if (!data || data.length === 0) return null;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  
  let currentAngle = -90;
  const segments = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return {
      ...item,
      percentage,
      color: colors[index % colors.length],
      startAngle,
      angle,
    };
  });

  const createArcPath = (startAngle, angle, radius) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = ((startAngle + angle) * Math.PI) / 180;
    const x1 = 50 + radius * Math.cos(startRad);
    const y1 = 50 + radius * Math.sin(startRad);
    const x2 = 50 + radius * Math.cos(endRad);
    const y2 = 50 + radius * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    return `M 50 50 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        {segments.map((seg, i) => (
          <path
            key={i}
            d={createArcPath(seg.startAngle, seg.angle, 40)}
            fill={seg.color}
            stroke="white"
            strokeWidth="1"
            className="transition-opacity hover:opacity-80"
          />
        ))}
      </svg>
      <div className="flex-1 space-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="text-gray-600 dark:text-gray-400 truncate max-w-[80px]">{seg.name}</span>
            </div>
            <span className="font-medium text-gray-800 dark:text-gray-200">{seg.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({ data, valueFormatter = (v) => v.toLocaleString() }) {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d.value));
  
  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {index + 1}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all" 
                style={{ width: `${(item.value / maxValue) * 100}%` }} 
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getOtelInstanceStatusBadgeClass(status) {
  if (status === "在线") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20";
  if (status === "离线") return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-500/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/25";
}

function formatOtelInstanceStatus(status) {
  if (status === "在线") return intl.get("otelOverview.statusOnline");
  if (status === "离线") return intl.get("otelOverview.statusOffline");
  return status || intl.get("otelOverview.na");
}

/** @param {unknown} raw */
function clampUtilPct(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

/** 与驾驶舱「健康度」条一致：左侧标签、右侧百分比、底部分段进度条（CPU / 内存 / 磁盘复用） */
function HostResourceUtilRow({ label, valuePct, barClassName }) {
  const pct = clampUtilPct(valuePct);
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] leading-tight">
        <span className="truncate text-gray-500 dark:text-gray-400">{label}</span>
        {pct == null ? (
          <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">—</span>
        ) : (
          <span className="shrink-0 font-medium tabular-nums text-gray-800 dark:text-gray-200">{pct.toFixed(1)}%</span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {pct != null ? (
          <div className={["h-full rounded-full transition-[width] duration-300", barClassName].join(" ")} style={{ width: `${pct}%` }} />
        ) : null}
      </div>
    </div>
  );
}

export function OtelInstanceListPanel({ data }) {
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");

  const overview = data?.overview || {};
  const instances = data?.instances || [];
  const trends = data?.trends || {};
  const distributions = data?.distributions || {};
  const histogramStats = data?.histogramStats || {};

  const closeDetailDrawer = useCallback(() => {
    setSelectedInstance(null);
    setDetailTab("overview");
  }, []);

  useEffect(() => {
    if (!selectedInstance) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeDetailDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedInstance, closeDetailDrawer]);

  const renderDetailDrawer = () => {
    if (!selectedInstance) return null;

    return (
      <div className="fixed inset-0 z-50 flex">
        <button
          type="button"
          className="min-h-0 min-w-0 flex-1 cursor-default bg-gray-900/40 backdrop-blur-sm transition-opacity duration-200 dark:bg-black/60"
          aria-label={intl.get("otelOverview.modalClose")}
          onClick={closeDetailDrawer}
        />
        <aside
          className="relative z-10 flex h-full w-full max-w-3xl flex-col border-l border-gray-200/80 bg-white shadow-2xl dark:border-gray-700/60 dark:bg-gray-900/95"
          role="dialog"
          aria-modal="true"
          aria-labelledby="otel-instance-drawer-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700/60">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0">
                <h2 id="otel-instance-drawer-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {intl.get("otelOverview.modalInstanceDetail")}
                </h2>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{selectedInstance.name}</p>
              </div>
              <span
                className={[
                  "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                  getOtelInstanceStatusBadgeClass(selectedInstance.status),
                ].join(" ")}
              >
                {formatOtelInstanceStatus(selectedInstance.status)}
              </span>
            </div>
            <button
              type="button"
              onClick={closeDetailDrawer}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.sectionBasicInfo")}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { labelKey: "otelOverview.labelInstanceId", value: selectedInstance.id },
                  { labelKey: "otelOverview.labelHostName", value: selectedInstance.hostName },
                  { labelKey: "otelOverview.labelRuntime", value: selectedInstance.runtime },
                  { labelKey: "otelOverview.labelLastActive", value: selectedInstance.lastActive },
                ].map((item) => (
                  <div key={item.labelKey} className="flex flex-col">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.value || intl.get("otelOverview.na")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700/60">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.sectionResourceUtil")}</h3>
              <div className="max-w-xl space-y-2.5">
                <HostResourceUtilRow
                  label={intl.get("otelOverview.resourceCpuUtil")}
                  valuePct={selectedInstance.cpuUtilizationPct}
                  barClassName="bg-blue-500 dark:bg-blue-400"
                />
                <HostResourceUtilRow
                  label={intl.get("otelOverview.resourceMemoryUtil")}
                  valuePct={selectedInstance.memoryUtilizationPct}
                  barClassName="bg-violet-500 dark:bg-violet-400"
                />
                <HostResourceUtilRow
                  label={intl.get("otelOverview.resourceDiskUtil")}
                  valuePct={selectedInstance.diskUtilizationPct}
                  barClassName="bg-amber-500 dark:bg-amber-400"
                />
              </div>
            </div>

            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700/60">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.sectionOverviewMetrics")}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { labelKey: "otelOverview.metricActiveSessions", value: (selectedInstance.activeSessions || 0).toLocaleString(), color: "text-blue-600 dark:text-blue-400" },
                  { labelKey: "otelOverview.colStuckSessions", value: selectedInstance.stuckSessions || 0, color: selectedInstance.stuckSessions > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-400" },
                  { labelKey: "otelOverview.metricTokenConsumption", value: selectedInstance.tokenConsumption || "0", color: "text-violet-600 dark:text-violet-400" },
                  { labelKey: "otelOverview.metricTotalCost", value: selectedInstance.totalCost || "$0", color: "text-rose-600 dark:text-rose-400" },
                  { labelKey: "otelOverview.colQueueDepth", value: selectedInstance.queueDepth || 0, color: "text-amber-600 dark:text-amber-400" },
                ].map((item) => (
                  <div key={item.labelKey} className="p-3 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/60">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                    <div className="mt-1">
                      <span className={["text-lg font-semibold", item.color].join(" ")}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-gray-100 dark:border-gray-700/60">
              <nav className="flex px-6 gap-1">
                {INSTANCE_DETAIL_TAB_KEYS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDetailTab(tab.key)}
                    className={[
                      "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                      detailTab === tab.key
                        ? "border-primary text-primary"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    ].join(" ")}
                  >
                    {intl.get(tab.labelKey)}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {detailTab === "overview" && (
                <div className="space-y-6">
                  <div className="app-card p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.detailCoreTrend")}</h4>
                    <LineChart data={trends.session || []} color="#8b5cf6" height={120} />
                  </div>
                </div>
              )}
              {detailTab === "session" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { labelKey: "otelOverview.sessionTotal", value: (selectedInstance.sessionTotal || 0).toLocaleString() },
                      { labelKey: "otelOverview.metricActiveSessions", value: (selectedInstance.activeSessions || 0).toLocaleString() },
                      { labelKey: "otelOverview.colStuckSessions", value: selectedInstance.stuckSessions || 0 },
                      { labelKey: "otelOverview.sessionSuccessRate", value: selectedInstance.sessionTotal > 0 ? ((selectedInstance.sessionTotal - selectedInstance.stuckSessions) / selectedInstance.sessionTotal * 100).toFixed(1) + "%" : "100%" },
                    ].map((item) => (
                      <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                        <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="app-card p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.detailSessionTrend")}</h4>
                    <LineChart data={trends.session || []} color="#3b82f6" height={100} />
                  </div>
                </div>
              )}
              {detailTab === "token" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { labelKey: "otelOverview.tokenTotalConsumption", value: selectedInstance.tokenConsumption || "0" },
                      { labelKey: "otelOverview.inputToken", value: selectedInstance.inputTokens || "0" },
                      { labelKey: "otelOverview.outputToken", value: selectedInstance.outputTokens || "0" },
                      { labelKey: "otelOverview.colQueueDepth", value: selectedInstance.queueDepth || 0 },
                    ].map((item) => (
                      <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                        <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="app-card p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.detailTokenTrend")}</h4>
                    <LineChart data={trends.token || []} color="#8b5cf6" height={100} />
                  </div>
                </div>
              )}
              {detailTab === "cost" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { labelKey: "otelOverview.labelCostToday", value: selectedInstance.totalCost || "$0" },
                      { labelKey: "otelOverview.labelCostPerHour", value: overview.costStats?.hourlyRate || "$0" },
                      { labelKey: "otelOverview.labelCostPerToken", value: overview.costStats?.perToken || "$0" },
                      { labelKey: "otelOverview.labelModel", value: distributions.costModel?.[0]?.name || intl.get("otelOverview.na") },
                    ].map((item) => (
                      <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                        <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="app-card p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.detailCostTrend")}</h4>
                    <LineChart data={trends.cost || []} color="#f43f5e" height={100} />
                  </div>
                </div>
              )}
              {detailTab === "message" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { labelKey: "otelOverview.msgProcessed", value: (selectedInstance.messageProcessed || 0).toLocaleString() },
                      { labelKey: "otelOverview.msgQueued", value: (selectedInstance.messageQueued || 0).toLocaleString() },
                      { labelKey: "otelOverview.metricAvgDuration", value: `${histogramStats.messageDuration?.avg || 0}ms` },
                      { labelKey: "otelOverview.metricMaxDuration", value: `${histogramStats.messageDuration?.max || 0}ms` },
                    ].map((item) => (
                      <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                        <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="app-card p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.detailMessageTrend")}</h4>
                    <LineChart data={trends.messageProcessed || []} color="#10b981" height={100} />
                  </div>
                </div>
              )}
              {detailTab === "queue" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { labelKey: "otelOverview.queueDepthCurrent", value: selectedInstance.queueDepth || 0 },
                      { labelKey: "otelOverview.enqueueTotal", value: (selectedInstance.enqueueTotal || 0).toLocaleString() },
                      { labelKey: "otelOverview.dequeueTotal", value: (selectedInstance.dequeueTotal || 0).toLocaleString() },
                      { labelKey: "otelOverview.avgWait", value: `${histogramStats.queueWait?.avg || 0}ms` },
                    ].map((item) => (
                      <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                        <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="app-card p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("otelOverview.detailQueueTrend")}</h4>
                    <LineChart data={trends.queueDepth || []} color="#f59e0b" height={100} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-700/60">
            <button
              type="button"
              onClick={closeDetailDrawer}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {intl.get("otelOverview.modalClose")}
            </button>
          </div>
        </aside>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="app-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("otelOverview.instanceListTitle")}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.instanceListHint")}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.instanceTotalCount", { count: instances.length })}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="text-emerald-600 dark:text-emerald-400">{intl.get("otelOverview.instanceOnlineCount", { count: instances.filter((i) => i.status === "在线").length })}</span>
          </div>
        </div>

        {instances.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Icon name="server" className="h-12 w-12 mb-3 opacity-50" />
            <p>{data ? intl.get("otelOverview.noInstanceData") : intl.get("openclawInstance.waitTelemetry")}</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {instances.map((instance) => (
              <button
                key={instance.id}
                type="button"
                onClick={() => setSelectedInstance(instance)}
                className="group flex w-full flex-col rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-primary/35 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/80 dark:hover:border-primary/45"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{instance.name}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{instance.id}</p>
                    {instance.hostName ? (
                      <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300" title={String(instance.hostName)}>
                        <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.labelHostName")}: </span>
                        {String(instance.hostName)}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={[
                      "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                      getOtelInstanceStatusBadgeClass(instance.status),
                    ].join(" ")}
                  >
                    {formatOtelInstanceStatus(instance.status)}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  <HostResourceUtilRow
                    label={intl.get("otelOverview.resourceCpuUtil")}
                    valuePct={instance.cpuUtilizationPct}
                    barClassName="bg-blue-500 dark:bg-blue-400"
                  />
                  <HostResourceUtilRow
                    label={intl.get("otelOverview.resourceMemoryUtil")}
                    valuePct={instance.memoryUtilizationPct}
                    barClassName="bg-violet-500 dark:bg-violet-400"
                  />
                  <HostResourceUtilRow
                    label={intl.get("otelOverview.resourceDiskUtil")}
                    valuePct={instance.diskUtilizationPct}
                    barClassName="bg-amber-500 dark:bg-amber-400"
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-xs">
                  <div className="min-w-0">
                    <dt className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.colActiveSessions")}</dt>
                    <dd className="mt-0.5 truncate font-medium tabular-nums text-gray-800 dark:text-gray-200">
                      {(instance.activeSessions || 0).toLocaleString()}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.colQueueDepth")}</dt>
                    <dd className="mt-0.5 truncate font-medium tabular-nums text-gray-800 dark:text-gray-200">{instance.queueDepth ?? 0}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.colTokenConsumption")}</dt>
                    <dd className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{instance.tokenConsumption || "0"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.colTotalCost")}</dt>
                    <dd className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{instance.totalCost || "$0"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] text-primary opacity-90 group-hover:opacity-100 dark:text-primary">
                  {intl.get("otelOverview.viewDetail")} →
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      {renderDetailDrawer()}
    </div>
  );
}

export default function OtelOverview({ onTelemetryData }) {
  const [pageTab, setPageTab] = useState("overview");
  const [selectedTimeRange, setSelectedTimeRange] = useState("1h");
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [countdown, setCountdown] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [timeMode, setTimeMode] = useState("quick");
  const [customStartTime, setCustomStartTime] = useState("");
  const [customEndTime, setCustomEndTime] = useState("");
  const [showTimePicker, setShowTimePicker] = useState(false);

  const { locale } = useLocale();
  const timeRanges = useMemo(
    () =>
      TIME_RANGE_DEFS.map((d) => ({
        ...d,
        label: intl.get(d.labelKey),
        granularityLabel: intl.get(d.granularityKey),
      })),
    [locale]
  );
  const refreshIntervals = useMemo(
    () => REFRESH_INTERVAL_DEFS.map((d) => ({ ...d, label: intl.get(d.labelKey) })),
    [locale]
  );

  const refreshIntervalRef = useRef(refreshInterval);
  refreshIntervalRef.current = refreshInterval;

  const timeRangeConfig = timeRanges.find((r) => r.value === selectedTimeRange);
  const selectedHours = timeRangeConfig?.hours || 1;
  const granularityMinutes = timeRangeConfig?.granularityMinutes || 1;
  const granularityLabel = timeRangeConfig?.granularityLabel || intl.get("otelOverview.granularity.1m");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/otel-overview?";
      if (timeMode === "custom" && customStartTime && customEndTime) {
        url += `startTime=${encodeURIComponent(customStartTime)}&endTime=${encodeURIComponent(customEndTime)}&granularityMinutes=${granularityMinutes}`;
      } else {
        url += `hours=${selectedHours}&granularityMinutes=${granularityMinutes}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedHours, granularityMinutes, timeMode, customStartTime, customEndTime]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshInterval === 0) {
      setCountdown(0);
      return;
    }
    setCountdown(refreshInterval);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return refreshIntervalRef.current;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, fetchData]);

  useEffect(() => {
    if (typeof onTelemetryData === "function" && data) {
      onTelemetryData(data);
    }
  }, [data, onTelemetryData]);

  const handleManualRefresh = () => {
    fetchData();
    if (refreshInterval > 0) setCountdown(refreshInterval);
  };

  const handleApplyCustomTime = () => {
    if (customStartTime && customEndTime) {
      setTimeMode("custom");
      setShowTimePicker(false);
      fetchData();
    }
  };

  const handleQuickTimeSelect = (value) => {
    setSelectedTimeRange(value);
    setTimeMode("quick");
    setCustomStartTime("");
    setCustomEndTime("");
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
          <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.loading")}</span>
        </div>
      </div>
    );
  }

  const overview = data?.overview || {};
  const instances = data?.instances || [];
  const trends = data?.trends || {};
  const distributions = data?.distributions || {};
  const histogramStats = data?.histogramStats || {};

  const topInstances = instances.slice(0, 5).map(inst => ({
    name: inst.name,
    value: inst.tokenConsumption?.replace(/[KM]/g, '') * (inst.tokenConsumption?.includes('M') ? 1000000 : inst.tokenConsumption?.includes('K') ? 1000 : 1) || 0,
  }));

  const sessionDistribution = [
    { name: intl.get("otelOverview.sessionActive"), value: overview.activeSessions || 0 },
    { name: intl.get("otelOverview.sessionStuck"), value: overview.stuckSessions || 0 },
    { name: intl.get("otelOverview.sessionOther"), value: Math.max(0, (overview.totalSessions || 0) - (overview.activeSessions || 0) - (overview.stuckSessions || 0)) },
  ];

  const tokenDistribution = [
    { name: intl.get("otelOverview.tokenInput"), value: instances.reduce((a, i) => a + (parseFloat(i.inputTokens) || 0), 0) },
    { name: intl.get("otelOverview.tokenOutput"), value: instances.reduce((a, i) => a + (parseFloat(i.outputTokens) || 0), 0) },
  ];

  const renderOverviewTab = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="server" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricTotalInstances")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{overview.totalInstances || 0}</span>
                <span className="text-xs text-gray-400">{intl.get("otelOverview.metricInstancesUnit")}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricOnlineCount", { count: overview.onlineInstances || 0 })}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-gray-400"></span>
              <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricOfflineCount", { count: overview.offlineInstances || 0 })}</span>
            </span>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Icon name="users" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricActiveSessions")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{overview.activeSessions?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricTotalSessionsLine", { count: overview.totalSessions?.toLocaleString() || 0 })}</span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricStuckCount", { count: overview.stuckSessions || 0 })}</span>
            </span>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Icon name="zap" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricTokenConsumption")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{overview.totalTokens?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
              <Icon name="dollar" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricTotalCost")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">${(overview.totalCost || 0).toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Icon name="activity" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricMessageProcessed")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{overview.messageProcessed?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Icon name="database" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricMessageQueued")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{overview.messageQueued?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
              <Icon name="clock" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricAvgDuration")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{histogramStats.messageDuration?.avg?.toFixed(1) || 0}</span>
                <span className="text-xs text-gray-400">ms</span>
              </div>
            </div>
          </div>
        </div>
        <div className="app-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500">
              <Icon name="timer" className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricAvgQueueWait")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{histogramStats.queueWait?.avg?.toFixed(1) || 0}</span>
                <span className="text-xs text-gray-400">ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartSessionTrend")}</h3>
          <LineChart data={trends.session || []} color="#3b82f6" height={120} />
        </div>
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTokenTrend")}</h3>
          <LineChart data={trends.token || []} color="#8b5cf6" height={120} />
        </div>
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartCostTrend")}</h3>
          <LineChart data={trends.cost || []} color="#f43f5e" height={120} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartSessionStateDist")}</h3>
          <PieChart data={sessionDistribution} size={100} />
        </div>
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTokenTypeShare")}</h3>
          <PieChart data={tokenDistribution} size={100} />
        </div>
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTopInstancesToken")}</h3>
          <TopList data={topInstances} valueFormatter={(v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? (v/1000).toFixed(1) + 'K' : v} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartMessageTrend")}</h3>
          <LineChart data={trends.messageProcessed || []} color="#10b981" height={120} />
        </div>
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartQueueDepthTrend")}</h3>
          <LineChart data={trends.queueDepth || []} color="#f59e0b" height={120} />
        </div>
      </div>
    </div>
  );

  const renderSessionTab = () => {
    const sessionAnalytics = data?.sessionAnalytics || {};
    
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.sessionTotal")}</p>
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{overview.totalSessions?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricActiveSessions")}</p>
            <span className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{overview.activeSessions?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.colStuckSessions")}</p>
            <span className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{overview.stuckSessions || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.sessionSuccessRate")}</p>
            <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {overview.totalSessions > 0 ? (((overview.totalSessions - overview.stuckSessions) / overview.totalSessions) * 100).toFixed(1) : 100}%
            </span>
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartSessionTrend")}</h3>
            <LineChart data={trends.session || []} color="#3b82f6" height={120} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartStateDist")}</h3>
            <PieChart data={sessionAnalytics.byState || sessionDistribution} size={100} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartChannelDist")}</h3>
            <PieChart data={sessionAnalytics.byChannel || []} size={100} />
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.stuckReasonAnalysis")}</h3>
            {sessionAnalytics.byReason && sessionAnalytics.byReason.length > 0 ? (
              <div className="space-y-3">
                {sessionAnalytics.byReason.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</span>
                      <span className="text-xs text-gray-500">({((item.value / (overview.stuckSessions || 1)) * 100).toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">{intl.get("otelOverview.noStuckData")}</div>
            )}
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTopInstancesSession")}</h3>
            <TopList data={sessionAnalytics.topInstances || []} />
          </div>
        </div>
      </div>
    );
  };

  const renderTokenTab = () => {
    const tokenAnalytics = data?.tokenAnalytics || {};
    
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.tokenTotalConsumption")}</p>
            <span className="text-2xl font-semibold text-violet-600 dark:text-violet-400">{overview.totalTokens?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.inputToken")}</p>
            <span className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{tokenAnalytics.byType?.find(t => t.name === 'input')?.value?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.outputToken")}</p>
            <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{tokenAnalytics.byType?.find(t => t.name === 'output')?.value?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.ioRatio")}</p>
            <span className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
              {tokenAnalytics.byType && tokenAnalytics.byType.length >= 2 
                ? (tokenAnalytics.byType[0].value / Math.max(1, tokenAnalytics.byType[1].value)).toFixed(2) 
                : '-'}
            </span>
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTokenTrend")}</h3>
            <LineChart data={trends.token || []} color="#8b5cf6" height={120} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTokenTypeShare")}</h3>
            <PieChart data={tokenAnalytics.byType || tokenDistribution} size={100} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartChannelDist")}</h3>
            <PieChart data={tokenAnalytics.byChannel || []} size={100} />
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.modelTokenDist")}</h3>
            <TopList data={tokenAnalytics.byModel || []} valueFormatter={(v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? (v/1000).toFixed(1) + 'K' : v} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.providerTokenDist")}</h3>
            <TopList data={tokenAnalytics.byProvider || []} valueFormatter={(v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? (v/1000).toFixed(1) + 'K' : v} />
          </div>
        </div>
        
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTopInstancesToken")}</h3>
          <TopList data={tokenAnalytics.topInstances || topInstances} valueFormatter={(v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? (v/1000).toFixed(1) + 'K' : v} />
        </div>
      </div>
    );
  };

  const renderCostTab = () => {
    const costAnalytics = data?.costAnalytics || {};
    
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricTotalCost")}</p>
            <span className="text-2xl font-semibold text-rose-600 dark:text-rose-400">${(overview.totalCost || 0).toFixed(4)}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.costAvgPerHour")}</p>
            <span className="text-2xl font-semibold text-amber-600 dark:text-amber-400">${((overview.totalCost || 0) / Math.max(1, selectedHours)).toFixed(4)}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.costTopModel")}</p>
            <span className="text-2xl font-semibold text-violet-600 dark:text-violet-400">{costAnalytics.byModel?.[0]?.name || '-'}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.costTopChannel")}</p>
            <span className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{costAnalytics.byChannel?.[0]?.name || '-'}</span>
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartCostTrend")}</h3>
            <LineChart data={trends.cost || []} color="#f43f5e" height={120} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartModelCostShare")}</h3>
            <PieChart data={costAnalytics.byModel || []} size={100} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartChannelCostShare")}</h3>
            <PieChart data={costAnalytics.byChannel || []} size={100} />
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.rankModelCost")}</h3>
            <TopList data={costAnalytics.byModel || []} valueFormatter={(v) => '$' + v.toFixed(4)} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.rankProviderCost")}</h3>
            <TopList data={costAnalytics.byProvider || []} valueFormatter={(v) => '$' + v.toFixed(4)} />
          </div>
        </div>
        
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTopInstancesCost")}</h3>
          <TopList data={costAnalytics.topInstances || []} valueFormatter={(v) => '$' + v.toFixed(4)} />
        </div>
      </div>
    );
  };

  const renderMessageTab = () => {
    const messageAnalytics = data?.messageAnalytics || {};
    
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.msgProcessed")}</p>
            <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{overview.messageProcessed?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.msgQueued")}</p>
            <span className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{overview.messageQueued?.toLocaleString() || 0}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricAvgDuration")}</p>
            <span className="text-2xl font-semibold text-cyan-600 dark:text-cyan-400">{(messageAnalytics.durationStats?.avg || histogramStats.messageDuration?.avg || 0).toFixed(1)}ms</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricMaxDuration")}</p>
            <span className="text-2xl font-semibold text-rose-600 dark:text-rose-400">{messageAnalytics.durationStats?.max || histogramStats.messageDuration?.max || 0}ms</span>
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartMessageTrend")}</h3>
            <LineChart data={trends.messageProcessed || []} color="#10b981" height={120} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartChannelDist")}</h3>
            <PieChart data={messageAnalytics.byChannel || []} size={100} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartDurationDist")}</h3>
            <div className="space-y-4">
              <div className="p-4 bg-cyan-50/50 dark:bg-cyan-950/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{(messageAnalytics.durationStats?.avg || 0).toFixed(1)}ms</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("otelOverview.avgDurationLabel")}</div>
              </div>
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{messageAnalytics.durationStats?.max || 0}ms</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("otelOverview.maxDurationLabel")}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="app-card p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTopInstancesMessage")}</h3>
          <TopList data={messageAnalytics.topInstances || []} />
        </div>
      </div>
    );
  };

  const renderQueueTab = () => {
    const queueAnalytics = data?.queueAnalytics || {};
    
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.queueDepthCurrent")}</p>
            <span className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{queueAnalytics.depthStats?.max || instances.reduce((a, i) => a + (i.queueDepth || 0), 0)}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.enqueueTotal")}</p>
            <span className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{instances.reduce((a, i) => a + (i.enqueueTotal || 0), 0).toLocaleString()}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.dequeueTotal")}</p>
            <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{instances.reduce((a, i) => a + (i.dequeueTotal || 0), 0).toLocaleString()}</span>
          </div>
          <div className="app-card p-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.avgWait")}</p>
            <span className="text-2xl font-semibold text-violet-600 dark:text-violet-400">{(queueAnalytics.waitStats?.avg || histogramStats.queueWait?.avg || 0).toFixed(1)}ms</span>
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartQueueDepthTrend")}</h3>
            <LineChart data={trends.queueDepth || []} color="#f59e0b" height={120} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartLaneDist")}</h3>
            <PieChart data={queueAnalytics.byLane || []} size={100} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartChannelDist")}</h3>
            <PieChart data={queueAnalytics.byChannel || []} size={100} />
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.rankLaneEnqueue")}</h3>
            <TopList data={queueAnalytics.byLane || []} />
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.chartTopInstancesEnqueue")}</h3>
            <TopList data={queueAnalytics.topInstances || []} />
          </div>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.waitTimeStats")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 bg-violet-50/50 dark:bg-violet-950/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{(queueAnalytics.waitStats?.avg || 0).toFixed(1)}ms</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("otelOverview.avgWaitLabel")}</div>
              </div>
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/30 rounded-lg text-center">
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{queueAnalytics.waitStats?.max || 0}ms</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("otelOverview.maxWaitLabel")}</div>
              </div>
            </div>
          </div>
          <div className="app-card p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("otelOverview.queueDepthStats")}</h3>
            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/30 rounded-lg text-center">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{queueAnalytics.depthStats?.max || 0}</div>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("otelOverview.maxQueueDepth")}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">{intl.get("otelOverview.loadErrorTitle")}</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200 underline"
              >
                {intl.get("otelOverview.clickRetry")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="app-card flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("otelOverview.headerObserveTime")}</span>
          <div className="flex gap-1.5">
            {timeRanges.slice(0, 6).map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => handleQuickTimeSelect(range.value)}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  timeMode === "quick" && selectedTimeRange === range.value
                    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                ].join(" ")}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("otelOverview.granularityWithValue", { label: granularityLabel })}</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTimePicker(!showTimePicker)}
              className={[
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                timeMode === "custom"
                  ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                  : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
              ].join(" ")}
            >
              <Icon name="calendar" className="h-3.5 w-3.5" />
              {timeMode === "custom" ? intl.get("otelOverview.customTime") : intl.get("otelOverview.preciseTime")}
            </button>
            {showTimePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{intl.get("timeFilter.startTime")}</label>
                    <input
                      type="datetime-local"
                      value={customStartTime}
                      onChange={(e) => setCustomStartTime(e.target.value)}
                      className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{intl.get("timeFilter.endTime")}</label>
                    <input
                      type="datetime-local"
                      value={customEndTime}
                      onChange={(e) => setCustomEndTime(e.target.value)}
                      className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowTimePicker(false)}
                      className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
                    >
                      {intl.get("otelOverview.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCustomTime}
                      disabled={!customStartTime || !customEndTime}
                      className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {intl.get("otelOverview.apply")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{intl.get("otelOverview.autoRefresh")}</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {refreshIntervals.map((interval) => (
                <option key={interval.value} value={interval.value}>{interval.label}</option>
              ))}
            </select>
            {refreshInterval > 0 && (
              <span className="text-gray-400 dark:text-gray-500 min-w-[36px]">({countdown}s)</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            <Icon name="refresh" className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
            {intl.get("otelOverview.manualRefresh")}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex gap-1">
          {PAGE_TAB_KEYS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPageTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                pageTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {pageTab === "overview" && renderOverviewTab()}
      {pageTab === "session" && renderSessionTab()}
      {pageTab === "token" && renderTokenTab()}
      {pageTab === "cost" && renderCostTab()}
      {pageTab === "message" && renderMessageTab()}
      {pageTab === "queue" && renderQueueTab()}
    </div>
  );
}
