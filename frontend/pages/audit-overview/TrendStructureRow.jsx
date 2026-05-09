import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dot } from "./shared.jsx";
import intl from "react-intl-universal";
import { navigateToSessionAudit } from "./navigation.js";

/* ────── 左侧：风险趋势变化 ────── */
function RiskTrendPanel({ trend }) {
  return (
    <div
      className="flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-none cursor-pointer transition hover:border-primary/30"
      onClick={() => navigateToSessionAudit({})}
      title={intl.get("auditOverview.riskTrend")}
    >
      <div className="flex items-center gap-1.5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.riskTrend")}</h4>
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      </div>
      <div className="mt-3 h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={trend.series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="riskTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 40]} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(v) => [v, intl.get("auditOverview.riskCount")]}
            />
            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#riskTrendFill)" dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5, fill: "#3b82f6", stroke: "white", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ────── 独立环形图面板 ────── */
function DonutPanel({ title, data, totalLabel, totalValue, channelMode }) {
  // 风险类型 → 关键证据映射
  const RISK_TYPE_EVIDENCE = {
    "auditOverview.riskType.toolError": "tool",
    "auditOverview.riskType.sensitiveCmd": "exec",
    "auditOverview.riskType.exitCode": "exec",
    "auditOverview.riskType.network": "network",
    "auditOverview.riskType.fileOp": "file",
    "auditOverview.riskType.noData": null,
  };

  const handleItemClick = (e) => {
    const name = typeof e.name === "string" ? e.name : "";
    if (channelMode) {
      // 渠道名可被搜索框匹配 channel 字段
      const channelMap = { Internal: "internal", Web: "web", API: "api", Feishu: "feishu", "Event Bus": "event-bus" };
      navigateToSessionAudit({ query: channelMap[name] || name.toLowerCase() });
    } else {
      // 风险类型 → 关键证据精准筛选
      const evFilter = RISK_TYPE_EVIDENCE[name];
      navigateToSessionAudit({
        ...(evFilter ? { evidenceFilter: evFilter } : {}),
        riskFilter: "high",
      });
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-none">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      <div className="mt-3 flex flex-1 items-start gap-3">
        <div className="h-[140px] w-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={1} onClick={handleItemClick}>
                {data.map((e, i) => (
                  <Cell key={i} fill={e.color} stroke="none" className="cursor-pointer" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {data.map((e, i) => (
            <div
              key={i}
              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[11px] transition hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => handleItemClick(e)}
            >
              <Dot style={{ backgroundColor: e.color }} />
              <span className="truncate text-gray-600 dark:text-gray-400">{intl.get(e.name)}</span>
              <span className="ml-auto shrink-0 tabular-nums text-gray-500">{e.pct}</span>
            </div>
          ))}
        </div>
      </div>
      {totalLabel && (
        <div className="mt-auto border-t border-gray-100 pt-3 text-right text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span>{intl.get(totalLabel)}: <strong className="text-gray-900 dark:text-gray-100">{totalValue}</strong></span>
        </div>
      )}
    </div>
  );
}

export default function TrendStructureRow({ trend, structure }) {
  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <RiskTrendPanel trend={trend} />
      <DonutPanel
        title={intl.get("auditOverview.riskTypeDistribution")}
        data={structure.typeDistribution}
        totalLabel="auditOverview.riskRuleTotal"
        totalValue={structure.totals.ruleCount}
      />
      <DonutPanel
        title={intl.get("auditOverview.riskChannelDistribution")}
        data={structure.channelDistribution}
        totalLabel="auditOverview.channelTotal"
        totalValue={structure.totals.channelCount}
        channelMode
      />
    </section>
  );
}
