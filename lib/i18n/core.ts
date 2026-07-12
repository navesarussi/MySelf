import { messages } from "./messages";
import type { Locale, Messages } from "./types";

export { ALL_FILTER, DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE } from "./types";
export type { Locale, Messages } from "./types";

type Params = Record<string, string | number>;

export function isRtl(locale: Locale): boolean {
  return locale === "he";
}

export function localeTag(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

export function getMessages(locale: Locale): Messages {
  return messages[locale] as Messages;
}

function lookup(dict: Messages, key: string): string | undefined {
  const parts = key.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function createTranslator(locale: Locale) {
  const dict = getMessages(locale);
  return function t(key: string, params?: Params): string {
    const template = lookup(dict, key) ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? `{${name}}`)
    );
  };
}

export type Translator = ReturnType<typeof createTranslator>;

export function formatLocaleDate(
  locale: Locale,
  iso: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString(localeTag(locale), options);
}

export function formatLocaleDateTime(locale: Locale, iso: string | null): string {
  if (!iso) return createTranslator(locale)("common.notSyncedYet");
  return new Date(iso).toLocaleString(localeTag(locale));
}
