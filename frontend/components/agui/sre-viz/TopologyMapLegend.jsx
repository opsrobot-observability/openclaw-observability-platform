/**
 * 拓扑图状态图例（紧急 / 严重 / 重要 / 警告 / 正常），与 `chart_config.node_colors` 对齐。
 */

export function TopologyMapLegend({ colors }) {
  /** 与参考图一致：严重度从左到高 → 低；颜色复用 chart_config 调色板 */
  const items = [
    { key: "emergency", label: "紧急", color: colors.anomaly },
    { key: "severe", label: "严重", color: colors.degraded },
    { key: "major", label: "重要", color: colors.slow },
    { key: "warn", label: "警告", color: colors.external },
    { key: "normal", label: "正常", color: colors.normal },
  ];
  return (
    <div
      role="list"
      aria-label="状态图例"
      className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] leading-none text-[#888888] dark:text-gray-400"
    >
      {items.map((s) => (
        <span key={s.key} role="listitem" className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}
