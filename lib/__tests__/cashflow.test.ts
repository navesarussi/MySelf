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
    original_amount: null,
    amount_ils: partial.amount,
    ils_estimated: false,
    description: "x",
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

  it("excludes savings from expense and net totals", () => {
    const summary = summarizeCashflow(
      [
        txn({ txn_date: "2026-09-01", amount: 1000, kind: "income" }),
        txn({ txn_date: "2026-09-02", amount: 400, kind: "expense", category: "מזון" }),
        txn({
          txn_date: "2026-09-03",
          amount: 200,
          kind: "expense",
          category: "חיסכון",
          expense_type: "savings",
        }),
      ],
      "2026-09"
    );
    assert.equal(summary.income, 1000);
    assert.equal(summary.expense, 400);
    assert.equal(summary.net, 600);
    assert.equal(summary.by_category.length, 1);
  });

  it("strictly filters out internal transactions", () => {
    const summary = summarizeCashflow(
      [
        txn({ txn_date: "2026-09-01", amount: 100, kind: "expense", category: "מזון" }),
        txn({ txn_date: "2026-09-02", amount: 1500, kind: "expense", category: "כללי", is_internal: true }),
        txn({ txn_date: "2026-09-03", amount: 500, kind: "income", is_internal: true }),
      ],
      "2026-09"
    );
    assert.equal(summary.income, 0);
    assert.equal(summary.expense, 100);
    assert.equal(summary.by_category.length, 1);
    assert.equal(summary.by_category[0].category, "מזון");
  });
});
