import { createHash } from "crypto";
import { formatInstallmentLabel } from "@/lib/finance/import/installment-label";
import { unreverseRtlDateToken } from "@/lib/finance/import/rtl-date";
import type { ParseFileResult, ParsedImportTransaction } from "@/lib/finance/import/types";

const ILS_ROW =
  /^(?:₪|EU)\s*(-?[\d,.]+)\s+(?:₪|EU)\s*(-?[\d,.]+)\s+(.+)$/i;
const FX_ROW = /^(?:\$|USD)\s*(-?[\d,.]+)\s+(.+)$/i;
const FX_TOTAL_DATE = /סה"כ לתאריך\s*(\d{2}\/\d{2}\/\d{2,4})/;
const RTL_DATE = /\b(\d{4}\/\d{2}\/\d{2,3})\b/;
const AMOUNT_INLINE = /^(-?[\d,.]+)\s+(\d{4}\/\d{2}\/\d{2})$/;
const MERCHANT_DATE = /^(.+?)\s+(\d{4}\/\d{2}\/\d{2})$/;

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}

function reverseMerchantLabel(raw: string): string {
  const trimmed = raw.trim();
  if (/[\u0590-\u05FF]/.test(trimmed)) return trimmed.replace(/\s+/g, " ").trim();
  return trimmed
    .split(/\s+/)
    .map((w) => (/^[A-Za-z0-9*./\\-]+$/.test(w) ? w.split("").reverse().join("") : w))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIsoFromDdMmYy(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${m[2]}-${m[1]}`;
}

function extractInstallment(text: string): {
  index: number | null;
  total: number | null;
  label: string | null;
} {
  const candidates: Array<{ index: number; total: number; score: number }> = [];

  for (const m of text.matchAll(/(\d{1,2})\s*מתוך\s*(\d{1,2})/g)) {
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (index >= 1 && total >= 1 && index <= total && total <= 36) {
      candidates.push({ index, total, score: 100 });
    }
  }

  for (const m of text.matchAll(/(?:^|[\s|])(\d)\/(\d)(?:[\s|]|$)/g)) {
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (index >= 1 && total >= 1 && index <= total && total <= 36) {
      candidates.push({ index, total, score: 80 });
    }
  }

  // Cal PDF date cluster often ends with `0/{total}|{index}` before the RTL date token.
  const pipeTail = text.match(/0\/(\d{1,2})\|(\d{1,2})\b/);
  if (pipeTail) {
    const total = Number(pipeTail[1]);
    const index = Number(pipeTail[2]);
    if (index >= 1 && total >= 1 && index <= total && total <= 36) {
      candidates.push({ index, total, score: 90 });
    }
  }

  if (candidates.length === 0) return { index: null, total: null, label: null };
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    index: best.index,
    total: best.total,
    label: formatInstallmentLabel(best.index, best.total),
  };
}

function extractRtlDateToken(text: string): string | null {
  const direct = text.match(RTL_DATE);
  if (direct) return direct[1];
  const compact = text.replace(/\|/g, "").match(/(\d{4}\/\d{2}\/\d{2,3})/);
  return compact?.[1] ?? null;
}

function extractMerchantFromTail(tail: string): { merchant: string; bookedAt: string | null } {
  const dateToken = extractRtlDateToken(tail);
  let bookedAt: string | null = dateToken ? unreverseRtlDateToken(dateToken) : null;
  let merchantPart = dateToken ? tail.replace(dateToken, " ").replace(/\|/g, " ").trim() : tail;

  // Drop Hebrew location/category noise; keep Latin merchant tokens + Hebrew shop names.
  const latinChunks = merchantPart.match(/[A-Za-z0-9*./\\-]{3,}/g) ?? [];
  const hebrewChunks = merchantPart.match(/[\u0590-\u05FF][\u0590-\u05FF\s"']{2,}/g) ?? [];
  const merchantRaw =
    latinChunks.sort((a, b) => b.length - a.length)[0] ??
    hebrewChunks.sort((a, b) => b.length - a.length)[0] ??
    merchantPart.slice(0, 80);

  return { merchant: reverseMerchantLabel(merchantRaw), bookedAt };
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
  let pendingMerchant: string | null = null;
  let pendingTxnDate: string | null = null;
  let pendingInstallment: ReturnType<typeof extractInstallment> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const installmentInLine = extractInstallment(line);

    const ils = line.match(ILS_ROW);
    if (ils) {
      const billing = parseAmount(ils[1]);
      const txnAmount = parseAmount(ils[2]);
      const amount = billing ?? txnAmount;
      const { merchant, bookedAt } = extractMerchantFromTail(ils[3]);
      const inst = installmentInLine.index ? installmentInLine : pendingInstallment;
      if (amount && bookedAt) {
        pushTxn(transactions, {
          booked_at: bookedAt,
          amount,
          kind: ils[1].startsWith("-") || ils[2].startsWith("-") ? "income" : "expense",
          description: merchant || "Cal",
          merchant: merchant || null,
          currency: "ILS",
          installment_index: inst?.index ?? null,
          installment_total: inst?.total ?? null,
          installment_label: inst?.label ?? null,
          raw: { line: i + 1, pattern: "ils_row" },
        });
        pendingInstallment = null;
      }
      continue;
    }

    const fx = line.match(FX_ROW);
    if (fx) {
      const amount = parseAmount(fx[1]);
      if (amount) {
        pendingFx = { amount, currency: "USD", tail: fx[2], line: i + 1 };
      }
      continue;
    }

    const fxDate = line.match(FX_TOTAL_DATE);
    if (fxDate && pendingFx) {
      const bookedAt = parseIsoFromDdMmYy(fxDate[1]);
      const { merchant } = extractMerchantFromTail(pendingFx.tail);
      if (bookedAt) {
        pushTxn(transactions, {
          booked_at: bookedAt,
          amount: pendingFx.amount,
          kind: pendingFx.amount < 0 ? "income" : "expense",
          description: merchant || "Cal FX",
          merchant: merchant || null,
          currency: pendingFx.currency,
          installment_index: installmentInLine.index,
          installment_total: installmentInLine.total,
          installment_label: installmentInLine.label,
          raw: { line: pendingFx.line, pattern: "fx_row" },
        });
      }
      pendingFx = null;
      continue;
    }

    if (installmentInLine.index && !line.match(RTL_DATE)) {
      pendingInstallment = installmentInLine;
    }

    const inline = line.match(AMOUNT_INLINE);
    if (inline) {
      const amt = parseAmount(inline[1]);
      const booked = unreverseRtlDateToken(inline[2]);
      const inst = installmentInLine.index ? installmentInLine : pendingInstallment;
      if (amt && booked) {
        const merchant = pendingMerchant ? reverseMerchantLabel(pendingMerchant) : "Cal";
        pushTxn(transactions, {
          booked_at: booked,
          amount: amt,
          kind: inline[1].startsWith("-") ? "income" : "expense",
          description: merchant,
          merchant,
          currency: "ILS",
          installment_index: inst?.index ?? null,
          installment_total: inst?.total ?? null,
          installment_label: inst?.label ?? null,
          raw: { line: i + 1, pattern: "inline" },
        });
        pendingMerchant = null;
        pendingTxnDate = null;
        pendingInstallment = null;
      }
      continue;
    }

    const merchantDate = line.match(MERCHANT_DATE);
    if (merchantDate && !/^(₪|EU|\$)/.test(merchantDate[1])) {
      pendingMerchant = merchantDate[1].trim();
      pendingTxnDate = unreverseRtlDateToken(merchantDate[2]);
      continue;
    }

    if (/^[A-Za-z0-9*.,\s/-]{4,}$/.test(line) && !/PRD-|ctovet|www\./i.test(line)) {
      pendingMerchant = line;
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
