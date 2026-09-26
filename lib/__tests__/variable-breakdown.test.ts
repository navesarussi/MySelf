import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVariableBreakdown } from "../finance/variable-breakdown";
import type { FinanceTransaction } from "../finance/types";

function txn(partial: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id">): FinanceTransaction {
  return {
    source: "manual",
    external_key: partial.id,
    txn_date: "2026-09-10",
    amount: 50,
    kind: "expense",
    currency: "ILS",
    original_amount: null,
    amount_ils: null,
    ils_estimated: false,
    description: "CAFE",
    merchant: "CAFE",
    account_number: null,
    card_name: null,
    status: "completed",
    category: "מזון",
    purpose_note: "latte",
    expense_type: "variable",
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: "2026-09-10T00:00:00.000Z",
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    ...partial,
  };
}

describe("buildVariableBreakdown", () => {
  it("groups variable expenses by category", () => {
    const groups = buildVariableBreakdown("2026-09", [
      txn({ id: "a", category: "מזון", amount: 40 }),
      txn({ id: "b", category: "מזון", amount: 60 }),
      txn({ id: "c", category: "תחבורה", amount: 25, merchant: "BIT", description: "BIT" }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].category, "מזון");
    assert.equal(groups[0].total, 100);
    assert.equal(groups[0].transactions.length, 2);
  });

  it("skips fixed and internal transactions", () => {
    const groups = buildVariableBreakdown("2026-09", [
      txn({ id: "fixed", expense_type: "fixed", amount: 200 }),
      txn({ id: "internal", is_internal: true, amount: 30 }),
      txn({ id: "var", amount: 15 }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].total, 15);
  });
});
