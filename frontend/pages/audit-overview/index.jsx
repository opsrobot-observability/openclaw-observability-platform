import CoreMetricsRow from "./CoreMetricsRow.jsx";
import TrendStructureRow from "./TrendStructureRow.jsx";
import BehaviorDynamicsRow from "./BehaviorDynamicsRow.jsx";

export default function AuditOverviewContent({ data }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      <CoreMetricsRow metrics={data.coreMetrics} />
      <TrendStructureRow trend={data.riskTrend} structure={data.riskStructure} />
      <BehaviorDynamicsRow
        heatmap={data.heatmap}
        agents={{
          list: data.riskObjects?.agents || [],
          totalLabel: data.riskObjects?.totalLabel || "",
          viewAllLabel: data.riskObjects?.viewAllLabel || "auditOverview.viewFullRanking",
        }}
      />
    </div>
  );
}
