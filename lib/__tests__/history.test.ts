import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinanceHistory,
  categoryDeltas,
  monthKeysEndingAt,
  parseHistoryMonths,
} from "../finance/history";
import type { CashflowRow } from "../finance/cashflow";

describe("parseHistoryMonths", () => {
  it("defaults empty to 6 and rejects invalid", () => {
    assert.equal(parseHistoryMonths(null), 6);
    assert.equal(parseHistoryMonths(""), 6);
    assert.equal(parseHistoryMonths("3"), 3);
    assert.equal(parseHistoryMonths("12"), 12);
    assert.equal(parseHistoryMonths("5"), null);
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
    assert.equal(deltas.find((d) => d.category === "דלק")?.prev_amount, 0);
  });
});

describe("buildFinanceHistory", () => {
  it("summarizes months with plan seeds and deltas", () => {
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
    const sep = history.rows[2]!;
    assert.equal(sep.month, "2026-09");
    assert.equal(sep.income, 1200);
    assert.equal(sep.expense, 600);
    assert.equal(sep.net, 600);
    assert.ok(sep.plan);
    assert.equal(sep.plan!.planned_income, 1500);
    assert.equal(sep.plan!.planned_expense, 500);
    assert.equal(sep.plan!.net_planned, 900);
    assert.equal(sep.category_deltas[0]?.category, "סופר");
    assert.equal(sep.category_deltas[0]?.delta, 200);
    assert.equal(history.rows[0]!.plan, null);
  });
});
