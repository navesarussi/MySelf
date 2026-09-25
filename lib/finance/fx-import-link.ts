import { round2 } from "@/lib/finance/money";
import { isLeumiFxConversionDescription } from "@/lib/finance/reconcile";
import { cardScopeFromAccount } from "@/lib/finance/stable-external-key";
import type { FinanceIngestInput } from "@/lib/finance/types";

/** Days to match legacy manual USD rows whose stable keys used wrong txn dates. */
export const FUZZY_USD_DATE_WINDOW_DAYS = 5;

/** Days to match a Leumi bank FX debit to a card foreign charge. */
export const FX_DEBIT_DATE_WINDOW_DAYS = 14;

export type LeumiFxDebitRow = {
  id: string;
  txn_date: string;
  amount: number;
  category: string | null;
  purpose_note: string | null;
  categorized_at: string | null;
  description: string;
  merchant: string | null;
  is_internal: boolean;
};

export type FuzzyUsdRow = {
  id: string;
  txn_date: string;
  card_name: string | null;
  account_number: string | null;
  currency: string;
  original_amount: number | null;
  amount: number;
};

export function stableDedupeAmount(input: {
  amount: number;
  currency?: string | null;
  original_amount?: number | null;
}): number {
  const currency = (input.currency ?? "ILS").trim().toUpperCase() || "ILS";
  if (currency === "ILS") return round2(input.amount);
  const original = input.original_amount ?? input.amount;
  return round2(original);
}

export function parseUsdFromFxNote(note: string | null | undefined): number | null {
  const m = (note ?? "").match(/\$\s*([\d,.]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

function daysDiff(d1: string, d2: string): number {
  const t1 = new Date(`${d1}T12:00:00Z`).getTime();
  const t2 = new Date(`${d2}T12:00:00Z`).getTime();
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
}

/** Leumi FX debit is the categorized expense-of-record (Apr–Sep 2026 production pattern). */
export function isCategorizedExpenseOfRecord(row: LeumiFxDebitRow): boolean {
  if (row.is_internal) return false;
  if (!isLeumiFxConversionDescription(row.description, row.merchant)) return false;
  return Boolean(row.category?.trim() || row.categorized_at);
}

export function cardChargeMatchesLeumiFx(
  card: Pick<
    FinanceIngestInput,
    "txn_date" | "amount" | "amount_ils" | "original_amount" | "currency"
  >,
  leumi: LeumiFxDebitRow
): boolean {
  if (!isLeumiFxConversionDescription(leumi.description, leumi.merchant)) return false;
  if (daysDiff(card.txn_date, leumi.txn_date) > FX_DEBIT_DATE_WINDOW_DAYS) return false;

  const cardUsd = stableDedupeAmount({
    amount: card.amount,
    currency: card.currency,
    original_amount: card.original_amount,
  });
  const noteUsd = parseUsdFromFxNote(leumi.purpose_note);
  if (noteUsd != null && Math.abs(noteUsd - cardUsd) <= 0.02) return true;

  const cardIls = round2(card.amount_ils ?? card.amount);
  if (Math.abs(leumi.amount - cardIls) <= 0.5) return true;
  if (leumi.amount > 0 && Math.abs(leumi.amount - cardIls) / leumi.amount <= 0.02) return true;

  return false;
}

/** Skip Cal USD insert when a categorized Leumi FX debit already owns this expense. */
export function shouldSkipCalUsdForExistingFxDebit(
  input: FinanceIngestInput,
  fxDebits: LeumiFxDebitRow[]
): boolean {
  const currency = (input.currency ?? "ILS").trim().toUpperCase();
  if (input.source !== "visa_cal" || currency === "ILS") return false;

  return fxDebits.some(
    (leumi) => isCategorizedExpenseOfRecord(leumi) && cardChargeMatchesLeumiFx(input, leumi)
  );
}

/** Uncategorized Leumi FX debit to pair with an incoming Cal USD row (internalize + inherit). */
export function findMatchingLeumiFxDebit(
  input: FinanceIngestInput,
  fxDebits: LeumiFxDebitRow[]
): LeumiFxDebitRow | null {
  const currency = (input.currency ?? "ILS").trim().toUpperCase();
  if (currency === "ILS") return null;
  return (
    fxDebits.find(
      (leumi) =>
        !isCategorizedExpenseOfRecord(leumi) &&
        isLeumiFxConversionDescription(leumi.description, leumi.merchant) &&
        cardChargeMatchesLeumiFx(input, leumi)
    ) ?? null
  );
}

function cardScopeForInput(input: FinanceIngestInput): string {
  return cardScopeFromAccount({
    account_number: input.account_number,
    card_name: input.card_name,
  });
}

/** Legacy manual USD rows: same account + currency + USD face amount within date window. */
export function fuzzyUsdRowMatches(
  input: FinanceIngestInput,
  existing: FuzzyUsdRow
): boolean {
  const currency = (input.currency ?? "ILS").trim().toUpperCase();
  if (currency === "ILS" || input.source !== "visa_cal") return false;
  if (existing.currency.trim().toUpperCase() !== currency) return false;
  if (cardScopeForInput(input) !== cardScopeFromAccount(existing)) return false;
  if (daysDiff(input.txn_date, existing.txn_date) > FUZZY_USD_DATE_WINDOW_DAYS) return false;

  const incomingUsd = stableDedupeAmount({
    amount: input.amount,
    currency: input.currency,
    original_amount: input.original_amount,
  });
  const existingUsd = round2(existing.original_amount ?? existing.amount);
  return Math.abs(incomingUsd - existingUsd) <= 0.02;
}

export function shouldSkipForFuzzyUsdDuplicate(
  input: FinanceIngestInput,
  existingRows: FuzzyUsdRow[]
): boolean {
  const currency = (input.currency ?? "ILS").trim().toUpperCase();
  if (currency === "ILS" || input.source !== "visa_cal") return false;
  return existingRows.some((row) => fuzzyUsdRowMatches(input, row));
}

/** Category/note to inherit when atomically replacing a Leumi FX debit with a card row. */
export function inheritFromLeumiFxDebit(leumi: LeumiFxDebitRow): Pick<
  FinanceIngestInput,
  "category" | "purpose_note" | "needs_categorization"
> {
  return {
    category: leumi.category,
    purpose_note: leumi.purpose_note,
    needs_categorization: false,
  };
}
