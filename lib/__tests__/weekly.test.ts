import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { weeklyVariablePace, type WeekBucket } from "../finance/weekly";

describe("weeklyVariablePace", () => {
  it("splits variable budget and reports leftover", () => {
    const weeks: WeekBucket[] = [
      { week: 1, label: "1", start: "2026-08-30", end: "2026-09-05", expense: 100, variable_expense: 80, income: 0 },
      { week: 2, label: "2", start: "2026-09-06", end: "2026-09-12", expense: 200, variable_expense: 150, income: 0 },
    ];
    const pace = weeklyVariablePace(
      weeks,
      { variablePlanned: 400, plannedIncome: 10000, plannedFixed: 6000, plannedSavings: 0 },
      new Date("2026-09-08")
    );
    assert.ok(pace);
    assert.equal(pace.week, 2);
    assert.equal(pace.variable_budget, 2000);
    assert.equal(pace.spent, 150);
    assert.equal(pace.left, 1850);
  });

  it("uses weekly override when set", () => {
    const weeks: WeekBucket[] = [
      { week: 1, label: "1", start: "2026-09-01", end: "2026-09-07", expense: 0, variable_expense: 50, income: 0 },
    ];
    const pace = weeklyVariablePace(
      weeks,
      { variablePlanned: 100, plannedIncome: 5000, plannedFixed: 4000, plannedSavings: 500, weeklyOverride: 300 },
      new Date("2026-09-03")
    );
    assert.ok(pace);
    assert.equal(pace.variable_budget, 300);
    assert.equal(pace.is_override, true);
    assert.equal(pace.left, 250);
  });
});
