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
        <p className="text-xs text-gray-500 dark:text-gray-400">{intl.get("common.loadingList")}</p>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {intl.get("common.pageInfo", { start, end, total })}
          {!trailingControls && (
            <span> · {intl.get("common.pageSize", { size: pageSize })}</span>
          )}
        </p>
      )}
      <div
        className={`flex flex-wrap items-center gap-4 ${loading ? "pointer-events-none opacity-50" : ""}`}
        aria-hidden={loading || undefined}
      >
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 shadow-sm transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
        >
          {intl.get("common.prevPage")}
        </button>
        <span className="min-w-[3rem] text-center text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300">
          {totalPages === 0 ? "—" : `${page} / ${totalPages}`}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 shadow-sm transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
        >
          {intl.get("common.nextPage")}
        </button>
        {trailingControls}
      </div>
    </div>
  );
}
