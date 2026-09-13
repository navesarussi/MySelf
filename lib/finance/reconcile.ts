import { getSupabase } from "@/lib/supabase";
import { rowToTxn, type FinanceTransaction } from "@/lib/finance/ingest";

export const BATCH_SETTLEMENT_KEYWORDS = [
  "מקס איט פיננ",
  "מקס איט",
  "ויזה כאל",
  "כאל",
  "כרטיסי אשראי",
  "ישראכרט",
  "סליקה",
  "חיוב כרטיס",
  "דיינרס",
  "אמריקן אקספרס",
] as const;

export const CARD_SOURCES = ["max", "visa_cal", "apple_pay"] as const;

export type ReconcileMatch = {
  batchId: string;
  batchDescription: string;
  batchAmount: number;
  matchedSum?: number;
  matchType: "sum_match" | "description_match";
};

export type ReconcileResult = {
  reconciledIds: string[];
  matches: ReconcileMatch[];
};

export function isBatchSettlementDescription(
  description?: string | null,
  merchant?: string | null
): boolean {
  const text = `${description ?? ""} ${merchant ?? ""}`.trim().toLowerCase();
  if (!text) return false;
  return BATCH_SETTLEMENT_KEYWORDS.some((kw) => text.includes(kw));
}

function daysDiff(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function matchCardSum(
  batch: FinanceTransaction,
  cardTxns: FinanceTransaction[]
): { matched: boolean; sum: number } {
  const isMax = batch.description.includes("מקס");
  const isCal = batch.description.includes("כאל") || batch.description.includes("ויזה");

  const providerTxns = cardTxns.filter((c) => {
    if (isMax) return c.source === "max";
    if (isCal) return c.source === "visa_cal";
    return true;
  });

  const sumProvider = round2(providerTxns.reduce((acc, c) => acc + c.amount, 0));
  if (Math.abs(sumProvider - batch.amount) <= 0.05 && providerTxns.length > 0) {
    return { matched: true, sum: sumProvider };
  }

  const closeTxns = cardTxns.filter((c) => daysDiff(c.txn_date, batch.txn_date) <= 3);
  const sumClose = round2(closeTxns.reduce((acc, c) => acc + c.amount, 0));
  if (Math.abs(sumClose - batch.amount) <= 0.05 && closeTxns.length > 0) {
    return { matched: true, sum: sumClose };
  }

  const sumAll = round2(cardTxns.reduce((acc, c) => acc + c.amount, 0));
  if (Math.abs(sumAll - batch.amount) <= 0.05 && cardTxns.length > 0) {
    return { matched: true, sum: sumAll };
  }

  return { matched: false, sum: 0 };
}

export function findReconcilableBatchTransactions(
  transactions: FinanceTransaction[]
): ReconcileResult {
  const candidateBatches = transactions.filter(
    (t) =>
      t.source === "leumi" &&
      t.kind === "expense" &&
      isBatchSettlementDescription(t.description, t.merchant)
  );

  const cardTxns = transactions.filter(
    (t) => (CARD_SOURCES as readonly string[]).includes(t.source) && t.kind === "expense" && !t.is_internal
  );

  const matches: ReconcileMatch[] = [];
  const reconciledIds: string[] = [];

  for (const batch of candidateBatches) {
    const { matched, sum } = matchCardSum(batch, cardTxns);
    if (matched) {
      matches.push({
        batchId: batch.id,
        batchDescription: batch.description,
        batchAmount: batch.amount,
        matchedSum: sum,
        matchType: "sum_match",
      });
    } else {
      matches.push({
        batchId: batch.id,
        batchDescription: batch.description,
        batchAmount: batch.amount,
        matchType: "description_match",
      });
    }
    reconciledIds.push(batch.id);
  }

  return { reconciledIds, matches };
}

export async function reconcileMonthTransactions(month: string): Promise<ReconcileResult> {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("*")
    .gte("txn_date", start)
    .lt("txn_date", next);

  if (error) throw new Error(error.message);
  const txns = (data ?? []).map((r) => rowToTxn(r as Record<string, unknown>));

  const result = findReconcilableBatchTransactions(txns);
  const idsToUpdate = txns
    .filter((t) => result.reconciledIds.includes(t.id) && (!t.is_internal || t.needs_categorization))
    .map((t) => t.id);

  if (idsToUpdate.length > 0) {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("finance_transactions")
      .update({
        is_internal: true,
        needs_categorization: false,
        updated_at: now,
      })
      .in("id", idsToUpdate);

    if (updateError) throw new Error(updateError.message);
  }

  return result;
}
