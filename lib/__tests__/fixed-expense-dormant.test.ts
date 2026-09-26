import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDormantFixedExpense, partitionFixedExpenses } from "../finance/fixed-expense-dormant";
import type { FixedExpenseItem } from "../finance/fixed-expenses";

function item(partial: Partial<FixedExpenseItem>): FixedExpenseItem {
  return {
    id: "x",
    rule_id: null,
    merchant_key: "test",
    name: "Test",
    category: null,
    planned_amount: 0,
    actual_amount: 0,
    frequency: "monthly",
    charge_day: null,
    last_charge_date: null,
    last_charge_amount: null,
    default_note: null,
    is_active: true,
    ...partial,
  };
}

describe("isDormantFixedExpense", () => {
  it("flags zero-charge items with no plan", () => {
    assert.equal(isDormantFixedExpense(item({})), true);
  });

  it("keeps items with month activity", () => {
    assert.equal(isDormantFixedExpense(item({ actual_amount: 50 })), false);
  });

  it("keeps items with positive last charge", () => {
    assert.equal(isDormantFixedExpense(item({ last_charge_amount: 100, last_charge_date: "2026-08-01" })), false);
  });

  it("hides active items with planned amount but no transaction charges", () => {
    assert.equal(isDormantFixedExpense(item({ planned_amount: 99, is_active: true })), true);
  });
});

describe("partitionFixedExpenses", () => {
  it("splits active and dormant lists", () => {
    const { active, dormant } = partitionFixedExpenses([
      item({ id: "a", actual_amount: 10 }),
      item({ id: "b" }),
    ]);
    assert.equal(active.length, 1);
    assert.equal(dormant.length, 1);
    assert.equal(active[0].id, "a");
    assert.equal(dormant[0].id, "b");
  });
});
