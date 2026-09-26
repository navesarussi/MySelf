/**
 * User-facing merchant labels: friendly names, Hebrew spacing, Cal OCR cleanup.
 * Keys/normalization stay in merchant-rules-client + cal-duplicate.
 */

import {
  extractCoreMerchantName,
  pickPreferredMerchantLabel,
} from "@/lib/finance/cal-duplicate";
import { normalizeHebrewDescription } from "@/lib/finance/hebrew-merchant";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";

/** Strip Cal standing-order / country-category noise from display text. */
const DISPLAY_NOISE_PREFIX =
  /^(?:לא\s*)?(?:הוראת\s+קבע\s*)+(?:ברכבות|רכבות|עמותות|משקאות|מסעדות|מוסדות|תחבורה|מילוד|חבור|ותר|מזון|קניות|תר|פנאי|בילוי|ריהוט|בית|שונות|תיירות|מחשבים|מוצרי(?:\s*און)?|זיכוי)?\s*/iu;

const DISPLAY_COUNTRY_TAIL =
  /^(?:לא\s+)?(?:ארצות\s*הברית|ארה"ב|יפן|ליטואניה|אוסטרליה|קפריסין|ישראל|אירלנד|בריטניה|אירופה|חו"ל)(?:\s+(?:שונות|תיירות|מחשבים|מוצרי(?:\s*און)?|מזון|פנאי|בילוי|רכב|ריהוט|בית))?\s*/iu;

type FriendlyRule = {
  pattern: RegExp;
  name: string;
};

/** Known international merchants — match on normalized Latin text. */
const FRIENDLY_MERCHANTS: FriendlyRule[] = [
  { pattern: /google\s*cloud/i, name: "Google Cloud" },
  { pattern: /google\s*play/i, name: "Google Play" },
  { pattern: /google\*?\s*journey/i, name: "Google Journey Diary" },
  { pattern: /^google\b/i, name: "Google" },
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
];

function stripDisplayNoise(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(DISPLAY_NOISE_PREFIX, "").replace(DISPLAY_COUNTRY_TAIL, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function friendlyLatinName(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const rule of FRIENDLY_MERCHANTS) {
    if (rule.pattern.test(t)) return rule.name;
  }
  return null;
}

/** Title-case a short Latin merchant fragment for display when no friendly map hits. */
function titleLatinFallback(text: string): string {
  const t = text.trim();
  if (!/[A-Za-z]/.test(t)) return t;
  const friendly = friendlyLatinName(t);
  if (friendly) return friendly;
  return t
    .split(/\s+/)
    .map((w) => {
      if (/^[A-Z0-9*.,/\\-]+$/.test(w) && w.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export type DisplayMerchantOptions = {
  /** When true, prefer the raw descriptor over friendly mapping (detail sheets). */
  raw?: boolean;
};

/**
 * Best user-facing merchant label.
 * Strips Cal "לא הוראת קבע" OCR prefixes, segments glued Hebrew, maps known merchants.
 */
export function formatDisplayMerchantName(
  value: string | null | undefined,
  options?: DisplayMerchantOptions
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  if (options?.raw) return formatMerchantLabel(raw);

  const spaced = formatMerchantLabel(raw);
  const stripped = stripDisplayNoise(spaced);
  const core = extractCoreMerchantName(stripped || spaced);
  const candidate = core || stripped || spaced;

  const friendly = friendlyLatinName(candidate);
  if (friendly) return friendly;

  if (/[\u0590-\u05FF]/.test(candidate)) {
    const segmented = normalizeHebrewDescription(candidate);
    const cleaned = stripDisplayNoise(segmented);
    return cleaned || segmented || candidate;
  }

  return titleLatinFallback(candidate);
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

/** Normalize stored merchant_key / display_name (for migrations). */
export function normalizeStoredMerchantFields(input: {
  merchant_key: string;
  display_name?: string | null;
}): { merchant_key: string; display_name: string | null } {
  const rawKey = input.merchant_key.trim();
  const rawDisplay = input.display_name?.trim() || null;
  const core = extractCoreMerchantName(rawKey) || extractCoreMerchantName(rawDisplay ?? "");
  const merchant_key = core || rawKey.toLowerCase().replace(/\s+/g, " ");
  const display_name = formatDisplayMerchantName(rawDisplay || rawKey) || null;
  return { merchant_key, display_name };
}
