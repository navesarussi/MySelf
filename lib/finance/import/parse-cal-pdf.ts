import { createHash } from "crypto";
import { extractCoreMerchantName } from "@/lib/finance/cal-duplicate";
import {
  isInformationalFxLine,
  isHebrewFxCategoryNoise,
  parseAbsAmount,
  parseSignedAmount,
  reverseLatinMerchantLine,
} from "@/lib/finance/import/fx-line";
import {
  compactImportText,
  extractCalInstallment,
  extractCalLatinMerchantLine,
  extractCalMerchantFromTail,
  isCalDateTotalLine,
  isSummaryImportText,
  normalizeHebrewDescription,
} from "@/lib/finance/import/normalize-import-row";
import { unreverseRtlDateToken } from "@/lib/finance/import/rtl-date";
import type { ParseFileResult, ParsedImportTransaction } from "@/lib/finance/import/types";

const ILS_ROW =
  /^(?:₪|EU)\s*(-?[\d,.]+)\s+(?:₪|EU)\s*(-?[\d,.]+)\s+(.+)$/i;
const FX_ROW = /^(?:\$|USD)\s*(-?[\d,.]+)\s*(.*)$/i;
const FX_TOTAL_DATE = /סה"כ\s*לתאריך\s*(\d{2}\/\d{2}\/\d{2,4})/;
const RTL_DATE = /(\d{4}\/\d{2}\/\d{2,3})/g;
const AMOUNT_INLINE = /^(-?[\d,.]+)\s+(\d{4}\/\d{2}\/\d{2,3})$/;
const MERCHANT_DATE = /^(.+?)\s+(\d{4}\/\d{2}\/\d{2,3})$/;
const LATIN_MERCHANT_LINE = /^[A-Za-z0-9*.,/\\-\s]{4,}$/;

type PendingUsd = {
  amount: number;
  signedAmount: number;
  currency: string;
  merchant: string;
  line: number;
  bookedAt: string | null;
  ilsAmount: number | null;
};

