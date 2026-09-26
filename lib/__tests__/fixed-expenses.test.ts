import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFixedExpenseItems } from "../finance/fixed-expenses";
import type { MerchantRule } from "../finance/merchant-rules-client";
import type { FinanceTransaction } from "../finance/types";

function txn(partial: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id">): FinanceTransaction {
  return {
    source: "leumi",
    external_key: partial.id,
    txn_date: "2026-09-05",
    amount: 100,
    kind: "expense",
    currency: "ILS",
    original_amount: null,
    amount_ils: null,
    ils_estimated: false,
    description: "NETFLIX",
    merchant: "NETFLIX",
    account_number: null,
    card_name: null,
    status: "completed",
    category: "מנויים",
    purpose_note: null,
    expense_type: "fixed",
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: "2026-09-05T00:00:00.000Z",
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    ...partial,
  };
}

describe("buildFixedExpenseItems", () => {
  it("includes fixed merchant rules with month actuals", () => {
    const rules: MerchantRule[] = [
      {
        id: "rule-1",
        merchant_key: "netflix",
        category: "מנויים",
        expense_type: "fixed",
        kind: "expense",
        default_note: null,
        planned_amount: 54.9,
        frequency: "monthly",
        charge_day: 5,
        is_active: true,
      },
    ];
    const monthTxns = [txn({ id: "t1", amount: 54.9, merchant: "NETFLIX", txn_date: "2026-09-05" })];
    const items = buildFixedExpenseItems(rules, monthTxns, monthTxns);
    assert.equal(items.length, 1);
    assert.equal(items[0].name.length > 0, true);
    assert.equal(items[0].planned_amount, 54.9);
    assert.equal(items[0].actual_amount, 54.9);
    assert.equal(items[0].last_charge_date, "2026-09-05");
  });

  it("includes fixed-tagged transactions without a rule", () => {
    const items = buildFixedExpenseItems(
      [],
      [txn({ id: "t2", merchant: "BITUAH LEUMI", description: "BITUAH LEUMI", amount: 350, category: "בית" })],
      [txn({ id: "t2", merchant: "BITUAH LEUMI", description: "BITUAH LEUMI", amount: 350, category: "בית", txn_date: "2026-08-01" })]
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].rule_id, null);
    assert.equal(items[0].actual_amount, 350);
  });
});
