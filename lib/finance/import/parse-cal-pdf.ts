import { createHash } from "crypto";
import { extractCoreMerchantName } from "@/lib/finance/cal-duplicate";
import {
  compactImportText,
  extractCalInstallment,
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
const RTL_DATE = /\b(\d{4}\/\d{2}\/\d{2,3})\b/;
const AMOUNT_INLINE = /^(-?[\d,.]+)\s+(\d{4}\/\d{2}\/\d{2,3})$/;
const MERCHANT_DATE = /^(.+?)\s+(\d{4}\/\d{2}\/\d{2,3})$/;

type PendingUsd = {
  amount: number;
  currency: string;
  merchant: string;
  line: number;
  bookedAt: string | null;
  ilsAmount: number | null;
};

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}

function parseIsoFromDdMmYy(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${m[2]}-${m[1]}`;
}

function extractRtlDateToken(text: string): string | null {
  const direct = text.match(RTL_DATE);
  if (direct) return direct[1];
  const compact = text.replace(/[\|\t\s]/g, "").match(/(\d{4}\/\d{2}\/\d{2,3})/);
  return compact?.[1] ?? null;
}

function collapseSplitHebrew(text: string): string {
  return text
    .replace(/\t/g, "")
    .replace(/([\u0590-\u05FF])\s+(?=[\u0590-\u05FF])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCalMerchant(raw: string): string {
  const { merchant } = extractCalMerchantFromTail(raw);
  if (!merchant || isSummaryImportText(merchant)) return "";
  const core = extractCoreMerchantName(merchant);
  return core || merchant;
}

function extractMerchantFromTail(tail: string): { merchant: string; bookedAt: string | null } {
  const dateToken = extractRtlDateToken(tail);
  const bookedAt = dateToken ? unreverseRtlDateToken(dateToken) : null;
  let merchantPart = dateToken ? tail.replace(dateToken, " ").replace(/\|/g, " ").trim() : tail;
  if (isSummaryImportText(merchantPart)) return { merchant: "", bookedAt };

  merchantPart = collapseSplitHebrew(
    merchantPart
      .replace(/\d{1,2}\s*מתוך\s*\d{1,2}/g, " ")
      .replace(/0\/\d{1,2}\|\d{1,2}/g, " ")
      .replace(/\d{1,2}\/\d{1,2}/g, " ")
      .replace(/[\d\s|/]+$/g, " ")
  );

  const merchant = cleanCalMerchant(merchantPart);
  return { merchant, bookedAt };
}

function reversePendingMerchant(raw: string): string {
  return cleanCalMerchant(raw.trim()) || normalizeHebrewDescription(raw.trim());
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
  const source_ref =
    row.source_ref ??
    makeSourceRef({
      d: row.booked_at,
      a: row.amount,
      c: row.currency ?? "ILS",
      m: row.merchant ?? row.description,
      i: row.installment_index ?? "",
      t: row.installment_total ?? "",
    });
  transactions.push({ ...row, source_ref });
}

function flushUsdQueue(
  transactions: ParsedImportTransaction[],
  queue: PendingUsd[],
  fallbackDate: string | null
) {
  for (const item of queue) {
    const bookedAt = item.bookedAt ?? fallbackDate;
    if (!bookedAt) continue;
    pushTxn(transactions, {
      booked_at: bookedAt,
      amount: item.amount,
      kind: item.amount < 0 ? "income" : "expense",
      description: item.merchant,
      merchant: item.merchant,
      currency: item.currency,
      raw: {
        line: item.line,
        pattern: "fx_row",
        ils_amount: item.ilsAmount,
      },
    });
  }
  queue.length = 0;
}

/** Parse Cal / Visa Leumi / PayBox monthly statement PDFs. */
export function parseCalStatementPdf(text: string): ParseFileResult {
  const meta = extractCardMeta(text);
  const label = meta.paybox ? "Cal PayBox" : "Cal Visa Leumi";
  const warnings: string[] = [];
  const transactions: ParsedImportTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let pendingMerchant: { text: string; line: number; bookedAt: string | null } | null = null;
  let pendingUsdAmount: { amount: number; line: number } | null = null;
  const usdQueue: PendingUsd[] = [];
  let usdSectionDate: string | null = null;
  const MAX_MERCHANT_PENDING_GAP = 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isSummaryImportText(line) && !line.match(FX_ROW)) {
      pendingMerchant = null;
      pendingUsdAmount = null;
      continue;
    }

    const ils = line.match(ILS_ROW);
    if (ils) {
      const billing = parseAmount(ils[1]);
      const txnAmount = parseAmount(ils[2]);
      const amount = billing ?? txnAmount;
      let tail = ils[3];
      if (isSummaryImportText(tail)) {
        pendingMerchant = null;
        continue;
      }

      if (!extractRtlDateToken(tail) && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (/^[\d\s/|]+$/.test(next.replace(/\t/g, "")) || extractRtlDateToken(next)) {
          tail = `${tail} ${next}`;
        }
      }

      const { merchant, bookedAt } = extractMerchantFromTail(tail);
      const inst = extractCalInstallment(line, { billingAmount: billing, txnAmount });

      if (pendingUsdAmount && merchant && bookedAt) {
        usdQueue.push({
          amount: pendingUsdAmount.amount,
          currency: "USD",
          merchant,
          line: pendingUsdAmount.line,
          bookedAt,
          ilsAmount: amount,
        });
        pendingUsdAmount = null;
        if (pendingMerchant && i - pendingMerchant.line <= MAX_MERCHANT_PENDING_GAP) {
          pendingMerchant = null;
        }
        continue;
      }

      if (amount && bookedAt && merchant) {
        pushTxn(transactions, {
          booked_at: bookedAt,
          amount,
          kind: ils[1].startsWith("-") || ils[2].startsWith("-") ? "income" : "expense",
          description: merchant,
          merchant,
          currency: "ILS",
          installment_index: inst.index,
          installment_total: inst.total,
          installment_label: inst.label,
          raw: { line: i + 1, pattern: "ils_row" },
        });
        if (!pendingUsdAmount && pendingMerchant && i - pendingMerchant.line <= MAX_MERCHANT_PENDING_GAP) {
          pendingMerchant = null;
        }
      }
      continue;
    }

    const fx = line.match(FX_ROW);
    if (fx) {
      const amount = parseAmount(fx[1]);
      const tailRaw = (fx[2] ?? "").trim();
      const fxDateOnLine = line.match(FX_TOTAL_DATE);
      const tailIsSummary = lineLooksLikeUsdSubtotal(line) || isSummaryImportText(tailRaw) || isSummaryImportText(line);

      if (fxDateOnLine) {
        usdSectionDate = parseIsoFromDdMmYy(fxDateOnLine[1]);
        if (pendingUsdAmount && pendingMerchant) {
          const merchant = reversePendingMerchant(pendingMerchant.text);
          if (merchant && !isSummaryImportText(merchant)) {
            usdQueue.push({
              amount: pendingUsdAmount.amount,
              currency: "USD",
              merchant,
              line: pendingUsdAmount.line,
              bookedAt: pendingMerchant.bookedAt ?? usdSectionDate,
              ilsAmount: null,
            });
          }
        }
        flushUsdQueue(transactions, usdQueue, usdSectionDate);
        pendingMerchant = null;
        pendingUsdAmount = null;
        continue;
      }

      if (!amount || tailIsSummary) {
        pendingUsdAmount = null;
        pendingMerchant = null;
        continue;
      }

      const { merchant: tailMerchant, bookedAt: tailDate } = extractMerchantFromTail(tailRaw);
      const merchantFromPending =
        pendingMerchant && i - pendingMerchant.line <= MAX_MERCHANT_PENDING_GAP
          ? reversePendingMerchant(pendingMerchant.text)
          : "";
      const merchant = tailMerchant || merchantFromPending;

      if (!merchant) {
        pendingUsdAmount = { amount, line: i + 1 };
        continue;
      }

      usdQueue.push({
        amount,
        currency: "USD",
        merchant,
        line: i + 1,
        bookedAt: tailDate ?? pendingMerchant?.bookedAt ?? usdSectionDate,
        ilsAmount: null,
      });
      pendingUsdAmount = null;
      pendingMerchant = null;
      continue;
    }

    const fxDate = line.match(FX_TOTAL_DATE);
    if (fxDate) {
      usdSectionDate = parseIsoFromDdMmYy(fxDate[1]);
      flushUsdQueue(transactions, usdQueue, usdSectionDate);
      pendingMerchant = null;
      pendingUsdAmount = null;
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

      const amt = parseAmount(inline[1]);
      const booked = unreverseRtlDateToken(inline[2]);
      const inst = extractCalInstallment(line);

      if (pendingUsdAmount && merchantPending && booked) {
        const merchant = reversePendingMerchant(merchantPending.text);
        if (merchant && !isSummaryImportText(merchant)) {
          usdQueue.push({
            amount: pendingUsdAmount.amount,
            currency: "USD",
            merchant,
            line: pendingUsdAmount.line,
            bookedAt: booked,
            ilsAmount: amt,
          });
        }
        pendingUsdAmount = null;
        pendingMerchant = null;
        continue;
      }

      if (amt && booked && merchantPending) {
        const merchant = reversePendingMerchant(merchantPending.text);
        if (merchant && !isSummaryImportText(merchant)) {
          pushTxn(transactions, {
            booked_at: booked,
            amount: amt,
            kind: inline[1].startsWith("-") ? "income" : "expense",
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
      pendingMerchant = { text: merchantDate[1].trim(), line: i, bookedAt };
      continue;
    }

    if (
      /^[A-Za-z0-9*.,\s/-]{4,}$/.test(line) &&
      !/^\d{4}\/\d{2}\/\d{2,3}$/.test(line) &&
      !/^\d{10,}-\d{3}-\d/.test(line) &&
      !/^[\d\s/|.-]+$/.test(line) &&
      !/PRD-|ctovet|www\./i.test(line)
    ) {
      pendingMerchant = { text: line, line: i, bookedAt: null };
    } else if (pendingMerchant && i - pendingMerchant.line > MAX_MERCHANT_PENDING_GAP) {
      pendingMerchant = null;
    }
  }

  flushUsdQueue(transactions, usdQueue, usdSectionDate);

  const deduped = new Map<string, ParsedImportTransaction>();
  for (const t of transactions) deduped.set(t.source_ref, t);

  if (deduped.size === 0) warnings.push("no_transactions_found");

  return {
    source: "cal",
    accountLabel: label,
    accountMetadata: meta,
    transactions: [...deduped.values()],
    warnings,
  };
}
