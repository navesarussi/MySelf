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

/**
 * Keep the native layout engine in LTR so `left`/`right` mean physical sides.
 * App-level Hebrew/English mirroring is handled entirely by useLayoutDir().
 * (forceRTL requires a reload to stick; we still request LTR for future launches.)
 */
function lockNativeLayoutToLtr() {
  if (Platform.OS === "web") return;
  try {
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
  } catch {
    /* ignore */
  }
}

function applyWebDocumentDirection(locale: Locale) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const rtl = isRtl(locale);
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.documentElement.lang = locale;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    lockNativeLayoutToLtr();
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw === "he" || raw === "en") setLocaleState(raw);
    });
  }, []);

  useEffect(() => {
    applyWebDocumentDirection(locale);
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
