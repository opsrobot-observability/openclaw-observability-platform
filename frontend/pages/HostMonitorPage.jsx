import { useState, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import HostMonitorOverview from "./host-monitor/HostMonitorOverview.jsx";
import HostMonitorOverviewHostTab from "./host-monitor/HostMonitorOverviewHostTab.jsx";

const PAGE_TABS = [
  { key: "runOverview", labelKey: "hostMonitor.pageTab.runOverview" },
  { key: "hostList", labelKey: "hostMonitor.pageTab.hostList" },
];

export default function HostMonitorPage() {
  const [pageTab, setPageTab] = useState("runOverview");
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [selectedHost, setSelectedHost] = useState(null);
  const [hostDrawerOpenNonce, setHostDrawerOpenNonce] = useState(0);

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch("/api/host-monitor/overview?hours=24");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOverviewData(json);
    } catch (e) {
      console.error("[HostMonitorPage] overview fetch failed", e);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleHostClick = useCallback((host) => {
    setSelectedHost(host);
    setHostDrawerOpenNonce((n) => n + 1);
    setPageTab("hostList");
  }, []);

  const handlePendingDrawerHostConsumed = useCallback(() => {
    setSelectedHost(null);
  }, []);

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-8">
      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex flex-wrap gap-1" role="tablist" aria-label={intl.get("hostMonitor.pageTab.ariaLabel")}>
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={pageTab === tab.key}
              onClick={() => setPageTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                pageTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {pageTab === "runOverview" && (
        <HostMonitorOverview onHostClick={handleHostClick} showHostTableSection={false} />
      )}

      {pageTab === "hostList" && (
        <HostMonitorOverviewHostTab
          overviewData={overviewData}
          overviewLoading={overviewLoading}
          pendingOpenHost={selectedHost}
          pendingOpenNonce={hostDrawerOpenNonce}
          onPendingOpenHostConsumed={handlePendingDrawerHostConsumed}
        />
      )}
    </div>
  );
}
