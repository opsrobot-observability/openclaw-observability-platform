import common from "./common.js";
import dashboard from "./dashboard.js";
import auditOverview from "./auditOverview.js";
import configChange from "./configChange.js";
import costAnalysis from "./costAnalysis.js";
import costOverview2 from "./costOverview2.js";
import agentCostDetail from "./agentCostDetail.js";
import llmCost from "./llmCost.js";
import sessionAudit from "./sessionAudit.js";
import fullChainTraceability from "./fullChainTraceability.js";
import digitalEmployee from "./digitalEmployee.js";
import otelOverview from "./otelOverview.js";
import instanceMonitoring from "./instanceMonitoring.js";
import hostMonitor from "./hostMonitor.js";
import callChainAnalysis from "./callChainAnalysis.js";

export default {
  ...common,
  ...dashboard,
  ...auditOverview,
  ...configChange,
  ...costAnalysis,
  ...costOverview2,
  ...agentCostDetail,
  ...llmCost,
  ...sessionAudit,
  ...fullChainTraceability,
  ...digitalEmployee,
  ...otelOverview,
  ...instanceMonitoring,
  ...hostMonitor,
  ...callChainAnalysis,
};
