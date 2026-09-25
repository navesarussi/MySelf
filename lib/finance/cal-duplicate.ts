import type { FinanceTransaction } from "@/lib/finance/types";
import {
  formatMerchantLabel,
  legacyNormalizeMerchantKey,
  normalizeMerchantKey,
} from "@/lib/finance/merchant-rules-client";
import { round2 } from "@/lib/finance/money";

/** Category tokens glued ahead of the real merchant in Cal PDF OCR rows. */
const CAL_CATEGORY_GLUE_WORDS = [
  "ברכבות",
  "רכבות",
  "עמותות",
  "משקאות",
  "מסעדות",
  "מוסדות",
  "תחבורה",
  "מילוד",
  "חבור",
  "ותר",
  "מזון",
  "קניות",
  "תר",
] as const;

const CAL_STANDING_ORDER_PREFIX = /^(?:לא\s*)?(?:הוראת\s+קבע\s*)+/iu;

const GLUED_OCR_PATTERN = /^[\u0590-\u05FF"']{10,}$/u;

/** Variable highway-toll standing orders — expected under transport, not fixed recurring. */
const VARIABLE_TOLL_CORE = /(?:^|\s)כביש(?:\s*6)?(?:\s|$)/iu;

export function isCalOcrGarbageMerchant(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return false;
  if (/לא\s*הוראת\s*קבע|לאהוראתקבע/iu.test(raw)) return true;
  const spaced = formatMerchantLabel(raw);
  if (/^לא\s+הוראת\s+קבע/iu.test(spaced)) return true;
  if (GLUED_OCR_PATTERN.test(raw.replace(/\s+/g, ""))) return true;
  return false;
}

function stripLeadingCategoryGlueTokens(text: string): string {
  let parts = text.split(/\s+/).filter(Boolean);
  const glue = [...CAL_CATEGORY_GLUE_WORDS].sort((a, b) => b.length - a.length);

  while (parts.length > 0) {
    const raw = parts[0];
    if (raw === "ו") {
      parts.shift();
      continue;
    }

    let stripped = false;
    for (const word of glue) {
      const lower = raw.toLowerCase();
      if (lower === word || lower === `ו${word}`) {
        parts.shift();
        stripped = true;
        break;
      }
      if (lower.startsWith(`ו${word}`) && lower.length > word.length + 1) {
        parts[0] = raw.slice(word.length + 1);
        stripped = true;
        break;
      }
      if (lower.startsWith(word) && lower.length > word.length) {
        parts[0] = raw.slice(word.length);
        stripped = true;
        break;
      }
    }
    if (stripped) continue;
    break;
  }

  let joined = parts.join(" ").trim();
  if (!joined.includes(" ") && joined.length >= 6) {
    const compact = joined.replace(/\s+/g, "");
    for (const word of glue) {
      if (compact.startsWith(word) && compact.length > word.length) {
        joined = compact.slice(word.length);
        break;
      }
      if (compact.startsWith(`ו${word}`) && compact.length > word.length + 1) {
        joined = compact.slice(word.length + 1);
        break;
      }
    }
  }

  return joined.trim();
}

export function extractCoreMerchantName(text: string | null | undefined): string {
  let s = formatMerchantLabel(text ?? "");
  s = s.replace(CAL_STANDING_ORDER_PREFIX, "");
  s = stripLeadingCategoryGlueTokens(s);
  if (s.replace(/\s+/g, "").length >= 8 && !/\s/.test(s)) {
    s = stripLeadingCategoryGlueTokens(formatMerchantLabel(s.replace(/\s+/g, "")));
  }
  return legacyNormalizeMerchantKey(s.replace(/\s+/g, " ").trim());
}

export function recurringMerchantGroupKey(input: {
  merchant?: string | null;
  description?: string | null;
}): string {
  const cores = [input.merchant, input.description]
    .map((v) => extractCoreMerchantName(v))
    .filter(Boolean);
  if (!cores.length) {
    const fallback = [input.merchant, input.description]
      .map((v) => normalizeMerchantKey(formatMerchantLabel(v ?? "")))
      .filter(Boolean);
    return fallback.sort((a, b) => b.length - a.length)[0] ?? "";
  }
  return cores.sort((a, b) => b.length - a.length)[0] ?? "";
}

export function recurringGroupKeysRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const wa = new Set(a.split(" ").filter(Boolean));
  const wb = b.split(" ").filter(Boolean);
  if (!wa.size || !wb.length) return false;
  const shared = wb.filter((w) => wa.has(w));
  return shared.length >= Math.min(wa.size, wb.length);
}

