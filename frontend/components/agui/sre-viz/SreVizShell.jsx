/**
 * SRE 可视化面板通用外壳：左侧色条 + 标题 + 子内容区。
 * 与业务无关，供各 `SreViz*` 面板复用。
 */

export const ACCENT = {
  blue: "border-l-blue-500",
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  rose: "border-l-rose-500",
};

export function Shell({ title, accent = "blue", children }) {
  return (
    <div
      className={`rounded-xl border border-gray-200 border-l-[3px] bg-white p-4 dark:border-gray-700 dark:bg-gray-900 ${ACCENT[accent] ?? ACCENT.blue}`}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      {children}
    </div>
  );
}
