import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withMerchantDisplay } from "../finance/merchant-display";
import type { FinanceTransaction } from "../finance/types";
import type { MerchantRule } from "../finance/merchant-rules-client";

function txn(partial: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: "t1",
    source: "visa_cal",
    external_key: "k1",
    txn_date: "2026-09-01",
    amount: 100,
    kind: "expense",
    currency: "ILS",
    original_amount: null,
    amount_ils: null,
    ils_estimated: false,
    description: "desc",
    merchant: "raw",
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
    categorized_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("withMerchantDisplay", () => {
  it("attaches merchant_display from matching rule", () => {
    const rules = new Map<string, MerchantRule>([
      [
        "רמי לוי",
        {
          merchant_key: "רמי לוי",
          display_name: "רמי לוי ראשון לציון",
          category: "מזון",
          expense_type: "variable",
          kind: "expense",
          default_note: null,
        },
      ],
    ]);
    const out = withMerchantDisplay(
      txn({ merchant: "מזוןומשקארמילוי-ראשוןלציון", description: "מזוןומשקארמילוי-ראשוןלציון" }),
      rules
    );
    assert.equal(out.merchant_display, "רמי לוי ראשון לציון");
    assert.equal(out.merchant, "מזוןומשקארמילוי-ראשוןלציון");
  });

  it("keeps raw merchant field unchanged", () => {
    const out = withMerchantDisplay(txn({ merchant: "google cloud wfv8mm sydney au" }), new Map());
    assert.equal(out.merchant, "google cloud wfv8mm sydney au");
    assert.equal(out.merchant_display, "Google Cloud");
  });
});
