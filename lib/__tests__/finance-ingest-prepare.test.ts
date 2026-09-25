import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareIngestRows } from "../finance/ingest";
import type { MerchantRule } from "../finance/merchant-rules";
import type { MerchantCategoryRow } from "../finance/merchant-category";
import type { FinanceIngestInput } from "../finance/types";

const noRules = new Map<string, MerchantRule>();

function txn(over: Partial<FinanceIngestInput> = {}): FinanceIngestInput {
  return {
    source: "leumi",
    txn_date: "2026-09-01",
    amount: 42,
    description: "קניות",
    ...over,
  } as FinanceIngestInput;
}

describe("prepareIngestRows", () => {
  it("assigns distinct stable ordinals for same-day same-amount rows in one batch", () => {
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({ card_name: "1234", amount: 42, description: "first" }),
        txn({ card_name: "1234", amount: 42, description: "second" }),
        txn({ card_name: "1234", amount: 43, description: "other" }),
      ],
      noRules,
      []
    );
    assert.equal(prepared.length, 3);
    assert.equal(duplicatesInBatch, 0);
    assert.notEqual(prepared[0].externalKey, prepared[1].externalKey);
  });

  it("derives distinct keys for distinct transactions", () => {
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [txn({ amount: 10, description: "a" }), txn({ amount: 20, description: "b" })],
      noRules,
      []
    );
    assert.equal(prepared.length, 2);
    assert.equal(duplicatesInBatch, 0);
    assert.notEqual(prepared[0].externalKey, prepared[1].externalKey);
  });

  it("feeds a categorised row back into history for later rows in the batch", () => {
    // The sequential pass exists for exactly this: row 2 learns from row 1.
    const history: MerchantCategoryRow[] = [];
    const { prepared } = prepareIngestRows(
      [
        txn({ merchant: "ZZQQ Store", description: "ZZQQ Store", category: "פנאי", amount: 10 }),
        txn({ merchant: "ZZQQ Store", description: "ZZQQ Store", amount: 20 }),
      ],
      noRules,
      history
    );
    assert.equal(prepared[0].row.category, "פנאי");
    assert.equal(prepared[1].row.category, "פנאי");
    assert.equal(prepared[1].row.needs_categorization, false);
  });

  it("returns an empty batch for no input", () => {
    const { prepared, duplicatesInBatch } = prepareIngestRows([], noRules, []);
    assert.deepEqual(prepared, []);
    assert.equal(duplicatesInBatch, 0);
  });

  it("skips re-import rows that match an existing stable day+amount+card key", () => {
    const existingStableCounts = new Map([["1234|2026-09-01|42.00|ILS", 1]]);
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          card_name: "1234",
          amount: 42,
          merchant: "3627ApplePay",
          description: "3627ApplePay",
          external_key: "old-key",
        }),
      ],
      noRules,
      [],
      new Set(),
      existingStableCounts
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 1);
  });

  it("collapses Cal OCR garbage duplicates and keeps the clean merchant row", () => {
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          source: "visa_cal",
          txn_date: "2026-08-21",
          amount: 5,
          merchant: "לאהוראתקבעעמותותותרלובי",
          description: "לאהוראתקבעעמותותותרלובי",
        }),
        txn({
          source: "visa_cal",
          txn_date: "2026-08-21",
          amount: 5,
          merchant: "לובי 99",
          description: "הוראת קבע",
        }),
      ],
      noRules,
      []
    );
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].row.merchant, "לובי 99");
    assert.equal(duplicatesInBatch, 0);
  });
});
