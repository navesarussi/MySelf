/** Helpers for Cal PDF foreign-currency (USD/EUR) rows. */

/** Parse amount preserving sign (negative = credit/refund). */
export function parseSignedAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function parseAbsAmount(raw: string): number | null {
  const n = parseSignedAmount(raw);
  return n == null ? null : Math.abs(n);
}

const INFO_FX_LINE =
  /לידיעה\s*בלבד|for\s+information\s+only|עמל(?:ה|ת)\s*עסק(?:ה|א)\s*במט.?ח/i;

/** Informational FX-fee lines on Cal statements — not real charges. */
export function isInformationalFxLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (INFO_FX_LINE.test(t)) return true;
  const compact = t.replace(/\s+/g, "");
  return /לידיעהבלבד|עמלתעסקהבמט"ח/.test(compact);
}

const HEBREW_CATEGORY_NOISE =
  /^(?:לא\s+)?(?:שונות|תיירות|מחשבים|מוצרי(?:\s*און)?|זיכוי|פנאי|מזון|מסעדות|קניות|ביטוח|תחבורה|עמותות|ברכבות|רכבות|משקאות|מילוד|חבור|ותר|תר|מוסדות)$/iu;

const HEBREW_COUNTRY_CATEGORY =
  /^(?:לא\s+)?(?:ארצות\s*הברית|ארה"ב|יפן|ליטואניה|אוסטרליה|קפריסין|ישראל|אירלנד|בריטניה|אירופה|חו"ל)(?:\s+(?:שונות|תיירות|מחשבים|מוצרי(?:\s*און)?|מזון|פנאי))?$/iu;

/** Hebrew country/category tail tokens that must not win over a Latin merchant. */
export function isHebrewFxCategoryNoise(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  if (HEBREW_CATEGORY_NOISE.test(t)) return true;
  if (HEBREW_COUNTRY_CATEGORY.test(t)) return true;
  if (/^לא\s*$/iu.test(t)) return true;
  if (/^[\d.]+$/u.test(t)) return true;
  if (/^00\.\d+$/u.test(t)) return true;
  const compact = t.replace(/\s+/g, "");
  if (/^לא[\u0590-\u05FF]{2,}(?:שונות|תיירות|מחשבים|מוצרי|זיכוי)/u.test(compact)) return true;
  if (/^לא?זיכוי/u.test(compact)) return true;
  return false;
}

/** True when a token is probably a reversed Latin merchant fragment from Cal PDF text. */
export function looksRtlLatinToken(raw: string): boolean {
  const t = raw.trim();
  if (!/^[A-Za-z0-9*.,/\\-]+$/.test(t)) return false;
  if (/\.(?:moc|gro|ten|vog|iam|ude|oc)$/i.test(t)) return true;
  if (/^moc\./i.test(t)) return true;
  if (/\.(?:com|net|org|app|io|ai)$/i.test(t)) return false;
  if (/^[A-Z][A-Z0-9*.,/\\-]{4,}$/.test(t) && /[AEIOUY]/i.test(t)) return false;
  if (/[AEIOU]{2,}/i.test(t) || /\.[A-Z]{2,}$/i.test(t)) return false;
  if (/^\d/.test(t) && /\d$/.test(t)) return false;
  return t.length >= 4 && !/[aeiou]{2}/i.test(t);
}

export function reverseLatinToken(raw: string): string {
  if (!/^[A-Za-z0-9*.,/\\-]+$/.test(raw)) return raw;
  if (!looksRtlLatinToken(raw)) return raw;
  return raw.split("").reverse().join("");
}

export function reverseLatinMerchantLine(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => reverseLatinToken(w))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
