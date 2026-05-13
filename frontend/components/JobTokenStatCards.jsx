import intl from "react-intl-universal";
import { formatTokenInt } from "../lib/jobTokenMetrics.js";

/** 小图标：合计（柱状） */
function IconTotal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M7 16V10m5 6V8m5 8v-4" />
    </svg>
  );
}

/** 小图标：输入 */
function IconInput(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/** 小图标：输出 */
function IconOutput(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

/** 小图标：记录条数 */
function IconRows(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

/** 小图标：平均值（折线趋势） */
function IconAvg(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 18h16M7 14l3-4 3 2 5-6" />
    </svg>
  );
}

/** 小图标：单次峰值 */
function IconMaxRun(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M8 16l4-8 4 5 4-10" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {{ sumIn: number, sumOut: number, sumTotal: number, rowsWithUsage: number, maxSingleRunTotal: number | null }} props.tokenAgg
 */
export default function JobTokenStatCards({ tokenAgg }) {
  const { sumIn, sumOut, sumTotal, rowsWithUsage, maxSingleRunTotal = null } = tokenAgg;
  const avgPerTask =
    rowsWithUsage != null && Number.isFinite(rowsWithUsage) && rowsWithUsage > 0 && Number.isFinite(sumTotal)
      ? Math.round(sumTotal / rowsWithUsage)
      : null;

  const cards = [
    {
      key: "total",
      label: intl.get("scheduledTasks.taskDetail.tokensCardTotal"),
      value: formatTokenInt(sumTotal),
      iconBox: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-400",
      Icon: IconTotal,
    },
    {
      key: "maxRun",
      label: intl.get("scheduledTasks.taskDetail.tokensCardMaxPerRun"),
      value: formatTokenInt(maxSingleRunTotal),
      iconBox: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
      Icon: IconMaxRun,
    },
    {
      key: "in",
      label: intl.get("scheduledTasks.taskDetail.tokensCardInput"),
      value: formatTokenInt(sumIn),
      iconBox: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
      Icon: IconInput,
    },
    {
      key: "out",
      label: intl.get("scheduledTasks.taskDetail.tokensCardOutput"),
      value: formatTokenInt(sumOut),
      iconBox: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/40 dark:text-fuchsia-400",
      Icon: IconOutput,
    },
    {
      key: "avg",
      label: intl.get("scheduledTasks.taskDetail.tokensCardAvgPerTask"),
      value: formatTokenInt(avgPerTask),
      iconBox: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
      Icon: IconAvg,
    },
    {
      key: "rows",
      label: intl.get("scheduledTasks.taskDetail.tokensCardUsageRows"),
      value: rowsWithUsage != null && Number.isFinite(rowsWithUsage) ? String(Math.round(rowsWithUsage)) : "—",
      iconBox: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
      Icon: IconRows,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ key, label, value, iconBox, Icon }) => (
        <div
          key={key}
          className="flex min-h-[88px] items-center gap-3.5 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${iconBox}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-gray-900 tabular-nums dark:text-gray-50">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
