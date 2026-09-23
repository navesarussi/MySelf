import { createHash } from "crypto";
import {
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
const FX_ROW = /^(?:\$|USD)\s*(-?[\d,.]+)\s+(.+)$/i;
const FX_TOTAL_DATE = /סה"כ לתאריך\s*(\d{2}\/\d{2}\/\d{2,4})/;
const RTL_DATE = /\b(\d{4}\/\d{2}\/\d{2,3})\b/;
const AMOUNT_INLINE = /^(-?[\d,.]+)\s+(\d{4}\/\d{2}\/\d{2,3})$/;
const MERCHANT_DATE = /^(.+?)\s+(\d{4}\/\d{2}\/\d{2,3})$/;

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
  // Cal PDFs split date digits with tabs/spaces (e.g. 6\t2\t0\t2/7\t0/1\t3).
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

  const { merchant } = extractCalMerchantFromTail(merchantPart);
  return { merchant, bookedAt };
}

function reversePendingMerchant(raw: string): string {
  const { merchant } = extractCalMerchantFromTail(collapseSplitHebrew(raw.trim()));
  if (merchant) return merchant;
  return normalizeHebrewDescription(raw.trim());
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

/** Parse Cal / Visa Leumi / PayBox monthly statement PDFs. */
export function parseCalStatementPdf(text: string): ParseFileResult {
  const meta = extractCardMeta(text);
  const label = meta.paybox ? "Cal PayBox" : "Cal Visa Leumi";
  const warnings: string[] = [];
  const transactions: ParsedImportTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let pendingFx: { amount: number; currency: string; tail: string; line: number } | null = null;
  let pendingMerchant: { text: string; line: number } | null = null;
  const MAX_MERCHANT_PENDING_GAP = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isSummaryImportText(line)) {
      pendingMerchant = null;
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

      // Multi-line row: date token may appear on the next line only.
      if (!extractRtlDateToken(tail) && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (/^[\d\s/|]+$/.test(next.replace(/\t/g, "")) || extractRtlDateToken(next)) {
          tail = `${tail} ${next}`;
        }
      }

      const { merchant, bookedAt } = extractMerchantFromTail(tail);
      const inst = extractCalInstallment(line, { billingAmount: billing, txnAmount });
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
        pendingMerchant = null;
      }
      continue;
    }

    const fx = line.match(FX_ROW);
    if (fx) {
      const amount = parseAmount(fx[1]);
      if (amount && !isSummaryImportText(fx[2])) {
        pendingFx = { amount, currency: "USD", tail: fx[2], line: i + 1 };
      }
      continue;
    }

    const fxDate = line.match(FX_TOTAL_DATE);
    if (fxDate && pendingFx) {
      const bookedAt = parseIsoFromDdMmYy(fxDate[1]);
      const { merchant } = extractMerchantFromTail(pendingFx.tail);
      const inst = extractCalInstallment(line);
      if (bookedAt && merchant) {
        pushTxn(transactions, {
          booked_at: bookedAt,
          amount: pendingFx.amount,
          kind: pendingFx.amount < 0 ? "income" : "expense",
          description: merchant,
          merchant,
          currency: pendingFx.currency,
          installment_index: inst.index,
          installment_total: inst.total,
          installment_label: inst.label,
          raw: { line: pendingFx.line, pattern: "fx_row" },
        });
      }
      pendingFx = null;
      pendingMerchant = null;
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
      pendingMerchant = { text: merchantDate[1].trim(), line: i };
      continue;
    }

    if (/^[A-Za-z0-9*.,\s/-]{4,}$/.test(line) && !/PRD-|ctovet|www\./i.test(line)) {
      pendingMerchant = { text: line, line: i };
    } else if (pendingMerchant && i - pendingMerchant.line > MAX_MERCHANT_PENDING_GAP) {
      pendingMerchant = null;
    }
  }

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
