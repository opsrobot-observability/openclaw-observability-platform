/**
 * 可排序表头：点击切换升序 / 降序；未选中列显示灰色 ↕
 */
export default function SortableTableTh({
  label,
  columnKey,
  sortKey,
  sortOrder,
  onSort,
  className = "",
  title: titleAttr,
}) {
  const active = sortKey === columnKey;
  return (
    <th
      scope="col"
      title={titleAttr}
      className={`px-4 py-3 text-left ${className}`}
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="group inline-flex max-w-full min-w-0 items-center gap-1 rounded font-semibold text-gray-700 transition hover:text-primary dark:text-gray-300 dark:hover:text-primary"
      >
        <span className="truncate">{label}</span>
        <span
          className={`inline-flex w-4 shrink-0 justify-center font-mono text-xs tabular-nums ${
            active ? "text-primary" : "text-gray-300 group-hover:text-gray-400"
          }`}
          aria-hidden
        >
          {active ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
