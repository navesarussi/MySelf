/**
 * User-facing merchant labels: friendly names, Hebrew spacing, Cal OCR cleanup.
 * Keys stay in merchant-rules-client + cal-duplicate — this module is display-only.
 */

import { pickPreferredMerchantLabel } from "@/lib/finance/cal-duplicate";
import { normalizeHebrewDescription, segmentGluedHebrew } from "@/lib/finance/hebrew-merchant";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";

/** Full Cal category names — longest first; only exact matches are stripped. */
export const CAL_CATEGORY_PREFIXES = [
  "מזון ומשקאות",
  "מזון מהיר",
  "פנאי בילוי",
  "רכבות חבור",
  "ריהוט ובית",
  "ריהוט בית",
  "עמותות ותר",
  "ציוד ומשרד",
  "ביטוח ופינ",
  "מוצרי און",
  "מסעדות",
  "מוסדות",
  "אנרגיה",
  "תיירות",
  "ביטוח",
] as const;

const CAL_STANDING_ORDER = /^(?:לא\s*)?(?:הוראת\s+קבע\s*)+/iu;

/** Standalone Cal "not standing order" marker — not לאומי / לא הוראת. */
const CAL_NOT_STANDING = /^לא\s+(?!הוראת\b|ומי\b)/iu;

const COUNTRY_CATEGORY_PREFIX =
  /^(?:(?:לא\s+)?(?:ארצות\s*הברית|ארה"ב|יפן|ליטואניה|אוסטרליה|קפריסין|ישראל|אירלנד|בריטניה|אירופה|חו"ל))(?:\s+(?:שונות|תיירות|מחשבים|מוצרי(?:\s*און)?|מזון(?:\s*ו(?:משקאות|מהיר)?)?|פנאי(?:\s*בילוי)?|רכב(?:ות(?:\s*חבור)?)?|ריהוט(?:\s*ובית)?|בית|אנרגיה|ביטוח|מסעדות|מוסדות|עמותות(?:\s*ותר)?))?\s*/iu;

const LATIN_LOCATION_TAIL =
  /\s+(?:(?:\b(?:abu\s+dhabi|dubai|sydney|melbourne|larnaca|limassol|luxembourg|darlinghurst|ramat\s*gan|tel\s*aviv)\b|\b[a-z]{2,}\s+[a-z]{2,}\b|\b[a-z]{2}\b))(?:\s+\b[a-z]{2}\b)?$/i;

type FriendlyRule = { pattern: RegExp; name: string };

/** Known international merchants — match on normalized Latin text. Order matters. */
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
];

