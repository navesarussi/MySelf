import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignStableExternalKeys,
  cardScopeFromAccount,
  stableTxnBaseKey,
  stableTxnExternalKey,
} from "../finance/stable-external-key";

describe("stable external keys", () => {
  it("derives card scope from mask last four digits", () => {
    assert.equal(cardScopeFromAccount({ card_mask: "2853755000-966-01" }), "6601");
  });

  it("uses default scope for Leumi regardless of account number", () => {
    assert.equal(cardScopeFromAccount({ source: "leumi", account_number: "669-55735/82" }), "default");
    assert.equal(cardScopeFromAccount({ source: "leumi" }), "default");
  });

  it("uses the same base key regardless of merchant text", () => {
    const base = stableTxnBaseKey({
      cardScope: "6601",
      txn_date: "2026-09-15",
      amount: 47.9,
      currency: "ILS",
    });
    assert.equal(base, "6601|2026-09-15|47.90|ILS");
    assert.equal(stableTxnExternalKey(base, 1), stableTxnExternalKey(base, 1));
    assert.notEqual(stableTxnExternalKey(base, 1), stableTxnExternalKey(base, 2));
  });

  it("assigns ordinals for same-day same-amount rows in file order", () => {
    const rows = assignStableExternalKeys(
      [
        { txn_date: "2026-09-01", amount: 50, currency: "ILS" },
        { txn_date: "2026-09-01", amount: 50, currency: "ILS" },
        { txn_date: "2026-09-02", amount: 50, currency: "ILS" },
      ],
      "6601"
    );
    assert.equal(rows.length, 3);
    assert.notEqual(rows[0].source_ref, rows[1].source_ref);
    assert.notEqual(rows[0].source_ref, rows[2].source_ref);
  });
});
