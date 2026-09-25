import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignStableExternalKeys } from "../finance/stable-external-key";

describe("run-import stable key lookup", () => {
  it("maps post-insert rows by stable external key, not parse source_ref", () => {
    const parsed = [
      { booked_at: "2025-01-16", amount: 183.58, currency: "USD", source_ref: "cal:import:aaa", merchant: "F25STORE" },
      { booked_at: "2025-01-18", amount: 1000, currency: "USD", source_ref: "cal:import:bbb", merchant: "ONLYCHAIN" },
    ];
    const stable = assignStableExternalKeys(
      parsed.map((p) => ({
        txn_date: p.booked_at,
        amount: p.amount,
        currency: p.currency,
        source_ref: p.source_ref,
      })),
      "6601"
    );
    const byStable = new Map(stable.map((s, i) => [s.source_ref, parsed[i]]));
    assert.ok(byStable.get(stable[0].source_ref)?.merchant === "F25STORE");
    assert.notEqual(stable[0].source_ref, parsed[0].source_ref);
    assert.ok(byStable.has(stable[0].source_ref));
  });
});
