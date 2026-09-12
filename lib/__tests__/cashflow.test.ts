import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeCashflow } from "../finance/cashflow";
import type { FinanceTransaction } from "../finance/ingest";

function txn(partial: Partial<FinanceTransaction> & Pick<FinanceTransaction, "txn_date" | "amount" | "kind">): FinanceTransaction {
  return {
    id: "1",
    source: "manual",
    external_key: "k",
    currency: "ILS",
    description: "x",
    merchant: null,
    account_number: null,
    card_name: null,
    status: "completed",
    category: null,
    purpose_note: null,
    expense_type: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("summarizeCashflow", () => {
  it("groups expenses by category", () => {
    const summary = summarizeCashflow(
      [
        txn({ txn_date: "2026-09-01", amount: 100, kind: "expense", category: "מזון" }),
        txn({ txn_date: "2026-09-02", amount: 50, kind: "expense", category: "מזון" }),
        txn({ txn_date: "2026-09-03", amount: 30, kind: "expense", category: "תחבורה" }),
        txn({ txn_date: "2026-09-04", amount: 200, kind: "income" }),
      ],
      "2026-09"
    );
    assert.equal(summary.income, 200);
    assert.equal(summary.expense, 180);
    assert.equal(summary.by_category.length, 2);
    assert.equal(summary.by_category[0].category, "מזון");
    assert.equal(summary.by_category[0].amount, 150);
  });
});
