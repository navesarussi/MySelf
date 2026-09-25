import { extractCoreMerchantName } from "@/lib/finance/cal-duplicate";
import { formatInstallmentLabel } from "@/lib/finance/import/installment-label";
import {
  isHebrewLocationNoise,
  normalizeHebrewDescription,
} from "@/lib/finance/hebrew-merchant";

export { normalizeHebrewDescription } from "@/lib/finance/hebrew-merchant";

const SUMMARY_KEYWORDS =
  /(?:^|[\s|])סה"כ|(?:^|[\s|])סה״כ|(?:^|[\s|])סה''כ|סך\s*ה\s*כל|^\s*(?:total|summary|subtotal|סיכום)\b/i;

/** Collapse whitespace and unify quote variants for robust summary matching. */
export function compactImportText(text: string): string {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/[""״''`]/g, '"')
    .replace(/\s+/g, "")
    .trim();
}

/** PayBox / Cal PDF label tokens that must not replace a Latin merchant name. */
const PAYBOX_MERCHANT_NOISE =
  /^(?:מזהה\s*כרטיס|מזההכרטיס|מס(?:'|\s*)?כרטיס|כרטיס|card\s*id)$/iu;

export function isPayboxMerchantNoise(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (PAYBOX_MERCHANT_NOISE.test(t)) return true;
  return PAYBOX_MERCHANT_NOISE.test(compactImportText(t));
}

export function isSummaryImportText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (SUMMARY_KEYWORDS.test(t)) return true;
  if (/^סה"כ\b/u.test(t)) return true;

  const compact = compactImportText(t).toLowerCase();
  if (!compact) return true;
  if (compact.includes("סה\"כ") || compact.includes("סה״כ") || compact.includes("סה''כ")) return true;
  if (/סה"כלתאריך|סהכלתאריך|לתאריךסה"כ|סךהכל|סךהכלל/.test(compact)) return true;
  if (/^total|^summary|^subtotal|^balance|^יתרה/.test(compact)) return true;
  return false;
}

/** Cal PDF inline row that is only amount + RTL date (date subtotal). */
export function isCalDateTotalLine(line: string, hasPendingMerchant: boolean): boolean {
  if (isSummaryImportText(line)) return true;
  if (/^-?[\d,.]+\s+\d{4}\/\d{2}\/\d{2,3}$/.test(line.trim()) && !hasPendingMerchant) return true;
  return false;
}

/** True when a Latin token is probably RTL-mirrored from Cal PDF text. */
function looksRtlLatinToken(raw: string): boolean {
  const t = raw.trim();
  if (!/^[A-Za-z0-9*./\\-]+$/.test(t)) return false;
  if (/\.(?:moc|gro|ten|vog|iam|ude|oc)$/i.test(t)) return true;
  if (/^moc\./i.test(t)) return true;
  if (/\.(?:com|net|org|app|io|ai)$/i.test(t)) return false;
  if (/^[A-Z][A-Z0-9*./\\-]{4,}$/.test(t) && /[AEIOUY]/.test(t)) return false;
  if (/[AEIOU]{2,}/.test(t) || /\.[A-Z]{2,}$/.test(t)) return false;
  return t.length >= 5 && !/[aeiou]{2}/i.test(t);
}

function reverseLatinToken(raw: string): string {
  if (!/^[A-Za-z0-9*./\\-]+$/.test(raw)) return raw;
  if (!looksRtlLatinToken(raw)) return raw;
  return raw.split("").reverse().join("");
}

function reverseMerchantLabel(raw: string): string {
  const trimmed = raw.trim();
  if (/[\u0590-\u05FF]/.test(trimmed)) return normalizeHebrewDescription(trimmed);
  return trimmed
    .split(/\s+/)
    .map((w) => reverseLatinToken(w))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTerminalPrefix(label: string): string {
  return label.replace(/^\d{3,}(?=ApplePay|Apple\s*Pay|APPLE)/i, "").trim();
}

function pickHebrewMerchant(chunks: string[]): string | null {
  const normalized = chunks
    .map((c) => normalizeHebrewDescription(c.trim()))
    .filter(
      (c) => c.length >= 3 && !isHebrewLocationNoise(c) && !isPayboxMerchantNoise(c)
    );

  const withSpaces = normalized.filter((c) => /\s/.test(c));
  if (withSpaces.length) return withSpaces.sort((a, b) => b.length - a.length)[0] ?? null;

  const meaningful = normalized.filter((c) => c.length >= 4);
  return meaningful.sort((a, b) => b.length - a.length)[0] ?? null;
}

function pickLatinMerchant(chunks: string[]): string | null {
  const cleaned = chunks
    .map((c) => stripTerminalPrefix(c.trim()))
    .filter((c) => c.length >= 3)
    .map((c) => reverseMerchantLabel(c))
    .filter(Boolean);

  const apple = cleaned.find((c) => /apple/i.test(c));
  if (apple) return apple;

  return (
    cleaned.sort((a, b) => {
      const byLen = b.length - a.length;
      if (byLen !== 0) return byLen;
      return cleaned.lastIndexOf(b) - cleaned.lastIndexOf(a);
    })[0] ?? null
  );
}

/** Extract merchant name from Cal PDF row tail (after amounts). */
export function extractCalMerchantFromTail(tail: string): { merchant: string; noise: string } {
  const cleaned = tail.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  const hebrewChunks = cleaned.match(/[\u0590-\u05FF][\u0590-\u05FF\s"'\-]*/gu) ?? [];
  const latinChunks = cleaned
    .split(/\s+/)
    .flatMap((part) => part.split(/[/\\|]+/))
    .map((c) => c.trim())
    .filter((c) => /^[A-Za-z0-9*.-]{3,}$/.test(c));

  const hebrew = pickHebrewMerchant(hebrewChunks);
  const latin = pickLatinMerchant(latinChunks);

  if (hebrew && latin && /apple/i.test(latin)) return { merchant: hebrew, noise: latin };
  if (hebrew && isPayboxMerchantNoise(hebrew) && latin) return { merchant: latin, noise: hebrew };
  if (hebrew && latin && latin.length >= 4) {
    const hebrewLooksLikeCategory = hebrew.length <= 12 && !/\s/.test(hebrew);
    if (hebrewLooksLikeCategory) return { merchant: latin, noise: hebrew };
  }
  if (hebrew) {
    const core = extractCoreMerchantName(hebrew);
    return { merchant: core || hebrew, noise: latin ?? "" };
  }
  if (latin) return { merchant: latin, noise: "" };
  const fallback = normalizeHebrewDescription(cleaned.slice(0, 80));
  if (isPayboxMerchantNoise(fallback)) return { merchant: latin ?? "", noise: fallback };
  return { merchant: fallback, noise: "" };
}

export type InstallmentExtract = {
  index: number | null;
  total: number | null;
  label: string | null;
};

function validInstallment(index: number, total: number): boolean {
  return index >= 1 && total >= 1 && index <= total && total <= 36;
}

function installmentResult(index: number, total: number): InstallmentExtract {
  return {
    index,
    total,
    label: formatInstallmentLabel(index, total),
  };
}

/** Strict installment detection — avoids date-cluster false positives. */
export function extractCalInstallment(
  text: string,
  ctx?: { billingAmount?: number | null; txnAmount?: number | null }
): InstallmentExtract {
  for (const m of text.matchAll(/(\d{1,2})\s*מתוך\s*(\d{1,2})/gu)) {
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (validInstallment(index, total)) return installmentResult(index, total);
  }

  const normalized = text.replace(/\t/g, "|");

  const pipeZero = normalized.match(/0\/(\d{1,2})[\|\t](\d{1,2})(?:[\|\t]|\s|$)/);
  if (pipeZero) {
    const total = Number(pipeZero[1]);
    const index = Number(pipeZero[2]);
    if (validInstallment(index, total)) return installmentResult(index, total);
  }

  const billing = ctx?.billingAmount ?? null;
  const txn = ctx?.txnAmount ?? null;
  if (billing != null && txn != null && Math.abs(billing - txn) > 0.009) {
    const pipeAlt = normalized.match(/\/(\d{1,2})[\|\t](\d{1,2})\s*$/);
    if (pipeAlt) {
      const total = Number(pipeAlt[1]);
      const index = Number(pipeAlt[2]);
      if (validInstallment(index, total)) {
        const ratio = txn / billing;
        if (Math.abs(ratio - total) / total <= 0.2) return installmentResult(index, total);
      }
    }
  }

  // Slash pairs inside Cal date clusters (e.g. tab-split `2/7`) — only when a `0/` pipe marker exists.
  if (/0\/\d{1,2}[\|\t]/.test(normalized)) {
    for (const m of normalized.matchAll(/(?:^|[\|\t\s])(\d)\/(\d)(?:[\|\t\s]|$)/g)) {
      const index = Number(m[1]);
      const total = Number(m[2]);
      if (validInstallment(index, total) && total >= 2) return installmentResult(index, total);
    }
  }

  return { index: null, total: null, label: null };
}
