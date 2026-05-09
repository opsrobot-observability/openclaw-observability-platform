/**
 * SRE 可视化面板通用外壳：标题 + 子内容区。
 * 与业务无关，供各 `SreViz*` 面板复用。
 */

export function Shell({ title, children }) {
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      {children}
    </div>
  );
}
