/**
 * 调用链面板内「Span 摘要」区块：总 span 数、可选 trace_id 列表与备注。
 */

export function SpanSummaryBox({ summary }) {
  if (!summary || typeof summary !== "object") return null;
  const ids = summary.available_trace_ids;
  const hasIds = Array.isArray(ids) && ids.length > 0;
  if (summary.total_spans == null && !hasIds && !summary.note) return null;
  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50/90 px-3 py-2.5 text-[11px] dark:border-gray-600 dark:bg-gray-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Span 摘要</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-700 dark:text-gray-200">
        {summary.total_spans != null && (
          <span>
            上报 spans：<span className="font-mono font-semibold">{summary.total_spans}</span>
          </span>
        )}
        {hasIds && (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-gray-500">可用 trace_id：</span>
            {ids.map((id) => (
              <code key={id} className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100">
                {id}
              </code>
            ))}
          </span>
        )}
      </div>
      {summary.note && <p className="mt-2 leading-snug text-gray-600 dark:text-gray-300">{summary.note}</p>}
    </div>
  );
}
