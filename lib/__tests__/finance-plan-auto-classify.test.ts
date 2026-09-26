import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoClassifyPatchForTxn } from "../finance/plan-store";
import type { FinanceTransaction } from "../finance/types";

const NOW = "2026-09-26T08:00:00.000Z";

function txn(over: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id" | "source" | "description">): FinanceTransaction {
  return {
    external_key: "fin:test",
    txn_date: "2026-09-01",
    amount: 500,
    kind: "income",
    currency: "ILS",
    original_amount: null,
    amount_ils: 500,
    ils_estimated: false,
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
    needs_categorization: true,
    categorized_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

describe("autoClassifyPatchForTxn", () => {
  it("does not flip Leumi credit kind when description looks like expense", () => {
    const row = txn({
      id: "leumi-credit",
      source: "leumi",
      kind: "income",
      description: "העברה לפיגור",
    });
    assert.equal(autoClassifyPatchForTxn(row, NOW), null);
  });

  it("does not flip outgoing Leumi digital transfer debit to income", () => {
    const row = txn({
      id: "leumi-debit",
      source: "leumi",
      kind: "expense",
      amount: 200,
      description: "העברה דיגיטל",
    });
    assert.equal(autoClassifyPatchForTxn(row, NOW), null);
  });

  it("leaves categorized rows untouched", () => {
    const row = txn({
      id: "done",
      source: "manual",
      kind: "income",
      description: "העברה דיגיטל",
      category: "משכורת",
      needs_categorization: false,
      categorized_at: NOW,
    });
    assert.equal(autoClassifyPatchForTxn(row, NOW), null);
  });

  it("leaves rows with needs_categorization=false untouched", () => {
    const row = txn({
      id: "locked",
      source: "manual",
      kind: "expense",
      description: "סופר",
      needs_categorization: false,
    });
    assert.equal(autoClassifyPatchForTxn(row, NOW), null);
  });

  it("may still auto-skip obvious bank fees on pending manual rows", () => {
    const row = txn({
      id: "fee",
      source: "manual",
      kind: "expense",
      description: "עמלת קנ במטח",
    });
    const patch = autoClassifyPatchForTxn(row, NOW);
    assert.ok(patch);
    assert.equal(patch!.needs_categorization, false);
    assert.equal(patch!.categorized_at, NOW);
    assert.equal("kind" in patch!, false);
  });
});
