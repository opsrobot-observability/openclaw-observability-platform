import intl from "react-intl-universal";

/** 数字员工 · 员工概览（演示） */
export default function DigitalEmployeeOverview() {
  const cards = [
    {
      titleKey: "digitalEmployee.onDuty",
      value: "24",
      hintKey: "digitalEmployee.onDutyHint",
      accent: "from-primary/10 to-blue-50 dark:from-primary/20 dark:to-gray-900",
    },
    {
      titleKey: "digitalEmployee.todayDialogue",
      value: "12.8k",
      hintKey: "digitalEmployee.todayDialogueHint",
      accent: "from-emerald-50 to-emerald-50/50 dark:from-emerald-950/50 dark:to-gray-900",
    },
    {
      titleKey: "digitalEmployee.avgResponse",
      value: "1.2s",
      hintKey: "digitalEmployee.avgResponseHint",
      accent: "from-violet-50 to-violet-50/40 dark:from-violet-950/40 dark:to-gray-900",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="app-card p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{intl.get("digitalEmployee.overviewTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {intl.get("digitalEmployee.overviewDesc")}
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <article
            key={c.titleKey}
            className="relative overflow-hidden app-card p-6 transition hover:shadow-card-hover dark:hover:shadow-none"
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.accent} opacity-90`} />
            <div className="relative">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{intl.get(c.titleKey)}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{c.value}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{intl.get(c.hintKey)}</p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
