import { useState, useEffect, useCallback, useMemo } from "react";
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

const HOST_CPU_LINE_COLORS = [
  "#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626",
  "#0891b2", "#db2777", "#65a30d", "#4f46e5", "#ea580c",
];

/** 总览：各主机 CPU 多线（data 每行含 time + 各 hostname 列） */
function MultiLineCpuChart({ data, hostnames, syncId }) {
  if (!data || data.length === 0 || !hostnames?.length) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const fmtPct = (val) => {
    if (val == null || val === "") return intl.get("hostMonitor.cpuTrendNoSample");
    const n = Number(val);
    if (!Number.isFinite(n)) return intl.get("hostMonitor.cpuTrendNoSample");
    return n.toFixed(1) + "%";
  };

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 28, right: 4, left: 0, bottom: 0 }} syncId={syncId}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={36} tickFormatter={(v) => `${v}%`} />
        <Tooltip formatter={(v) => [fmtPct(v), ""]} labelFormatter={(d) => d || ""} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend
          verticalAlign="top"
          align="left"
          height={24}
          iconType="plain"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, lineHeight: "14px", maxHeight: 48, overflowY: "auto" }}
        />
        {hostnames.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            stroke={HOST_CPU_LINE_COLORS[idx % HOST_CPU_LINE_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

/** 总览：多主机多线（通用数值，非百分比） */
function MultiLineMetricChart({ data, hostnames, syncId }) {
  if (!data || data.length === 0 || !hostnames?.length) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const fmtVal = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? "");
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toFixed(n < 10 ? 2 : 1);
  };

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 28, right: 4, left: 0, bottom: 0 }} syncId={syncId}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => fmtVal(v)} />
        <Tooltip formatter={(v) => [fmtVal(v), ""]} labelFormatter={(d) => d || ""} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend
          verticalAlign="top"
          align="left"
          height={24}
          iconType="plain"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, lineHeight: "14px", maxHeight: 48, overflowY: "auto" }}
        />
        {hostnames.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            stroke={HOST_CPU_LINE_COLORS[idx % HOST_CPU_LINE_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

function TrendChartHostEmpty() {
  return (
    <p className="flex h-full items-center justify-center text-xs text-gray-400">
      {intl.get("hostMonitor.trendHostFilterEmptyState")}
    </p>
  );
}

/** 主机在线状态：堆叠柱状图（在线=绿，离线=红） */
function OnlineStatusStackedBarChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };

  const fmtInt = (v) => (Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : String(v ?? ""));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="12%">
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={36} />
        <Tooltip
          formatter={(v, name) => [
            fmtInt(v),
            name === "online" ? intl.get("hostMonitor.legendOnlineHosts") : intl.get("hostMonitor.legendOfflineHosts"),
          ]}
          labelFormatter={(d) => d || ""}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Legend verticalAlign="top" align="right" iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="online" name={intl.get("hostMonitor.legendOnlineHosts")} stackId="a" fill="#22c55e" maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="offline" name={intl.get("hostMonitor.legendOfflineHosts")} stackId="a" fill="#ef4444" maxBarSize={28} isAnimationActive={false} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

/** 磁盘 IO：读 / 写双序列（MB，与网络趋势图样式一致） */
function DiskIoDualChart({ data, syncId }) {
  if (!data || data.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  const formatValue = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return String(val ?? "");
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toFixed(n < 10 ? 2 : 1);
  };

  const trendTick = (d) => {
    if (typeof d === "string" && d.length >= 10) return d.slice(5);
    return String(d ?? "");
  };

  const readGrad = "hostMonitorDiskIoReadGrad";
  const writeGrad = "hostMonitorDiskIoWriteGrad";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId={syncId}>
        <defs>
          <linearGradient id={readGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id={writeGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={trendTick} />
        <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={(v) => formatValue(v)} />
        <Tooltip
          formatter={(v, name) => [
            formatValue(v),
            name === "read" ? intl.get("hostMonitor.diskIoRead") : intl.get("hostMonitor.diskIoWrite"),
          ]}
          labelFormatter={(d) => d || ""}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Legend verticalAlign="top" align="right" iconType="plain" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="read" stroke="none" fill={`url(#${readGrad})`} isAnimationActive={false} connectNulls />
        <Line
          type="monotone"
          dataKey="read"
          name={intl.get("hostMonitor.diskIoRead")}
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
          connectNulls
        />
        <Area type="monotone" dataKey="write" stroke="none" fill={`url(#${writeGrad})`} isAnimationActive={false} connectNulls />
        <Line
          type="monotone"
          dataKey="write"
          name={intl.get("hostMonitor.diskIoWrite")}
          stroke="#0d9488"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
          connectNulls
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
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

function PieChart({
  data,
  colors: customColors,
  legendAlign = "center",
  legendFormatter,
  legendFontSize = 11,
  showSliceLabel = false,
  showOuterCalloutLabels = false,
  innerRadius = 35,
  outerRadius = 70,
  showLegend = true,
}) {
  const safeData = (data && data.length > 0) ? data : [{ name: '-', value: 1 }];
  const total = safeData.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const defaultColors = ['#3b5cf6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  const colors = customColors || defaultColors;

  if (total === 0) {
    return <p className="flex h-[200px] items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>;
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={safeData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={outerRadius}
            innerRadius={innerRadius}
            paddingAngle={2}
            labelLine={false}
            label={
              showOuterCalloutLabels
                ? ({ cx, cy, midAngle, outerRadius: r, fill, name }) => {
                    const rad = Math.PI / 180;
                    const sx = cx + (r + 2) * Math.cos(-midAngle * rad);
                    const sy = cy + (r + 2) * Math.sin(-midAngle * rad);
                    const mx = cx + (r + 16) * Math.cos(-midAngle * rad);
                    const my = cy + (r + 16) * Math.sin(-midAngle * rad);
                    const ex = mx + (Math.cos(-midAngle * rad) >= 0 ? 16 : -16);
                    const ey = my;
                    const textAnchor = ex >= cx ? "start" : "end";
                    return (
                      <g>
                        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" strokeWidth={1.25} />
                        <text x={ex + (textAnchor === "start" ? 4 : -4)} y={ey} textAnchor={textAnchor} dominantBaseline="central" fontSize={12} fill="#4b5563">
                          {name}
                        </text>
                      </g>
                    );
                  }
                : showSliceLabel
                ? ({ name, value }) => `${name} ${Number(value || 0).toFixed(0)}`
                : false
            }
          >
            {safeData.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => `${Number(v).toFixed(0)} (${(Number(v) / total * 100).toFixed(1)}%)`} />
          {showLegend ? (
            <Legend
              iconType="circle"
              iconSize={8}
              layout="vertical"
              verticalAlign="middle"
              align={legendAlign}
              wrapperStyle={{ fontSize: legendFontSize }}
              formatter={legendFormatter}
            />
          ) : null}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

const TOP_TABLE_DASH = "\u2014";

function fmtTopGb(n) {
  if (n == null || !Number.isFinite(Number(n))) return TOP_TABLE_DASH;
  return `${Number(n).toFixed(1)} GB`;
}

function fmtTopCores(n) {
  if (n == null || !Number.isFinite(Number(n))) return TOP_TABLE_DASH;
  return String(Math.round(Number(n)));
}

/**
 * @param {"cpu" | "memory" | "disk" | "simple"} variant
 * @param {(row: object) => void} [onRowClick] 点击行下钻主机详情（运行概览 Top10）
 */
function TopHostsTable({ data, metricLabel, valueFormatter = (v) => v.toFixed(1) + "%", maxRows = 10, variant = "simple", onRowClick }) {
  const colSpan = variant === "cpu" ? 5 : variant === "memory" || variant === "disk" ? 7 : 4;
  const rowInteractive = typeof onRowClick === "function";
  const metricBadgeClass = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
    if (n < 60) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300";
    if (n < 85) return "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300";
    return "bg-red-100 text-red-700 dark:bg-red-900/35 dark:text-red-300";
  };

  if (!data || data.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50/80 dark:bg-gray-800/50">
            <tr>
              <th className="w-8 px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">#</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.hostname")}</th>
              <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">OS</th>
              {variant === "cpu" ? (
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColCpuCores")}</th>
              ) : null}
              {variant === "memory" ? (
                <>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColMemTotal")}</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColMemUsed")}</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColMemFree")}</th>
                </>
              ) : null}
              {variant === "disk" ? (
                <>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColDiskTotal")}</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColDiskUsed")}</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColDiskFree")}</th>
                </>
              ) : null}
              <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{metricLabel}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={colSpan} className="px-3 py-4 text-center text-gray-400">
                {intl.get("hostMonitor.noData")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-gray-50/80 dark:bg-gray-800/50">
          <tr>
            <th className="w-8 px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">#</th>
            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.hostname")}</th>
            <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">OS</th>
            {variant === "cpu" ? (
              <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColCpuCores")}</th>
            ) : null}
            {variant === "memory" ? (
              <>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColMemTotal")}</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColMemUsed")}</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColMemFree")}</th>
              </>
            ) : null}
            {variant === "disk" ? (
              <>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColDiskTotal")}</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColDiskUsed")}</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.top10ColDiskFree")}</th>
              </>
            ) : null}
            <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-400">{metricLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.slice(0, maxRows).map((item, index) => (
            <tr
              key={item.hostname || item.name || index}
              onClick={rowInteractive ? () => onRowClick(item) : undefined}
              className={[
                rowInteractive
                  ? "cursor-pointer transition-colors hover:bg-primary-soft/50 dark:hover:bg-primary/10"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/30",
              ].join(" ")}
              {...(rowInteractive
                ? {
                    tabIndex: 0,
                    onKeyDown: (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(item);
                      }
                    },
                    "aria-label": intl.get("hostMonitor.top10RowOpenDetail", { host: item.name || item.hostname || "-" }),
                  }
                : {})}
            >
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{index + 1}</td>
              <td className="max-w-[140px] truncate px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{item.name || "-"}</td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{item.os || "-"}</td>
              {variant === "cpu" ? (
                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopCores(item.cpuCores)}</td>
              ) : null}
              {variant === "memory" ? (
                <>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopGb(item.memTotalGB)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopGb(item.memUsedGB)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopGb(item.memFreeGB)}</td>
                </>
              ) : null}
              {variant === "disk" ? (
                <>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopGb(item.diskTotalGB)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopGb(item.diskUsedGB)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtTopGb(item.diskFreeGB)}</td>
                </>
              ) : null}
              <td className="px-3 py-2 text-right">
                <span className={["inline-flex items-center rounded-md px-2 py-0.5 font-mono font-medium", metricBadgeClass(item.value)].join(" ")}>
                  {valueFormatter(item.value)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopList({ data, valueFormatter = (v) => v.toLocaleString() }) {
  if (!data || data.length === 0) return null;
  const maxValue = Math.max(...data.map(d => d.value));
  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((item, index) => (
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
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.value / maxValue) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const HONEYCOMB_MODES = [
  { id: "status", labelKey: "hostMonitor.healthHoneyModeStatus" },
  { id: "cpu", labelKey: "hostMonitor.healthHoneyModeCpu" },
  { id: "memory", labelKey: "hostMonitor.healthHoneyModeMemory" },
  { id: "disk", labelKey: "hostMonitor.healthHoneyModeDisk" },
];

function utilHeatFill(pct) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  if (p < 60) return "#22c55e";
  if (p < 85) return "#eab308";
  return "#ef4444";
}

function statusHoneyFill(status) {
  switch (status) {
    case "healthy":
      return "#10b981";
    case "warning":
      return "#f59e0b";
    case "critical":
      return "#ef4444";
    default:
      return "#9ca3af";
  }
}

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const ang = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`);
  }
  return pts.join(" ");
}

/** 蜂窝几何缩放（相对基准半径 17）；配合 SVG 的 max-height 限制，避免占满整列宽 */
const HONEYCOMB_VISUAL_SCALE = 0.3;

function honeycombLayout(count, maxCols = 14) {
  const r = 17 * HONEYCOMB_VISUAL_SCALE;
  if (count <= 0) {
    return { positions: [], viewBox: "0 0 120 80", r };
  }
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  let cols = Math.ceil(Math.sqrt(count * 1.2));
  cols = Math.max(1, Math.min(maxCols, cols));
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = r + dx * (col + 0.5 * (row % 2));
    const cy = r + dy * row;
    positions.push({ cx, cy, r });
  }
  const sqrt32 = Math.sqrt(3) / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.cx - sqrt32 * p.r);
    maxX = Math.max(maxX, p.cx + sqrt32 * p.r);
    minY = Math.min(minY, p.cy - p.r);
    maxY = Math.max(maxY, p.cy + p.r);
  }
  const pad = 10 * HONEYCOMB_VISUAL_SCALE;
  return {
    positions,
    viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
    r,
  };
}

function hostHoneyLabel(mode, host) {
  const name = String(host.hostname || host.name || "").trim() || "-";
  if (mode === "status") {
    const s = host.healthStatus;
    const label =
      s === "healthy"
        ? intl.get("hostMonitor.statusHealthy")
        : s === "warning"
          ? intl.get("hostMonitor.statusWarning")
          : s === "critical"
            ? intl.get("hostMonitor.statusCritical")
            : s || "-";
    return `${name}\n${label}`;
  }
  if (mode === "cpu") {
    const v = parseFloat(host.cpuUtilization);
    return `${name}\n${intl.get("hostMonitor.cpuUsage")}: ${Number.isFinite(v) ? v.toFixed(1) : "-"}%`;
  }
  if (mode === "memory") {
    const v = parseFloat(host.memoryUtilization);
    return `${name}\n${intl.get("hostMonitor.memoryUsage")}: ${Number.isFinite(v) ? v.toFixed(1) : "-"}%`;
  }
  const v = parseFloat(host.maxDiskUtilization);
  return `${name}\n${intl.get("hostMonitor.diskUsage")}: ${Number.isFinite(v) ? v.toFixed(1) : "-"}%`;
}

function hostHoneyMetricText(mode, host) {
  if (mode === "status") {
    const s = host.healthStatus;
    if (s === "healthy") return intl.get("hostMonitor.statusHealthy");
    if (s === "warning") return intl.get("hostMonitor.statusWarning");
    if (s === "critical") return intl.get("hostMonitor.statusCritical");
    return "-";
  }
  const v =
    mode === "cpu"
      ? parseFloat(host.cpuUtilization)
      : mode === "memory"
        ? parseFloat(host.memoryUtilization)
        : parseFloat(host.maxDiskUtilization);
  return Number.isFinite(v) ? `${v.toFixed(0)}%` : "-";
}

function hostHoneyFill(mode, host) {
  if (mode === "status") return statusHoneyFill(host.healthStatus);
  if (mode === "cpu") return utilHeatFill(host.cpuUtilization);
  if (mode === "memory") return utilHeatFill(host.memoryUtilization);
  return utilHeatFill(host.maxDiskUtilization);
}

/**
 * 主机健康蜂窝图：按状态或资源利用率着色，点击可下钻详情
 */
function HostHealthHoneycomb({ hosts, mode, onHostClick }) {
  const sorted = useMemo(() => {
    if (!hosts?.length) return [];
    return [...hosts].sort((a, b) =>
      String(a.hostname || a.name || "").localeCompare(String(b.hostname || b.name || ""), undefined, {
        numeric: true,
      }),
    );
  }, [hosts]);

  const { positions, viewBox } = useMemo(() => honeycombLayout(sorted.length), [sorted.length]);
  const legendItems = useMemo(() => {
    if (!sorted.length) return [];
    if (mode === "status") {
      const healthy = sorted.filter((h) => h.healthStatus === "healthy").length;
      const warning = sorted.filter((h) => h.healthStatus === "warning").length;
      const critical = sorted.filter((h) => h.healthStatus === "critical").length;
      return [
        { key: "healthy", color: statusHoneyFill("healthy"), label: intl.get("hostMonitor.statusHealthy"), count: healthy },
        { key: "warning", color: statusHoneyFill("warning"), label: intl.get("hostMonitor.statusWarning"), count: warning },
        { key: "critical", color: statusHoneyFill("critical"), label: intl.get("hostMonitor.statusCritical"), count: critical },
      ];
    }
    const pickUtil = (h) =>
      mode === "cpu" ? parseFloat(h.cpuUtilization) : mode === "memory" ? parseFloat(h.memoryUtilization) : parseFloat(h.maxDiskUtilization);
    let low = 0;
    let mid = 0;
    let high = 0;
    for (const h of sorted) {
      const n = pickUtil(h);
      if (!Number.isFinite(n)) continue;
      if (n < 70) low += 1;
      else if (n < 90) mid += 1;
      else high += 1;
    }
    return [
      { key: "low", color: utilHeatFill(30), label: intl.get("hostMonitor.healthHoneyLegendLow"), count: low },
      { key: "mid", color: utilHeatFill(72), label: intl.get("hostMonitor.healthHoneyLegendMid"), count: mid },
      { key: "high", color: utilHeatFill(92), label: intl.get("hostMonitor.healthHoneyLegendHigh"), count: high },
    ];
  }, [sorted, mode]);

  if (!sorted.length) {
    return (
      <p className="flex min-h-[100px] items-center justify-center text-xs text-gray-400">{intl.get("hostMonitor.noData")}</p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex w-32 shrink-0 justify-center">
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
          {legendItems.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              <span>{item.label}</span>
              <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 justify-center overflow-x-auto">
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="mx-auto block h-auto max-h-[200px] w-auto max-w-full"
          role="img"
          aria-label={intl.get("hostMonitor.healthHoneyTitle")}
        >
          {sorted.map((host, i) => {
            const p = positions[i];
            if (!p) return null;
            const fill = hostHoneyFill(mode, host);
            const pts = hexPoints(p.cx, p.cy, p.r);
            const label = hostHoneyLabel(mode, host);
            const metricText = hostHoneyMetricText(mode, host);
            const interactive = typeof onHostClick === "function";
            const sw = Math.max(0.22, p.r * 0.09);
            return (
              <g key={String(host.hostname || host.name || i)}>
                <polygon
                  points={pts}
                  fill={fill}
                  stroke="rgba(15,23,42,0.12)"
                  strokeWidth={sw}
                  className={[
                    interactive ? "cursor-pointer transition-opacity hover:opacity-90" : "",
                    "dark:stroke-white/15",
                  ].join(" ")}
                  onClick={interactive ? () => onHostClick(host) : undefined}
                  {...(interactive
                    ? {
                        tabIndex: 0,
                        onKeyDown: (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onHostClick(host);
                          }
                        },
                      }
                    : {})}
                >
                  <title>{label}</title>
                </polygon>
                <text
                  x={p.cx}
                  y={p.cy + p.r * 0.08}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.max(1.8, p.r * 0.42)}
                  fontWeight="700"
                  fill="rgba(255,255,255,0.92)"
                  pointerEvents="none"
                >
                  {metricText}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const TIME_RANGE_DEFS = [
  { value: "6h", hours: 6, labelKey: "hostMonitor.timeRange.6h" },
  { value: "12h", hours: 12, labelKey: "hostMonitor.timeRange.12h" },
  { value: "24h", hours: 24, labelKey: "hostMonitor.timeRange.24h" },
  { value: "72h", hours: 72, labelKey: "hostMonitor.timeRange.3d" },
  { value: "168h", hours: 168, labelKey: "hostMonitor.timeRange.7d" },
];

export default function HostMonitorOverview({ onHostClick, showHostTableSection = true }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedHours, setSelectedHours] = useState(24);
  const [top10Tab, setTop10Tab] = useState("cpu");
  /** 趋势区分组内主机过滤：null=全选；非空数组=仅所选；[]=全部取消（图表无主机） */
  const [trendHostSelection, setTrendHostSelection] = useState(null);
  const [trendHostFilterQuery, setTrendHostFilterQuery] = useState("");
  /** 资源趋势统计：split=按主机多线；merge=所选主机合并为单条（CPU/内存/磁盘为逐点平均，网络为逐点和） */
  const [trendStatMode, setTrendStatMode] = useState("merge");
  const [healthHoneyMode, setHealthHoneyMode] = useState("status");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/host-monitor/overview?hours=${selectedHours}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedHours]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, [fetchData]);

  useEffect(() => {
    setTrendHostSelection(null);
    setTrendHostFilterQuery("");
  }, [selectedHours]);

  const hostListForTopDrill = data?.hostList || [];

  const resolveHostFromTopRow = useCallback(
    (row) => {
      const hn = String(row.hostname || row.name || "").trim();
      if (!hn) return null;
      const found = hostListForTopDrill.find((h) => String(h.hostname || h.name || "").trim() === hn);
      return found || { hostname: hn, name: hn };
    },
    [hostListForTopDrill],
  );

  const handleTop10RowClick = useCallback(
    (row) => {
      if (!onHostClick) return;
      const host = resolveHostFromTopRow(row);
      if (host) onHostClick(host);
    },
    [onHostClick, resolveHostFromTopRow],
  );

  const top10RowClick = onHostClick ? handleTop10RowClick : undefined;

  const summary = data?.summary || {};
  const hostList = data?.hostList || [];
  const trends = data?.trends || {};
  const rankings = data?.rankings || {};

  const rawTimestamps = (trends.timestamps || []);
  const safeTs = rawTimestamps.length > 0 ? rawTimestamps : Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.now() - (23 - i) * 3600000);
    return d.toISOString();
  });

  function fmtTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return String(ts); }
  }

  function downsample(arr, maxPts = 60) {
    if (arr.length <= maxPts) return arr;
    const step = arr.length / maxPts;
    return Array.from({ length: maxPts }, (_, i) => arr[Math.floor(i * step)]);
  }

  const tsLabels = downsample(safeTs.map(fmtTs));
  const cpuRaw = (trends.cpu || []);
  const memRaw = (trends.memory || []);
  const diskRaw = (trends.disk || []);
  const netRaw = (trends.network || []);
  const diskIoRaw = trends.diskIo || [];

  const ensureTrendData = (raw, defaultVal, count, opts = {}) => {
    const padNull = opts.padMissingAsNull === true;
    const mk = () => (padNull ? { utilization: null } : { utilization: String(defaultVal) });
    const targetLen = count || tsLabels.length || 24;
    if (!raw || raw.length === 0) return Array.from({ length: targetLen }, mk);
    if (raw.length >= targetLen) return raw.slice(0, targetLen);
    return [...raw, ...Array.from({ length: targetLen - raw.length }, mk)];
  };

  const cpuTrendData = downsample(ensureTrendData(cpuRaw, 0, tsLabels.length)).map((d, i) => ({ time: tsLabels[i] || '', value: parseFloat(d.utilization) || 0 }));

  const cpuByHostRaw = trends.cpuByHost;
  const allTrendHostnames = useMemo(() => {
    if (!cpuByHostRaw || !Array.isArray(cpuByHostRaw) || cpuByHostRaw.length === 0) return [];
    return cpuByHostRaw.map((h) => h.hostname).filter(Boolean);
  }, [cpuByHostRaw]);
  const effectiveTrendHostnames = (() => {
    if (allTrendHostnames.length === 0) return [];
    if (trendHostSelection === null) return allTrendHostnames;
    return allTrendHostnames.filter((h) => trendHostSelection.includes(h));
  })();

  const trendChartsShowEmpty = trendStatMode === "split" && allTrendHostnames.length > 0 && effectiveTrendHostnames.length === 0;

  // 主机集合变化（如 mock -> Doris）时，纠正残留筛选，避免趋势图整组“无数据”
  useEffect(() => {
    setTrendHostSelection((prev) => {
      if (prev === null) return prev;
      if (!Array.isArray(prev)) return null;
      if (allTrendHostnames.length === 0) return null;
      const next = prev.filter((hn) => allTrendHostnames.includes(hn));
      if (next.length === 0 || next.length === allTrendHostnames.length) return null;
      if (next.length === prev.length && next.every((hn, idx) => hn === prev[idx])) return prev;
      return next;
    });
  }, [allTrendHostnames]);

  const filteredHostsForPicklist = allTrendHostnames.filter((hn) => {
    const q = trendHostFilterQuery.trim().toLowerCase();
    if (!q) return true;
    return hn.toLowerCase().includes(q);
  });

  const buildUtilMultiLineFromByHost = (raw, opts = {}) => {
    if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
    const hostnames = effectiveTrendHostnames.filter((hn) => raw.some((r) => r.hostname === hn));
    if (hostnames.length === 0) return null;
    const n = safeTs.length;
    const perHostDown = hostnames.map((hn) => {
      const h = raw.find((r) => r.hostname === hn);
      const arr = ensureTrendData(h?.data, 0, n, opts);
      return { hostname: hn, pts: downsample(arr) };
    });
    const timeRow = downsample(safeTs.map(fmtTs));
    const len = Math.min(timeRow.length, ...perHostDown.map((p) => p.pts.length));
    if (len === 0) return null;
    const rows = Array.from({ length: len }, (_, i) => {
      const pt = { time: timeRow[i] || "" };
      for (const ph of perHostDown) {
        const u = ph.pts[i]?.utilization;
        if (u == null || u === "") pt[ph.hostname] = null;
        else {
          const utilNum = parseFloat(u);
          pt[ph.hostname] = Number.isFinite(utilNum) ? utilNum : null;
        }
      }
      return pt;
    });
    return { hostnames, rows };
  };

  const cpuByHostChart = buildUtilMultiLineFromByHost(cpuByHostRaw, { padMissingAsNull: true });

  const memoryByHostRaw = trends.memoryByHost;
  const diskByHostRaw = trends.diskByHost;
  const memoryByHostChart = buildUtilMultiLineFromByHost(memoryByHostRaw, { padMissingAsNull: true });
  const diskByHostChart = buildUtilMultiLineFromByHost(diskByHostRaw, { padMissingAsNull: true });

  const buildMergedUtilLineFromByHost = (raw, opts = {}) => {
    if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
    const hns = effectiveTrendHostnames.filter((hn) => raw.some((r) => r.hostname === hn));
    if (hns.length === 0) return null;
    const n = safeTs.length;
    const perHostDown = hns.map((hn) => {
      const h = raw.find((r) => r.hostname === hn);
      const arr = ensureTrendData(h?.data, 0, n, opts);
      return { pts: downsample(arr) };
    });
    const timeRow = downsample(safeTs.map(fmtTs));
    const len = Math.min(timeRow.length, ...perHostDown.map((p) => p.pts.length));
    if (len === 0) return null;
    let hasAnyPoint = false;
    const rows = Array.from({ length: len }, (_, i) => {
      let sum = 0;
      let present = 0;
      for (const ph of perHostDown) {
        const u = ph.pts[i]?.utilization;
        if (u == null || u === "") continue;
        const utilNum = parseFloat(u);
        if (!Number.isFinite(utilNum)) continue;
        sum += utilNum;
        present += 1;
      }
      if (present > 0) hasAnyPoint = true;
      return { time: timeRow[i] || "", value: present ? sum / present : 0 };
    });
    // 若按主机序列没有任何有效点，回退到总趋势，避免整图被 0 覆盖
    if (!hasAnyPoint) return null;
    return rows;
  };

  const cpuMergedLine = buildMergedUtilLineFromByHost(cpuByHostRaw, { padMissingAsNull: true });
  const memMergedLine = buildMergedUtilLineFromByHost(memoryByHostRaw, { padMissingAsNull: true });
  const diskMergedLine = buildMergedUtilLineFromByHost(diskByHostRaw, { padMissingAsNull: true });

  const memTrendData = downsample(ensureTrendData(memRaw, 0, tsLabels.length)).map((d, i) => {
    const util = parseFloat(d?.utilization);
    if (Number.isFinite(util)) return { time: tsLabels[i] || "", value: util };
    const used = parseFloat(d?.usedGB);
    const free = parseFloat(d?.freeGB);
    const total = (Number.isFinite(used) ? used : 0) + (Number.isFinite(free) ? free : 0);
    return { time: tsLabels[i] || "", value: total > 0 ? (used / total) * 100 : 0 };
  });
  const diskTrendData = downsample(ensureTrendData(diskRaw, 0, tsLabels.length)).map((d, i) => ({ time: tsLabels[i] || '', value: parseFloat(d.utilization) || 0 }));

  const networkByHostRaw = trends.networkByHost;
  const diskIoByHostRaw = trends.diskIoByHost;
  const netDualData = (() => {
    if (networkByHostRaw && Array.isArray(networkByHostRaw) && networkByHostRaw.length > 0) {
      const hnList = effectiveTrendHostnames.filter((hn) => networkByHostRaw.some((r) => r.hostname === hn));
      if (hnList.length > 0) {
        const n = safeTs.length;
        const perHost = hnList.map((hn) => {
          const h = networkByHostRaw.find((r) => r.hostname === hn);
          const arr =
            h?.data && h.data.length > 0
              ? h.data
              : Array.from({ length: n }, () => ({ receiveMB: "0", transmitMB: "0" }));
          const padded =
            arr.length >= n
              ? arr.slice(0, n)
              : [...arr, ...Array.from({ length: n - arr.length }, () => ({ receiveMB: "0", transmitMB: "0" }))];
          return downsample(padded).map((p) => ({
            receive: parseFloat(p.receiveMB) || 0,
            transmit: parseFloat(p.transmitMB) || 0,
          }));
        });
        const timeRow = downsample(safeTs.map(fmtTs));
        const len = Math.min(timeRow.length, ...perHost.map((p) => p.length));
        if (len > 0) {
          return Array.from({ length: len }, (_, i) => {
            let receive = 0;
            let transmit = 0;
            for (const ph of perHost) {
              receive += ph[i]?.receive || 0;
              transmit += ph[i]?.transmit || 0;
            }
            return { time: timeRow[i] || "", receive, transmit };
          });
        }
      }
    }
    const netDualDataRaw = netRaw && netRaw.length > 0 ? netRaw : Array.from({ length: tsLabels.length || 24 }, () => ({ receiveMB: "0", transmitMB: "0" }));
    return downsample(netDualDataRaw).map((d, i) => ({
      time: tsLabels[i] || "",
      receive: parseFloat(d.receiveMB) || 0,
      transmit: parseFloat(d.transmitMB) || 0,
    }));
  })();

  const netReceiveLine = netDualData.map((d) => ({ time: d.time, value: d.receive }));
  const netTransmitLine = netDualData.map((d) => ({ time: d.time, value: d.transmit }));

  const buildNetworkMultiLine = (selector) => {
    if (!networkByHostRaw || !Array.isArray(networkByHostRaw) || networkByHostRaw.length === 0) return null;
    const hostnames = effectiveTrendHostnames.filter((hn) => networkByHostRaw.some((r) => r.hostname === hn));
    if (hostnames.length === 0) return null;
    const n = safeTs.length;
    const perHostDown = hostnames.map((hn) => {
      const h = networkByHostRaw.find((r) => r.hostname === hn);
      const arr =
        h?.data && h.data.length > 0
          ? h.data
          : Array.from({ length: n }, () => ({ receiveMB: "0", transmitMB: "0" }));
      const padded =
        arr.length >= n
          ? arr.slice(0, n)
          : [...arr, ...Array.from({ length: n - arr.length }, () => ({ receiveMB: "0", transmitMB: "0" }))];
      return { hostname: hn, pts: downsample(padded) };
    });
    const timeRow = downsample(safeTs.map(fmtTs));
    const len = Math.min(timeRow.length, ...perHostDown.map((p) => p.pts.length));
    if (len === 0) return null;
    const rows = Array.from({ length: len }, (_, i) => {
      const row = { time: timeRow[i] || "" };
      for (const ph of perHostDown) row[ph.hostname] = selector(ph.pts[i]);
      return row;
    });
    return { hostnames, rows };
  };

  const netReceiveByHostChart = buildNetworkMultiLine((pt) => parseFloat(pt?.receiveMB) || 0);
  const netTransmitByHostChart = buildNetworkMultiLine((pt) => parseFloat(pt?.transmitMB) || 0);

  const diskIoDualData = (() => {
    if (diskIoByHostRaw && Array.isArray(diskIoByHostRaw) && diskIoByHostRaw.length > 0) {
      const hnList = effectiveTrendHostnames.filter((hn) => diskIoByHostRaw.some((r) => r.hostname === hn));
      if (hnList.length > 0) {
        const n = safeTs.length;
        const perHost = hnList.map((hn) => {
          const h = diskIoByHostRaw.find((r) => r.hostname === hn);
          const arr =
            h?.data && h.data.length > 0
              ? h.data
              : Array.from({ length: n }, () => ({ readMB: "0", writeMB: "0" }));
          const padded =
            arr.length >= n
              ? arr.slice(0, n)
              : [...arr, ...Array.from({ length: n - arr.length }, () => ({ readMB: "0", writeMB: "0" }))];
          return downsample(padded).map((p) => ({
            read: parseFloat(p.readMB) || 0,
            write: parseFloat(p.writeMB) || 0,
          }));
        });
        const timeRow = downsample(safeTs.map(fmtTs));
        const len = Math.min(timeRow.length, ...perHost.map((p) => p.length));
        if (len > 0) {
          return Array.from({ length: len }, (_, i) => {
            let read = 0;
            let write = 0;
            for (const ph of perHost) {
              read += ph[i]?.read || 0;
              write += ph[i]?.write || 0;
            }
            return { time: timeRow[i] || "", read, write };
          });
        }
      }
    }
    const raw =
      diskIoRaw && diskIoRaw.length > 0
        ? diskIoRaw
        : Array.from({ length: safeTs.length || tsLabels.length || 24 }, () => ({ readMB: "0", writeMB: "0" }));
    return downsample(raw).map((d, i) => ({
      time: tsLabels[i] || "",
      read: parseFloat(d.readMB) || 0,
      write: parseFloat(d.writeMB) || 0,
    }));
  })();

  const diskIoByHostChart = (() => {
    if (!diskIoByHostRaw || !Array.isArray(diskIoByHostRaw) || diskIoByHostRaw.length === 0) return null;
    const hostnames = effectiveTrendHostnames.filter((hn) => diskIoByHostRaw.some((r) => r.hostname === hn));
    if (hostnames.length === 0) return null;
    const n = safeTs.length;
    const perHostDown = hostnames.map((hn) => {
      const h = diskIoByHostRaw.find((r) => r.hostname === hn);
      const arr =
        h?.data && h.data.length > 0
          ? h.data
          : Array.from({ length: n }, () => ({ readMB: "0", writeMB: "0" }));
      const padded =
        arr.length >= n
          ? arr.slice(0, n)
          : [...arr, ...Array.from({ length: n - arr.length }, () => ({ readMB: "0", writeMB: "0" }))];
      return { hostname: hn, pts: downsample(padded) };
    });
    const timeRow = downsample(safeTs.map(fmtTs));
    const len = Math.min(timeRow.length, ...perHostDown.map((p) => p.pts.length));
    if (len === 0) return null;
    const rows = Array.from({ length: len }, (_, i) => {
      const row = { time: timeRow[i] || "" };
      for (const ph of perHostDown) {
        const read = parseFloat(ph.pts[i]?.readMB) || 0;
        const write = parseFloat(ph.pts[i]?.writeMB) || 0;
        row[ph.hostname] = read + write;
      }
      return row;
    });
    return { hostnames, rows };
  })();

  /** 各时间点在线/离线主机数（堆叠柱状图；有 per-host CPU 时按桶内是否有上报统计，无则整段视为在线） */
  const onlineStatusBarData = (() => {
    if (trendChartsShowEmpty) return [];
    if (cpuByHostRaw && Array.isArray(cpuByHostRaw) && cpuByHostRaw.length > 0) {
      const hns = effectiveTrendHostnames.filter((hn) => cpuByHostRaw.some((r) => r.hostname === hn));
      if (hns.length === 0) return [];
      const n = safeTs.length;
      const padCpuSeries = (h) => {
        const arr = h?.data && Array.isArray(h.data) ? h.data : [];
        const padded =
          arr.length >= n
            ? arr.slice(0, n)
            : [...arr, ...Array.from({ length: n - arr.length }, () => ({ utilization: null }))];
        return downsample(padded);
      };
      const perHostPts = hns.map((hn) => {
        const h = cpuByHostRaw.find((r) => r.hostname === hn);
        return padCpuSeries(h);
      });
      const timeRow = downsample(safeTs.map(fmtTs));
      const len = Math.min(timeRow.length, ...perHostPts.map((p) => p.length));
      if (len === 0) return [];
      const total = hns.length;
      return Array.from({ length: len }, (_, i) => {
        let online = 0;
        for (const pts of perHostPts) {
          const u = pts[i]?.utilization;
          if (u != null && u !== "" && Number.isFinite(parseFloat(u))) online += 1;
        }
        return { time: timeRow[i] || "", online, offline: Math.max(0, total - online) };
      });
    }
    const total = Number(summary.totalHosts) || (hostList && hostList.length) || 0;
    return downsample(safeTs.map(fmtTs)).map((t) => ({ time: t || "", online: total, offline: 0 }));
  })();

  const trendHostCheckboxChecked = (hostname) =>
    trendHostSelection === null || (Array.isArray(trendHostSelection) && trendHostSelection.includes(hostname));

  const trendStatSplit = trendStatMode === "split";

  const toggleTrendHost = (hostname) => {
    setTrendHostSelection((prev) => {
      const all = allTrendHostnames;
      if (all.length === 0) return prev;
      if (prev === null) {
        return all.filter((h) => h !== hostname);
      }
      if (prev.length === 0) {
        return [hostname];
      }
      if (prev.includes(hostname)) {
        return prev.filter((h) => h !== hostname);
      }
      const next = [...prev, hostname];
      return next.length === all.length ? null : next;
    });
  };

  const healthDist = [
    { name: intl.get("hostMonitor.statusHealthy"), value: Number(summary.healthyHosts) || 0 },
    { name: intl.get("hostMonitor.statusWarning"), value: Number(summary.warningHosts) || 0 },
    { name: intl.get("hostMonitor.statusCritical"), value: Number(summary.criticalHosts) || 0 },
  ];
  const healthDistColors = ["#10b981", "#f59e0b", "#ef4444"];

  const osDist = [];
  const osMap = {};
  (hostList || []).forEach(h => {
    const key = h.osType || 'unknown';
    osMap[key] = (osMap[key] || 0) + 1;
  });
  Object.entries(osMap).forEach(([k, v]) => osDist.push({ name: k, value: v }));
  if (osDist.length === 0) osDist.push({ name: '-', value: 1 });

  const hostOsMap = {};
  const hostNameMap = {};
  (hostList || []).forEach(h => {
    if (h.hostname) {
      hostOsMap[h.hostname] = h.osType || 'linux';
      hostNameMap[h.hostname] = h.hostname;
    }
  });
  const firstHostName = (hostList && hostList.length > 0 && hostList[0].hostname) ? hostList[0].hostname : 'unknown';

  const enrichTopRankings = (raw, fallback, kind) => {
    const arr = raw && raw.length > 0 ? raw : fallback;
    return arr.map((r) => {
      const rawName = r.hostname || r.name || "";
      const resolvedName = rawName && rawName !== "unknown" && rawName !== "null" ? rawName : firstHostName;
      const base = {
        name: resolvedName,
        hostname: resolvedName,
        os: r.osType || hostOsMap[resolvedName] || "linux",
        value: parseFloat(r.value) || 0,
      };
      if (kind === "cpu") {
        const c = r.cpuCores;
        return {
          ...base,
          cpuCores: c != null && c !== "" && Number.isFinite(Number(c)) ? Number(c) : null,
        };
      }
      if (kind === "memory") {
        const t = parseFloat(r.totalGB ?? r.totalgb);
        const u = parseFloat(r.usedGB ?? r.usedgb);
        const f = parseFloat(r.freeGB ?? r.freegb);
        const memFree = Number.isFinite(f) ? f : Number.isFinite(t) && Number.isFinite(u) ? Math.max(0, t - u) : null;
        return {
          ...base,
          memTotalGB: Number.isFinite(t) ? t : null,
          memUsedGB: Number.isFinite(u) ? u : null,
          memFreeGB: memFree,
        };
      }
      if (kind === "disk") {
        const t = parseFloat(r.totalGB ?? r.totalgb);
        const u = parseFloat(r.usedGB ?? r.usedgb);
        const f = parseFloat(r.freeGB ?? r.freegb);
        const diskFree = Number.isFinite(f) ? f : Number.isFinite(t) && Number.isFinite(u) ? Math.max(0, t - u) : null;
        return {
          ...base,
          diskTotalGB: Number.isFinite(t) ? t : null,
          diskUsedGB: Number.isFinite(u) ? u : null,
          diskFreeGB: diskFree,
        };
      }
      return base;
    });
  };

  const fbCpu = [{ hostname: firstHostName, value: 0, osType: "-", cpuCores: null }];
  const fbMem = [{ hostname: firstHostName, value: 0, osType: "-", usedGB: "0", totalGB: "0", freeGB: "0" }];
  const fbDisk = [{ hostname: firstHostName, value: 0, osType: "-", usedGB: null, totalGB: null, freeGB: null }];

  const topCpu = enrichTopRankings(rankings.cpu, fbCpu, "cpu");
  const topMem = enrichTopRankings(rankings.memory, fbMem, "memory");
  const topDisk = enrichTopRankings(rankings.diskIo || rankings.disk, fbDisk, "disk");

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
          <span className="text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">{intl.get("hostMonitor.loadError")}</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
              <button type="button" onClick={fetchData}
                className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 underline dark:text-red-300 dark:hover:text-red-200">
                {intl.get("common.retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工具栏：时间范围 + 刷新 (对齐 OtelOverview 样式) */}
      <div className="app-card flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.timeRange")}</span>
          <div className="flex gap-1.5">
            {TIME_RANGE_DEFS.map((range) => (
              <button key={range.value} type="button" onClick={() => setSelectedHours(range.hours)}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  selectedHours === range.hours
                    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                ].join(" ")}
              >
                {intl.get(range.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-6">
          <button type="button" onClick={fetchData} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
            <Icon name="refresh" className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
            {intl.get("hostMonitor.refresh")}
          </button>

          <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.lastUpdate")}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "-"}</span>
        </div>
      </div>

      {/* KPI 卡片行 1：核心指标 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="server" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.totalHosts")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.totalHosts || 0}</span>
                <span className="text-[11px] text-gray-400">{intl.get("hostMonitor.hostsUnit")}</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>{intl.get("hostMonitor.healthyCount", { count: summary.healthyHosts || 0 })}</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>{intl.get("hostMonitor.warningCount", { count: summary.warningHosts || 0 })}</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>{intl.get("hostMonitor.criticalCount", { count: summary.criticalHosts || 0 })}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Icon name="cpu" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.avgCpuUtil")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.avgCpuUtilization || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(summary.avgCpuUtilization || 0, 100)}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Icon name="memory" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.avgMemUtil")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.avgMemoryUtilization || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(summary.avgMemoryUtilization || 0, 100)}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
              <Icon name="hard-drive" className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.maxDiskUtil")}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">{summary.maxDiskUtilization || 0}%</span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${Math.min(summary.maxDiskUtilization || 0, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* 主机在线状态趋势：独立于「资源趋势」卡片组，置于 KPI 下方 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartOnlineTrend")}</h3>
        <div className="mt-3 h-52">
          {trendChartsShowEmpty ? <TrendChartHostEmpty /> : <OnlineStatusStackedBarChart data={onlineStatusBarData} />}
        </div>
      </div>

      {/* 主机健康蜂窝图 + 健康状态分布：并列一行，位于在线趋势之下 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white px-4 pb-3 pt-3 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.healthHoneyTitle")}</h3>
            </div>
            <div
              className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 dark:border-gray-600 dark:bg-gray-800/60"
              role="tablist"
              aria-label={intl.get("hostMonitor.healthHoneyModeAria")}
            >
              {HONEYCOMB_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={healthHoneyMode === m.id}
                  onClick={() => setHealthHoneyMode(m.id)}
                  className={[
                    "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    healthHoneyMode === m.id
                      ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700"
                      : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200",
                  ].join(" ")}
                >
                  {intl.get(m.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
            <HostHealthHoneycomb hosts={hostList} mode={healthHoneyMode} onHostClick={onHostClick} />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.chartHealthDist")}</h3>
          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/40 p-3 dark:border-gray-800 dark:bg-gray-900/30">
            <div className="flex min-h-[220px] flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="w-full shrink-0 lg:w-36 lg:self-stretch lg:border-r lg:border-gray-200 lg:pr-3 dark:lg:border-gray-700">
                <div className="flex h-full flex-col justify-center gap-2.5 text-[13px] text-gray-700 dark:text-gray-200">
                {healthDist.map((item, idx) => (
                  <div key={item.name} className="inline-flex w-fit items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 ring-1 ring-gray-100 dark:bg-gray-900/60 dark:ring-gray-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: healthDistColors[idx % healthDistColors.length] }} />
                    <span className="leading-none">{`${item.name}：${item.value}`}</span>
                  </div>
                ))}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <PieChart
                  data={healthDist}
                  colors={healthDistColors}
                  showLegend={false}
                  showOuterCalloutLabels
                  innerRadius={0}
                  outerRadius={70}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 趋势图：四宫格 + 统计模式 + 主机过滤（单卡片分组） */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.trendCardGroupTitle")}</h3>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div
              className="inline-flex rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 dark:border-gray-600 dark:bg-gray-800/60"
              role="group"
              aria-label={intl.get("hostMonitor.trendStatModeAria")}
            >
              <button
                type="button"
                onClick={() => setTrendStatMode("split")}
                className={[
                  "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  trendStatSplit
                    ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200",
                ].join(" ")}
              >
                {intl.get("hostMonitor.trendStatModeSplit")}
              </button>
              <button
                type="button"
                onClick={() => setTrendStatMode("merge")}
                className={[
                  "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  !trendStatSplit
                    ? "bg-white text-primary shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-gray-700"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200",
                ].join(" ")}
              >
                {intl.get("hostMonitor.trendStatModeMerge")}
              </button>
            </div>
            {allTrendHostnames.length > 0 ? (
              <details className="group relative">
                <summary className="cursor-pointer list-none rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="filterInclude" className="h-3.5 w-3.5 text-gray-500" />
                    {intl.get("hostMonitor.trendHostFilter")}
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-normal text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-600">
                      {trendHostSelection === null
                        ? intl.get("hostMonitor.trendHostFilterAll")
                        : trendHostSelection.length === 0
                          ? intl.get("hostMonitor.trendHostFilterNone")
                          : intl.get("hostMonitor.trendHostFilterCount", { count: trendHostSelection.length })}
                    </span>
                  </span>
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-[min(100vw-2rem,22rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <div className="mb-2 flex flex-col gap-2">
                    <div className="relative">
                      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={trendHostFilterQuery}
                        onChange={(e) => setTrendHostFilterQuery(e.target.value)}
                        placeholder={intl.get("hostMonitor.trendHostSearchPlaceholder")}
                        className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTrendHostSelection(null)}
                        className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/15"
                      >
                        {intl.get("hostMonitor.trendHostFilterSelectAll")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrendHostSelection([])}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {intl.get("hostMonitor.trendHostFilterDeselectAll")}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {filteredHostsForPicklist.length === 0 ? (
                      <p className="py-2 text-center text-[11px] text-gray-400">{intl.get("hostMonitor.trendHostSearchNoMatch")}</p>
                    ) : (
                      filteredHostsForPicklist.map((hn) => (
                        <label
                          key={hn}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/80"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary dark:border-gray-600"
                            checked={trendHostCheckboxChecked(hn)}
                            onChange={() => toggleTrendHost(hn)}
                          />
                          <span className="truncate font-mono text-gray-800 dark:text-gray-200">{hn}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {trendStatSplit
                ? cpuByHostChart
                  ? intl.get("hostMonitor.chartCpuTrendByHost")
                  : intl.get("hostMonitor.chartCpuTrend")
                : intl.get("hostMonitor.chartCpuTrendMerge")}
            </h4>
            <div className="mt-2 h-52">
              {trendChartsShowEmpty ? (
                <TrendChartHostEmpty />
              ) : trendStatSplit ? (
                cpuByHostChart ? (
                  <MultiLineCpuChart data={cpuByHostChart.rows} hostnames={cpuByHostChart.hostnames} syncId="overview-resource-trend-sync" />
                ) : (
                  <LineChart data={cpuTrendData} color="#8b5cf6" yMax={100} syncId="overview-resource-trend-sync" />
                )
              ) : (
                <LineChart data={cpuMergedLine || cpuTrendData} color="#8b5cf6" yMax={100} syncId="overview-resource-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {trendStatSplit ? intl.get("hostMonitor.chartMemoryTrend") : intl.get("hostMonitor.chartMemoryTrendMerge")}
            </h4>
            <div className="mt-2 h-52">
              {trendChartsShowEmpty ? (
                <TrendChartHostEmpty />
              ) : trendStatSplit ? (
                memoryByHostChart ? (
                  <MultiLineCpuChart data={memoryByHostChart.rows} hostnames={memoryByHostChart.hostnames} syncId="overview-resource-trend-sync" />
                ) : (
                  <LineChart data={memTrendData} color="#3b82f6" yMax={100} syncId="overview-resource-trend-sync" />
                )
              ) : (
                <LineChart data={memMergedLine || memTrendData} color="#3b82f6" yMax={100} syncId="overview-resource-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {trendStatSplit ? intl.get("hostMonitor.chartDiskTrend") : intl.get("hostMonitor.chartDiskTrendMerge")}
            </h4>
            <div className="mt-2 h-52">
              {trendChartsShowEmpty ? (
                <TrendChartHostEmpty />
              ) : trendStatSplit ? (
                diskByHostChart ? (
                  <MultiLineCpuChart data={diskByHostChart.rows} hostnames={diskByHostChart.hostnames} syncId="overview-resource-trend-sync" />
                ) : (
                  <LineChart data={diskTrendData} color="#f97316" yMax={100} syncId="overview-resource-trend-sync" />
                )
              ) : (
                <LineChart data={diskMergedLine || diskTrendData} color="#f97316" yMax={100} syncId="overview-resource-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {trendStatSplit ? intl.get("hostMonitor.chartDiskIoTrendByHost") : intl.get("hostMonitor.chartDiskIoTrend")}
            </h4>
            <div className="mt-2 h-52">
              {trendStatSplit ? (
                diskIoByHostChart ? (
                  <MultiLineMetricChart data={diskIoByHostChart.rows} hostnames={diskIoByHostChart.hostnames} syncId="overview-resource-trend-sync" />
                ) : (
                  <DiskIoDualChart data={diskIoDualData} syncId="overview-resource-trend-sync" />
                )
              ) : (
                <DiskIoDualChart data={diskIoDualData} syncId="overview-resource-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{intl.get("hostMonitor.chartNetworkInbound")}</h4>
            <div className="mt-2 h-52">
              {trendStatSplit ? (
                netReceiveByHostChart ? (
                  <MultiLineMetricChart data={netReceiveByHostChart.rows} hostnames={netReceiveByHostChart.hostnames} syncId="overview-resource-trend-sync" />
                ) : (
                  <LineChart data={netReceiveLine} color="#06b6d4" syncId="overview-resource-trend-sync" />
                )
              ) : (
                <LineChart data={netReceiveLine} color="#06b6d4" syncId="overview-resource-trend-sync" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100/80 bg-gray-50/30 p-3 dark:border-gray-800/80 dark:bg-gray-950/20">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{intl.get("hostMonitor.chartNetworkOutbound")}</h4>
            <div className="mt-2 h-52">
              {trendStatSplit ? (
                netTransmitByHostChart ? (
                  <MultiLineMetricChart data={netTransmitByHostChart.rows} hostnames={netTransmitByHostChart.hostnames} syncId="overview-resource-trend-sync" />
                ) : (
                  <LineChart data={netTransmitLine} color="#8b5cf6" syncId="overview-resource-trend-sync" />
                )
              ) : (
                <LineChart data={netTransmitLine} color="#8b5cf6" syncId="overview-resource-trend-sync" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top10 分析：CPU / 内存 / 磁盘利用率 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] dark:border-gray-800 dark:bg-gray-900/60 dark:ring-white/[0.05]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("hostMonitor.top10AnalysisTitle")}</h3>
        <nav className="mt-3 flex flex-wrap gap-1 border-b border-gray-100 dark:border-gray-800" role="tablist" aria-label={intl.get("hostMonitor.top10AnalysisTitle")}>
          {[
            { id: "cpu", labelKey: "hostMonitor.top10TabCpu" },
            { id: "memory", labelKey: "hostMonitor.top10TabMemory" },
            { id: "disk", labelKey: "hostMonitor.top10TabDisk" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={top10Tab === tab.id}
              onClick={() => setTop10Tab(tab.id)}
              className={[
                "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px",
                top10Tab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
        <div className="mt-4" role="tabpanel">
          {top10Tab === "cpu" ? (
            <TopHostsTable
              variant="cpu"
              data={topCpu}
              metricLabel={intl.get("hostMonitor.cpuUsage")}
              valueFormatter={(v) => v.toFixed(1) + "%"}
              maxRows={10}
              onRowClick={top10RowClick}
            />
          ) : null}
          {top10Tab === "memory" ? (
            <TopHostsTable
              variant="memory"
              data={topMem}
              metricLabel={intl.get("hostMonitor.memoryUsage")}
              valueFormatter={(v) => v.toFixed(1) + "%"}
              maxRows={10}
              onRowClick={top10RowClick}
            />
          ) : null}
          {top10Tab === "disk" ? (
            <TopHostsTable
              variant="disk"
              data={topDisk}
              metricLabel={intl.get("hostMonitor.diskUtilization")}
              valueFormatter={(v) => v.toFixed(1) + "%"}
              maxRows={10}
              onRowClick={top10RowClick}
            />
          ) : null}
        </div>
      </div>

      {showHostTableSection ? (
        <div className="app-card p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-emerald-600 dark:text-emerald-400">{intl.get("hostMonitor.hostHealthyCount", { count: hostList.filter(h => h.healthStatus === 'healthy').length })}</span>
            </div>
          </div>

          <HostMonitorHostTable hosts={hostList} onRowClick={onHostClick} />
        </div>
      ) : null}
    </div>
  );
}
