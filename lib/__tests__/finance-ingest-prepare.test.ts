import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareIngestRows } from "../finance/ingest";
import type { FuzzyUsdRow, LeumiFxDebitRow } from "../finance/fx-import-link";
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

  it("assigns distinct stable keys for same-day same-amount rows with different descriptions", () => {
    const { prepared } = prepareIngestRows(
      [
        txn({ card_name: "6601", txn_date: "2026-06-28", amount: 130, merchant: "Zigo", description: "Zigo refund A" }),
        txn({ card_name: "6601", txn_date: "2026-06-28", amount: 130, merchant: "Zigo", description: "Zigo refund B" }),
      ],
      noRules,
      []
    );
    assert.equal(prepared.length, 2);
    assert.notEqual(prepared[0].externalKey, prepared[1].externalKey);
  });

  it("skips re-import when stable key ordinals already exist in DB", () => {
    const existingStableCounts = new Map([["6601|2026-06-28|130.00|ILS", 2]]);
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({ card_name: "6601", txn_date: "2026-06-28", amount: 130, merchant: "Zigo" }),
        txn({ card_name: "6601", txn_date: "2026-06-28", amount: 130, merchant: "Zigo" }),
      ],
      noRules,
      [],
      { existingStableCounts }
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 2);
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
      { existingStableCounts }
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 1);
  });

  it("skips Cal USD when a categorized Leumi FX debit is the expense of record", () => {
    const existingFxDebits: LeumiFxDebitRow[] = [
      {
        id: "fx-1",
        txn_date: "2026-06-15",
        amount: 365.5,
        category: "מנויים",
        purpose_note: "Anthropic $100",
        categorized_at: "2026-06-16T00:00:00.000Z",
        description: "המרת קנ במטח",
        merchant: null,
        is_internal: false,
      },
    ];
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          source: "visa_cal",
          card_name: "6601",
          txn_date: "2026-06-14",
          amount: 100,
          currency: "USD",
          original_amount: 100,
          amount_ils: 365.5,
          description: "ANTHROPIC",
        }),
      ],
      noRules,
      [],
      { existingFxDebits }
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 1);
  });

  it("inserts Cal USD when Leumi FX debit is uncategorized (pair for internalization)", () => {
    const existingFxDebits: LeumiFxDebitRow[] = [
      {
        id: "fx-2",
        txn_date: "2026-06-15",
        amount: 365.5,
        category: null,
        purpose_note: null,
        categorized_at: null,
        description: "המרת קנ במטח",
        merchant: null,
        is_internal: false,
      },
    ];
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          source: "visa_cal",
          card_name: "6601",
          txn_date: "2026-06-14",
          amount: 100,
          currency: "USD",
          original_amount: 100,
          amount_ils: 365.5,
          description: "ANTHROPIC",
        }),
      ],
      noRules,
      [],
      { existingFxDebits }
    );
    assert.equal(prepared.length, 1);
    assert.equal(duplicatesInBatch, 0);
    assert.equal(prepared[0].row.currency, "USD");
  });

  it("dedupes legacy manual USD rows by account + amount within date window", () => {
    const existingFuzzyUsd: FuzzyUsdRow[] = [
      {
        id: "legacy-1",
        txn_date: "2026-03-01",
        card_name: "6601",
        account_number: null,
        currency: "USD",
        original_amount: 20,
        amount: 20,
      },
    ];
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          source: "visa_cal",
          card_name: "6601",
          txn_date: "2026-03-04",
          amount: 20,
          currency: "USD",
          original_amount: 20,
          amount_ils: 73,
          description: "OPENAI",
        }),
      ],
      noRules,
      [],
      { existingFuzzyUsd }
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 1);
  });

  it("skips Leumi re-import when Excel row had null account and sync has account number", () => {
    const existingStableCounts = new Map([["default|2026-09-01|100.00|ILS", 1]]);
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          account_number: "669-55735/82",
          amount: 100,
          description: "העברה לפיגור",
        }),
      ],
      noRules,
      [],
      { existingStableCounts }
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 1);
  });

  it("skips Leumi re-import within ±1 day date window", () => {
    const existingStableCounts = new Map([["default|2026-09-01|100.00|ILS", 1]]);
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({
          txn_date: "2026-09-02",
          amount: 100,
          description: "העברה לפיגור",
        }),
      ],
      noRules,
      [],
      { existingStableCounts }
    );
    assert.equal(prepared.length, 0);
    assert.equal(duplicatesInBatch, 1);
  });

  it("dedupes identical Leumi rows within one sync payload", () => {
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({ amount: 100, description: "העברה לפיגור" }),
        txn({ amount: 100, description: "העברה לפיגור" }),
      ],
      noRules,
      []
    );
    assert.equal(prepared.length, 1);
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
