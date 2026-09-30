import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOK_LIMITS, BOOK_SLEEVES, MODEL_ENVELOPE, scaledSleeves, sleevesForGroup } from "../trading/book/sleeves";

describe("book sleeves", () => {
  it("scales risk per trade and keeps the slots", () => {
    const s = scaledSleeves(0.5);
    assert.equal(s.length, BOOK_SLEEVES.length);
    s.forEach((x, i) => {
      assert.equal(x.risk_pct, BOOK_SLEEVES[i].risk_pct * 0.5);
      assert.equal(x.max_positions, BOOK_SLEEVES[i].max_positions);
      assert.equal(x.def, BOOK_SLEEVES[i].def);
    });
  });
  it("model envelope mirrors the live limits", () => {
    assert.equal(MODEL_ENVELOPE.max_gross, BOOK_LIMITS.max_gross);
    assert.equal(MODEL_ENVELOPE.max_positions, BOOK_LIMITS.max_positions);
  });
  it("splits sleeves by pass group", () => {
    assert.deepEqual(sleevesForGroup("CRYPTO", BOOK_SLEEVES).map((s) => s.def.id), ["CRYPTO_TREND"]);
    assert.deepEqual(sleevesForGroup("STOCKS", BOOK_SLEEVES).map((s) => s.def.id), ["MOMENTUM", "ASSET_ROTATION", "REVERSAL"]);
  });
});
