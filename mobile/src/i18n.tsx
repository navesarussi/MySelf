import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTranslator, isRtl } from "@/lib/i18n/core";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/types";

/** Same dictionaries and translator as the website (lib/i18n). */

const STORAGE_KEY = "myself.locale";

type I18nValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  rtl: boolean;
};

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k) => k,
  rtl: true,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw === "he" || raw === "en") setLocaleState(raw);
    });
  }, []);

  const value = useMemo<I18nValue>(() => {
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
  return useContext(I18nContext);
}
