/** 明细表默认每页条数 */
export const DEFAULT_TABLE_PAGE_SIZE = 20;

/**
 * 分页控件（置于表格上方）
 * @param {number} page - 当前页，从 1 开始
 * @param {number} pageSize
 * @param {number} total - 总条数
 * @param {(p: number) => void} onPageChange
 * @param {import("react").ReactNode} [trailingControls] — 渲染在「下一页」右侧，例如每页条数选择器
 * @param {boolean} [loading] — 为 true 时左侧显示加载文案，右侧控件半透且不可点
 */
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
        <p className="text-sm text-gray-500 dark:text-gray-400">正在加载列表数据…</p>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          第 <span className="tabular-nums text-gray-900 dark:text-gray-100">{start}</span>–
          <span className="tabular-nums text-gray-900 dark:text-gray-100">{end}</span> 条，共{" "}
          <span className="tabular-nums text-gray-900 dark:text-gray-100">{total}</span> 条
          {!trailingControls && (
            <span className="text-gray-400 dark:text-gray-500"> · 每页 {pageSize} 条</span>
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
          上一页
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
          下一页
        </button>
        {trailingControls}
      </div>
    </div>
  );
}
