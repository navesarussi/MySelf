import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyMoneyItemType } from "../finance/money-item-type";

describe("bulk edit type patch shape", () => {
  it("produces locked categorization fields for each type", () => {
    for (const type of ["fixed", "variable", "income", "internal"] as const) {
      const fields = applyMoneyItemType(type, { kind: "expense" });
      if (type === "income") assert.equal(fields.kind, "income");
      if (type === "fixed") assert.equal(fields.expense_type, "fixed");
      if (type === "variable") assert.equal(fields.expense_type, "variable");
      if (type === "internal") assert.equal(fields.is_internal, true);
    }
  });
});
