import {
  pickSessionKey,
  sessionListPrimaryLabel,
  sessionListRowStableKey,
} from "../../../lib/sreOpenclawSessions.js";
import { USE_MOCK } from "../constants.js";
import { sessionTimeLabel } from "../sessionUtils.js";

export default function OpenClawSessionsAside({
  sessionGroups,
  collapsedSessionGroups,
  toggleSessionGroupCollapse,
  sessionRows,
  sessionsLoading,
  sessionsError,
  openingSessionKey,
  isRunning,
  openHistorySession,
  reloadSessions,
}) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-950/40">
      <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">OpenClaw 会话</p>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {USE_MOCK && (
            <p className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">Demo 模式不拉取远端会话。</p>
          )}
          {!USE_MOCK && sessionsLoading && sessionRows.length === 0 && (
            <p className="px-2 py-3 text-xs text-gray-500">加载中…</p>
          )}
          {!USE_MOCK && sessionsError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              {sessionsError}
            </p>
          )}
          {!USE_MOCK &&
            sessionGroups.map((group) => {
              const collapsed = collapsedSessionGroups.has(group.groupId);
              return (
                <div key={group.groupId} className="mb-2 last:mb-0">
                  <button
                    type="button"
                    onClick={() => toggleSessionGroupCollapse(group.groupId)}
                    aria-expanded={!collapsed}
                    className="mb-1 flex w-full items-center gap-1 rounded-md px-1 py-1 text-left transition hover:bg-gray-200/80 dark:hover:bg-gray-800/60"
                  >
                    <svg
                      className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${collapsed ? "-rotate-90" : ""}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M5.5 7.5 10 12l4.5-4.5H5.5Z" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      {group.label}
                      <span className="ml-1 font-normal normal-case text-gray-400 dark:text-gray-500">({group.rows.length})</span>
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="space-y-0 pl-0.5">
                      {group.rows.map((row, idx) => {
                        const sessionKeyForApi = pickSessionKey(row);
                        if (!sessionKeyForApi) return null;
                        const stableKey = sessionListRowStableKey(row) || `${group.groupId}_${idx}`;
                        const busy = openingSessionKey === stableKey;
                        const title = sessionListPrimaryLabel(row);
                        const rowTimeLabel = sessionTimeLabel(row);
                        return (
                          <button
                            key={stableKey}
                            type="button"
                            disabled={busy || isRunning}
                            onClick={() => void openHistorySession(row)}
                            className="mb-1.5 w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-primary/30 hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-900/80"
                          >
                            <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-100" title={sessionKeyForApi}>
                              {sessionKeyForApi}
                            </p>
                            {rowTimeLabel && (
                              <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500">{rowTimeLabel}</p>
                            )}
                            {busy && <p className="mt-1 text-[10px] text-primary">打开中…</p>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          {!USE_MOCK && !sessionsLoading && !sessionsError && sessionRows.length === 0 && (
            <p className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">暂无会话记录</p>
          )}
        </div>
        {!USE_MOCK && (
          <div className="border-t border-gray-200 p-2 dark:border-gray-700">
            <button
              type="button"
              onClick={() => void reloadSessions()}
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-600 transition hover:border-primary/40 hover:text-primary dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary/40"
            >
              刷新列表
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
