export type Locale = "he" | "en";

export const LOCALES: Locale[] = ["he", "en"];
export const DEFAULT_LOCALE: Locale = "he";
export const LOCALE_COOKIE = "locale";

/** URL/query filter sentinel — language-independent */
export const ALL_FILTER = "all";

export type Messages = typeof import("./messages").messages.he;
