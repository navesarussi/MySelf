import { formatInstallmentLabel } from "@/lib/finance/import/installment-label";

const SUMMARY_KEYWORDS =
  /(?:^|[\s|])סה"כ|(?:^|[\s|])סה״כ|(?:^|[\s|])סה''כ|סך\s*ה\s*כל|^\s*(?:total|summary|subtotal|סיכום)\b/i;

const HEBREW_LOCATION_NOISE =
  /^(?:לא\s+)?(?:אירלנד|ארה"ב|ארצות\s*הברית|בריטניה|אירופה|חו"ל|ישראל|תל\s*אביב|ירושלים|חיפה)$/u;

/** Common Hebrew tokens glued together in Cal PDF extraction (longest first). */
const HEBREW_VOCAB = [
  "ארצות הברית",
  "מוצרי און",
  "סופר פאר",
  "סופר-פאר",
  "לא אירלנד",
  "תל אביב",
  "בית עסק",
  "אירלנד",
  "מוצרי",
  "תשלומים",
  "ירושלים",
  "ישראל",
  "חיפה",
  "סופר",
  "פאר",
  "דלק",
  "און",
  "לא",
  "שק",
].sort((a, b) => b.length - a.length);

export function isSummaryImportText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (SUMMARY_KEYWORDS.test(t)) return true;
  if (/^סה"כ\b/u.test(t)) return true;
  return false;
}

/** Cal PDF inline row that is only amount + RTL date (date subtotal). */
export function isCalDateTotalLine(line: string, hasPendingMerchant: boolean): boolean {
  if (isSummaryImportText(line)) return true;
  if (/^-?[\d,.]+\s+\d{4}\/\d{2}\/\d{2,3}$/.test(line.trim()) && !hasPendingMerchant) return true;
  return false;
}

function segmentGluedHebrew(text: string): string {
  let rest = text.replace(/\s+/g, "");
  if (!rest) return text.trim();
  const parts: string[] = [];
  while (rest.length > 0) {
    let matched = "";
    for (const word of HEBREW_VOCAB) {
      const compact = word.replace(/\s+/g, "");
      if (rest.startsWith(compact)) {
        matched = word;
        rest = rest.slice(compact.length);
        break;
      }
    }
    if (!matched) {
      const m = rest.match(/^[\u0590-\u05FF]+/u);
      if (!m) break;
      parts.push(m[0]);
      rest = rest.slice(m[0].length);
      continue;
    }
    parts.push(matched);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Insert readable spaces in RTL Hebrew merchant/description text. */
export function normalizeHebrewDescription(text: string): string {
  let out = text
    .replace(/([^\s|])(\|)([^\s|])/g, "$1 $3")
    .replace(/([\u0590-\u05FF])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u0590-\u05FF])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const hebrewRuns = out.match(/[\u0590-\u05FF"']+/gu) ?? [];
  for (const run of hebrewRuns) {
    if (run.length >= 8 && !/\s/.test(run)) {
      const segmented = segmentGluedHebrew(run);
      if (segmented.includes(" ")) out = out.replace(run, segmented);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function reverseLatinToken(raw: string): string {
  return /^[A-Za-z0-9*./\\-]+$/.test(raw) ? raw.split("").reverse().join("") : raw;
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
    .filter((c) => c.length >= 3 && !HEBREW_LOCATION_NOISE.test(c));

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

  return cleaned.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Extract merchant name from Cal PDF row tail (after amounts). */
export function extractCalMerchantFromTail(tail: string): { merchant: string; noise: string } {
  const cleaned = tail.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  const hebrewChunks = cleaned.match(/[\u0590-\u05FF][\u0590-\u05FF\s"'\-]*/gu) ?? [];
  const latinChunks = cleaned.match(/[A-Za-z0-9*./\\-]{3,}/g) ?? [];

  const hebrew = pickHebrewMerchant(hebrewChunks);
  const latin = pickLatinMerchant(latinChunks);

  if (hebrew && latin && /apple/i.test(latin)) return { merchant: hebrew, noise: latin };
  if (hebrew) return { merchant: hebrew, noise: latin ?? "" };
  if (latin) return { merchant: latin, noise: "" };
  return { merchant: normalizeHebrewDescription(cleaned.slice(0, 80)), noise: "" };
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
