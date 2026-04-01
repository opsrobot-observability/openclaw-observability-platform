import intl from "react-intl-universal";
import { useLocale } from "../context/LocaleContext.jsx";

const LANGS = [
  { id: "zh-CN", labelKey: "lang.zh", icon: "中" },
  { id: "en-US", labelKey: "lang.en", icon: "EN" },
];

export default function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  const current = LANGS.find((item) => item.id === locale) || LANGS[0];

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label={intl.get("lang.switch")}
        title={intl.get("lang.switch")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <span className="text-[11px] font-semibold leading-none">{current.icon}</span>
      </button>
      <div className="invisible pointer-events-none absolute right-0 top-full z-20 min-w-28 rounded-lg border border-gray-200 bg-white p-1 opacity-0 shadow-lg transition group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:opacity-100 dark:border-gray-700 dark:bg-gray-900">
        {LANGS.map(({ id, labelKey, icon }) => {
          const active = locale === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setLocale(id)}
              className={[
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
              ].join(" ")}
            >
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-gray-100 px-1 text-[10px] font-semibold leading-none dark:bg-gray-800">
                {icon}
              </span>
              <span>{intl.get(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
