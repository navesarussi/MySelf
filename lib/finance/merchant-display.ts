/**
 * User-facing merchant labels: friendly names, Hebrew spacing, Cal OCR cleanup.
 * Keys stay in merchant-rules-client + cal-duplicate — this module is display-only.
 */

import { pickPreferredMerchantLabel } from "@/lib/finance/cal-duplicate";
import {
  expandGluedCategoryLabel,
  expandLoneCategoryLabel,
  formatHebrewMerchantRemainder,
  meaningfulCharCount,
  stripCategoryAndCardPrefixes,
  stripCategoryPrefix,
} from "@/lib/finance/merchant-segment";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";

export { CAL_GLUED_CATEGORY_PREFIXES as CAL_CATEGORY_PREFIXES } from "@/lib/finance/merchant-segment";
export { meaningfulCharCount } from "@/lib/finance/merchant-segment";

const CAL_STANDING_ORDER = /^(?:לא\s*)?(?:הוראת\s+קבע\s*)+/iu;

/** Standalone Cal "not standing order" marker — not לאומי / לא הוראת. */
const CAL_NOT_STANDING = /^לא\s+(?!הוראת\b|ומי\b)/iu;

/** Cal category rows prefixed with standalone לא (not standing order). */
const CAL_NOT_STANDING_CATEGORY = /^לא\s+(?=ביטוח|מוסדות|מזון|מסעדות|אנרגיה|גז|ציוד|ריהוט)/iu;

