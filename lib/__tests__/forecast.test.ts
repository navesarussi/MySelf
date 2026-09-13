import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFinanceForecast } from "../finance/forecast";
import type { MonthPlanView } from "../finance/plan-types";

function emptySection(type: MonthPlanView["sections"]["income"]["line_type"]) {
  return { line_type: type, lines: [], planned_total: 0, actual_total: 0 };
}

describe("buildFinanceForecast", () => {
  it("projects cumulative net from plan totals", () => {
    const plan: MonthPlanView = {
      month: "2026-09",
      plan_id: "p1",
      weekly_budget_override: null,
      sections: {
        income: { ...emptySection("income"), planned_total: 15000 },
        fixed: { ...emptySection("fixed"), planned_total: 5000 },
        variable: { ...emptySection("variable"), planned_total: 3000 },
        planned: { ...emptySection("planned"), planned_total: 0 },
        savings: { ...emptySection("savings"), planned_total: 2000 },
      },
      totals: {
        planned_income: 15000,
        actual_income: 0,
        planned_expense: 8000,
        actual_expense: 0,
        net_planned: 5000,
        net_actual: 0,
        savings_planned: 2000,
      },
      weeks: [],
      weekly_pace: null,
    };
    const f = buildFinanceForecast(plan, 3);
    assert.equal(f.monthly_net, 5000);
    assert.equal(f.rows.length, 3);
    assert.equal(f.projected_cumulative, 15000);
  });
});
