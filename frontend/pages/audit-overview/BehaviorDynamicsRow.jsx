import intl from "react-intl-universal";
import { ProgressBar } from "./shared.jsx";
import { navigateToSessionAudit } from "./navigation.js";

/* ────── 风险行为热力图 ────── */
function HeatmapPanel({ heatmap }) {
  const { xLabels, yLabels, matrix, maxValue, summaryText } = heatmap;
  const getOpacity = (v) => (maxValue > 0 ? v / maxValue : 0);
  return (
    <div className="flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-none">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.riskHeatmap")}</h4>
      <div className="mt-3 flex-1">
        <div className="flex">
          <div className="flex shrink-0 flex-col justify-around pr-2" style={{ width: 72 }}>
            {yLabels.map((label, i) => (
              <span key={i} className="truncate text-[10px] leading-4 text-gray-500 dark:text-gray-400" title={intl.get(label)}>
                {intl.get(label)}
              </span>
            ))}
          </div>
          <div className="flex-1">
            <div
              className="grid gap-px overflow-hidden rounded"
              style={{ gridTemplateColumns: `repeat(${xLabels.length}, 1fr)`, gridTemplateRows: `repeat(${yLabels.length}, 1fr)` }}
            >
              {matrix.flatMap((row, ri) =>
                row.map((v, ci) => (
                  <div
                    key={`${ri}-${ci}`}
                    className="aspect-square cursor-pointer transition-colors hover:ring-2 hover:ring-red-400"
                    style={{ backgroundColor: `rgba(239, 68, 68, ${getOpacity(v) * 0.9 + 0.05})` }}
                    title={`${intl.get(yLabels[ri])} · ${xLabels[ci]}:00 — ${v}`}
                    onClick={() => {
                      if (v <= 0) return;
                      const heatmapEvidenceMap = {
                        "auditOverview.heatmap.prompt": null,
                        "auditOverview.heatmap.toolCall": "tool",
                        "auditOverview.heatmap.fileAccess": "file",
                        "auditOverview.heatmap.browser": "network",
                        "auditOverview.heatmap.mcp": "tool",
                      };
                      const evFilter = heatmapEvidenceMap[yLabels[ri]];
                      navigateToSessionAudit({
                        ...(evFilter ? { evidenceFilter: evFilter } : {}),
                      });
                    }}
                  />
                ))
              )}
            </div>
            <div className="mt-1 flex" style={{ marginLeft: 0 }}>
              {xLabels.map((label, i) => (
                <span key={i} className="flex-1 text-center text-[10px] text-gray-400">{label}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-gray-400">
          <span>{intl.get("auditOverview.heatmapLow")}</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((o, i) => (
            <span key={i} className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: `rgba(239, 68, 68, ${o})` }} />
          ))}
          <span>{intl.get("auditOverview.heatmapHigh")}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{summaryText?.key ? intl.get(summaryText.key, summaryText.params) : summaryText}</p>
      </div>
    </div>
  );
}

/* ────── 高风险 Agent ────── */
function RiskAgentPanel({ agents, totalLabel, viewAllLabel }) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-none">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intl.get("auditOverview.highRiskAgent")}</h4>
      <div className="mt-3 flex-1 space-y-3">
        {agents.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">{intl.get("auditOverview.noHighRiskAgent")}</p>
        )}
        {agents.map((item, i) => (
          <div
            key={i}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => navigateToSessionAudit({ query: item.name, riskFilter: "high" })}
          >
            <span className="w-4 text-center text-xs font-medium tabular-nums text-gray-500">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                <span className="ml-2 shrink-0 tabular-nums text-gray-500">{item.pct}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <ProgressBar pct={item.pct} color={item.color} />
                <span className="text-[11px] tabular-nums text-gray-400">{item.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">{totalLabel?.key ? intl.get(totalLabel.key, totalLabel.params) : totalLabel}</span>
        <button type="button" className="text-xs font-medium text-primary hover:text-primary-hover">{intl.get(viewAllLabel)}</button>
      </div>
    </div>
  );
}

export default function BehaviorDynamicsRow({ heatmap, agents }) {
  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <HeatmapPanel heatmap={heatmap} />
      <RiskAgentPanel
        agents={agents?.list || []}
        totalLabel={agents?.totalLabel || ""}
        viewAllLabel={agents?.viewAllLabel || "auditOverview.viewFullRanking"}
      />
    </section>
  );
}
