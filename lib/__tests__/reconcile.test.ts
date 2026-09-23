import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBatchSettlementDescription,
  findReconcilableBatchTransactions,
} from "../finance/reconcile";
import type { FinanceTransaction } from "../finance/types";

function makeTxn(
  partial: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id" | "source" | "txn_date" | "amount" | "kind" | "description">
): FinanceTransaction {
  return {
    id: partial.id,
    source: partial.source,
    external_key: `key-${partial.id}`,
    txn_date: partial.txn_date,
    amount: partial.amount,
    kind: partial.kind,
    currency: "ILS",
    description: partial.description,
    merchant: partial.merchant ?? null,
    account_number: null,
    card_name: partial.card_name ?? null,
    status: "completed",
    category: partial.category ?? null,
    purpose_note: null,
    expense_type: partial.expense_type ?? null,
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: partial.is_internal ?? false,
    needs_categorization: partial.needs_categorization ?? true,
    categorized_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("isBatchSettlementDescription", () => {
  it("identifies known credit card settlement descriptions", () => {
    assert.equal(isBatchSettlementDescription("מקס איט פיננסיים"), true);
    assert.equal(isBatchSettlementDescription("חיוב חודשי כאל"), true);
    assert.equal(isBatchSettlementDescription("כרטיסי אשראי לישראל"), true);
    assert.equal(isBatchSettlementDescription("ויזה כאל"), true);
    assert.equal(isBatchSettlementDescription("ישראכרט הוראת קבע"), true);
    assert.equal(isBatchSettlementDescription("סליקה מקס"), true);
    assert.equal(isBatchSettlementDescription("חיוב כרטיס אשראי"), true);
    assert.equal(isBatchSettlementDescription(undefined, "מקס איט"), true);
  });

  it("returns false for regular merchants", () => {
    assert.equal(isBatchSettlementDescription("שופרסל שלי"), false);
    assert.equal(isBatchSettlementDescription("סופר-פארם"), false);
    assert.equal(isBatchSettlementDescription("העברה לחשבון אחר"), false);
    assert.equal(isBatchSettlementDescription(""), false);
  });
});

describe("findReconcilableBatchTransactions", () => {
  it("detects exact sum match between Leumi batch charge and max transactions", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({
        id: "batch-1",
        source: "leumi",
        txn_date: "2026-09-10",
        amount: 250,
        kind: "expense",
        description: "מקס איט פיננסים",
      }),
      makeTxn({
        id: "card-1",
        source: "max",
        txn_date: "2026-09-02",
        amount: 150,
        kind: "expense",
        description: "זארה",
      }),
      makeTxn({
        id: "card-2",
        source: "max",
        txn_date: "2026-09-08",
        amount: 100,
        kind: "expense",
        description: "ארומה",
      }),
    ];

    const result = findReconcilableBatchTransactions(txns);
    assert.deepEqual(result.reconciledIds, ["batch-1"]);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].batchId, "batch-1");
    assert.equal(result.matches[0].matchType, "sum_match");
    assert.equal(result.matches[0].matchedSum, 250);
  });

  it("detects sum match within ±3 days billing cycle", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({
        id: "batch-cal",
        source: "leumi",
        txn_date: "2026-09-15",
        amount: 320,
        kind: "expense",
        description: "סליקה כרטיסי אשראי",
      }),
      makeTxn({
        id: "card-cal-1",
        source: "visa_cal",
        txn_date: "2026-09-14",
        amount: 200,
        kind: "expense",
        description: "דלק פז",
      }),
      makeTxn({
        id: "card-cal-2",
        source: "visa_cal",
        txn_date: "2026-09-16",
        amount: 120,
        kind: "expense",
        description: "סופר פארם",
      }),
    ];

    const result = findReconcilableBatchTransactions(txns);
    assert.deepEqual(result.reconciledIds, ["batch-cal"]);
    assert.equal(result.matches[0].matchType, "sum_match");
    assert.equal(result.matches[0].matchedSum, 320);
  });

  it("marks description_match even when card transactions are missing or do not sum up", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({
        id: "batch-lone",
        source: "leumi",
        txn_date: "2026-09-10",
        amount: 1450,
        kind: "expense",
        description: "מקס איט",
      }),
      makeTxn({
        id: "reg-leumi",
        source: "leumi",
        txn_date: "2026-09-05",
        amount: 45,
        kind: "expense",
        description: "קפה גרג",
      }),
    ];

    const result = findReconcilableBatchTransactions(txns);
    assert.deepEqual(result.reconciledIds, ["batch-lone"]);
    assert.equal(result.matches[0].batchId, "batch-lone");
    assert.equal(result.matches[0].matchType, "description_match");
  });

  it("ignores non-leumi batch-like descriptions or income transactions", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({
        id: "card-not-batch",
        source: "max",
        txn_date: "2026-09-10",
        amount: 200,
        kind: "expense",
        description: "מקס איט",
      }),
      makeTxn({
        id: "income-leumi",
        source: "leumi",
        txn_date: "2026-09-10",
        amount: 200,
        kind: "income",
        description: "מקס איט זיכוי",
      }),
    ];

    const result = findReconcilableBatchTransactions(txns);
    assert.deepEqual(result.reconciledIds, []);
    assert.equal(result.matches.length, 0);
  });
});