export function mergeRecurringMerchantGroups<T>(byKey: Map<string, T[]>): Map<string, T[]> {
  const keys = [...byKey.keys()];
  const parent = new Map<string, string>();
  for (const k of keys) parent.set(k, k);

  function find(k: string): string {
    const p = parent.get(k)!;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  }

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (recurringGroupKeysRelated(keys[i], keys[j])) {
        const ri = find(keys[i]);
        const rj = find(keys[j]);
        const merged = ri.length >= rj.length ? ri : rj;
        parent.set(ri, merged);
        parent.set(rj, merged);
      }
    }
  }

  const merged = new Map<string, T[]>();
  for (const [key, items] of byKey.entries()) {
    const root = find(key);
    const list = merged.get(root) ?? [];
    list.push(...items);
    merged.set(root, list);
  }

  return merged;
}

export function pickPreferredMerchantLabel(
  ...fields: Array<string | null | undefined>
): string {
  const candidates = fields
    .map((v) => formatMerchantLabel(v ?? ""))
    .filter((v) => v.length >= 2);

  const clean = candidates.filter((c) => !isCalOcrGarbageMerchant(c));
  const pool = clean.length ? clean : candidates;
  if (!pool.length) return "";

  return pool.sort((a, b) => {
    const score = (s: string) => {
      let n = 0;
      if (!isCalOcrGarbageMerchant(s)) n += 100;
      if (/\d/.test(s)) n += 10;
      if (/\s/.test(s)) n += 5;
      n -= s.length * 0.01;
      return n;
    };
    return score(b) - score(a);
  })[0];
}

export function isVariableTollMerchant(
  input: Pick<FinanceTransaction, "merchant" | "description"> | string
): boolean {
  const key =
    typeof input === "string"
      ? input
      : [input.merchant, input.description]
          .map((v) => formatMerchantLabel(v ?? ""))
          .join(" ");
  const core = extractCoreMerchantName(key) || normalizeMerchantKey(key);
  return VARIABLE_TOLL_CORE.test(core) || VARIABLE_TOLL_CORE.test(formatMerchantLabel(key));
}

export function txnRowQualityScore(t: {
  merchant?: string | null;
  description?: string | null;
}): number {
  let score = 0;
  const merchant = t.merchant?.trim() ?? "";
  const description = t.description?.trim() ?? "";
  if (merchant && !isCalOcrGarbageMerchant(merchant)) score += 50;
  if (description === "הוראת קבע" && merchant) score += 30;
  if (/\s/.test(merchant)) score += 10;
  if (/\d/.test(merchant)) score += 5;
  score -= (merchant.length + description.length) * 0.01;
  return score;
}

/** One logical charge per calendar day + amount (keep cleanest row). */
export function dedupeSameDayAmountCharges(txns: FinanceTransaction[]): FinanceTransaction[] {
  const byDayAmount = new Map<string, FinanceTransaction>();
  for (const t of txns) {
    const key = `${t.txn_date}|${round2(t.amount)}`;
    const existing = byDayAmount.get(key);
    if (!existing || txnRowQualityScore(t) > txnRowQualityScore(existing)) {
      byDayAmount.set(key, t);
    }
  }
  return [...byDayAmount.values()];
}

export function typicalChargeAmount(amounts: number[]): number {
  if (!amounts.length) return 0;
  const sorted = [...amounts].map(round2).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return round2((sorted[mid - 1] + sorted[mid]) / 2);
}

export function calDuplicateMerchantCore(input: {
  merchant?: string | null;
  description?: string | null;
}): string {
  const cores = [input.merchant, input.description]
    .map((v) => extractCoreMerchantName(v))
    .filter(Boolean);
  if (!cores.length) return recurringMerchantGroupKey(input);
  return cores.sort((a, b) => a.length - b.length)[0];
}

export function calDuplicateDayAmountKey(input: {
  txn_date: string;
  amount: number;
  source: string;
  merchant?: string | null;
  description?: string | null;
}): string {
  return `${input.txn_date}|${round2(input.amount)}|${input.source}|${calDuplicateMerchantCore(input)}`;
}

export function calDuplicateKeysCompatible(existingKey: string, candidateKey: string): boolean {
  const parts = (key: string) => {
    const bits = key.split("|");
    return {
      prefix: bits.slice(0, 3).join("|"),
      core: bits.slice(3).join("|"),
    };
  };
  const a = parts(existingKey);
  const b = parts(candidateKey);
  if (a.prefix !== b.prefix) return false;
  return recurringGroupKeysRelated(a.core, b.core);
}

export function shouldSkipCalGarbageDuplicate(input: {
  merchant?: string | null;
  description?: string | null;
  txn_date: string;
  amount: number;
  source: string;
  existingCleanKeys: Set<string>;
  batchCleanKeys: Set<string>;
}): boolean {
  if (input.source !== "visa_cal") return false;
  const field = input.merchant ?? input.description ?? "";
  if (!isCalOcrGarbageMerchant(field)) return false;
  const key = calDuplicateDayAmountKey(input);
  for (const existing of input.existingCleanKeys) {
    if (calDuplicateKeysCompatible(existing, key)) return true;
  }
  for (const existing of input.batchCleanKeys) {
    if (calDuplicateKeysCompatible(existing, key)) return true;
  }
  return false;
}
