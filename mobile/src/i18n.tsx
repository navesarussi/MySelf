import React, { useEffect } from "react";
import { I18nManager, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTranslator, isRtl } from "@/lib/i18n/core";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/types";

const STORAGE_KEY = "myself.locale";

type I18nValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  rtl: boolean;
};

const I18nContext = React.createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k) => k,
  rtl: true,
});

function applyDocumentDirection(locale: Locale) {
  const rtl = isRtl(locale);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }
  if (Platform.OS !== "web" && I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(rtl);
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw === "he" || raw === "en") setLocaleState(raw);
    });
  }, []);

  useEffect(() => {
    applyDocumentDirection(locale);
  }, [locale]);

  const value = React.useMemo<I18nValue>(() => {
    const t = createTranslator(locale);
    return {
      locale,
      setLocale: (l: Locale) => {
        setLocaleState(l);
        AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
      },
      t,
      rtl: isRtl(locale),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return React.useContext(I18nContext);
}
