import { Area, AreaChart, ResponsiveContainer } from "recharts";
import intl from "react-intl-universal";

/** 全局规范之下的 SparklineCard */
export function SparklineCard({ title, value, icon, iconBg, iconColor, compareLabel, compareValue, compareUp, sparkline, sparklineColor, onClick }) {
  const chartData = (sparkline || []).map((v, i) => ({ i, v }));
  const labelText = intl.get(compareLabel) || compareLabel;
  const valueText = intl.get(compareValue) || compareValue;
  return (
    <div
      onClick={onClick}
      className={[
        "rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-none",
        onClick ? "cursor-pointer transition hover:border-primary/30 hover:shadow-md" : "",
      ].join(" ")}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{typeof value === "string" ? intl.get(value) || value : value}</span>
        <span className={`text-xs font-medium ${
          compareUp === true ? "text-emerald-600 dark:text-emerald-400" :
          compareUp === false ? "text-red-500 dark:text-red-400" :
          "text-gray-400"
        }`}>
          {labelText} {compareUp === true ? "↑" : compareUp === false ? "↓" : ""}{valueText}
        </span>
      </div>
      {/* 底部: Sparkline */}
      <div className="mt-2 h-12 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-${sparklineColor?.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={sparklineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={sparklineColor}
              strokeWidth={1.5}
              fill={`url(#spark-${sparklineColor?.replace("#", "")})`}
              dot={false}
              activeDot={{ r: 3, fill: sparklineColor, stroke: "white", strokeWidth: 1.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** 水平进度条 */
export function ProgressBar({ pct, color }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: pct, backgroundColor: color }}
      />
    </div>
  );
}

/** 小圆点 */
export function Dot({ className = "" }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} />;
}
