import { useState, useMemo, useEffect, useCallback } from "react";
import intl from "react-intl-universal";
import Icon from "../../components/Icon.jsx";
import TablePagination from "../../components/TablePagination.jsx";

const DEFAULT_PAGE_SIZE = 10;

const STATUS_RANK = { healthy: 0, warning: 1, critical: 2 };

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

const EMPTY_CELL = "\u2014";

function cellText(v) {
  if (v == null) return EMPTY_CELL;
  const s = String(v).trim();
  return s === "" ? EMPTY_CELL : s;
}

function getStatusLabel(status) {
  switch (status) {
    case "healthy":
      return intl.get("hostMonitor.statusHealthy");
    case "warning":
      return intl.get("hostMonitor.statusWarning");
    case "critical":
      return intl.get("hostMonitor.statusCritical");
    default:
      return status;
  }
}

function sortValueForKey(host, key) {
  switch (key) {
    case "hostname":
      return String(host.hostname || host.name || "").toLowerCase();
    case "primaryIp":
      return String(host.primaryIp || host.ip || "").toLowerCase();
    case "networkRx":
      return Number(host.networkReceiveBytes) || 0;
    case "networkTx":
      return Number(host.networkTransmitBytes) || 0;
    case "os":
      return `${host.osType || ""}/${host.arch || ""}`.toLowerCase();
    case "status":
      return STATUS_RANK[host.healthStatus] ?? 99;
    case "cpu":
      return parseFloat(host.cpuUtilization) || 0;
    case "cpuCores":
      return Number(host.cpuCores) || 0;
    case "memory":
      return parseFloat(host.memoryUtilization) || 0;
    case "memorySpace":
      return Number(host.memoryTotal) || 0;
    case "disk":
      return parseFloat(host.maxDiskUtilization) || 0;
    case "diskSpace":
      return Number(host.diskTotalBytes) || 0;
    case "load":
      return parseFloat(host.loadAvg1m) || 0;
    default:
      return "";
  }
}

function compareValues(a, b, dir) {
  const asc = dir === "asc" ? 1 : -1;
  if (a < b) return -1 * asc;
  if (a > b) return 1 * asc;
  return 0;
}