const FOREIGN_COUNTRY_RULES: Array<{ re: RegExp; label: string }> = [
  { re: /^אר(?:ה"ב|צות\s*הברית)/u, label: "ארצות הברית" },
  { re: /^אירלנד/u, label: "אירלנד" },
  { re: /^בריטניה/u, label: "בריטניה" },
  { re: /^אירופה/u, label: "אירופה" },
  { re: /^חו"ל/u, label: 'חו"ל' },
  { re: /^יפן/u, label: "יפן" },
  { re: /^ליטואניה/u, label: "ליטואניה" },
  { re: /^אוסטרליה/u, label: "אוסטרליה" },
  { re: /^קפריסין/u, label: "קפריסין" },
  { re: /^ישראל/u, label: "ישראל" },
];

const LATIN_LOCATION_TAIL =
  /\s+(?:(?:\b(?:abu\s+dhabi|dubai|sydney|melbourne|larnaca|limassol|luxembourg|darlinghurst|ramat\s*gan|tel\s*aviv)\b|\b[a-z]{2,}\s+[a-z]{2,}\b|\b[a-z]{2}\b))(?:\s+\b[a-z]{2}\b)?$/i;

const LEGAL_ENTITY_SUFFIX = /\s+\b(?:pty|ltd|llc|inc|corp|co|gmbh|llp|plc|limited)\.?\b/gi;

type FriendlyRule = { pattern: RegExp; name: string };

const FRIENDLY_MERCHANTS: FriendlyRule[] = [
  { pattern: /google\*?\s*cloud/i, name: "Google Cloud" },
  { pattern: /google\*?\s*play/i, name: "Google Play" },
  { pattern: /google\*?\s*journey/i, name: "Google Journey Diary" },
  { pattern: /^google\b/i, name: "Google" },
  { pattern: /mcdonald'?s?\b/i, name: "McDonald's" },
  { pattern: /cursor(?:,|\s).*?(?:ide|usage|\.com)/i, name: "Cursor" },
  { pattern: /^cursor\b/i, name: "Cursor" },
  { pattern: /wix\.com/i, name: "Wix" },
  { pattern: /hostinger/i, name: "Hostinger" },
  { pattern: /twilio/i, name: "Twilio" },
  { pattern: /anthropic|claude\.ai/i, name: "Anthropic / Claude" },
  { pattern: /apple\.com|apple\s*pay/i, name: "Apple" },
  { pattern: /esimo/i, name: "eSIMo" },
  { pattern: /replit/i, name: "Replit" },
  { pattern: /openai|chatgpt/i, name: "OpenAI" },
  { pattern: /github/i, name: "GitHub" },
  { pattern: /vercel/i, name: "Vercel" },
  { pattern: /netflix/i, name: "Netflix" },
  { pattern: /spotify/i, name: "Spotify" },
  { pattern: /microsoft|msft/i, name: "Microsoft" },
  { pattern: /amazon|amzn/i, name: "Amazon" },
  { pattern: /^gett\b/i, name: "Gett" },
  { pattern: /^shein\b/i, name: "SHEIN" },
  { pattern: /transportfornsw/i, name: "Transport for NSW" },
  { pattern: /autogrill/i, name: "Autogrill" },
];

function stripLeadingStandaloneLo(text: string): string {
  return text.trim().replace(/^לא\s+(?!הוראת\b|ומי\b)/iu, "");
}

function stripCalMarkers(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(CAL_STANDING_ORDER, "")
      .replace(CAL_NOT_STANDING_CATEGORY, "")
      .replace(CAL_NOT_STANDING, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function parseForeignCountryRow(text: string): { country: string; remainder: string } | null {
  const s = stripLeadingStandaloneLo(text);
  for (const { re, label } of FOREIGN_COUNTRY_RULES) {
    const m = s.match(re);
    if (!m) continue;
    const remainder = s.slice(m[0].length).trim();
    if (remainder || s === label) return { country: label, remainder };
  }
  return null;
}

function formatForeignCountryDisplay(country: string, remainder: string): string {
  if (!remainder) return country;
  let inner = stripCategoryAndCardPrefixes(remainder);
  if (!inner || meaningfulCharCount(inner) < 2) {
    inner = expandGluedCategoryLabel(remainder);
  } else {
    inner = expandGluedCategoryLabel(inner);
  }
  if (/[\u0590-\u05FF]/.test(inner)) {
    inner = formatHebrewMerchantRemainder(inner);
  }
  inner = expandLoneCategoryLabel(inner);
  if (!inner) return country;
  return `${inner} (${country})`;
}

/** @deprecated Use stripCategoryPrefix from merchant-segment */
export function stripFullCategoryPrefix(text: string): string {
  return stripCategoryPrefix(text);
}

function withMinLengthFallback(original: string, result: string): string {
  const r = result.trim();
  if (meaningfulCharCount(r) >= 2) return r;
  return formatMerchantLabel(original);
}

function friendlyLatinName(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const rule of FRIENDLY_MERCHANTS) {
    if (rule.pattern.test(t)) return rule.name;
  }
  return null;
}

function stripProcessorPrefix(text: string): string {
  const m = text.trim().match(/^(?:ms|sq|sp)\s*\*?\s*(\S+)/i);
  if (!m?.[1]) return text.trim();
  const word = m[1];
  if (/^nomads/i.test(word)) return "Nomads";
  return word;
}

function stripLatinLocationJunk(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(LATIN_LOCATION_TAIL, "")
      .replace(/\s+\d{4,}(?:\s+[\w.]*)?$/g, "")
      .replace(/\s+(?:www\.[\w.]+|[\w.]+\.(?:com|co|io|us|au|ae|cy|lu))\s*$/i, "")
      .replace(LEGAL_ENTITY_SUFFIX, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function trimTrailingPunctuation(text: string): string {
  return text.replace(/[\s\-–—,.;:]+$/u, "").trim();
}

function formatLatinAcronym(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && /^[a-z0-9]{2,4}$/i.test(words[0]!)) {
    return words[0]!.toUpperCase();
  }
  return text;
}

function titleLatinFallback(text: string): string {
  let t = stripLatinLocationJunk(stripProcessorPrefix(text.trim()));
  t = trimTrailingPunctuation(t);
  if (!t) return t;
  const friendly = friendlyLatinName(t);
  if (friendly) return trimTrailingPunctuation(friendly);
  if (!/[A-Za-z]/.test(t)) return t;
  const titled = t
    .split(/\s+/)
    .map((w) => {
      if (/^mcdonald/i.test(w)) return "McDonald's";
      if (/^[A-Z0-9*.,/\\-]+$/.test(w) && w.length <= 4) return w;
      if (/^\d+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
  return trimTrailingPunctuation(formatLatinAcronym(titled));
}

function isMostlyLatin(text: string): boolean {
  const hebrew = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return latin > 0 && latin >= hebrew;
}

export type DisplayMerchantOptions = {
  raw?: boolean;
};

export function formatDisplayMerchantName(
  value: string | null | undefined,
  options?: DisplayMerchantOptions
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  if (options?.raw) return formatMerchantLabel(raw);

  if (isMostlyLatin(raw)) {
    const cleaned = stripLatinLocationJunk(stripProcessorPrefix(raw));
    const friendly = friendlyLatinName(cleaned);
    if (friendly) return trimTrailingPunctuation(friendly);
    return titleLatinFallback(cleaned);
  }

  const foreign = parseForeignCountryRow(raw);
  if (foreign) {
    return withMinLengthFallback(raw, formatForeignCountryDisplay(foreign.country, foreign.remainder));
  }

  let s = formatMerchantLabel(raw);
  s = stripLeadingStandaloneLo(s);
  s = stripCalMarkers(s);

  const foreignAfterLo = parseForeignCountryRow(s);
  if (foreignAfterLo) {
    return withMinLengthFallback(raw, formatForeignCountryDisplay(foreignAfterLo.country, foreignAfterLo.remainder));
  }

  s = stripCategoryAndCardPrefixes(s);

  const latinFriendly = friendlyLatinName(s);
  if (latinFriendly) return trimTrailingPunctuation(latinFriendly);

  if (/[\u0590-\u05FF]/.test(s)) {
    s = formatHebrewMerchantRemainder(s);
    s = expandLoneCategoryLabel(s);
    return withMinLengthFallback(raw, s);
  }

  return withMinLengthFallback(raw, titleLatinFallback(s));
}

export function pickDisplayMerchantLabel(
  ...fields: Array<string | null | undefined>
): string {
  const preferred = pickPreferredMerchantLabel(...fields);
  if (preferred) return formatDisplayMerchantName(preferred);
  for (const f of fields) {
    const d = formatDisplayMerchantName(f);
    if (d) return d;
  }
  return "";
}

export function normalizeStoredDisplayName(input: {
  merchant_key: string;
  display_name?: string | null;
}): { display_name: string | null } {
  const source = input.display_name?.trim() || input.merchant_key.trim();
  if (!source) return { display_name: null };
  return { display_name: formatDisplayMerchantName(source) || null };
}

export function normalizeStoredMerchantFields(input: {
  merchant_key: string;
  display_name?: string | null;
}): { merchant_key: string; display_name: string | null } {
  const rawKey = input.merchant_key.trim();
  const { display_name } = normalizeStoredDisplayName(input);
  return { merchant_key: rawKey, display_name };
}

export function enrichMerchantRuleForDisplay<T extends { merchant_key: string; display_name?: string | null }>(
  rule: T
): T & { display_name: string } {
  const display =
    formatDisplayMerchantName(rule.display_name) ||
    formatDisplayMerchantName(rule.merchant_key) ||
    rule.merchant_key;
  return { ...rule, display_name: display };
}
