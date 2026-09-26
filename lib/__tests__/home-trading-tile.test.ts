import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_TRADING_LEGACY_FIELDS,
  homeTradingFromLiveSnapshot,
  type HomeTradingSnapshot,
} from "../home-snapshots";
import { resolveHomeTradingTile } from "../home-trading-tile";

const legacyHomeTrading: HomeTradingSnapshot = {
  phase: "PAPER",
  equity: 78_701,
  starting_equity: 100_000,
  kill_switch_active: false,
};

describe("homeTradingFromLiveSnapshot", () => {
  it("exposes the legacy /api/v1/home trading fields older clients read", () => {
    const trading = homeTradingFromLiveSnapshot({
      equity: 78_701,
      starting_equity: 100_000,
      peak_equity: 100_000,
      kill_switch_active: false,
      phase: "PAPER",
      updated_at: "2026-09-26T15:06:00.000Z",
    });
    for (const key of HOME_TRADING_LEGACY_FIELDS) {
      assert.ok(key in trading, `missing legacy field ${key}`);
    }
    assert.deepEqual(trading, legacyHomeTrading);
  });
});

describe("resolveHomeTradingTile", () => {
  it("prefers live equity when both sources exist", () => {
    assert.deepEqual(
      resolveHomeTradingTile(
        { equity: 79_000, starting_equity: 100_000, kill_switch_active: true },
        legacyHomeTrading
      ),
      { equity: 79_000, starting_equity: 100_000, kill_switch_active: true }
    );
  });

  it("falls back to home payload when live query is loading or errored", () => {
    assert.deepEqual(resolveHomeTradingTile(null, legacyHomeTrading), {
      equity: 78_701,
      starting_equity: 100_000,
      kill_switch_active: false,
    });
  });

  it("returns null only when neither source has equity", () => {
    assert.equal(resolveHomeTradingTile(null, null), null);
  });
});
