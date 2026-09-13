import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtAmount0, safeAmount } from "../finance/format";

describe("finance format", () => {
  it("safeAmount handles undefined and NaN", () => {
    assert.equal(safeAmount(undefined), 0);
    assert.equal(safeAmount(null), 0);
    assert.equal(safeAmount("12.5"), 12.5);
    assert.equal(safeAmount(NaN), 0);
  });

  it("fmtAmount0 never throws", () => {
    assert.equal(fmtAmount0(undefined), "0");
    assert.equal(fmtAmount0(42.7), "43");
  });
});
