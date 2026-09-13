import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCategory } from "../finance/category-list";

describe("normalizeCategory", () => {
  it("trims and rejects empty or too long names", () => {
    assert.equal(normalizeCategory("  סופר  "), "סופר");
    assert.equal(normalizeCategory(""), null);
    assert.equal(normalizeCategory("x".repeat(41)), null);
  });
});
