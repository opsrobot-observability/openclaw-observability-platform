import { useState, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import Icon from "../components/Icon.jsx";

function formatValue(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
  return val?.toLocaleString() || '0';
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return dateStr;
  }
}

export default function InstanceMonitoring() {
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/otel-overview?hours=24&granularityMinutes=30");
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStatusBadgeClass = (status) => {
    if (status === "在线") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/20";
    if (status === "离线") return "bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-500/20";
    return "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/25";
  };

  const formatInstanceStatus = (status) => {
    if (status === "在线") return intl.get("otelOverview.statusOnline");
    if (status === "离线") return intl.get("otelOverview.statusOffline");
    return status || intl.get("otelOverview.na");
  };

  const overview = data?.overview || {};
  const instances = data?.instances || [];
  const histogramStats = data?.histogramStats || {};

  const totalInstances = instances.length;
  const onlineInstances = instances.filter((i) => i.status === "在线").length;
  const offlineInstances = instances.filter((i) => i.status !== "在线").length;
  const totalActiveSessions = instances.reduce((a, i) => a + (i.activeSessions || 0), 0);
  const totalStuckSessions = instances.reduce((a, i) => a + (i.stuckSessions || 0), 0);
  const totalMessageProcessed = instances.reduce((a, i) => a + (i.messageProcessed || 0), 0);
  const totalQueueDepth = instances.reduce((a, i) => a + (i.queueDepth || 0), 0);

  const renderDetailModal = () => {
    if (!selectedInstance) return null;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-200 dark:bg-black/60" onClick={() => setSelectedInstance(null)} />
        <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-gray-700/60 dark:bg-gray-900/95">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700/60">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="server" className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedInstance.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{selectedInstance.id}</p>
              </div>
              <span className={["inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ml-2", getStatusBadgeClass(selectedInstance.status)].join(" ")}>
                {formatInstanceStatus(selectedInstance.status)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedInstance(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[75vh] overflow-y-auto">
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
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("instanceMonitoring.sectionSessionMetrics")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { labelKey: "otelOverview.sessionTotal", value: formatValue(selectedInstance.sessionTotal), color: "text-gray-800 dark:text-gray-200" },
                  { labelKey: "otelOverview.metricActiveSessions", value: formatValue(selectedInstance.activeSessions), color: "text-blue-600 dark:text-blue-400" },
                  { labelKey: "otelOverview.colStuckSessions", value: selectedInstance.stuckSessions || 0, color: selectedInstance.stuckSessions > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-400" },
                  { labelKey: "otelOverview.sessionSuccessRate", value: selectedInstance.sessionTotal > 0 ? ((selectedInstance.sessionTotal - selectedInstance.stuckSessions) / selectedInstance.sessionTotal * 100).toFixed(1) + "%" : "100%", color: "text-emerald-600 dark:text-emerald-400" },
                ].map((item) => (
                  <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                    <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">
                      <span className={item.color}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700/60">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("instanceMonitoring.sectionTokenMetrics")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { labelKey: "otelOverview.tokenTotalConsumption", value: selectedInstance.tokenConsumption || "0", color: "text-violet-600 dark:text-violet-400" },
                  { labelKey: "otelOverview.inputToken", value: selectedInstance.inputTokens || "0", color: "text-blue-600 dark:text-blue-400" },
                  { labelKey: "otelOverview.outputToken", value: selectedInstance.outputTokens || "0", color: "text-emerald-600 dark:text-emerald-400" },
                  { labelKey: "otelOverview.metricTotalCost", value: selectedInstance.totalCost || "$0", color: "text-rose-600 dark:text-rose-400" },
                ].map((item) => (
                  <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                    <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">
                      <span className={item.color}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700/60">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("instanceMonitoring.sectionMessageProcessing")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { labelKey: "otelOverview.msgProcessed", value: formatValue(selectedInstance.messageProcessed), color: "text-emerald-600 dark:text-emerald-400" },
                  { labelKey: "otelOverview.msgQueued", value: formatValue(selectedInstance.messageQueued), color: "text-amber-600 dark:text-amber-400" },
                  { labelKey: "otelOverview.metricAvgDuration", value: `${histogramStats.messageDuration?.avg || 0}ms`, color: "text-blue-600 dark:text-blue-400" },
                  { labelKey: "otelOverview.metricMaxDuration", value: `${histogramStats.messageDuration?.max || 0}ms`, color: "text-rose-600 dark:text-rose-400" },
                ].map((item) => (
                  <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                    <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">
                      <span className={item.color}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{intl.get("instanceMonitoring.sectionQueueStatus")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { labelKey: "otelOverview.queueDepthCurrent", value: selectedInstance.queueDepth || 0, color: "text-amber-600 dark:text-amber-400" },
                  { labelKey: "otelOverview.enqueueTotal", value: formatValue(selectedInstance.enqueueTotal), color: "text-blue-600 dark:text-blue-400" },
                  { labelKey: "otelOverview.dequeueTotal", value: formatValue(selectedInstance.dequeueTotal), color: "text-emerald-600 dark:text-emerald-400" },
                  { labelKey: "otelOverview.avgWait", value: `${histogramStats.queueWait?.avg || 0}ms`, color: "text-violet-600 dark:text-violet-400" },
                ].map((item) => (
                  <div key={item.labelKey} className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-lg">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{intl.get(item.labelKey)}</span>
                    <div className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">
                      <span className={item.color}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-700/60">
            <button
              type="button"
              onClick={() => setSelectedInstance(null)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {intl.get("otelOverview.modalClose")}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{intl.get("instanceMonitoring.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {intl.get("instanceMonitoring.lastUpdated", { time: formatDateTime(data?.generatedAt) })}
          </span>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Icon name="refresh" className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
            {intl.get("instanceMonitoring.refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">{intl.get("otelOverview.loadErrorTitle")}</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                type="button"
                onClick={fetchData}
                className="mt-2 text-sm font-medium text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200 underline"
              >
                {intl.get("instanceMonitoring.retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
            <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.loading")}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="app-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="server" className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricTotalInstances")}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalInstances}</span>
                    <span className="text-xs text-gray-400">{intl.get("otelOverview.metricInstancesUnit")}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricOnlineCount", { count: onlineInstances })}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                  <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.metricOfflineCount", { count: offlineInstances })}</span>
                </span>
              </div>
            </div>

            <div className="app-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                  <Icon name="users" className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("instanceMonitoring.metricTotalSessions")}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalActiveSessions.toLocaleString()}</span>
                    <span className="text-xs text-gray-400">{intl.get("instanceMonitoring.labelActive")}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="app-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Icon name="activity" className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("instanceMonitoring.metricMessagesTotal")}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalMessageProcessed.toLocaleString()}</span>
                    <span className="text-xs text-gray-400">{intl.get("instanceMonitoring.unitMessages")}</span>
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("instanceMonitoring.metricQueueDepthTotal")}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalQueueDepth}</span>
                    <span className="text-xs text-gray-400">{intl.get("instanceMonitoring.labelPending")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 app-card p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("instanceMonitoring.chartInstanceStatusDist")}</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-lg text-center">
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{onlineInstances}</div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("instanceMonitoring.onlineInstances")}</div>
                  <div className="mt-2 h-2 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalInstances > 0 ? (onlineInstances / totalInstances) * 100 : 0}%` }}></div>
                  </div>
                </div>
                <div className="p-4 bg-amber-50/50 dark:bg-amber-950/30 rounded-lg text-center">
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{totalStuckSessions}</div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("instanceMonitoring.stuckSessions")}</div>
                  <div className="mt-2 h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${totalActiveSessions > 0 ? Math.min((totalStuckSessions / totalActiveSessions) * 100, 100) : 0}%` }}></div>
                  </div>
                </div>
                <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg text-center">
                  <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">{offlineInstances}</div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intl.get("instanceMonitoring.offlineInstances")}</div>
                  <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-400 rounded-full" style={{ width: `${totalInstances > 0 ? (offlineInstances / totalInstances) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="app-card p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{intl.get("instanceMonitoring.instanceHealth")}</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-500 dark:text-gray-400">{intl.get("instanceMonitoring.overallHealth")}</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">{totalInstances > 0 ? ((onlineInstances / totalInstances) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalInstances > 0 ? (onlineInstances / totalInstances) * 100 : 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-500 dark:text-gray-400">{intl.get("instanceMonitoring.sessionSuccessRate")}</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {totalActiveSessions > 0 ? (((totalActiveSessions - totalStuckSessions) / totalActiveSessions) * 100).toFixed(1) : 100}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalActiveSessions > 0 ? ((totalActiveSessions - totalStuckSessions) / totalActiveSessions) * 100 : 100}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="app-card p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("otelOverview.instanceListTitle")}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{intl.get("otelOverview.instanceListHint")}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{intl.get("otelOverview.instanceTotalCount", { count: totalInstances })}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="text-emerald-600 dark:text-emerald-400">{intl.get("otelOverview.instanceOnlineCount", { count: onlineInstances })}</span>
              </div>
            </div>

            {instances.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <Icon name="server" className="h-12 w-12 mb-3 opacity-50" />
                <p>{intl.get("otelOverview.noInstanceData")}</p>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colInstanceId")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colInstanceName")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colStatus")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colActiveSessions")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colStuckSessions")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colTokenConsumption")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colTotalCost")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colMessageProcessed")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colQueueDepth")}</th>
                        <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{intl.get("otelOverview.colActions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
                      {instances.map((instance, i) => (
                        <tr
                          key={instance.id}
                          className={[
                            "transition-colors duration-200 hover:bg-primary-soft/40 dark:hover:bg-primary/10 cursor-pointer",
                            i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/40" : "bg-white dark:bg-transparent",
                          ].join(" ")}
                          onClick={() => setSelectedInstance(instance)}
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-gray-800 dark:text-gray-200">{instance.id}</td>
                          <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{instance.name}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={["inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", getStatusBadgeClass(instance.status)].join(" ")}>
                              {formatInstanceStatus(instance.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{(instance.activeSessions || 0).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={instance.stuckSessions > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-400"}>
                              {instance.stuckSessions || 0}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{instance.tokenConsumption || "0"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{instance.totalCost || "$0"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{(instance.messageProcessed || 0).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{instance.queueDepth || 0}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInstance(instance);
                              }}
                              className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft transition-colors dark:text-primary dark:hover:bg-primary/15"
                            >
                              <Icon name="info" className="h-3.5 w-3.5 mr-1" />
                              {intl.get("otelOverview.viewDetail")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {renderDetailModal()}
    </div>
  );
}
