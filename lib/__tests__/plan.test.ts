import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actualForLine,
  buildMonthPlanView,
  groupActuals,
  seedPlanLines,
  type PlanLineRow,
} from "../finance/plan";
import type { FinanceTransaction } from "../finance/ingest";
import type { MerchantRule } from "../finance/merchant-rules";

function txn(p: Partial<FinanceTransaction> & Pick<FinanceTransaction, "txn_date" | "amount" | "kind">): FinanceTransaction {
  return {
    id: "1",
    source: "manual",
    external_key: "k",
    currency: "ILS",
    original_amount: null,
    amount_ils: p.amount,
    ils_estimated: false,
    description: "x",
    merchant: null,
    account_number: null,
    card_name: null,
    status: "completed",
    category: null,
    purpose_note: null,
    expense_type: null,
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
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
    assert.equal(view.totals.net_actual, 7700);
    assert.equal(view.weeks.length >= 4, true);
  });

  it("net_actual excludes savings via shared month-net helper", () => {
    const lines: PlanLineRow[] = [
      {
        id: "1",
        plan_id: "p",
        line_type: "income",
        name: "הכנסות",
        category: null,
        planned_amount: 5000,
        sort_order: 0,
      },
      {
        id: "2",
        plan_id: "p",
        line_type: "variable",
        name: "מזון",
        category: "מזון",
        planned_amount: 1000,
        sort_order: 1,
      },
      {
        id: "3",
        plan_id: "p",
        line_type: "savings",
        name: "חיסכון",
        category: null,
        planned_amount: 500,
        sort_order: 2,
      },
    ];
    const view = buildMonthPlanView(
      "2026-09",
      "p",
      lines,
      [
        txn({ txn_date: "2026-09-01", amount: 5000, kind: "income" }),
        txn({ txn_date: "2026-09-02", amount: 800, kind: "expense", category: "מזון" }),
        txn({
          txn_date: "2026-09-03",
          amount: 1200,
          kind: "expense",
          category: "חיסכון",
          expense_type: "savings",
        }),
      ]
    );
    assert.equal(view.totals.net_actual, 4200);
    assert.equal(view.sections.savings.actual_total, 1200);
  });
});

describe("expense_type and merchant rules in plan", () => {
  it("groupActuals respects transaction explicit expense_type", () => {
    const txns = [
      txn({
        txn_date: "2026-09-01",
        amount: 70,
        kind: "expense",
        category: "מזון",
        expense_type: "fixed",
      }),
    ];
    const groups = groupActuals(txns, "2026-09");
    const foodGroup = groups.find((g) => g.category === "מזון");
    assert.ok(foodGroup);
    assert.equal(foodGroup.line_type, "fixed");
  });

  it("groupActuals and actualForLine skip is_internal transactions", () => {
    const txns = [
      txn({
        txn_date: "2026-09-01",
        amount: 500,
        kind: "expense",
        category: "מזון",
        is_internal: true,
      }),
    ];
    const groups = groupActuals(txns, "2026-09");
    assert.equal(groups.length, 0);

    const line: PlanLineRow = {
      id: "1",
      plan_id: "p",
      line_type: "variable",
      name: "מזון",
      category: "מזון",
      planned_amount: 1000,
      sort_order: 0,
    };
    assert.equal(actualForLine(line, txns, "2026-09"), 0);
  });

  it("actualForLine matches expense_type override to fixed line", () => {
    const fixedLine: PlanLineRow = {
      id: "f",
      plan_id: "p",
      line_type: "fixed",
      name: "מזון",
      category: "מזון",
      planned_amount: 100,
      sort_order: 0,
    };
    const varLine: PlanLineRow = {
      id: "v",
      plan_id: "p",
      line_type: "variable",
      name: "מזון",
      category: "מזון",
      planned_amount: 500,
      sort_order: 1,
    };
    const txns = [
      txn({
        txn_date: "2026-09-02",
        amount: 80,
        kind: "expense",
        category: "מזון",
        expense_type: "fixed",
      }),
      txn({
        txn_date: "2026-09-03",
        amount: 120,
        kind: "expense",
        category: "מזון",
        expense_type: "variable",
      }),
    ];
    assert.equal(actualForLine(fixedLine, txns, "2026-09"), 80);
    assert.equal(actualForLine(varLine, txns, "2026-09"), 120);
  });

  it("actualForLine resolves expense_type using rulesMap when not on txn", () => {
    const rulesMap = new Map<string, MerchantRule>([
      [
        "netflix",
        {
          merchant_key: "netflix",
          category: "מזון",
          expense_type: "fixed",
          kind: "expense",
          default_note: null,
        },
      ],
    ]);
    const fixedLine: PlanLineRow = {
      id: "f",
      plan_id: "p",
      line_type: "fixed",
      name: "מזון",
      category: "מזון",
      planned_amount: 100,
      sort_order: 0,
    };
    const txns = [
      txn({
        txn_date: "2026-09-04",
        amount: 60,
        kind: "expense",
        category: "מזון",
        merchant: "Netflix",
      }),
    ];
    assert.equal(actualForLine(fixedLine, txns, "2026-09", rulesMap), 60);
  });
});
