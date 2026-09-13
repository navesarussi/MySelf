import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinanceHistory,
  categoryDeltas,
  HISTORY_MONTH_MAX,
  monthKeysEndingAt,
  parseHistoryMonths,
} from "../finance/history";
import type { CashflowRow } from "../finance/cashflow";

describe("parseHistoryMonths", () => {
  it("defaults empty to 6 and accepts custom 1-24", () => {
    assert.equal(parseHistoryMonths(null), 6);
    assert.equal(parseHistoryMonths("9"), 9);
    assert.equal(parseHistoryMonths(String(HISTORY_MONTH_MAX)), HISTORY_MONTH_MAX);
    assert.equal(parseHistoryMonths("0"), null);
    assert.equal(parseHistoryMonths("25"), null);
    assert.equal(parseHistoryMonths("3.5"), null);
  });
});

describe("monthKeysEndingAt", () => {
  it("returns oldest→newest inclusive", () => {
    assert.deepEqual(monthKeysEndingAt("2026-09", 3), ["2026-07", "2026-08", "2026-09"]);
  });
});

describe("categoryDeltas", () => {
  it("ranks by absolute change and treats missing as 0", () => {
    const deltas = categoryDeltas(
      [
        { category: "סופר", amount: 800 },
        { category: "דלק", amount: 200 },
      ],
      [{ category: "סופר", amount: 500 }],
      5
    );
    assert.equal(deltas[0]?.category, "סופר");
    assert.equal(deltas[0]?.delta, 300);
  });
});

describe("buildFinanceHistory", () => {
  it("includes trends and plan slices", () => {
    const txns: CashflowRow[] = [
      { txn_date: "2026-08-10", amount: 1000, kind: "income", category: null, needs_categorization: false },
      { txn_date: "2026-08-12", amount: 400, kind: "expense", category: "סופר", needs_categorization: false },
      { txn_date: "2026-09-05", amount: 1200, kind: "income", category: null, needs_categorization: false },
      { txn_date: "2026-09-08", amount: 600, kind: "expense", category: "סופר", needs_categorization: false },
    ];
    const history = buildFinanceHistory({
      endMonth: "2026-09",
      months: 3,
      transactions: txns,
      planSeeds: [
        {
          month: "2026-09",
          planned_income: 1500,
          planned_fixed: 200,
          planned_variable: 300,
          planned_planned: 0,
          savings_planned: 100,
        },
      ],
    });
    assert.equal(history.rows.length, 3);
    assert.ok(history.trends);
    assert.equal(history.trends.total_income, 2200);
    assert.equal(history.rows[2]!.plan!.net_planned, 900);
  });
});