function compactHebrew(s: string): string {
  return s.replace(/[\s"'-]/g, "");
}

/** Count meaningful letters (Hebrew or Latin), ignoring punctuation and digits. */
export function meaningfulCharCount(s: string): number {
  return (s.match(/[\u0590-\u05FFA-Za-z]/g) ?? []).length;
}

function categoryCompact(cat: string): string {
  return compactHebrew(cat);
}

function stripCalMarkers(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(CAL_STANDING_ORDER, "")
      .replace(CAL_NOT_STANDING, "")
      .replace(COUNTRY_CATEGORY_PREFIX, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function sliceAfterCompactPrefix(text: string, prefixCompactLen: number): string {
  let ci = 0;
  let oi = 0;
  while (oi < text.length && ci < prefixCompactLen) {
    if (!/[\s"'-]/.test(text[oi])) ci++;
    oi++;
  }
  return text.slice(oi).trim();
}

/** Strip a full known Cal category prefix (spaced or exactly glued). */
export function stripFullCategoryPrefix(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  for (const cat of CAL_CATEGORY_PREFIXES) {
    if (trimmed.startsWith(`${cat} `) || trimmed === cat) {
      const rest = trimmed.slice(cat.length).trim();
      if (meaningfulCharCount(rest) >= 2) return rest;
    }
  }

  const compact = compactHebrew(trimmed);
  for (const cat of CAL_CATEGORY_PREFIXES) {
    const catC = categoryCompact(cat);
    if (!compact.startsWith(catC) || compact.length <= catC.length) continue;
    const rest = sliceAfterCompactPrefix(trimmed, catC.length);
    if (meaningfulCharCount(rest) < 2) continue;
    return rest;
  }

  return trimmed;
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

function stripLatinLocationJunk(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(LATIN_LOCATION_TAIL, "")
      .replace(/\s+\d{4,}(?:\s+[\w.]*)?$/g, "")
      .replace(/\s+(?:www\.[\w.]+|[\w.]+\.(?:com|co|io|us|au|ae|cy|lu))\s*$/i, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function titleLatinFallback(text: string): string {
  const t = stripLatinLocationJunk(text.trim());
  if (!t) return t;
  const friendly = friendlyLatinName(t);
  if (friendly) return friendly;
  if (!/[A-Za-z]/.test(t)) return t;
  return t
    .split(/\s+/)
    .map((w) => {
      if (/^mcdonald/i.test(w)) return "McDonald's";
      if (/^[A-Z0-9*.,/\\-]+$/.test(w) && w.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function isMostlyLatin(text: string): boolean {
  const hebrew = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return latin > 0 && latin >= hebrew;
}

export type DisplayMerchantOptions = {
  /** When true, prefer the raw descriptor over friendly mapping (detail sheets). */
  raw?: boolean;
};

/**
 * Best user-facing merchant label.
 * Strips Cal markers and full category prefixes, maps known merchants, never shrinks below 2 letters.
 */
export function formatDisplayMerchantName(
  value: string | null | undefined,
  options?: DisplayMerchantOptions
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  if (options?.raw) return formatMerchantLabel(raw);

  if (isMostlyLatin(raw)) {
    const cleaned = stripLatinLocationJunk(raw);
    const friendly = friendlyLatinName(cleaned);
    if (friendly) return friendly;
    return titleLatinFallback(cleaned);
  }

  let s = formatMerchantLabel(raw);
  s = stripCalMarkers(s);
  s = stripFullCategoryPrefix(s);

  const latinFriendly = friendlyLatinName(s);
  if (latinFriendly) return latinFriendly;

  if (/[\u0590-\u05FF]/.test(s)) {
    s = normalizeHebrewDescription(s);
    if (!/\s/.test(s) && meaningfulCharCount(s) >= 4) {
      const segmented = segmentGluedHebrew(s);
      if (segmented.includes(" ")) s = segmented;
    }
    return withMinLengthFallback(raw, s);
  }

  return withMinLengthFallback(raw, titleLatinFallback(s));
}

/** Pick the best display label from merchant + description fields. */
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

/** Compute display_name for a merchant rule row — never changes merchant_key. */
export function normalizeStoredDisplayName(input: {
  merchant_key: string;
  display_name?: string | null;
}): { display_name: string | null } {
  const source = input.display_name?.trim() || input.merchant_key.trim();
  if (!source) return { display_name: null };
  return { display_name: formatDisplayMerchantName(source) || null };
}

/**
 * Migration helper — merchant_key is returned unchanged; only display_name is normalized.
 * @deprecated Prefer normalizeStoredDisplayName — kept for script compatibility.
 */
export function normalizeStoredMerchantFields(input: {
  merchant_key: string;
  display_name?: string | null;
}): { merchant_key: string; display_name: string | null } {
  const rawKey = input.merchant_key.trim();
  const { display_name } = normalizeStoredDisplayName(input);
  return { merchant_key: rawKey, display_name };
}

/** Attach computed display label to a merchant rule for API responses. */
export function enrichMerchantRuleForDisplay<T extends { merchant_key: string; display_name?: string | null }>(
  rule: T
): T & { display_name: string } {
  const display =
    formatDisplayMerchantName(rule.display_name) ||
    formatDisplayMerchantName(rule.merchant_key) ||
    rule.merchant_key;
  return { ...rule, display_name: display };
}
