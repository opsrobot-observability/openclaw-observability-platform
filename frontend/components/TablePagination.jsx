import intl from "react-intl-universal";

export const DEFAULT_TABLE_PAGE_SIZE = 20;

export default function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className = "",
  trailingControls = null,
  loading = false,
}) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = !loading && total > 0 && page > 1;
  const canNext = !loading && total > 0 && totalPages > 0 && page < totalPages;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 ${className}`}
    >
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{intl.get("common.loadingList")}</p>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {intl.get("common.pageInfo", { start, end, total })}
          {!trailingControls && (
            <span className="text-gray-400 dark:text-gray-500"> · {intl.get("common.pageSize", { size: pageSize })}</span>
          )}
        </p>
      )}
      <div
        className={`flex flex-wrap items-center gap-2 ${loading ? "pointer-events-none opacity-50" : ""}`}
        aria-hidden={loading || undefined}
      >
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className="app-btn-outline"
        >
          {intl.get("common.prevPage")}
        </button>
        <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-gray-600 dark:text-gray-400">
          {totalPages === 0 ? "—" : `${page} / ${totalPages}`}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className="app-btn-outline"
        >
          {intl.get("common.nextPage")}
        </button>
        {trailingControls}
      </div>
    </div>
  );
}
