import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { brokerEquity } from "../trading/account-equity";
import { drawdownFromPeak, shouldTripKillSwitch } from "../trading/risk-envelope";

/**
 * The tick adopts the broker's equity as the account's, because the demo
 * account can hold positions the strategy does not know about. It did so with a
 * bare `Number(acct.equity)`.
 *
 * A response missing the field — a maintenance page that still parses, a shape
 * change, a partial body — makes that NaN, and NaN does not stay contained:
 *
 *   peak = Math.max(settings.peak_equity, NaN)   →  NaN
 *   updateSettings({ peak_equity: NaN })         →  NaN persisted (Postgres
 *                                                   numeric accepts it)
 *   drawdownFromPeak(equity, NaN)                →  NaN
 *   NaN >= MASTER_KILL_SWITCH_DD                 →  false, forever
 *
 * One bad response therefore disables the master kill switch permanently.
 */
describe("brokerEquity", () => {
  it("adopts a real figure", () => {
    assert.deepEqual(brokerEquity("100123.45"), { ok: true, equity: 100123.45 });
    assert.deepEqual(brokerEquity(50000), { ok: true, equity: 50000 });
  });

  it("refuses anything that is not a positive finite number", () => {
    for (const bad of [undefined, null, "", "  ", "abc", NaN, Infinity, -Infinity, 0, -1, "0"]) {
      const result = brokerEquity(bad as never);
      assert.equal(result.ok, false, `must refuse ${JSON.stringify(bad)}`);
    }
  });

  it("names what it saw, so the tick can report it", () => {
    const result = brokerEquity(undefined);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /equity/i);
  });
});

describe("the failure this prevents", () => {
  it("a NaN peak silently disables the kill switch", () => {
    const poisoned = Math.max(100_000, Number(undefined));
    assert.ok(Number.isNaN(poisoned), "Math.max with NaN is NaN");
    // drawdownFromPeak guards `!(peak > 0)`, which NaN satisfies, so the
    // drawdown reads as *zero* — the account looks permanently at its high.
    assert.equal(drawdownFromPeak(50_000, poisoned), 0);
    assert.equal(
      shouldTripKillSwitch(50_000, poisoned),
      false,
      "a 50% drawdown against a NaN peak does not trip — this is the bug"
    );
  });

  it("keeping the computed equity leaves the kill switch working", () => {
    const fallback = 100_000;
    const result = brokerEquity(undefined);
    const equity = result.ok ? result.equity : fallback;
    const peak = Math.max(100_000, equity);
    assert.equal(peak, 100_000);
    assert.equal(shouldTripKillSwitch(50_000, peak), true);
  });
});
