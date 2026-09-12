import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMerchantKey, suggestCategoryFromHistory } from "../finance/merchant-category";

describe("normalizeMerchantKey", () => {
  it("lowercases and collapses whitespace", () => {
    assert.equal(normalizeMerchantKey("  Super   Yuda  "), "super yuda");
  });
});

describe("suggestCategoryFromHistory", () => {
  const history = [
    { merchant: "סופר יודה", description: "סופר יודה", category: "מזון" },
    { merchant: "דלק", description: "דלק", category: "תחבורה" },
  ];

  it("matches merchant", () => {
    assert.equal(suggestCategoryFromHistory("סופר יודה", null, history), "מזון");
  });

  it("matches description when merchant missing", () => {
    assert.equal(suggestCategoryFromHistory(null, "דלק", history), "תחבורה");
  });

  it("returns null when unknown", () => {
    assert.equal(suggestCategoryFromHistory("unknown shop", null, history), null);
  });
});
