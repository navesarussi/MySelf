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
  it("keeps the first of two rows sharing an external key and counts the rest", () => {
    // Previously each repeat made its own INSERT and was skipped on the unique
    // violation; the batched upsert needs them collapsed before the statement.
    const { prepared, duplicatesInBatch } = prepareIngestRows(
      [
        txn({ external_key: "k1", description: "first" }),
        txn({ external_key: "k1", description: "second" }),
        txn({ external_key: "k2" }),
      ],
      noRules,
      []
    );
    assert.equal(prepared.length, 2);
    assert.equal(duplicatesInBatch, 1);
    assert.deepEqual(
      prepared.map((p) => p.externalKey),
      ["k1", "k2"]
    );
    assert.equal(prepared[0].row.description, "first");
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
});
