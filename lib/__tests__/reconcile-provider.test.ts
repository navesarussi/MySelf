import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findReconcilableBatchTransactions } from "../finance/reconcile";
import type { FinanceTransaction } from "../finance/types";

function txn(
  partial: Partial<FinanceTransaction> &
    Pick<FinanceTransaction, "id" | "source" | "txn_date" | "amount" | "kind" | "description">
): FinanceTransaction {
  return {
    external_key: `key-${partial.id}`,
    currency: "ILS",
    merchant: null,
    account_number: null,
    card_name: null,
    status: "completed",
    category: null,
    purpose_note: null,
    expense_type: null,
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

/**
 * A month can hold settlements from more than one card issuer. The provider is
 * read off the batch description, but the fallback sums ignored it and totalled
 * every card transaction in the month — so a Max settlement could be reported
 * as a "sum match" against a total that was mostly Cal spending.
 */
describe("batch reconciliation with two card providers in one month", () => {
  const maxBatch = txn({
    id: "batch-max",
    source: "leumi",
    txn_date: "2026-07-10",
    amount: 900,
    kind: "expense",
    description: "מקס איט פיננסים",
  });
  const calTxns = [
    txn({ id: "c1", source: "visa_cal", txn_date: "2026-07-03", amount: 500, kind: "expense", description: "חנות" }),
    txn({ id: "c2", source: "visa_cal", txn_date: "2026-07-04", amount: 400, kind: "expense", description: "דלק" }),
  ];

  it("does not claim a sum match from another provider's transactions", () => {
    // No Max transactions at all — the 900 comes entirely from Cal.
    const { matches } = findReconcilableBatchTransactions([maxBatch, ...calTxns]);
    assert.equal(matches.length, 1);
    assert.equal(
      matches[0].matchType,
      "description_match",
      "a Max settlement must not be matched against Cal spending"
    );
    assert.equal(matches[0].matchedSum, undefined);
  });

  it("still matches the batch against its own provider", () => {
    const maxTxns = [
      txn({ id: "m1", source: "max", txn_date: "2026-07-02", amount: 600, kind: "expense", description: "סופר" }),
      txn({ id: "m2", source: "max", txn_date: "2026-07-05", amount: 300, kind: "expense", description: "בגדים" }),
    ];
    const { matches } = findReconcilableBatchTransactions([maxBatch, ...maxTxns, ...calTxns]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].matchType, "sum_match");
    assert.equal(matches[0].matchedSum, 900);
  });

  it("falls back within the provider when only part of the month settles", () => {
    // 900 settles, but the provider also has a later charge in the same month
    // that belongs to the next settlement — the near-date fallback must find it.
    const maxTxns = [
      txn({ id: "m1", source: "max", txn_date: "2026-07-08", amount: 600, kind: "expense", description: "סופר" }),
      txn({ id: "m2", source: "max", txn_date: "2026-07-09", amount: 300, kind: "expense", description: "בגדים" }),
      txn({ id: "m3", source: "max", txn_date: "2026-07-28", amount: 250, kind: "expense", description: "מאוחר" }),
    ];
    const { matches } = findReconcilableBatchTransactions([maxBatch, ...maxTxns, ...calTxns]);
    assert.equal(matches[0].matchType, "sum_match");
    assert.equal(matches[0].matchedSum, 900);
  });

  it("keeps using every card transaction when the issuer is not identifiable", () => {
    const genericBatch = txn({
      id: "batch-generic",
      source: "leumi",
      txn_date: "2026-07-10",
      amount: 900,
      kind: "expense",
      description: "חיוב כרטיס אשראי",
    });
    const { matches } = findReconcilableBatchTransactions([genericBatch, ...calTxns]);
    assert.equal(matches[0].matchType, "sum_match");
    assert.equal(matches[0].matchedSum, 900);
  });
});
