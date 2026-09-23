import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getRecentMonths,
  findRecurringExpenseSuggestions,
} from "../finance/recurring";
import { dedupeRecurringSuggestions } from "../finance/recurring-client";
import type { RecurringSuggestion } from "../finance/types-client";
import type { FinanceTransaction } from "../finance/types";
import type { MerchantRule } from "../finance/merchant-rules";

function makeTxn(
  partial: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id" | "txn_date" | "amount" | "kind" | "description">
): FinanceTransaction {
  return {
    id: partial.id,
    source: "manual",
    external_key: `key-${partial.id}`,
    txn_date: partial.txn_date,
    amount: partial.amount,
    kind: partial.kind,
    currency: "ILS",
    description: partial.description,
    merchant: partial.merchant ?? null,
    account_number: null,
    card_name: null,
    status: "completed",
    category: partial.category ?? null,
    purpose_note: null,
    expense_type: partial.expense_type ?? null,
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: partial.is_internal ?? false,
    needs_categorization: false,
    categorized_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("getRecentMonths", () => {
  it("calculates past months within same year", () => {
    assert.deepEqual(getRecentMonths("2026-09", 3), ["2026-07", "2026-08", "2026-09"]);
  });

  it("handles year transition properly", () => {
    assert.deepEqual(getRecentMonths("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
  });
});

describe("findRecurringExpenseSuggestions", () => {
  it("suggests recurring fixed expense for exact match across 3 months", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({ id: "1", txn_date: "2026-07-10", amount: 55, kind: "expense", description: "נטפליקס", category: "מנויים" }),
      makeTxn({ id: "2", txn_date: "2026-08-10", amount: 55, kind: "expense", description: "נטפליקס", category: "מנויים" }),
      makeTxn({ id: "3", txn_date: "2026-09-10", amount: 55, kind: "expense", description: "נטפליקס", category: "מנויים" }),
    ];

    const suggestions = findRecurringExpenseSuggestions(txns);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].merchant_key, "נטפליקס");
    assert.equal(suggestions[0].suggested_amount, 55);
    assert.equal(suggestions[0].occurrences, 3);
    assert.equal(suggestions[0].category, "מנויים");
  });

  it("suggests recurring fixed expense for amounts within 10% tolerance across 2 months", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({ id: "1", txn_date: "2026-08-01", amount: 200, kind: "expense", description: "חברת חשמל", category: "בית" }),
      makeTxn({ id: "2", txn_date: "2026-09-01", amount: 215, kind: "expense", description: "חברת חשמל", category: "בית" }),
    ];

    const suggestions = findRecurringExpenseSuggestions(txns);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].merchant_key, "חברת חשמל");
    assert.equal(suggestions[0].occurrences, 2);
    assert.equal(suggestions[0].suggested_amount, 207.5);
  });

  it("ignores expenses with fluctuating amounts over 10%", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({ id: "1", txn_date: "2026-07-05", amount: 100, kind: "expense", description: "מסעדה אקראית" }),
      makeTxn({ id: "2", txn_date: "2026-08-05", amount: 280, kind: "expense", description: "מסעדה אקראית" }),
    ];

    const suggestions = findRecurringExpenseSuggestions(txns);
    assert.equal(suggestions.length, 0);
  });

  it("skips merchant when already marked as fixed in rules", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({ id: "1", txn_date: "2026-08-01", amount: 300, kind: "expense", description: "ספוטיפיי" }),
      makeTxn({ id: "2", txn_date: "2026-09-01", amount: 300, kind: "expense", description: "ספוטיפיי" }),
    ];

    const existingRules: MerchantRule[] = [
      {
        merchant_key: "ספוטיפיי",
        category: "מנויים",
        expense_type: "fixed",
        kind: "expense",
        default_note: null,
      },
    ];

    const suggestions = findRecurringExpenseSuggestions(txns, existingRules);
    assert.equal(suggestions.length, 0);
  });

  it("merges Cal OCR clones with clean merchant and uses typical charge not sum", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({
        id: "1",
        txn_date: "2026-07-21",
        amount: 5,
        kind: "expense",
        merchant: "לובי 99",
        description: "הוראת קבע",
        category: "עמותות",
      }),
      makeTxn({
        id: "2",
        txn_date: "2026-07-21",
        amount: 5,
        kind: "expense",
        merchant: "לאהוראתקבעעמותותותרלובי",
        description: "לאהוראתקבעעמותותותרלובי",
      }),
      makeTxn({
        id: "3",
        txn_date: "2026-08-21",
        amount: 5,
        kind: "expense",
        merchant: "לובי 99",
        description: "הוראת קבע",
      }),
      makeTxn({
        id: "4",
        txn_date: "2026-08-21",
        amount: 5,
        kind: "expense",
        merchant: "לא הוראתקבעעמותותותרלובי",
        description: "לא הוראתקבעעמותותותרלובי",
      }),
    ];

    const suggestions = findRecurringExpenseSuggestions(txns);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].suggested_amount, 5);
    assert.equal(suggestions[0].display_name, "לובי 99");
    assert.equal(suggestions[0].occurrences, 2);
  });

  it("does not suggest variable highway toll merchants as fixed recurring", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({
        id: "1",
        txn_date: "2026-07-21",
        amount: 141.65,
        kind: "expense",
        merchant: "כביש 6",
        description: "הוראת קבע",
        category: "תחבורה",
      }),
      makeTxn({
        id: "2",
        txn_date: "2026-07-21",
        amount: 141.65,
        kind: "expense",
        merchant: "לאהוראתקבערכבותחבורכביש",
        description: "לאהוראתקבערכבותחבורכביש",
      }),
      makeTxn({
        id: "3",
        txn_date: "2026-08-20",
        amount: 139.38,
        kind: "expense",
        merchant: "כביש 6",
        description: "הוראת קבע",
        category: "תחבורה",
      }),
      makeTxn({
        id: "4",
        txn_date: "2026-08-20",
        amount: 139.38,
        kind: "expense",
        merchant: "לא הוראתקבערכבותחבורכביש",
        description: "לא הוראתקבערכבותחבורכביש",
      }),
    ];

    const suggestions = findRecurringExpenseSuggestions(txns);
    assert.equal(suggestions.length, 0);
  });

  it("dedupeRecurringSuggestions collapses synthetic duplicate rows", () => {
    const dupes: RecurringSuggestion[] = [
      {
        merchant_key: "לאהוראתקבעברכבותחבורכביש",
        display_name: "לאהוראתקבעברכבותחבורכביש",
        category: "תחבורה",
        suggested_amount: 141,
        occurrences: 2,
        months: ["2026-08", "2026-09"],
        amounts: [141, 141],
      },
      {
        merchant_key: "לא הוראת קבע ברכבות חבור כביש",
        display_name: "לאהוראתקבעברכבותחבורכביש",
        category: "תחבורה",
        suggested_amount: 141,
        occurrences: 2,
        months: ["2026-08", "2026-09"],
        amounts: [141, 141],
      },
    ];

    const merged = dedupeRecurringSuggestions(dupes);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].suggested_amount, 141);
    assert.match(merged[0].display_name, /הוראת קבע/);
  });

  it("skips internal transactions and income transactions", () => {
    const txns: FinanceTransaction[] = [
      makeTxn({ id: "1", txn_date: "2026-08-01", amount: 500, kind: "expense", description: "העברה פנימית", is_internal: true }),
      makeTxn({ id: "2", txn_date: "2026-09-01", amount: 500, kind: "expense", description: "העברה פנימית", is_internal: true }),
      makeTxn({ id: "3", txn_date: "2026-08-10", amount: 10000, kind: "income", description: "משכורת" }),
      makeTxn({ id: "4", txn_date: "2026-09-10", amount: 10000, kind: "income", description: "משכורת" }),
    ];

    const suggestions = findRecurringExpenseSuggestions(txns);
    assert.equal(suggestions.length, 0);
  });
});
