import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMonthPlanView, seedPlanLines, type PlanLineRow } from "../finance/plan";
import type { FinanceTransaction } from "../finance/ingest";

function txn(p: Partial<FinanceTransaction> & Pick<FinanceTransaction, "txn_date" | "amount" | "kind">): FinanceTransaction {
  return {
    id: "1",
    source: "manual",
    external_key: "k",
    currency: "ILS",
    description: "x",
    merchant: null,
    account_number: null,
    card_name: null,
    status: "completed",
    category: null,
    purpose_note: null,
    needs_categorization: false,
    categorized_at: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

describe("seedPlanLines", () => {
  it("copies previous plan lines", () => {
    const prev: PlanLineRow[] = [
      {
        id: "a",
        plan_id: "p",
        line_type: "fixed",
        name: "בית",
        category: "בית",
        planned_amount: 5000,
        sort_order: 0,
      },
    ];
    const lines = seedPlanLines("2026-09", prev, []);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].planned_amount, 5000);
  });

  it("uses template when no previous plan", () => {
    const lines = seedPlanLines("2026-09", null, []);
    assert.ok(lines.some((l) => l.line_type === "savings"));
    assert.ok(lines.some((l) => l.name === "מזון"));
    assert.ok(lines.length >= 8);
  });
});

describe("buildMonthPlanView", () => {
  it("computes section totals", () => {
    const lines: PlanLineRow[] = [
      {
        id: "1",
        plan_id: "p",
        line_type: "income",
        name: "הכנסות",
        category: null,
        planned_amount: 10000,
        sort_order: 0,
      },
      {
        id: "2",
        plan_id: "p",
        line_type: "variable",
        name: "מזון",
        category: "מזון",
        planned_amount: 2000,
        sort_order: 1,
      },
    ];
    const view = buildMonthPlanView(
      "2026-09",
      "p",
      lines,
      [
        txn({ txn_date: "2026-09-05", amount: 8000, kind: "income" }),
        txn({ txn_date: "2026-09-10", amount: 300, kind: "expense", category: "מזון" }),
      ]
    );
    assert.equal(view.totals.actual_income, 8000);
    assert.equal(view.sections.variable.actual_total, 300);
    assert.equal(view.weeks.length >= 4, true);
  });
});
