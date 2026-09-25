import { convertForeignToIls } from "@/lib/finance/fx-rates";
import { round2 } from "@/lib/finance/money";
import type { ParsedImportTransaction } from "@/lib/finance/import/types";

/** Normalize parsed import rows so amount is always ILS for cashflow totals. */
export function normalizeParsedForeignAmounts(
  transactions: ParsedImportTransaction[]
): ParsedImportTransaction[] {
  return transactions.map((t) => {
    const currency = (t.currency ?? "ILS").trim().toUpperCase() || "ILS";
    if (currency === "ILS") {
      return { ...t, currency: "ILS", amount_ils: round2(t.amount), ils_estimated: false };
    }

    const original = round2(t.original_amount ?? t.amount);
    const rawIls = t.raw?.ils_amount;
    const statementIls =
      typeof rawIls === "number" && Number.isFinite(rawIls) && rawIls > 0
        ? round2(rawIls)
        : t.amount_ils != null
          ? round2(t.amount_ils)
          : null;

    if (statementIls != null) {
      return {
        ...t,
        currency,
        original_amount: original,
        amount: statementIls,
        amount_ils: statementIls,
        ils_estimated: Boolean(t.ils_estimated),
      };
    }

    const est = convertForeignToIls(original, currency, t.booked_at);
    return {
      ...t,
      currency,
      original_amount: original,
      amount: est.ils,
      amount_ils: est.ils,
      ils_estimated: est.estimated,
    };
  });
}