function SortTh({ colKey, labelKey, sortKey, sortDir, onSort }) {
  const active = sortKey === colKey;
  return (
    <th scope="col" className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className="group inline-flex max-w-full items-center gap-1 font-semibold text-gray-700 hover:text-primary dark:text-gray-300 dark:hover:text-primary"
      >
        <span className="truncate">{intl.get(labelKey)}</span>
        <span
          className={`shrink-0 text-[10px] font-normal ${active ? "text-primary" : "text-gray-400 opacity-60 group-hover:opacity-100"}`}
          aria-hidden
        >
          {active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25B4\u25BE"}
        </span>
      </button>
    </th>
  );
}

/**
 * 主机监控主机列表表格
 * @param {{ hosts: object[], onRowClick?: (host: object) => void, selectedHostname?: string | null, showToolbar?: boolean, pageSize?: number }} props
 */
export default function HostMonitorHostTable({
  hosts,
  onRowClick,
  selectedHostname = null,
  showToolbar = true,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ key: "hostname", dir: "asc" });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(() => Math.max(1, Number(pageSizeProp) || DEFAULT_PAGE_SIZE));

  const sortKey = sort.key;
  const sortDir = sort.dir;

  useEffect(() => {
    setPageSize(Math.max(1, Number(pageSizeProp) || DEFAULT_PAGE_SIZE));
  }, [pageSizeProp]);

  const effectivePageSize = showToolbar ? pageSize : hosts?.length || 9999;

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredHosts = useMemo(() => {
    if (!hosts || hosts.length === 0) return [];
    if (!showToolbar) return hosts;
    return hosts.filter((host) => {
      if (statusFilter !== "all" && host.healthStatus !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const hn = String(host.hostname || host.name || "").toLowerCase();
      const ip = String(host.primaryIp || host.ip || "").toLowerCase();
      return hn.includes(normalizedQuery) || ip.includes(normalizedQuery);
    });
  }, [hosts, showToolbar, statusFilter, normalizedQuery]);

  const sortedHosts = useMemo(() => {
    const list = [...filteredHosts];
    const sk = sort.key;
    const sd = sort.dir;
    list.sort((ha, hb) => {
      const va = sortValueForKey(ha, sk);
      const vb = sortValueForKey(hb, sk);
      if (typeof va === "number" && typeof vb === "number") return compareValues(va, vb, sd);
      return compareValues(String(va), String(vb), sd);
    });
    return list;
  }, [filteredHosts, sort]);

  const matchedCount = sortedHosts.length;
  const totalPages = Math.max(1, Math.ceil(matchedCount / effectivePageSize));
  const pageIndexClamped = Math.min(pageIndex, Math.max(0, totalPages - 1));
  const pageSafe = pageIndexClamped + 1;

  useEffect(() => {
    setPageIndex((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useEffect(() => {
    setPageIndex(0);
  }, [normalizedQuery, statusFilter, sort.key, sort.dir, hosts?.length, effectivePageSize]);

  const pageSlice = useMemo(() => {
    if (!showToolbar) return sortedHosts;
    const start = pageIndexClamped * effectivePageSize;
    return sortedHosts.slice(start, start + effectivePageSize);
  }, [sortedHosts, pageIndexClamped, effectivePageSize, showToolbar]);

  const toggleSort = useCallback((key) => {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  }, []);

  if (!hosts || hosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Icon name="server" className="mb-3 h-12 w-12 opacity-50" />
        <p>{intl.get("hostMonitor.noData")}</p>
      </div>
    );
  }

  const total = hosts.length;

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="sr-only" htmlFor="host-monitor-host-search">
              {intl.get("hostMonitor.searchPlaceholder")}
            </label>
            <input
              id="host-monitor-host-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={intl.get("hostMonitor.searchPlaceholder")}
              className="w-full min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="host-monitor-status-filter" className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {intl.get("hostMonitor.filterStatusLabel")}
              </label>
              <select
                id="host-monitor-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">{intl.get("hostMonitor.filterAllStatus")}</option>
                <option value="healthy">{intl.get("hostMonitor.statusHealthy")}</option>
                <option value="warning">{intl.get("hostMonitor.statusWarning")}</option>
                <option value="critical">{intl.get("hostMonitor.statusCritical")}</option>
              </select>
              {matchedCount !== total ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {intl.get("hostMonitor.hostFilterMatch", { matched: matchedCount, total })}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/90 dark:border-gray-800 dark:bg-gray-800/80">
                <SortTh colKey="hostname" labelKey="hostMonitor.colHostname" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="primaryIp" labelKey="hostMonitor.colPrimaryIp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="os" labelKey="hostMonitor.colOs" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="status" labelKey="hostMonitor.colStatus" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="cpuCores" labelKey="hostMonitor.colCpuCores" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="memorySpace" labelKey="hostMonitor.colMemorySpace" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="diskSpace" labelKey="hostMonitor.colDiskSpace" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="cpu" labelKey="hostMonitor.colCpuUtilization" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="memory" labelKey="hostMonitor.colMemory" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="disk" labelKey="hostMonitor.colDisk" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="networkRx" labelKey="hostMonitor.colNetworkRx" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh colKey="networkTx" labelKey="hostMonitor.colNetworkTx" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900/50">
              {pageSlice.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    {intl.get("hostMonitor.noMatchingHosts")}
                  </td>
                </tr>
              ) : (
                pageSlice.map((host, idx) => {
                  const hn = host.hostname || host.name || `host-${idx}`;
                  const isSel = selectedHostname != null && String(selectedHostname) === String(hn);
                  return (
                    <tr
                      key={hn}
                      className={[
                        "transition-colors duration-200",
                        onRowClick ? "cursor-pointer" : "",
                        isSel
                          ? "bg-primary-soft/50 ring-1 ring-inset ring-primary/20 dark:bg-primary/15"
                          : onRowClick
                            ? "hover:bg-primary-soft/40 dark:hover:bg-primary/10"
                            : "",
                      ].join(" ")}
                      onClick={() => onRowClick?.(host)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-gray-800 dark:text-gray-200">{hn}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{cellText(host.primaryIp ?? host.ip)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                        {host.osType}/{host.arch}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusColor(host.healthStatus)}`}>
                          {getStatusLabel(host.healthStatus)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {cellText(host.cpuCores)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {cellText(host.memoryFormatted?.total || host.memoryTotalDisplay)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {cellText(host.diskTotalDisplay)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(Number(host.cpuUtilization) || 0, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{host.cpuUtilization}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(Number(host.memoryUtilization) || 0, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{host.memoryUtilization}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(Number(host.maxDiskUtilization) || 0, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{host.maxDiskUtilization}%</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{cellText(host.networkReceiveDisplay)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{cellText(host.networkTransmitDisplay)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {showToolbar && matchedCount > 0 ? (
          <TablePagination
            page={pageSafe}
            pageSize={effectivePageSize}
            total={matchedCount}
            onPageChange={(p) => setPageIndex(p - 1)}
            className="border-t border-gray-100 px-4 py-3 dark:border-gray-800"
            trailingControls={
              <label className="ml-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="shrink-0">{intl.get("common.perPage")}</span>
                <select
                  value={effectivePageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="app-input min-w-[4.5rem] px-2 py-1.5"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="shrink-0">{intl.get("common.items")}</span>
              </label>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
