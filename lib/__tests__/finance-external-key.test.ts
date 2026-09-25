import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { financeExternalKey } from "../finance/external-key";

describe("financeExternalKey", () => {
  it("uses identifier when present", () => {
    const key = financeExternalKey({
      source: "leumi",
      account_number: "1234",
      identifier: "txn-99",
      txn_date: "2026-09-01",
      amount: 50,
      description: "test",
    });
    assert.equal(key, "leumi:1234:txn-99");
  });

  it("uses card_name in identifier when account_number missing", () => {
    const key = financeExternalKey({
      source: "max",
      card_name: "MAX-0812",
      identifier: "tx-456",
      txn_date: "2026-09-01",
      amount: 120,
      description: "Super",
    });
    assert.equal(key, "max:MAX-0812:tx-456");
  });

  it("uses stable card+date+amount+currency keys without merchant", () => {
    const a = financeExternalKey({
      source: "apple_pay",
      card_name: "1234",
      txn_date: "2026-09-01",
      amount: 47.9,
      description: "3627ApplePay",
      merchant: "3627ApplePay",
    });
    const b = financeExternalKey({
      source: "visa_cal",
      card_name: "1234",
      txn_date: "2026-09-01",
      amount: 47.9,
      description: "Apple Pay Store",
      merchant: "Apple Pay Store",
    });
    assert.match(a, /^fin:[a-f0-9]{24}$/);
    assert.equal(a, b);
  });

  it("differs for different amounts", () => {
    const a = financeExternalKey({
      source: "apple_pay",
      card_name: "1234",
      txn_date: "2026-09-01",
      amount: 10,
      description: "x",
    });
    const b = financeExternalKey({
      source: "apple_pay",
      card_name: "1234",
      txn_date: "2026-09-01",
      amount: 11,
      description: "x",
    });
    assert.notEqual(a, b);
  });
});
