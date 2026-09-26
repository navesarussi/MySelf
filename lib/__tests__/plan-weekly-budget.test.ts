import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWeeklyBudgetOverrideValue } from "../finance/weekly";

describe("resolveWeeklyBudgetOverrideValue", () => {
  it("returns null when clearing override", () => {
    assert.equal(resolveWeeklyBudgetOverrideValue(null, 400), null);
  });

  it("returns null when amount matches computed budget", () => {
    assert.equal(resolveWeeklyBudgetOverrideValue(400, 400), null);
    assert.equal(resolveWeeklyBudgetOverrideValue(400.004, 400), null);
  });

  it("returns rounded override when different from computed", () => {
    assert.equal(resolveWeeklyBudgetOverrideValue(333, 400), 333);
    assert.equal(resolveWeeklyBudgetOverrideValue(450.556, 400), 450.56);
  });

  it("rejects invalid amounts", () => {
    assert.equal(resolveWeeklyBudgetOverrideValue(-1, 400), null);
    assert.equal(resolveWeeklyBudgetOverrideValue(Number.NaN, 400), null);
  });
});
