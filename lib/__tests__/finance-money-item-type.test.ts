import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMoneyItemType,
  moneyItemTypeFromTxn,
  moneyItemTypeToFields,
} from "../finance/money-item-type";
import type { FinanceTransaction } from "../finance/types";

function txn(over: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: "t1",
    source: "manual",
    external_key: "k",
    txn_date: "2026-09-01",
    amount: 100,
    kind: "expense",
    currency: "ILS",
    original_amount: null,
    amount_ils: null,
    ils_estimated: false,
    description: "test",
    merchant: "test",
    account_number: null,
    card_name: null,
    status: "completed",
    category: "מזון",
    purpose_note: null,
    expense_type: "variable",
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("moneyItemTypeFromTxn", () => {
  it("maps internal, income, fixed, variable", () => {
    assert.equal(moneyItemTypeFromTxn(txn({ is_internal: true })), "internal");
    assert.equal(moneyItemTypeFromTxn(txn({ kind: "income", expense_type: null })), "income");
    assert.equal(moneyItemTypeFromTxn(txn({ expense_type: "fixed" })), "fixed");
    assert.equal(moneyItemTypeFromTxn(txn({ expense_type: "variable" })), "variable");
  });
});

describe("moneyItemTypeToFields", () => {
  it("round-trips fixed and variable", () => {
    for (const type of ["fixed", "variable", "income", "internal"] as const) {
      const fields = moneyItemTypeToFields(type);
      const fake = txn({
        kind: fields.kind,
        expense_type: fields.expense_type,
        is_internal: fields.is_internal,
      });
      if (type !== "internal") assert.equal(moneyItemTypeFromTxn(fake), type);
    }
  });

  it("internal preserves income kind", () => {
    const fields = applyMoneyItemType("internal", { kind: "income" });
    assert.equal(fields.kind, "income");
    assert.equal(fields.is_internal, true);
  });
});

describe("validateSplitParts", () => {
  it("requires parts to sum to parent amount", async () => {
    const { validateSplitParts } = await import("../finance/split-txn");
    assert.equal(validateSplitParts(100, [{ amount: 60 }, { amount: 40 }]), null);
    assert.equal(validateSplitParts(100, [{ amount: 60 }, { amount: 30 }]), "split_amount_mismatch");
    assert.equal(validateSplitParts(100, [{ amount: 100 }]), "split_requires_two_parts");
  });
});

describe("applyTypeToMerchantTransactions matching", () => {
  it("matches merchant keys via normalizeMerchantKey", async () => {
    const { pendingMatchesForRule } = await import("../finance/apply-rule-pending");
    const rows = [
      { id: "a", merchant: "NETFLIX", description: "NETFLIX", kind: "expense", purpose_note: null },
      { id: "b", merchant: "OTHER", description: "OTHER", kind: "expense", purpose_note: null },
    ];
    const matched = pendingMatchesForRule(rows, { merchant_key: "netflix", kind: "expense" });
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, "a");
  });
});

describe("autoClassify respects user lock after type switch", () => {
  it("does not overwrite categorized fixed expense", async () => {
    const { autoClassifyPatchForTxn } = await import("../finance/plan-store");
    const row = txn({
      id: "locked-fixed",
      source: "leumi",
      expense_type: "fixed",
      category: "מנויים",
      needs_categorization: false,
      categorized_at: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(autoClassifyPatchForTxn(row, new Date().toISOString()), null);
  });
});
