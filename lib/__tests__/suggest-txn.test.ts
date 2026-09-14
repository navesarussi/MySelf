import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { quickCategoryOptions } from "../finance/suggest-txn";

describe("quickCategoryOptions", () => {
  it("puts suggestion first and dedupes", () => {
    const out = quickCategoryOptions("מזון", ["בילויים", "מזון", "קניות"], 6);
    assert.equal(out[0], "מזון");
    assert.equal(out.filter((c) => c === "מזון").length, 1);
  });
});
