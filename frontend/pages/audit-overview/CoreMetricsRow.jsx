import intl from "react-intl-universal";
import { SparklineCard } from "./shared.jsx";
import { navigateToSessionAudit } from "./navigation.js";

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.964 11.964 0 015.626 7.5c-.448.638-.75 1.37-.75 2.143 0 5.41 2.889 10.052 7.124 12.421 4.235-2.369 7.124-7.01 7.124-12.421 0-.772-.302-1.505-.75-2.143A11.964 11.964 0 0112 2.714z" />
    </svg>
  );
}

function ExclamationIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function TargetIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2m-8-10h2m14 0h2m-3.172-5.172l1.414-1.414M5.758 18.364l-1.414 1.414M18.364 18.364l1.414 1.414M5.758 5.758L4.344 4.344M12 7a5 5 0 100 10 5 5 0 000-10z" />
    </svg>
  );
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function BotIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

const ICON_MAP = {
  riskLevel: ShieldIcon,
  highRiskSessions: ExclamationIcon,
  riskHits: TargetIcon,
  affectedAccounts: UsersIcon,
  riskAgents: BotIcon,
};

/** 卡片 ID → 下钻 params 映射 */
const CARD_DRILL_PARAMS = {
  riskLevel: { riskFilter: "high" },
  highRiskSessions: { riskFilter: "high" },
  riskHits: { riskFilter: "high" },
  affectedAccounts: { riskFilter: "high" },
  riskAgents: { riskFilter: "high" },
};

export default function CoreMetricsRow({ metrics }) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => {
          const Icon = ICON_MAP[m.id] || ShieldIcon;
          const title = intl.get(`auditOverview.card.${m.id}`);
          const drillParams = CARD_DRILL_PARAMS[m.id];
          return (
            <SparklineCard
              key={m.id}
              {...m}
              title={title}
              icon={<Icon className="h-4 w-4" />}
              onClick={drillParams ? () => navigateToSessionAudit(drillParams) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
