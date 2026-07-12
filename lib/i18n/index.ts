import { cookies } from "next/headers";
import { createTranslator, isRtl } from "./core";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./types";

export * from "./core";

function isLocale(value: string | undefined): value is Locale {
  return value === "he" || value === "en";
}

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export async function getTranslations() {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale), isRtl: isRtl(locale) };
}