function parseIsoFromDdMmYy(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${m[2]}-${m[1]}`;
}

function extractRtlDateTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const m of text.matchAll(RTL_DATE)) tokens.push(m[1]);
  if (tokens.length) return tokens;
  const compact = text.replace(/[\|\t\s]/g, "");
  for (const m of compact.matchAll(/(\d{4}\/\d{2}\/\d{2,3})/g)) tokens.push(m[1]);
  return tokens;
}

/** Prefer the transaction date column — earliest valid ISO date in the cluster. */
function pickTxnDateFromCluster(text: string): string | null {
  const isos = extractRtlDateTokens(text)
    .map((t) => unreverseRtlDateToken(t))
    .filter((d): d is string => Boolean(d))
    .sort();
  return isos[0] ?? null;
}

function collapseSplitHebrew(text: string): string {
  return text
    .replace(/\t/g, "")
    .replace(/([\u0590-\u05FF])\s+(?=[\u0590-\u05FF])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCalMerchant(raw: string, preferLatin = false): string {
  const { merchant } = extractCalMerchantFromTail(raw, { preferLatin });
  if (!merchant || isSummaryImportText(merchant)) return "";
  if (preferLatin && isHebrewFxCategoryNoise(merchant)) return "";
  const core = extractCoreMerchantName(merchant);
  return core || merchant;
}

function extractMerchantFromTail(
  tail: string,
  preferLatin = false
): { merchant: string; bookedAt: string | null } {
  const bookedAt = pickTxnDateFromCluster(tail);
  const dateToken = extractRtlDateTokens(tail)[0];
  let merchantPart = dateToken ? tail.replace(dateToken, " ").replace(/\|/g, " ").trim() : tail;
  if (isSummaryImportText(merchantPart)) return { merchant: "", bookedAt };

  merchantPart = collapseSplitHebrew(
    merchantPart
      .replace(/\d{1,2}\s*מתוך\s*\d{1,2}/g, " ")
      .replace(/0\/\d{1,2}\|\d{1,2}/g, " ")
      .replace(/\d{1,2}\/\d{1,2}/g, " ")
      .replace(/[\d\s|/]+$/g, " ")
  );

  const merchant = cleanCalMerchant(merchantPart, preferLatin);
  return { merchant, bookedAt };
}

function merchantFromPendingLatin(text: string): string {
  const fromLine = extractCalLatinMerchantLine(text);
  if (fromLine) return fromLine;
  return cleanCalMerchant(text, true) || reverseLatinMerchantLine(text.trim());
}

function pickFxMerchant(input: {
  tailRaw: string;
  pendingLatin: string | null;
}): string {
  const tailMerchant = cleanCalMerchant(input.tailRaw, true);
  const pending = input.pendingLatin ? merchantFromPendingLatin(input.pendingLatin) : "";
  if (pending && (isHebrewFxCategoryNoise(tailMerchant) || !tailMerchant)) return pending;
  if (tailMerchant && !isHebrewFxCategoryNoise(tailMerchant)) return tailMerchant;
  return pending || tailMerchant;
}

function lineLooksLikeUsdSubtotal(line: string): boolean {
  if (isSummaryImportText(line)) return true;
  const compact = compactImportText(line).toLowerCase();
  return compact.includes("סה\"כ") || compact.includes("סה״כ") || compact.includes("סךהכל");
}

function makeSourceRef(parts: Record<string, string | number>): string {
  const raw = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return `cal:import:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

function extractCardMeta(text: string): Record<string, unknown> {
  const cardMask = text.match(/(\d{10,}-\d{3}-\d{2})/);
  const creditLimit = text.match(/₪\s*([\d,]+)\s*מ\s*ס\s*ג\s*ר\s*ת/i) ?? text.match(/₪\s*([\d,]+)/);
  const billingTotal = text.match(/₪\s*([\d,]+)\s*ס\s*ך\s*ה\s*ת\s*ח\s*י/i);
  const isPaybox = /פייבוקס|pay\s*box|xoByaP/i.test(text);
  return {
    card_mask: cardMask?.[1] ?? null,
    credit_limit_ils: creditLimit ? Number(creditLimit[1].replace(/,/g, "")) : null,
    statement_total_ils: billingTotal ? Number(billingTotal[1].replace(/,/g, "")) : null,
    paybox: isPaybox,
  };
}

function pushTxn(
  transactions: ParsedImportTransaction[],
  row: Omit<ParsedImportTransaction, "source_ref"> & { source_ref?: string }
) {
  const lineNo =
    typeof row.raw?.line === "number" ? row.raw.line : transactions.length + 1;
  const source_ref =
    row.source_ref ??
    makeSourceRef({
      d: row.booked_at,
      a: row.amount,
      c: row.currency ?? "ILS",
      n: lineNo,
      i: row.installment_index ?? "",
      t: row.installment_total ?? "",
    });
  transactions.push({ ...row, source_ref });
}

function flushUsdQueue(transactions: ParsedImportTransaction[], queue: PendingUsd[]) {
  for (const item of queue) {
    if (!item.bookedAt) continue;
    pushTxn(transactions, {
      booked_at: item.bookedAt,
      amount: item.amount,
      kind: item.signedAmount < 0 ? "income" : "expense",
      description: item.merchant,
      merchant: item.merchant,
      currency: item.currency,
      raw: {
        line: item.line,
        pattern: "fx_row",
        ils_amount: item.ilsAmount,
        signed_amount: item.signedAmount,
      },
    });
  }
  queue.length = 0;
}

function attachDatesToPendingUsd(pending: PendingUsd, text: string): boolean {
  const bookedAt = pickTxnDateFromCluster(text);
  if (!bookedAt) return false;
  pending.bookedAt = bookedAt;
  if (!pending.merchant) {
    const { merchant } = extractMerchantFromTail(text, true);
    if (merchant && !isHebrewFxCategoryNoise(merchant)) pending.merchant = merchant;
  }
  return true;
}

/** Parse Cal / Visa Leumi / PayBox monthly statement PDFs. */
export function parseCalStatementPdf(text: string): ParseFileResult {
  const meta = extractCardMeta(text);
  const label = meta.paybox ? "Cal PayBox" : "Cal Visa Leumi";
  const warnings: string[] = [];
  const transactions: ParsedImportTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let pendingMerchant: { text: string; line: number; bookedAt: string | null; latin: boolean } | null =
    null;
  let pendingUsd: PendingUsd | null = null;
  const usdQueue: PendingUsd[] = [];
  const MAX_MERCHANT_PENDING_GAP = 3;

  function flushPendingUsd() {
    if (!pendingUsd) return;
    if (pendingUsd.bookedAt && pendingUsd.merchant) usdQueue.push(pendingUsd);
    pendingUsd = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isInformationalFxLine(line)) {
      pendingMerchant = null;
      flushPendingUsd();
      continue;
    }

    if (isSummaryImportText(line) && !line.match(FX_ROW)) {
      pendingMerchant = null;
      flushPendingUsd();
      continue;
    }

    // Attach orphan date/category lines to a waiting USD row.
    if (pendingUsd && !pendingUsd.bookedAt && !line.match(FX_ROW) && !line.match(ILS_ROW)) {
      if (attachDatesToPendingUsd(pendingUsd, line)) {
        flushPendingUsd();
        pendingMerchant = null;
        continue;
      }
    }

    const ils = line.match(ILS_ROW);
    if (ils) {
      const billing = parseAbsAmount(ils[1]);
      const txnAmount = parseAbsAmount(ils[2]);
      const signedBilling = parseSignedAmount(ils[1]);
      const signedTxn = parseSignedAmount(ils[2]);
      const amount = billing ?? txnAmount;
      let tail = ils[3];
      if (isSummaryImportText(tail)) {
        pendingMerchant = null;
        flushPendingUsd();
        continue;
      }

      if (!extractRtlDateTokens(tail).length && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (
          /^[\d\s/|]+$/.test(next.replace(/\t/g, "")) ||
          extractRtlDateTokens(next).length > 0 ||
          (next.length < 80 && /[\u0590-\u05FF]/.test(next) && !next.match(FX_ROW))
        ) {
          tail = `${tail} ${next}`;
          i += 1;
        }
      }

      const { merchant, bookedAt } = extractMerchantFromTail(tail);
      const inst = extractCalInstallment(line, { billingAmount: billing, txnAmount });

      if (pendingUsd && merchant && bookedAt) {
        pendingUsd.bookedAt = bookedAt;
        pendingUsd.ilsAmount = amount;
        if (!pendingUsd.merchant && merchant && !isHebrewFxCategoryNoise(merchant)) {
          pendingUsd.merchant = merchant;
        }
        flushPendingUsd();
        pendingMerchant = null;
        continue;
      }

      if (amount && bookedAt && merchant) {
        const signed = signedBilling ?? signedTxn ?? amount;
        pushTxn(transactions, {
          booked_at: bookedAt,
          amount,
          kind: signed < 0 ? "income" : "expense",
          description: merchant,
          merchant,
          currency: "ILS",
          installment_index: inst.index,
          installment_total: inst.total,
          installment_label: inst.label,
          raw: { line: i + 1, pattern: "ils_row" },
        });
        if (pendingMerchant && i - pendingMerchant.line <= MAX_MERCHANT_PENDING_GAP) {
          pendingMerchant = null;
        }
        flushPendingUsd();
      }
      continue;
    }

    const fx = line.match(FX_ROW);
    if (fx) {
      flushPendingUsd();
      const signedAmount = parseSignedAmount(fx[1]);
      const amount = signedAmount == null ? null : Math.abs(signedAmount);
      const tailRaw = (fx[2] ?? "").trim();
      const fxDateOnLine = line.match(FX_TOTAL_DATE);
      const tailIsSummary =
        lineLooksLikeUsdSubtotal(line) ||
        (tailRaw ? isSummaryImportText(tailRaw) : false) ||
        isSummaryImportText(line);

      if (fxDateOnLine) {
        flushUsdQueue(transactions, usdQueue);
        pendingMerchant = null;
        continue;
      }

      if (isInformationalFxLine(tailRaw) || isInformationalFxLine(line)) {
        pendingMerchant = null;
        continue;
      }

      if (!amount || tailIsSummary) {
        pendingMerchant = null;
        continue;
      }

      const pendingLatin =
        pendingMerchant && i - pendingMerchant.line <= MAX_MERCHANT_PENDING_GAP
          ? pendingMerchant.text
          : null;
      const merchant = pickFxMerchant({ tailRaw, pendingLatin });
      const bookedAt = tailRaw ? pickTxnDateFromCluster(tailRaw) : null;

      if (!merchant) {
        pendingUsd = {
          amount,
          signedAmount: signedAmount!,
          currency: "USD",
          merchant: "",
          line: i + 1,
          bookedAt,
          ilsAmount: null,
        };
        pendingMerchant = null;
        continue;
      }

      if (bookedAt) {
        usdQueue.push({
          amount,
          signedAmount: signedAmount!,
          currency: "USD",
          merchant,
          line: i + 1,
          bookedAt,
          ilsAmount: null,
        });
        pendingMerchant = null;
        continue;
      }

      pendingUsd = {
        amount,
        signedAmount: signedAmount!,
        currency: "USD",
        merchant,
        line: i + 1,
        bookedAt: null,
        ilsAmount: null,
      };
      pendingMerchant = null;
      continue;
    }

    const fxDate = line.match(FX_TOTAL_DATE);
    if (fxDate) {
      flushUsdQueue(transactions, usdQueue);
      pendingMerchant = null;
      flushPendingUsd();
      continue;
    }

    const inline = line.match(AMOUNT_INLINE);
    if (inline) {
      const merchantPending =
        pendingMerchant && i - pendingMerchant.line <= MAX_MERCHANT_PENDING_GAP ? pendingMerchant : null;
      if (isCalDateTotalLine(line, !!merchantPending)) {
        pendingMerchant = null;
        continue;
      }

      const amt = parseAbsAmount(inline[1]);
      const signed = parseSignedAmount(inline[1]);
      const booked = unreverseRtlDateToken(inline[2]);
      const inst = extractCalInstallment(line);

      if (pendingUsd && merchantPending && booked) {
        pendingUsd.bookedAt = booked;
        pendingUsd.ilsAmount = amt;
        flushPendingUsd();
        pendingMerchant = null;
        continue;
      }

      if (amt && booked && merchantPending) {
        const merchant = merchantPending.latin
          ? merchantFromPendingLatin(merchantPending.text)
          : cleanCalMerchant(merchantPending.text);
        if (merchant && !isSummaryImportText(merchant)) {
          pushTxn(transactions, {
            booked_at: booked,
            amount: amt,
            kind: (signed ?? amt) < 0 ? "income" : "expense",
            description: merchant,
            merchant,
            currency: "ILS",
            installment_index: inst.index,
            installment_total: inst.total,
            installment_label: inst.label,
            raw: { line: i + 1, pattern: "inline" },
          });
        }
        pendingMerchant = null;
      } else if (!merchantPending) {
        pendingMerchant = null;
      }
      continue;
    }

    const merchantDate = line.match(MERCHANT_DATE);
    if (merchantDate && !/^(₪|EU|\$)/.test(merchantDate[1]) && !isSummaryImportText(merchantDate[1])) {
      const bookedAt = unreverseRtlDateToken(merchantDate[2]);
      pendingMerchant = { text: merchantDate[1].trim(), line: i, bookedAt, latin: false };
      continue;
    }

    const isLatinLine =
      LATIN_MERCHANT_LINE.test(line) &&
      !/^\d{4}\/\d{2}\/\d{2,3}$/.test(line) &&
      !/^\d{10,}-\d{3}-\d/.test(line) &&
      !/^[\d\s/|.-]+$/.test(line) &&
      !/PRD-|ctovet|www\./i.test(line) &&
      !/[\u0590-\u05FF]/.test(line);

    if (isLatinLine) {
      pendingMerchant = { text: line, line: i, bookedAt: null, latin: true };
    } else if (
      pendingUsd &&
      !pendingUsd.bookedAt &&
      (extractRtlDateTokens(line).length > 0 || /[\u0590-\u05FF]/.test(line))
    ) {
      if (attachDatesToPendingUsd(pendingUsd, line)) flushPendingUsd();
    } else if (pendingMerchant && i - pendingMerchant.line > MAX_MERCHANT_PENDING_GAP) {
      pendingMerchant = null;
    }
  }

  flushPendingUsd();
  flushUsdQueue(transactions, usdQueue);

  if (transactions.length === 0) warnings.push("no_transactions_found");

  return {
    source: "cal",
    accountLabel: label,
    accountMetadata: meta,
    transactions,
    warnings,
  };
}
