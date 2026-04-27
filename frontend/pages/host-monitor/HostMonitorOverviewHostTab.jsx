import { useState, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import HostMonitorHostTable from "./HostMonitorHostTable.jsx";
import { HostMonitorDetailMainPanel } from "./HostMonitorDetail.jsx";

/**
 * 运行概览 · 主机列表子 Tab：表格 + 右侧抽屉详情
 */
export default function HostMonitorOverviewHostTab({
  overviewData,
  overviewLoading,
  pendingOpenHost,
  pendingOpenNonce,
  onPendingOpenHostConsumed,
}) {
  const [drawerHost, setDrawerHost] = useState(null);

  const hostList = overviewData?.hostList || [];
  const drawerHostname = drawerHost?.hostname || "";

  const closeDrawer = useCallback(() => setDrawerHost(null), []);

  useEffect(() => {
    if (!pendingOpenHost?.hostname) return;
    setDrawerHost(pendingOpenHost);
    onPendingOpenHostConsumed?.();
  }, [pendingOpenNonce, pendingOpenHost, onPendingOpenHostConsumed]);

  useEffect(() => {
    if (!drawerHost) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerHost, closeDrawer]);

  if (overviewLoading && !overviewData) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Icon name="loading" className="h-8 w-8 text-primary animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{intl.get("hostMonitor.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="app-card p-6">
        {hostList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <Icon name="server" className="mb-3 h-12 w-12 opacity-50" />
            <p>{intl.get("hostMonitor.noData")}</p>
          </div>
        ) : (
          <HostMonitorHostTable
            hosts={hostList}
            selectedHostname={drawerHostname || null}
            onRowClick={(host) => setDrawerHost(host)}
          />
        )}
      </div>

      {drawerHost ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/40 dark:bg-black/50"
            aria-label={intl.get("hostMonitor.drawer.close")}
            onClick={closeDrawer}
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(100vw,calc(72rem*1.1))] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950"
            role="dialog"
            aria-modal="true"
            aria-labelledby="host-monitor-drawer-title"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 id="host-monitor-drawer-title" className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {intl.get("hostMonitor.drawer.hostDetailTitle")} · {drawerHostname}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label={intl.get("hostMonitor.drawer.close")}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <HostMonitorDetailMainPanel
                key={drawerHostname}
                selectedHost={drawerHost}
                overviewData={overviewData}
                onBack={null}
              />
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
