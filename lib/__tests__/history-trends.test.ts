import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHistoryTrends, halfPeriodTrend } from "../finance/history-trends";
import type { HistoryMonthRow } from "../finance/history";

function row(month: string, income: number, expense: number, cats: string[] = []): HistoryMonthRow {
  const by_category = cats.map((c, i) => ({ category: c, amount: expense / (cats.length || 1) }));
  return {
    month,
    income,
    expense,
    net: income - expense,
    by_category,
    plan: null,
    category_deltas: [],
  };
}

describe("halfPeriodTrend", () => {
  it("detects rising expense trend", () => {
    const t = halfPeriodTrend([100, 120, 200, 240]);
    assert.equal(t.direction, "up");
    assert.ok(t.change_pct > 0);
  });

  it("is flat for single month", () => {
    assert.deepEqual(halfPeriodTrend([500]), { direction: "flat", change_pct: 0 });
  });
});

describe("buildHistoryTrends", () => {
  it("aggregates totals and top categories", () => {
    const trends = buildHistoryTrends([
      row("2026-07", 1000, 400, ["סופר"]),
      row("2026-08", 1100, 500, ["סופר", "דלק"]),
      row("2026-09", 1200, 600, ["סופר"]),
    ]);
    assert.equal(trends.total_income, 3300);
    assert.equal(trends.total_expense, 1500);
    assert.equal(trends.avg_expense, 500);
    assert.equal(trends.series.length, 3);
    assert.ok(trends.top_categories[0]?.category === "סופר");
    assert.ok(trends.top_categories[0]!.share_pct > 0);
  });
});
