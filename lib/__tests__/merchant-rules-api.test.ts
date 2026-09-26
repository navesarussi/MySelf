import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirrors PATCH /finance/merchant-rules validation rules for edit APIs. */
function validateMerchantRulePatch(body: Record<string, unknown>): string | null {
  if (body.planned_amount !== undefined) {
    const planned = Number(body.planned_amount);
    if (!Number.isFinite(planned) || planned < 0) return "invalid_planned_amount";
  }
  if (body.charge_day !== undefined && body.charge_day !== null) {
    const day = Number(body.charge_day);
    if (!Number.isInteger(day) || day < 1 || day > 31) return "invalid_charge_day";
  }
  if (body.frequency !== undefined && body.frequency !== null) {
    const freq = String(body.frequency);
    if (freq && freq !== "monthly" && freq !== "weekly" && freq !== "yearly") return "invalid_frequency";
  }
  return null;
}

describe("merchant rule edit API validation", () => {
  it("accepts a valid fixed-expense patch", () => {
    assert.equal(
      validateMerchantRulePatch({
        display_name: "נטפליקס",
        planned_amount: 54.9,
        category: "מנויים",
        frequency: "monthly",
        charge_day: 5,
        is_active: true,
      }),
      null
    );
  });

  it("rejects invalid charge day and planned amount", () => {
    assert.equal(validateMerchantRulePatch({ charge_day: 32 }), "invalid_charge_day");
    assert.equal(validateMerchantRulePatch({ planned_amount: -5 }), "invalid_planned_amount");
    assert.equal(validateMerchantRulePatch({ frequency: "daily" }), "invalid_frequency");
  });
});
