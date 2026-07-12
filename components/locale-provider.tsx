"use client";

import { createContext, useContext, useMemo } from "react";
import { createTranslator, getMessages, type Locale, type Messages, type Translator } from "@/lib/i18n/core";

type LocaleContextValue = {
  locale: Locale;
  t: Translator;
  isRtl: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      locale,
      t: createTranslator(locale),
      isRtl: locale === "he",
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslations() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useTranslations must be used within LocaleProvider");
  }
  return ctx;
}

export function useMessages(): Messages {
  const { locale } = useTranslations();
  return getMessages(locale);
}
