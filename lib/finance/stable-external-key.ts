import { createHash } from "crypto";
import { round2 } from "@/lib/finance/money";

/** Last-4 (or fallback scope) identifying a card/account for dedupe across sources. */
export function cardScopeFromAccount(input: {
  account_number?: string | null;
  card_name?: string | null;
  card_mask?: string | null;
  /** Leumi is a single bank account — dedupe ignores account number form. */
  source?: string | null;
}): string {
  if (input.source === "leumi") return "default";
  const mask = input.card_mask?.trim();
  if (mask) {
    const digits = mask.replace(/\D/g, "");
    if (digits.length >= 4) return digits.slice(-4);
  }
  const acct = (input.account_number ?? input.card_name ?? "").trim();
  const digits = acct.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  if (acct) return acct.toLowerCase().replace(/\s+/g, "-");
  return "default";
}

/** Leumi scopes equivalent for dedupe: Excel null account vs sync last-4. */
export function leumiDedupeScopes(input: {
  account_number?: string | null;
  card_name?: string | null;
}): string[] {
  const raw = cardScopeFromAccount({ ...input, source: undefined });
  return raw === "default" ? ["default"] : ["default", raw];
}

/** Stable identity for one charge — survives merchant/parser changes; omits import source. */
export function stableTxnBaseKey(input: {
  cardScope: string;
  txn_date: string;
  amount: number;
  currency: string;
}): string {
  const scope = input.cardScope.trim() || "default";
  const currency = (input.currency || "ILS").trim().toUpperCase() || "ILS";
  return `${scope}|${input.txn_date}|${round2(input.amount).toFixed(2)}|${currency}`;
}

/** External key with optional ordinal when multiple same-day same-amount charges exist. */
export function stableTxnExternalKey(baseKey: string, ordinal: number): string {
  const payload = ordinal <= 1 ? baseKey : `${baseKey}|#${ordinal}`;
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 24);
  return `fin:${hash}`;
}

export type StableKeyAssignInput = {
  txn_date: string;
  amount: number;
  currency?: string | null;
  source_ref?: string;
};

/** Assign count-based ordinals within a batch and emit stable external keys. */
export function assignStableExternalKeys<T extends StableKeyAssignInput>(
  transactions: T[],
  cardScope: string
): (T & { source_ref: string })[] {
  const ordinals = new Map<string, number>();
  return transactions.map((t) => {
    const base = stableTxnBaseKey({
      cardScope,
      txn_date: t.txn_date,
      amount: t.amount,
      currency: t.currency ?? "ILS",
    });
    const ordinal = (ordinals.get(base) ?? 0) + 1;
    ordinals.set(base, ordinal);
    return { ...t, source_ref: stableTxnExternalKey(base, ordinal) };
  });
}
