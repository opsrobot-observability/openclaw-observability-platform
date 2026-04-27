import { useState, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}

function getStatusColor(status) {
  switch (status) {
    case "healthy":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning":
      return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "critical":
      return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/40 dark:text-red-300";
    default:
      return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400";
  }
}

function getStatusLabel(status) {
  switch (status) {
    case "healthy": return intl.get("hostMonitor.statusHealthy");
    case "warning": return intl.get("hostMonitor.statusWarning");
    case "critical": return intl.get("hostMonitor.statusCritical");
    default: return status;
  }
}

export default function HostMonitor({ hostname, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [hours, setHours] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ hours });
      if (hostname) params.set('hostname', hostname);
      const res = await fetch(`/api/host-monitor?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [hours, hostname]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000); // 30秒自动刷新
    return () => clearInterval(timer);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{intl.get("common.error")}: {error}</p>
          <button
            onClick={fetchData}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            {intl.get("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const cpu = data?.cpu || {};
  const memory = data?.memory || {};
  const disks = data?.disks || [];
  const networks = data?.networks || [];
  const processes = data?.processes || {};
  const hostInfo = data?.hostInfo || {};

  return (
    <div className="space-y-6">
      {/* 头部信息栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 transition-colors">
              <Icon name="arrow-left" className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Icon name="monitor" className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {hostname ? `${intl.get("hostMonitor.detailTitle")} - ${hostname}` : intl.get("hostMonitor.title")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {hostInfo.name} ({hostInfo.osType}/{hostInfo.arch})
              {data?.dataTimestamp && ` · ${new Date(data.dataTimestamp).toLocaleString()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 时间范围选择 */}
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value={1}>1 {intl.get("hostMonitor.hour")}</option>
            <option value={6}>6 {intl.get("hostMonitor.hours")}</option>
            <option value={24}>24 {intl.get("hostMonitor.hours")}</option>
          </select>

          {/* 健康状态 */}
          <span className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${getStatusColor(data?.healthStatus)}`}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
              data?.healthStatus === 'healthy' ? 'bg-emerald-500' :
              data?.healthStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            {getStatusLabel(data?.healthStatus)}
          </span>

          {/* 刷新按钮 */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <Icon name="refresh" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 告警提示 */}
      {data?.alerts?.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/60 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <Icon name="alert-triangle" className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <h3 className="font-medium text-red-900 dark:text-red-200">{intl.get("hostMonitor.alertsTitle")}</h3>
              <ul className="mt-2 space-y-1">
                {data.alerts.map((alert, idx) => (
                  <li key={idx} className="text-sm text-red-700 dark:text-red-300">
                    [{alert.severity.toUpperCase()}] {alert.message} (当前值: {alert.currentValue}%)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* KPI 概览卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CPU 使用率 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                <Icon name="cpu" className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.cpuUsage")}</span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">CPU</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.avgCpuUtilization}%</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(summary.avgCpuUtilization, 100)}%`,
                  backgroundColor: summary.avgCpuUtilization > 80 ? '#ef4444' : summary.avgCpuUtilization > 60 ? '#f59e0b' : '#10b981'
                }}
              />
            </div>
          </div>
        </div>

        {/* 内存使用率 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Icon name="memory" className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.memoryUsage")}</span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">MEM</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.avgMemoryUtilization}%</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {memory.formatted?.used} / {memory.formatted?.total}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(summary.avgMemoryUtilization, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 磁盘使用率 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                <Icon name="hard-drive" className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.diskUsage")}</span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">DISK</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.maxDiskUtilization}%</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(summary.maxDiskUtilization, 100)}%`,
                  backgroundColor: summary.maxDiskUtilization > 85 ? '#ef4444' : summary.maxDiskUtilization > 70 ? '#f59e0b' : '#10b981'
                }}
              />
            </div>
          </div>
        </div>

        {/* 负载均衡 & 进程数 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                <Icon name="activity" className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.loadAvg")}</span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">LOAD</span>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">1m:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{summary.loadAverage?.["1m"] || "N/A"}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">5m:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{summary.loadAverage?.["5m"] || "N/A"}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">15m:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{summary.loadAverage?.["15m"] || "N/A"}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.processes")}:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{summary.processCount || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 详细指标区域 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* CPU 详细信息 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            <Icon name="cpu" className="h-5 w-5 text-purple-500" />
            {intl.get("hostMonitor.cpuDetail")}
          </h3>
          
          <div className="space-y-4">
            {/* CPU 核心数和使用率分布 */}
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.cores")}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{cpu.coreCount || 0}</span>
              </div>
              
              <div className="space-y-2">
                {[
                  { label: intl.get("hostMonitor.cpuUser"), value: cpu.userPercent, color: "bg-blue-500" },
                  { label: intl.get("hostMonitor.cpuSystem"), value: cpu.systemPercent, color: "bg-purple-500" },
                  { label: intl.get("hostMonitor.cpuIowait"), value: cpu.iowaitPercent, color: "bg-amber-500" },
                  { label: intl.get("hostMonitor.cpuIdle"), value: cpu.idlePercent, color: "bg-gray-400" }
                ].map((item, idx) => (
                  <div key={idx}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{item.value}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-500`}
                        style={{ width: `${Math.min(item.value, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 内存详细信息 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            <Icon name="memory" className="h-5 w-5 text-blue-500" />
            {intl.get("hostMonitor.memoryDetail")}
          </h3>
          
          <div className="space-y-3">
            {/* 内存总量环形图（简化为条形） */}
            <div className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
              <div className="text-sm opacity-90">{intl.get("hostMonitor.totalMemory")}</div>
              <div className="mt-1 text-2xl font-bold">{memory.formatted?.total || "N/A"}</div>
              <div className="mt-1 text-xs opacity-75">({(memory.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB)</div>
            </div>

            {/* 内存分配明细 */}
            <div className="space-y-2">
              {[
                { label: intl.get("hostMonitor.memUsed"), value: memory.usedBytes, formatted: memory.formatted?.used, percent: memory.utilizationPercent, color: "bg-red-500" },
                { label: intl.get("hostMonitor.memFree"), value: memory.freeBytes, formatted: memory.formatted?.free, color: "bg-green-500" },
                { label: intl.get("hostMonitor.memCached"), value: memory.cachedBytes, formatted: memory.formatted?.cached, color: "bg-amber-500" },
                { label: intl.get("hostMonitor.memBuffer"), value: memory.bufferBytes, formatted: memory.formatted?.buffer, color: "bg-cyan-500" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${item.color}`} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.formatted || "0 B"}</div>
                    {item.percent && <div className="text-xs text-gray-500 dark:text-gray-400">{item.percent}%</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 磁盘列表 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            <Icon name="hard-drive" className="h-5 w-5 text-orange-500" />
            {intl.get("hostMonitor.diskDetail")} ({disks.length})
          </h3>
          
          {disks.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              {intl.get("hostMonitor.noData")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700/60">
                    <th className="pb-3 text-left font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.mountpoint")}</th>
                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.usage")}</th>
                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.used")}</th>
                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.available")}</th>
                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">I/O Read</th>
                    <th className="pb-3 text-right font-medium text-gray-600 dark:text-gray-400">I/O Write</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                  {disks.map((disk, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{disk.mountpoint}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{disk.device} ({disk.fsType})</div>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          Number(disk.utilizationPercent) > 85 
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : Number(disk.utilizationPercent) > 70 
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                        }`}>
                          {formatPercent(disk.utilizationPercent)}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-gray-700 dark:text-gray-300">{disk.usedFormatted}</td>
                      <td className="py-3 text-right font-mono text-gray-700 dark:text-gray-300">{disk.freeFormatted}</td>
                      <td className="py-3 text-right font-mono text-gray-700 dark:text-gray-300">{disk.ioReadFormatted}</td>
                      <td className="py-3 text-right font-mono text-gray-700 dark:text-gray-300">{disk.ioWriteFormatted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 网络接口列表 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            <Icon name="wifi" className="h-5 w-5 text-cyan-500" />
            {intl.get("hostMonitor.networkDetail")} ({networks.length})
          </h3>
          
          {networks.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              {intl.get("hostMonitor.noData")}
            </div>
          ) : (
            <div className="space-y-3">
              {networks.map((net, idx) => (
                <div key={idx} className="rounded-lg border border-gray-100 p-4 dark:border-gray-700/40">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400">
                        <Icon name="globe" className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{net.device}</span>
                    </div>
                    {net.connections > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {net.connections} {intl.get("hostMonitor.connections").toLowerCase()}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-blue-50 p-2.5 dark:bg-blue-950/20">
                      <div className="text-xs text-blue-600 dark:text-blue-400">⬇ {intl.get("hostMonitor.receive")}</div>
                      <div className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">{net.receiveFormatted || "0 B"}</div>
                      <div className="text-xs text-blue-600/70 dark:text-blue-400/70">{net.receivePackets?.toLocaleString()} pkts</div>
                    </div>
                    <div className="rounded-md bg-green-50 p-2.5 dark:bg-green-950/20">
                      <div className="text-xs text-green-600 dark:text-green-400">⬆ {intl.get("hostMonitor.transmit")}</div>
                      <div className="mt-1 text-sm font-semibold text-green-900 dark:text-green-100">{net.transmitFormatted || "0 B"}</div>
                      <div className="text-xs text-green-600/70 dark:text-green-400/70">{net.transmitPackets?.toLocaleString()} pkts</div>
                    </div>
                  </div>

                  {(net.receiveErrors > 0 || net.transmitErrors > 0) && (
                    <div className="mt-2 flex gap-3 text-xs text-red-600 dark:text-red-400">
                      {net.receiveErrors > 0 && <span>⚠ Rx Err: {net.receiveErrors}</span>}
                      {net.transmitErrors > 0 && <span>⚠ Tx Err: {net.transmitErrors}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 进程统计 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          <Icon name="layers" className="h-5 w-5 text-indigo-500" />
          {intl.get("hostMonitor.processDetail")}
        </h3>
        
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: intl.get("hostMonitor.procRunning"), value: processes.running, icon: "play-circle", color: "text-green-600 bg-green-50 dark:bg-green-950/40" },
            { label: intl.get("hostMonitor.procSleeping"), value: processes.sleeping, icon: "moon", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
            { label: intl.get("hostMonitor.procStopped"), value: processes.stopped, icon: "pause-circle", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
            { label: intl.get("hostMonitor.procZombie"), value: processes.zombie, icon: "alert-circle", color: "text-red-600 bg-red-50 dark:bg-red-950/40" }
          ].map((proc, idx) => (
            <div key={idx} className={`rounded-lg ${proc.color.includes('dark') ? proc.color.split(' ').slice(-1)[0] + ' p-4' : proc.color.split(' ').slice(-1)[0] + ' p-4'}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${proc.color}`}>
                <Icon name={proc.icon} className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{proc.value || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{proc.label}</div>
            </div>
          ))}

          <div className="col-span-2 sm:col-span-4 pt-4 border-t border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">{intl.get("hostMonitor.totalProcesses")}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{processes.total || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 底部时间戳 */}
      <div className="text-center text-xs text-gray-400 dark:text-gray-500">
        {intl.get("hostMonitor.lastUpdate")}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "-"}
        {" · "}
        {intl.get("hostMonitor.timeRange")}: {hours} {hours === 1 ? intl.get("hostMonitor.hour") : intl.get("hostMonitor.hours")}
      </div>
    </div>
  );
}
