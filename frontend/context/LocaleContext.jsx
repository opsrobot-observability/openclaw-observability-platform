import { createContext, useContext, useState, useEffect, useCallback, Fragment } from "react";
import intl from "react-intl-universal";
import zhCN from "../locales/zh-CN/index.js";
import enUS from "../locales/en-US/index.js";

const LOCALES = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const STORAGE_KEY = "app-locale";

function getInitialLocale() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LOCALES[stored]) return stored;
  const browserLang = navigator.language || navigator.userLanguage || "";
  if (browserLang.startsWith("en")) return "en-US";
  return "zh-CN";
}

const LocaleContext = createContext({
  locale: "zh-CN",
  setLocale: () => {},
  intlReady: false,
});

export function LocaleProvider({ children }) {
  const [locale, setLocaleRaw] = useState(getInitialLocale);
  const [intlReady, setIntlReady] = useState(false);

  useEffect(() => {
    intl
      .init({ currentLocale: locale, locales: LOCALES })
      .then(() => setIntlReady(true));
  }, []);

  const setLocale = useCallback(async (lang) => {
    if (!LOCALES[lang]) return;
    await intl.init({ currentLocale: lang, locales: LOCALES });
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    setLocaleRaw(lang);
  }, []);

  if (!intlReady) return null;

  return (
    <LocaleContext.Provider value={{ locale, setLocale, intlReady }}>
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export default LocaleContext;
