import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calDuplicateDayAmountKey,
  dedupeSameDayAmountCharges,
  extractCoreMerchantName,
  isCalOcrGarbageMerchant,
  isVariableTollMerchant,
  pickPreferredMerchantLabel,
  recurringMerchantGroupKey,
  shouldSkipCalGarbageDuplicate,
  typicalChargeAmount,
} from "../finance/cal-duplicate";
import type { FinanceTransaction } from "../finance/types";

function makeTxn(
  partial: Partial<FinanceTransaction> & Pick<FinanceTransaction, "id" | "txn_date" | "amount" | "kind" | "description">
): FinanceTransaction {
  return {
    id: partial.id,
    source: partial.source ?? "visa_cal",
    external_key: `key-${partial.id}`,
    txn_date: partial.txn_date,
    amount: partial.amount,
    kind: partial.kind,
    currency: "ILS",
    original_amount: null,
    amount_ils: partial.amount,
    ils_estimated: false,
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
    is_internal: false,
    needs_categorization: false,
    categorized_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("cal duplicate helpers", () => {
  it("detects glued OCR garbage and maps cores to clean merchant names", () => {
    assert.equal(isCalOcrGarbageMerchant("לאהוראתקבעעמותותותרלובי"), true);
    assert.equal(isCalOcrGarbageMerchant("לובי 99"), false);
    assert.equal(extractCoreMerchantName("לובי 99"), "לובי 99");
    assert.equal(extractCoreMerchantName("לאהוראתקבעעמותותותרלובי"), "לובי");
    assert.equal(
      recurringMerchantGroupKey({ merchant: "לובי 99", description: "הוראת קבע" }),
      "לובי 99"
    );
    assert.equal(
      recurringMerchantGroupKey({
        merchant: "לאהוראתקבעעמותותותרלובי",
        description: "לאהוראתקבעעמותותותרלובי",
      }),
      "לובי"
    );
  });

  it("prefers clean merchant labels over OCR glue", () => {
    assert.equal(
      pickPreferredMerchantLabel("לובי 99", "לא הוראת קבע עמותות תר לובי", "לאהוראתקבעעמותותותרלובי"),
      "לובי 99"
    );
    assert.equal(
      pickPreferredMerchantLabel("כביש 6", "לא הוראת קבע ברכבות חבור כביש"),
      "כביש 6"
    );
  });

  it("dedupes same-day same-amount rows keeping the clean merchant", () => {
    const txns = [
      makeTxn({
        id: "clean",
        txn_date: "2026-08-21",
        amount: 5,
        kind: "expense",
        merchant: "לובי 99",
        description: "הוראת קבע",
      }),
      makeTxn({
        id: "garbage-a",
        txn_date: "2026-08-21",
        amount: 5,
        kind: "expense",
        merchant: "לאהוראתקבעעמותותותרלובי",
        description: "לאהוראתקבעעמותותותרלובי",
      }),
      makeTxn({
        id: "garbage-b",
        txn_date: "2026-08-21",
        amount: 5,
        kind: "expense",
        merchant: "לא הוראתקבעעמותותותרלובי",
        description: "לא הוראתקבעעמותותותרלובי",
      }),
    ];

    const deduped = dedupeSameDayAmountCharges(txns);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].merchant, "לובי 99");
  });

  it("uses median typical charge instead of summing duplicate rows", () => {
    assert.equal(typicalChargeAmount([5, 5, 10]), 5);
    assert.equal(typicalChargeAmount([141.65, 139.38]), 140.51);
  });

  it("flags variable highway toll merchants", () => {
    assert.equal(isVariableTollMerchant({ merchant: "כביש 6", description: "הוראת קבע" }), true);
    assert.equal(
      isVariableTollMerchant({
        merchant: "לאהוראתקבערכבותחבורכביש",
        description: "לאהוראתקבערכבותחבורכביש",
      }),
      true
    );
    assert.equal(isVariableTollMerchant({ merchant: "לובי 99", description: "הוראת קבע" }), false);
  });

  it("skips garbage import rows when a clean sibling exists", () => {
    const key = calDuplicateDayAmountKey({
      txn_date: "2026-08-21",
      amount: 5,
      source: "visa_cal",
      merchant: "לובי 99",
      description: "הוראת קבע",
    });
    const existingCleanKeys = new Set([key]);
    assert.equal(
      shouldSkipCalGarbageDuplicate({
        txn_date: "2026-08-21",
        amount: 5,
        source: "visa_cal",
        merchant: "לאהוראתקבעעמותותותרלובי",
        description: "לאהוראתקבעעמותותותרלובי",
        existingCleanKeys,
        batchCleanKeys: new Set(),
      }),
      true
    );
  });
});
