import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import HostMonitorHostTable from "./HostMonitorHostTable.jsx";
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

const INPUT =
  "w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500";

const RELATIVE_TIME_PRESETS = [
  { key: "30s", minutes: 0.5 },
  { key: "1m", minutes: 1 },
  { key: "5m", minutes: 5 },
  { key: "15m", minutes: 15 },
  { key: "30m", minutes: 30 },
  { key: "1h", minutes: 60 },
  { key: "4h", minutes: 240 },
  { key: "6h", minutes: 360 },
  { key: "12h", minutes: 720 },
  { key: "24h", minutes: 1440 },
  { key: "3d", minutes: 4320 },
  { key: "7d", minutes: 10080 },
  { key: "30d", minutes: 43200 },
];

const CALENDAR_TIME_KEYS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
];

function localValueToIso(local) {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfYear(d) {
  const x = new Date(d);
  x.setMonth(0, 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toBackendDateTimeString(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logSearchPresetLabel(preset, customStart, customEnd) {
  if (preset === "custom") {
    if (customStart && customEnd) {
      const s = customStart.length >= 16 ? customStart.slice(0, 16) : customStart;
      const e = customEnd.length >= 16 ? customEnd.slice(0, 16) : customEnd;
      return `${s.replace("T", " ")} → ${e.replace("T", " ")}`;
    }
    return intl.get("logSearch.preset.custom");
  }
  const k = `logSearch.preset.${preset}`;
  const t = intl.get(k);
  return t && t !== k ? t : preset;
}

function LogTimeRangePicker({ timePreset, setTimePreset, customStart, setCustomStart, customEnd, setCustomEnd, disabled, onCommit }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState(null);

  const updatePanelPos = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(window.innerWidth - 16, 22 * 16);
    let left = r.right - maxW;
    if (left < 8) left = Math.min(8, r.left);
    left = Math.max(8, Math.min(left, window.innerWidth - maxW - 8));
    setPanelPos({ top: r.bottom + 4, left, width: maxW });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => updatePanelPos();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const buttonLabel = useMemo(() => logSearchPresetLabel(timePreset, customStart, customEnd), [timePreset, customStart, customEnd]);

  const pickPreset = (key) => {
    setTimePreset(key);
    if (key !== "custom") {
      setOpen(false);
      onCommit();
    }
  };

  const applyCustom = () => {
    setTimePreset("custom");
    setOpen(false);
    onCommit();
  };

  const panelContent = (
    <>
      <div className="border-b border-slate-100 px-3 pb-2 pt-1 dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {intl.get("logSearch.timeGroup.relative")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {RELATIVE_TIME_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(p.key)}
              className={[
                "rounded-md px-2 py-1.5 text-left text-xs font-medium transition",
                timePreset === p.key
                  ? "bg-primary/12 text-primary dark:bg-primary/20"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {intl.get(`logSearch.preset.${p.key}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
        <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-400 dark:text-slate-500">
          {intl.get("logSearch.timeGroup.calendar")}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-0.5 sm:grid-cols-3">
          {CALENDAR_TIME_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(key)}
              className={[
                "rounded px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition",
                timePreset === key
                  ? "bg-primary/12 text-primary dark:bg-primary/20"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {intl.get(`logSearch.preset.${key}`)}
            </button>
          ))}
        </div>
      </div>
      <details className="px-3 py-2">
        <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 [&::-webkit-details-marker]:hidden">
          {intl.get("logSearch.timeSection.custom")}
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className={`${INPUT} max-w-full py-1.5 text-xs sm:max-w-[11rem]`}
            />
            <span className="text-slate-400 dark:text-slate-600">—</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className={`${INPUT} max-w-full py-1.5 text-xs sm:max-w-[11rem]`}
            />
          </div>
          <button
            type="button"
            disabled={disabled || !customStart || !customEnd}
            onClick={applyCustom}
            className="app-btn-outline w-fit py-1.5 pl-3 pr-4 text-xs"
          >
            {intl.get("logSearch.timeApply")}
          </button>
        </div>
      </details>
    </>
  );

  return (
    <div className="relative w-auto min-w-[7.5rem] max-w-[15rem] shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={intl.get("logSearch.timePickerAria")}
        onClick={() => setOpen((o) => !o)}
        className="box-border flex min-h-9 w-full min-w-0 items-center gap-1 rounded-md border border-slate-200/90 bg-white py-2 pl-3 pr-2 text-left text-sm text-slate-800 outline-none ring-0 focus:ring-0 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100"
      >
        <span className="min-w-0 flex-1 truncate" title={buttonLabel}>
          {buttonLabel}
        </span>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
            className="fixed z-[200] max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200/90 bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-label={intl.get("logSearch.timeRange")}
          >
            {panelContent}
          </div>,
          document.body,
        )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function CoreMetricCard({ title, value, hint, accent, iconName, iconClassName, children }) {
  const baseClass = [
    "rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm ring-1 ring-black/[0.03]",
    "dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]",
    accent ?? "",
  ].join(" ");
  return (
    <div className={baseClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
        {iconName ? (
          <span className={["inline-flex h-6 w-6 items-center justify-center rounded-md", iconClassName || "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"].join(" ")}>
            <Icon name={iconName} className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

function getStatusColor(status) {
  switch (status) {
    case "healthy": return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning": return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "critical": return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300";
    default: return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
  }
}
function getHealthLabel(status) {
  switch (status) {
    case "healthy": return intl.get("hostMonitor.statusHealthy");
    case "warning": return intl.get("hostMonitor.statusWarning");
    case "critical": return intl.get("hostMonitor.statusCritical");
    default: return status;
  }
}

function formatPercentValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${num.toFixed(1)}%`;
}

function LineChart({ data, color, height = 208, yMax, syncId }) {
  if (!data || data.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? '');
    if (yMax != null) return n.toFixed(1) + '%';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toFixed(n < 10 ? 1 : 0);
  };

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? '');
  };

  const gradId = `areaGrad-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 5)}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId={syncId}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={yMax ? 40 : 48}
          domain={yMax ? [0, yMax] : undefined}
          tickFormatter={(v) => formatValue(v)} />
        <Tooltip formatter={(v) => [formatValue(v), '']} labelFormatter={(d) => d || ''} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

function RechartsDonut({ data, colors, height = 220, legendAlign = "right", legendLayout = "horizontal", legendVerticalAlign = "bottom" }) {
  const safeData = (data && data.length > 0) ? data : [];
  if (safeData.length === 0) {
    return <p className="flex items-center justify-center text-xs text-gray-400" style={{ height }}>{intl.get("hostMonitor.noData")}</p>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie data={safeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={1}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
            {safeData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => (v != null ? Number(v).toFixed(1) : "—")} />
          <Legend
            iconType="circle"
            iconSize={8}
            align={legendAlign}
            layout={legendLayout}
            verticalAlign={legendVerticalAlign}
            wrapperStyle={{ fontSize: 11, lineHeight: "18px" }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

function OnlineStatusBarChart({ data, syncId }) {
  if (!data || data.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };

  const statusLabel = (v) => (Number(v) >= 1 ? intl.get("hostMonitor.legendOnlineHosts") : intl.get("hostMonitor.legendOfflineHosts"));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId={syncId}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={34} domain={[0, 1]} ticks={[0, 1]} />
        <Tooltip
          formatter={(v, name) => {
            if (name === "online") return [statusLabel(v), ""];
            return [null, ""];
          }}
          labelFormatter={(d) => d || ""}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => (value === "online" ? intl.get("hostMonitor.legendOnlineHosts") : intl.get("hostMonitor.legendOfflineHosts"))}
        />
        <Bar dataKey="offline" stackId="a" fill="#ef4444" isAnimationActive={false} />
        <Bar dataKey="online" stackId="a" fill="#22c55e" isAnimationActive={false} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

const DETAIL_TABS = [
  { id: "basicInfo", labelKey: "hostMonitor.detailTab.basicInfo" },
  { id: "filesystem", labelKey: "hostMonitor.detailTab.filesystem" },
  { id: "network", labelKey: "hostMonitor.detailTab.network" },
  { id: "processes", labelKey: "hostMonitor.detailTab.processes" },
];

const DISK_PIE_COLORS = ["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#ec4899", "#a855f7", "#14b8a6", "#eab308"];

/** 运行详情右侧主体（与「主机列表」抽屉内展示一致） */
export function HostMonitorDetailMainPanel({ selectedHost, overviewData, onBack }) {
  const [activeTab, setActiveTab] = useState("basicInfo");
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timePreset, setTimePreset] = useState("24h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const tabRangeInitRef = useRef(false);

  const hostList = overviewData?.hostList || [];
  const currentHostname = selectedHost?.hostname || selectedHost || (hostList[0]?.hostname || null);

  const computeRangeIso = useCallback(() => {
    const nowMs = Date.now();
    if (timePreset === "custom") {
      const s = localValueToIso(customStart);
      const e = localValueToIso(customEnd);
      return { startIso: s ? toBackendDateTimeString(s) : "", endIso: e ? toBackendDateTimeString(e) : "" };
    }
    if (timePreset === "today") {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      return { startIso: toBackendDateTimeString(s), endIso: toBackendDateTimeString(new Date()) };
    }
    if (timePreset === "yesterday") {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const end = new Date(dayStart.getTime() - 1);
      const start = new Date(dayStart);
      start.setDate(start.getDate() - 1);
      return { startIso: toBackendDateTimeString(start), endIso: toBackendDateTimeString(end) };
    }
    if (timePreset === "thisWeek") {
      const s = startOfWeekMonday(new Date());
      return { startIso: toBackendDateTimeString(s), endIso: toBackendDateTimeString(new Date()) };
    }
    if (timePreset === "lastWeek") {
      const thisWeek = startOfWeekMonday(new Date());
      const end = new Date(thisWeek.getTime() - 1);
      const start = startOfWeekMonday(new Date(end));
      return { startIso: toBackendDateTimeString(start), endIso: toBackendDateTimeString(end) };
    }
    if (timePreset === "thisMonth") {
      const s = startOfMonth(new Date());
      return { startIso: toBackendDateTimeString(s), endIso: toBackendDateTimeString(new Date()) };
    }
    if (timePreset === "lastMonth") {
      const thisMonth = startOfMonth(new Date());
      const end = new Date(thisMonth.getTime() - 1);
      const start = startOfMonth(new Date(end));
      return { startIso: toBackendDateTimeString(start), endIso: toBackendDateTimeString(end) };
    }
    if (timePreset === "thisYear") {
      const s = startOfYear(new Date());
      return { startIso: toBackendDateTimeString(s), endIso: toBackendDateTimeString(new Date()) };
    }
    if (timePreset === "lastYear") {
      const thisYear = startOfYear(new Date());
      const end = new Date(thisYear.getTime() - 1);
      const start = startOfYear(new Date(end));
      return { startIso: toBackendDateTimeString(start), endIso: toBackendDateTimeString(end) };
    }
    const def = RELATIVE_TIME_PRESETS.find((p) => p.key === timePreset);
    const minutes = def?.minutes ?? 1440;
    const start = new Date(nowMs - minutes * 60_000);
    const end = new Date(nowMs);
    return { startIso: toBackendDateTimeString(start), endIso: toBackendDateTimeString(end) };
  }, [timePreset, customStart, customEnd]);

  const fetchDetail = useCallback(async (hostname) => {
    if (!hostname) return;
    setLoading(true);
    setError(null);
    try {
      const { startIso, endIso } = computeRangeIso();
      const params = new URLSearchParams({ hostname });
      if (startIso && endIso) {
        params.set("startIso", startIso);
        params.set("endIso", endIso);
      }
      const res = await fetch(`/api/host-monitor?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetailData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [computeRangeIso]);

  const handleTabChange = useCallback((nextTab) => {
    setActiveTab(nextTab);
    if (nextTab === "filesystem") {
      setCustomStart("");
      setCustomEnd("");
      setTimePreset("30d");
      return;
    }
    if (timePreset === "30d") {
      setCustomStart("");
      setCustomEnd("");
      setTimePreset("24h");
    }
  }, [timePreset]);

  useEffect(() => {
    if (currentHostname) {
      fetchDetail(currentHostname);
      setActiveTab("basicInfo");
    }
  }, [currentHostname]);

  useEffect(() => {
    if (!currentHostname) return;
    if (!tabRangeInitRef.current) {
      tabRangeInitRef.current = true;
      return;
    }
    if (activeTab === "filesystem" && timePreset === "30d") {
      fetchDetail(currentHostname);
    }
    if (activeTab !== "filesystem" && timePreset === "24h") {
      fetchDetail(currentHostname);
    }
  }, [activeTab, timePreset, currentHostname, fetchDetail]);

  const summary = detailData?.summary || {};
  const cpu = detailData?.cpu || {};
  const memory = detailData?.memory || {};
  const memTotal = Number(memory.totalBytes) || 0;
  const memUsed = Number(memory.usedBytes) || 0;
  const memFree = Number(memory.freeBytes) || 0;
  const memCached = Number(memory.cachedBytes) || 0;
  const memBuffer = Number(memory.bufferBytes) || 0;
  const memPct = (val) => memTotal > 0 ? ((val / memTotal) * 100) : 0;
  const memBreakdown = [
    { label: intl.get("hostMonitor.memUsed"), value: memory.formatted?.used || "0 B", pct: memPct(memUsed), color: "bg-red-500", tc: "text-red-600 dark:text-red-400" },
    { label: intl.get("hostMonitor.memFree"), value: memory.formatted?.free || "0 B", pct: memPct(memFree), color: "bg-green-500", tc: "text-green-600 dark:text-green-400" },
    { label: intl.get("hostMonitor.memCached"), value: memory.formatted?.cached || "0 B", pct: memPct(memCached), color: "bg-amber-500", tc: "text-amber-600 dark:text-amber-400" },
    { label: intl.get("hostMonitor.memBuffer"), value: memory.formatted?.buffer || "0 B", pct: memPct(memBuffer), color: "bg-cyan-500", tc: "text-cyan-600 dark:text-cyan-400" },
  ];
  const memPieData = memBreakdown
    .map(b => ({ name: b.label, value: Number(b.pct.toFixed(1)) }))
    .filter(x => x.value > 0);
  const disks = detailData?.disks || [];
  const networks = detailData?.networks || [];
  const processes = detailData?.processes || {};
  const hostInfo = detailData?.hostInfo || {};
  const networkRxBytes = networks.reduce((sum, n) => sum + (Number(n.receiveBytes) || 0), 0);
  const networkTxBytes = networks.reduce((sum, n) => sum + (Number(n.transmitBytes) || 0), 0);
  const networkRxDisplay = summary.networkReceiveDisplay || formatBytes(networkRxBytes);
  const networkTxDisplay = summary.networkTransmitDisplay || formatBytes(networkTxBytes);
  const processTotalRaw =
    Number(processes.total) ||
    (Number(processes.running) || 0) +
      (Number(processes.sleeping) || 0) +
      (Number(processes.stopped) || 0) +
      (Number(processes.zombie) || 0);
  const processTotal = Math.max(processTotalRaw, 1);
  const procRunning = Number(processes.running) || 0;
  const procSleeping = Number(processes.sleeping) || 0;
  const procStopped = Number(processes.stopped) || 0;
  const procZombie = Number(processes.zombie) || 0;
  const processDetailRowsRaw = detailData?.processDetails || processes?.details || [];
  const processDetailRows = (Array.isArray(processDetailRowsRaw) ? processDetailRowsRaw : []).map((p, idx) => ({
    id: p?.pid ?? p?.id ?? idx,
    name: p?.name || p?.processName || "-",
    pid: p?.pid ?? "-",
    user: p?.user || p?.owner || "-",
    cpu: Number(p?.cpuPercent ?? p?.cpuUsage ?? 0),
    memory: Number(p?.memoryPercent ?? p?.memoryUsage ?? 0),
    state: p?.state || "-",
    command: p?.command || p?.cmd || "-",
  }));
  const procRunningShare = (procRunning / processTotal) * 100;
  const procSleepingShare = (procSleeping / processTotal) * 100;
  const procZombieShare = (procZombie / processTotal) * 100;
  const procStoppedShare = (procStopped / processTotal) * 100;
  const procActiveShare = ((procRunning + procSleeping) / processTotal) * 100;

  function downsample(arr, maxPts = 60) {
    if (!arr || arr.length <= maxPts) return arr || [];
    const step = arr.length / maxPts;
    return Array.from({ length: maxPts }, (_, i) => arr[Math.floor(i * step)]);
  }

  const getDisplayRangeHours = useCallback(() => {
    if (timePreset === "custom") {
      const s = customStart ? new Date(customStart).getTime() : NaN;
      const e = customEnd ? new Date(customEnd).getTime() : NaN;
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
        return (e - s) / 3600000;
      }
      return 24;
    }
    const p = RELATIVE_TIME_PRESETS.find((x) => x.key === timePreset);
    if (p?.minutes) return p.minutes / 60;
    switch (timePreset) {
      case "today": return 24;
      case "yesterday": return 24;
      case "thisWeek": return 7 * 24;
      case "lastWeek": return 7 * 24;
      case "thisMonth": return 30 * 24;
      case "lastMonth": return 30 * 24;
      case "thisYear": return 365 * 24;
      case "lastYear": return 365 * 24;
      default: return 24;
    }
  }, [timePreset, customStart, customEnd]);

  function fmtTs(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      const rangeHours = getDisplayRangeHours();
      // <= 24h: 时分；<= 7d: 月-日 时；> 7d: 月-日
      if (rangeHours <= 24) return `${hh}:${mi}`;
      if (rangeHours <= 7 * 24) return `${mm}-${dd} ${hh}:00`;
      return `${mm}-${dd}`;
    } catch {
      return String(ts);
    }
  }

  const cpuTrendRaw = detailData?.trends?.cpuUtilization || [];
  const memTrendRaw = detailData?.trends?.memoryUtilization || [];
  const diskTrendRaw = detailData?.trends?.diskMaxUtilization || [];
  const diskIoTrendRaw = detailData?.trends?.diskIo || [];
  const netTrendRaw = detailData?.trends?.network || [];
  const loadTrendRaw = detailData?.trends?.loadAverage || [];
  const onlineStatusRaw = detailData?.trends?.onlineStatus || [];
  const tsRaw = detailData?.trends?.timestamps || [];

  const safeTs = tsRaw.length > 0 ? tsRaw : Array.from({ length: 24 }, (_, i) => new Date(Date.now() - (23 - i) * 3600000).toISOString());

  const tsLabels = downsample(safeTs.map(fmtTs));
  const extractValues = (raw, key = 'utilization') => {
    if (!raw || raw.length === 0) return Array(tsLabels.length || 24).fill(0);
    return raw.map(d => typeof d === 'object' ? parseFloat(d[key]) || 0 : parseFloat(d) || 0);
  };
  const cpuTrendData = downsample(extractValues(cpuTrendRaw)).map((v, i) => ({ time: tsLabels[i] || '', value: v }));
  const memTrendData = downsample(extractValues(memTrendRaw)).map((v, i) => ({ time: tsLabels[i] || '', value: v }));
  const diskTrendData = downsample(extractValues(diskTrendRaw)).map((v, i) => ({ time: tsLabels[i] || '', value: v }));
  const diskIoTrend = downsample(
    diskIoTrendRaw.length > 0
      ? diskIoTrendRaw
      : Array(tsLabels.length || 24).fill({ readOps: summary.diskReadOps || 0, writeOps: summary.diskWriteOps || 0 }),
  ).map((v, i) => ({
    time: tsLabels[i] || "",
    value:
      typeof v === "object"
        ? (Number(v.totalOps) || Number(v.io) || Number(v.value) || (Number(v.readOps) || 0) + (Number(v.writeOps) || 0))
        : Number(v) || 0,
  }));
  const netRxTrend = downsample(netTrendRaw.length > 0 ? netTrendRaw : Array(tsLabels.length || 24).fill({ receiveMB: '0', transmitMB: '0' })).map((v, i) => ({ time: tsLabels[i] || '', value: parseFloat(v.receiveMB) || 0 }));
  const netTxTrend = downsample(netTrendRaw.length > 0 ? netTrendRaw : Array(tsLabels.length || 24).fill({ receiveMB: '0', transmitMB: '0' })).map((v, i) => ({ time: tsLabels[i] || '', value: parseFloat(v.transmitMB) || 0 }));
  const load1mTrend = downsample(loadTrendRaw.length > 0 ? loadTrendRaw : Array(tsLabels.length || 24).fill({ load1m: null })).map((v, i) => ({
    time: tsLabels[i] || "",
    value: v?.load1m == null || v?.load1m === "" ? null : Number(v.load1m),
  }));
  const networkRows = networks.map((net, idx) => {
    const rxRaw = Number(net.receiveBytes) || 0;
    const txRaw = Number(net.transmitBytes) || 0;
    const rxRate = net.receiveRateFormatted || net.receiveFormatted || formatBytes(rxRaw);
    const txRate = net.transmitRateFormatted || net.transmitFormatted || formatBytes(txRaw);
    return {
      key: `${net.device || "net"}-${idx}`,
      name: net.device || `eth${idx}`,
      mac: net.macAddress || "-",
      rxRate,
      txRate,
      rxErrors: Number(net.receiveErrors) || 0,
      txErrors: Number(net.transmitErrors) || 0,
      rxDrops: Number(net.receiveDropped) || 0,
      txDrops: Number(net.transmitDropped) || 0,
      connections: Number(net.connections) || 0,
    };
  });
  const withPerSecond = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return "0 B/s";
    return /\/s$/i.test(s) ? s : `${s}/s`;
  };
  const withCountUnit = (v) => `${Number(v || 0).toLocaleString()}${intl.get("hostMonitor.unitCount")}`;
  const onlineStatusTrend = downsample(onlineStatusRaw.length > 0 ? onlineStatusRaw : Array(tsLabels.length || 24).fill(0)).map((v, i) => {
    const online = Number(v) >= 1 ? 1 : 0;
    return { time: tsLabels[i] || "", online, offline: online ? 0 : 1 };
  });

  const diskPieData = disks.map(d => ({ name: d.mountpoint, value: Number(d.utilizationPercent) || 0 })).filter(x => x.value > 0);
  const fsTotalBytes = disks.reduce((acc, d) => acc + (Number(d.totalBytes) || 0), 0);
  const fsUsedBytes = disks.reduce((acc, d) => acc + (Number(d.usedBytes) || 0), 0);
  const fsFreeBytes = disks.reduce((acc, d) => acc + (Number(d.freeBytes) || 0), 0);
  const fsAvgUtil =
    disks.length > 0
      ? disks.reduce((acc, d) => acc + (Number(d.utilizationPercent) || 0), 0) / disks.length
      : 0;
  const fsCriticalCount = disks.filter((d) => Number(d.utilizationPercent) >= 85).length;

  const showDetailToolbarTimePicker =
    activeTab !== "filesystem" &&
    activeTab !== "network" &&
    activeTab !== "processes" &&
    activeTab !== "basicInfo";
  const showDetailToolbar = Boolean(onBack) || showDetailToolbarTimePicker;

  return (
    <section className="flex h-full min-h-0 w-full flex-1 flex-col">
        {!currentHostname ? (
          <div className="app-card flex min-h-[420px] flex-1 items-center justify-center p-8 text-center">
            <div>
              <Icon name="server" className="mx-auto h-12 w-12 mb-3 opacity-30 text-gray-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{intl.get("hostMonitor.detail.empty.selectHost")}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.detail.empty.hint")}</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {loading && (
              <div className="flex flex-1 items-center justify-center py-16">
                <LoadingSpinner />
              </div>
            )}
            {error && (<div className="app-card shrink-0 p-4 text-sm text-rose-600 dark:text-rose-400">{error}</div>)}

            {!loading && !error && detailData && (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="app-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                  {showDetailToolbar && (
                    <div className="flex shrink-0 flex-col gap-2 border-b border-gray-100 px-6 py-3 dark:border-gray-700/60 sm:flex-row sm:items-center sm:justify-between">
                      {showDetailToolbarTimePicker && (
                        <div className="flex items-center gap-3 sm:ml-auto">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.timeRange")}</span>
                          <LogTimeRangePicker
                            timePreset={timePreset}
                            setTimePreset={setTimePreset}
                            customStart={customStart}
                            setCustomStart={setCustomStart}
                            customEnd={customEnd}
                            setCustomEnd={setCustomEnd}
                            disabled={loading}
                            onCommit={() => {
                              if (currentHostname) fetchDetail(currentHostname);
                            }}
                          />
                        </div>
                      )}
                      {onBack ? (
                        <div className="flex items-center justify-end sm:order-first">
                          <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                          >
                            <Icon name="arrow-left" className="h-3.5 w-3.5" />{intl.get("hostMonitor.backToOverview")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <nav
                    className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-100 px-6 dark:border-gray-700/60 scrollbar-ui"
                    role="tablist"
                  >
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={[
                          "-mb-px whitespace-nowrap rounded-t-md border px-3 py-2.5 text-sm font-medium transition",
                          activeTab === tab.id
                            ? "border-gray-200 border-b-white bg-white text-primary dark:border-gray-700 dark:border-b-gray-900 dark:bg-gray-900 dark:text-primary"
                            : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800",
                        ].join(" ")}
                      >
                        {intl.get(tab.labelKey)}
                      </button>
                    ))}
                  </nav>

                  <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6">
                    {/* ===== 基础信息 Tab ===== */}
                    {activeTab === "basicInfo" && (
                      <div className="space-y-6">
                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.basicInfo.title")}</h4>
                          </div>
                          <div className="p-4">
                            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              {[
                                { labelKey: "hostMonitor.basicInfo.hostname", value: hostInfo.name || currentHostname },
                                { labelKey: "hostMonitor.basicInfo.osType", value: `${hostInfo.osType || "-"}/${hostInfo.arch || "-"}` },
                                { labelKey: "hostMonitor.basicInfo.status", value: getHealthLabel(detailData.healthStatus), color: getStatusColor(detailData.healthStatus) },
                                { labelKey: "hostMonitor.basicInfo.cpuCores", value: cpu.coreCount || "-" },
                                { labelKey: "hostMonitor.basicInfo.totalMemory", value: memory.formatted?.total || "-" },
                                { labelKey: "hostMonitor.basicInfo.processCount", value: processes.total || summary.processCount || 0 },
                              ].map((item) => (
                                <div key={item.labelKey}>
                                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{intl.get(item.labelKey)}</dt>
                                  <dd className={`mt-1 text-sm font-medium ${item.color || 'text-gray-900 dark:text-gray-100'}`}>{item.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                          <CoreMetricCard title={intl.get("hostMonitor.cpuUsage")} value={`${summary.avgCpuUtilization}%`} hint={intl.get("hostMonitor.cpuUsage")}>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(Number(summary.avgCpuUtilization) || 0, 100)}%` }} />
                            </div>
                          </CoreMetricCard>
                          <CoreMetricCard title={intl.get("hostMonitor.memoryUsage")} value={`${summary.avgMemoryUtilization}%`} hint={intl.get("hostMonitor.memoryUsage")}>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(Number(summary.avgMemoryUtilization) || 0, 100)}%` }} />
                            </div>
                          </CoreMetricCard>
                          <CoreMetricCard title={intl.get("hostMonitor.diskUsage")} value={`${summary.maxDiskUtilization}%`} hint={intl.get("hostMonitor.diskUsage")}>
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(Number(summary.maxDiskUtilization) || 0, 100)}%` }} />
                            </div>
                          </CoreMetricCard>
                          <CoreMetricCard title={intl.get("hostMonitor.loadAvg")} value={summary.loadAverage?.["1m"] || "N/A"} />
                          <CoreMetricCard title={intl.get("hostMonitor.colNetworkRx")} value={networkRxDisplay} />
                          <CoreMetricCard title={intl.get("hostMonitor.colNetworkTx")} value={networkTxDisplay} />
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartOnlineTrend")}</h4>
                            <div className="flex items-center gap-2">
                              <LogTimeRangePicker
                                timePreset={timePreset}
                                setTimePreset={setTimePreset}
                                customStart={customStart}
                                setCustomStart={setCustomStart}
                                customEnd={customEnd}
                                setCustomEnd={setCustomEnd}
                                disabled={loading}
                                onCommit={() => {
                                  if (currentHostname) fetchDetail(currentHostname);
                                }}
                              />
                            </div>
                          </div>
                          <div className="p-4">
                            <p className="mb-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{intl.get("hostMonitor.chartOnlineTrend")}</p>
                            <div className="h-52"><OnlineStatusBarChart data={onlineStatusTrend} /></div>
                          </div>
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.resourceTrend24h")}</h4>
                            <div className="flex items-center gap-2">
                              <LogTimeRangePicker
                                timePreset={timePreset}
                                setTimePreset={setTimePreset}
                                customStart={customStart}
                                setCustomStart={setCustomStart}
                                customEnd={customEnd}
                                setCustomEnd={setCustomEnd}
                                disabled={loading}
                                onCommit={() => {
                                  if (currentHostname) fetchDetail(currentHostname);
                                }}
                              />
                            </div>
                          </div>
                          <div className="grid gap-4 p-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-medium text-violet-600 dark:text-violet-400">{intl.get("hostMonitor.colCpuShort")}</p>
                              <div className="h-52"><LineChart data={cpuTrendData} color="#8b5cf6" yMax={100} syncId="basic-resource-trend-sync" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-blue-600 dark:text-blue-400">{intl.get("hostMonitor.colMemory")}</p>
                              <div className="h-52"><LineChart data={memTrendData} color="#3b82f6" yMax={100} syncId="basic-resource-trend-sync" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-orange-600 dark:text-orange-400">{intl.get("hostMonitor.chartDiskIoTrend")}</p>
                              <div className="h-52"><LineChart data={diskIoTrend} color="#f97316" syncId="basic-resource-trend-sync" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">{intl.get("hostMonitor.chartLoadTrend")}</p>
                              <div className="h-52"><LineChart data={load1mTrend} color="#64748b" syncId="basic-resource-trend-sync" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-cyan-600 dark:text-cyan-400">⬇ {intl.get("hostMonitor.colNetworkRx")} (MB)</p>
                              <div className="h-52"><LineChart data={netRxTrend} color="#06b6d4" syncId="basic-resource-trend-sync" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-fuchsia-600 dark:text-fuchsia-400">⬆ {intl.get("hostMonitor.colNetworkTx")} (MB)</p>
                              <div className="h-52"><LineChart data={netTxTrend} color="#d946ef" syncId="basic-resource-trend-sync" /></div>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* ===== 文件系统 Tab ===== */}
                    {activeTab === "filesystem" && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {intl.get("hostMonitor.filesystemTitle")} ({disks.length})
                          </h4>
                        </div>

                        {disks.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.noData")}</p>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              <CoreMetricCard
                                title={intl.get("hostMonitor.filesystemTotalCapacity")}
                                value={formatBytes(fsTotalBytes)}
                                iconName="database"
                                iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"
                              />
                              <CoreMetricCard
                                title={intl.get("hostMonitor.filesystemUsedCapacity")}
                                value={formatBytes(fsUsedBytes)}
                                iconName="hard-drive"
                                iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                              />
                              <CoreMetricCard
                                title={intl.get("hostMonitor.filesystemFreeCapacity")}
                                value={formatBytes(fsFreeBytes)}
                                iconName="layers"
                                iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                              />
                              <CoreMetricCard
                                title={intl.get("hostMonitor.filesystemAvgUtil")}
                                value={formatPercentValue(fsAvgUtil)}
                                iconName="activity"
                                iconClassName="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300"
                              />
                            </div>

                            <div className="app-card overflow-hidden p-0">
                              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.filesystemUtilTrend")}</h4>
                                <div className="flex items-center gap-2">
                                  <LogTimeRangePicker
                                    timePreset={timePreset}
                                    setTimePreset={setTimePreset}
                                    customStart={customStart}
                                    setCustomStart={setCustomStart}
                                    customEnd={customEnd}
                                    setCustomEnd={setCustomEnd}
                                    disabled={loading}
                                    onCommit={() => {
                                      if (currentHostname) fetchDetail(currentHostname);
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="h-64 w-full px-2 py-4 sm:px-4">
                                <LineChart data={diskTrendData} color="#f97316" yMax={100} />
                              </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="app-card overflow-hidden p-0">
                                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.filesystemListTitle")}</h4>
                                </div>
                                <div className="overflow-x-auto px-4 py-3">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700/60 dark:bg-gray-800/30">
                                        <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.mountpoint")}</th>
                                        <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.device")}</th>
                                        <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.fstype")}</th>
                                        <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.usage")}</th>
                                        <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.used")}</th>
                                        <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.available")}</th>
                                        <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.totalSize")}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                                      {disks.map((disk, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                          <td className="py-3 font-medium text-gray-900 dark:text-gray-100">{disk.mountpoint || "-"}</td>
                                          <td className="py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{disk.device || "-"}</td>
                                          <td className="py-3 text-xs text-gray-500 dark:text-gray-400">{disk.fstype || "-"}</td>
                                          <td className="py-3 text-right">
                                            <span className={`font-mono text-sm font-medium ${Number(disk.utilizationPercent) > 85 ? "text-red-600" : Number(disk.utilizationPercent) > 70 ? "text-amber-600" : "text-green-600"}`}>
                                              {disk.utilizationPercent}%
                                            </span>
                                          </td>
                                          <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">
                                            {disk.usedFormatted || formatBytes(Number(disk.usedBytes) || 0)}
                                          </td>
                                          <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">
                                            {disk.freeFormatted || formatBytes(Number(disk.freeBytes) || 0)}
                                          </td>
                                          <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{disk.totalFormatted || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              <div className="app-card overflow-hidden p-0">
                                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.diskSpaceDist")}</h4>
                                </div>
                                <div className="px-2 py-4 sm:px-4">
                                  <RechartsDonut
                                    data={diskPieData}
                                    colors={DISK_PIE_COLORS}
                                    height={240}
                                    legendAlign="left"
                                    legendLayout="vertical"
                                    legendVerticalAlign="middle"
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ===== 网络 Tab ===== */}
                    {activeTab === "network" && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.networkDetail")} ({networks.length})</h4>
                        </div>

                        {networks.length > 0 && (
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {networks.slice(0, 6).map((net, idx) => (
                              <div key={idx} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05] hover:border-primary/30 transition-colors">
                                <div className="mb-3 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400">
                                      <Icon name="wifi" className="h-3.5 w-3.5" />
                                    </div>
                                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{net.device}</span>
                                  </div>
                                  <span className="text-[10px] text-gray-400">{net.macAddress || ''}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="rounded bg-blue-50/70 p-2.5 dark:bg-blue-950/20">
                                    <div className="text-[10px] text-blue-600 dark:text-blue-400">⬇ {intl.get("hostMonitor.receive")}</div>
                                    <div className="mt-0.5 text-sm font-semibold text-blue-900 dark:text-blue-100">{net.receiveFormatted || "0 B"}</div>
                                  </div>
                                  <div className="rounded bg-green-50/70 p-2.5 dark:bg-green-950/20">
                                    <div className="text-[10px] text-green-600 dark:text-green-400">⬆ {intl.get("hostMonitor.transmit")}</div>
                                    <div className="mt-0.5 text-sm font-semibold text-green-900 dark:text-green-100">{net.transmitFormatted || "0 B"}</div>
                                  </div>
                                </div>
                                {net.speed && <div className="mt-2 text-[10px] text-gray-400">Speed: {net.speed}</div>}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="app-card overflow-hidden p-0">
                          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.netTrafficTrend")}</h4>
                            <div className="flex items-center gap-2">
                              <LogTimeRangePicker
                                timePreset={timePreset}
                                setTimePreset={setTimePreset}
                                customStart={customStart}
                                setCustomStart={setCustomStart}
                                customEnd={customEnd}
                                setCustomEnd={setCustomEnd}
                                disabled={loading}
                                onCommit={() => {
                                  if (currentHostname) fetchDetail(currentHostname);
                                }}
                              />
                            </div>
                          </div>
                          <div className="grid gap-4 p-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-medium text-cyan-600 dark:text-cyan-400">⬇ {intl.get("hostMonitor.receive")} (MB)</p>
                              <div className="h-52"><LineChart data={netRxTrend} color="#06b6d4" /></div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium text-violet-600 dark:text-violet-400">⬆ {intl.get("hostMonitor.transmit")} (MB)</p>
                              <div className="h-52"><LineChart data={netTxTrend} color="#8b5cf6" /></div>
                            </div>
                          </div>
                        </div>

                        {networks.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.noData")}</p>
                        ) : (
                          <>
                            <div className="app-card overflow-hidden p-0">
                              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.nicListTitle")}</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[980px] text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700/60 dark:bg-gray-800/30">
                                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColName")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColRxRate")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColTxRate")}</th>
                                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColMac")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColRxErrors")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColTxErrors")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColRxDrops")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.nicColTxDrops")}</th>
                                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.connections")}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                                    {networkRows.map((row) => (
                                      <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.name}</td>
                                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300">{withPerSecond(row.rxRate)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">{withPerSecond(row.txRate)}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{row.mac}</td>
                                        <td
                                          className={[
                                            "px-4 py-3 text-right font-mono text-xs font-semibold",
                                            row.rxErrors >= 10
                                              ? "text-red-600 dark:text-red-400"
                                              : row.rxErrors > 0
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-gray-500 dark:text-gray-400",
                                          ].join(" ")}
                                        >
                                          {withCountUnit(row.rxErrors)}
                                        </td>
                                        <td
                                          className={[
                                            "px-4 py-3 text-right font-mono text-xs font-semibold",
                                            row.txErrors >= 10
                                              ? "text-red-600 dark:text-red-400"
                                              : row.txErrors > 0
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-gray-500 dark:text-gray-400",
                                          ].join(" ")}
                                        >
                                          {withCountUnit(row.txErrors)}
                                        </td>
                                        <td
                                          className={[
                                            "px-4 py-3 text-right font-mono text-xs font-semibold",
                                            row.rxDrops >= 20
                                              ? "text-red-600 dark:text-red-400"
                                              : row.rxDrops > 0
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-gray-500 dark:text-gray-400",
                                          ].join(" ")}
                                        >
                                          {withCountUnit(row.rxDrops)}
                                        </td>
                                        <td
                                          className={[
                                            "px-4 py-3 text-right font-mono text-xs font-semibold",
                                            row.txDrops >= 20
                                              ? "text-red-600 dark:text-red-400"
                                              : row.txDrops > 0
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-gray-500 dark:text-gray-400",
                                          ].join(" ")}
                                        >
                                          {withCountUnit(row.txDrops)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">{withCountUnit(row.connections)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                          </>
                        )}
                      </div>
                    )}

                    {/* ===== 进程 Tab ===== */}
                    {activeTab === "processes" && (
                      <div className="space-y-6">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.processDetail")}</h4>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                          {[
                            {
                              key: "running",
                              title: intl.get("hostMonitor.procRunning"),
                              value: procRunning.toLocaleString(),
                              hint: formatPercentValue(procRunningShare),
                              pct: procRunningShare,
                              iconName: "play",
                              iconClassName: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
                              barClass: "bg-emerald-500",
                            },
                            {
                              key: "sleeping",
                              title: intl.get("hostMonitor.procSleeping"),
                              value: procSleeping.toLocaleString(),
                              hint: formatPercentValue(procSleepingShare),
                              pct: procSleepingShare,
                              iconName: "moon",
                              iconClassName: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
                              barClass: "bg-sky-500",
                            },
                            {
                              key: "stopped",
                              title: intl.get("hostMonitor.procStopped"),
                              value: procStopped.toLocaleString(),
                              hint: formatPercentValue(procStoppedShare),
                              pct: procStoppedShare,
                              iconName: "pause",
                              iconClassName: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
                              barClass: "bg-amber-500",
                            },
                            {
                              key: "zombie",
                              title: intl.get("hostMonitor.procZombie"),
                              value: procZombie.toLocaleString(),
                              hint: formatPercentValue(procZombieShare),
                              pct: procZombieShare,
                              iconName: "alert-triangle",
                              iconClassName: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
                              barClass: "bg-rose-500",
                            },
                            {
                              key: "active",
                              title: intl.get("hostMonitor.processActiveRatio"),
                              value: formatPercentValue(procActiveShare),
                              hint: `${intl.get("hostMonitor.procRunning")}: ${procRunning.toLocaleString()} · ${intl.get("hostMonitor.procSleeping")}: ${procSleeping.toLocaleString()}`,
                              pct: procActiveShare,
                              iconName: "activity",
                              iconClassName: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
                              barClass: "bg-violet-500",
                            },
                          ].map((item) => (
                            <CoreMetricCard
                              key={item.key}
                              title={item.title}
                              value={item.value}
                              hint={item.hint}
                              iconName={item.iconName}
                              iconClassName={item.iconClassName}
                            >
                              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                <div
                                  className={["h-full rounded-full", item.barClass].join(" ")}
                                  style={{ width: `${Math.min(100, Math.max(0, Number(item.pct) || 0))}%` }}
                                />
                              </div>
                            </CoreMetricCard>
                          ))}
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.procStateShareBarsTitle")}</h4>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {intl.get("hostMonitor.totalProcesses")}: {processTotal.toLocaleString()} · {intl.get("hostMonitor.procStateShareStackHint")}
                            </p>
                          </div>
                          <div className="space-y-5 p-4">
                            <div
                              className="flex h-3.5 w-full flex-row overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                              role="img"
                              aria-label={intl.get("hostMonitor.procStateShareBarsTitle")}
                            >
                              {procRunningShare > 0 ? (
                                <div
                                  className="h-full min-w-px bg-emerald-500"
                                  style={{ flex: `0 0 ${Math.min(100, procRunningShare)}%` }}
                                  title={`${intl.get("hostMonitor.procRunning")} ${formatPercentValue(procRunningShare)}`}
                                />
                              ) : null}
                              {procSleepingShare > 0 ? (
                                <div
                                  className="h-full min-w-px bg-sky-500"
                                  style={{ flex: `0 0 ${Math.min(100, procSleepingShare)}%` }}
                                  title={`${intl.get("hostMonitor.procSleeping")} ${formatPercentValue(procSleepingShare)}`}
                                />
                              ) : null}
                              {procStoppedShare > 0 ? (
                                <div
                                  className="h-full min-w-px bg-amber-500"
                                  style={{ flex: `0 0 ${Math.min(100, procStoppedShare)}%` }}
                                  title={`${intl.get("hostMonitor.procStopped")} ${formatPercentValue(procStoppedShare)}`}
                                />
                              ) : null}
                              {procZombieShare > 0 ? (
                                <div
                                  className="h-full min-w-px bg-rose-500"
                                  style={{ flex: `0 0 ${Math.min(100, procZombieShare)}%` }}
                                  title={`${intl.get("hostMonitor.procZombie")} ${formatPercentValue(procZombieShare)}`}
                                />
                              ) : null}
                            </div>
                            <div className="space-y-3.5">
                              {[
                                {
                                  key: "running",
                                  label: intl.get("hostMonitor.procRunning"),
                                  pct: procRunningShare,
                                  count: procRunning,
                                  barClass: "bg-emerald-500",
                                },
                                {
                                  key: "sleeping",
                                  label: intl.get("hostMonitor.procSleeping"),
                                  pct: procSleepingShare,
                                  count: procSleeping,
                                  barClass: "bg-sky-500",
                                },
                                {
                                  key: "stopped",
                                  label: intl.get("hostMonitor.procStopped"),
                                  pct: procStoppedShare,
                                  count: procStopped,
                                  barClass: "bg-amber-500",
                                },
                                {
                                  key: "zombie",
                                  label: intl.get("hostMonitor.procZombie"),
                                  pct: procZombieShare,
                                  count: procZombie,
                                  barClass: "bg-rose-500",
                                },
                              ].map((row) => (
                                <div key={row.key}>
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{row.label}</span>
                                    <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                                      {formatPercentValue(row.pct)} · {row.count.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                                    <div
                                      className={["h-full rounded-full transition-[width] duration-300", row.barClass].join(" ")}
                                      style={{ width: `${Math.min(100, Math.max(0, Number(row.pct) || 0))}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="app-card overflow-hidden p-0">
                          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.processListTitle")}</h4>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {intl.get("hostMonitor.totalProcesses")}: {processDetailRows.length}
                            </span>
                          </div>
                          {processDetailRows.length === 0 ? (
                            <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.noData")}</p>
                          ) : (
                            <div className="overflow-x-auto px-4 py-3">
                              <table className="w-full min-w-[860px] text-sm">
                                <thead>
                                  <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700/60 dark:bg-gray-800/30">
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.processColName")}</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">PID</th>
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.processColUser")}</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">CPU%</th>
                                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">MEM%</th>
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.processColState")}</th>
                                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.processColCommand")}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                                  {processDetailRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                      <td className="py-3 font-medium text-gray-900 dark:text-gray-100">{row.name}</td>
                                      <td className="py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{row.pid}</td>
                                      <td className="py-3 text-xs text-gray-600 dark:text-gray-400">{row.user}</td>
                                      <td className="py-3 text-right font-mono text-xs text-violet-700 dark:text-violet-300">{row.cpu.toFixed(1)}%</td>
                                      <td className="py-3 text-right font-mono text-xs text-blue-700 dark:text-blue-300">{row.memory.toFixed(1)}%</td>
                                      <td className="py-3 text-xs text-gray-600 dark:text-gray-400">{row.state}</td>
                                      <td className="max-w-[360px] truncate py-3 font-mono text-xs text-gray-600 dark:text-gray-400" title={row.command}>
                                        {row.command}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
    </section>
  );
}

export default function HostMonitorDetail({ selectedHost, overviewData, overviewLoading, onBack, onSelectHost }) {
  const hostList = overviewData?.hostList || [];
  const currentHostname = selectedHost?.hostname || selectedHost || (hostList[0]?.hostname || null);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(280px,22rem)_minmax(0,1fr)]">
      <aside className="min-h-0">
        <div className="app-card flex h-full min-h-[420px] flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.hostList.title")}</p>
            <span className="text-xs text-gray-400">{hostList.length} {intl.get("hostMonitor.hostsUnit")}</span>
          </div>

          {overviewLoading && !overviewData ? (
            <div className="flex flex-1 items-center justify-center py-10"><LoadingSpinner /></div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto pr-0.5">
              <HostMonitorHostTable
                hosts={hostList}
                selectedHostname={currentHostname}
                showToolbar={false}
                onRowClick={(host) => {
                  onSelectHost?.(host);
                }}
              />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <HostMonitorDetailMainPanel selectedHost={selectedHost} overviewData={overviewData} onBack={onBack} />
      </div>
    </div>
  );
}
