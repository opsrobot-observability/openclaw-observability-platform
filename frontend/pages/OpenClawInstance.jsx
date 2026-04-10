import { useCallback, useState } from "react";
import intl from "react-intl-universal";
import OtelOverview, { OtelInstanceListPanel } from "./OtelOverview.jsx";
import ConfigChange from "./ConfigChange.jsx";

const MAIN_TABS = [
  { key: "runOverview", labelKey: "openclawInstance.tabRunOverview" },
  { key: "runDetail", labelKey: "openclawInstance.tabRunDetail" },
  { key: "configChange", labelKey: "openclawInstance.tabConfigChange" },
];

export default function OpenClawInstance() {
  const [mainTab, setMainTab] = useState("runOverview");
  const [telemetryData, setTelemetryData] = useState(null);
  const onTelemetryData = useCallback((d) => setTelemetryData(d), []);

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-100 dark:border-gray-700/60">
        <nav className="flex gap-1" aria-label={intl.get("page.openclawInstance.title")}>
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMainTab(tab.key)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                mainTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
              ].join(" ")}
            >
              {intl.get(tab.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      <div className={mainTab === "runOverview" ? "block" : "hidden"} aria-hidden={mainTab !== "runOverview"}>
        <OtelOverview onTelemetryData={onTelemetryData} />
      </div>

      {mainTab === "runDetail" && <OtelInstanceListPanel data={telemetryData} />}
      {mainTab === "configChange" && <ConfigChange />}
    </div>
  );
}
