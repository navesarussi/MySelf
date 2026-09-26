import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Home and Trading must share one TanStack query key for live equity.
 * This test pins the contract without importing React Native modules.
 */
describe("trading equity query key contract", () => {
  it("uses a single canonical key under the trading namespace", () => {
    const tradingEquity = ["trading", "equity"] as const;
    const tradingAll = ["trading"] as const;
    assert.deepEqual(tradingEquity.slice(0, 1), tradingAll);
    assert.equal(tradingEquity[1], "equity");
  });

  it("matches the mobile keys module shape", async () => {
    const { queryKeys } = await import("../../mobile/src/query/keys.ts");
    assert.deepEqual(queryKeys.tradingEquity, ["trading", "equity"]);
    assert.ok(queryKeys.tradingAll[0] === queryKeys.tradingEquity[0]);
  });
});
