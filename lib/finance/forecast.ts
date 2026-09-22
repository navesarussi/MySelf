import type { MonthPlanView } from "@/lib/finance/plan-types";
import { round2 } from "@/lib/finance/money";

export type ForecastMonth = {
  month: string;
  label: string;
  income: number;
  fixed: number;
  variable: number;
  savings: number;
  net: number;
  cumulative_savings: number;
};

export type FinanceForecast = {
  base_month: string;
  months_ahead: number;
  monthly_savings: number;
  monthly_net: number;
  projected_cumulative: number;
  rows: ForecastMonth[];
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
}

/** Project cashflow from monthly plan totals. */
export function buildFinanceForecast(
  plan: MonthPlanView,
  monthsAhead = 6
): FinanceForecast {
  const income = plan.sections.income?.planned_total ?? 0;
  const fixed = plan.sections.fixed?.planned_total ?? 0;
  const variable = plan.sections.variable?.planned_total ?? 0;
  const planned = plan.sections.planned?.planned_total ?? 0;
  const savings = plan.sections.savings?.planned_total ?? 0;
  const monthly_net = round2(income - fixed - variable - planned - savings);

  const rows: ForecastMonth[] = [];
  let cumulative = 0;
  for (let i = 0; i < monthsAhead; i++) {
    const month = shiftMonth(plan.month, i);
    cumulative = round2(cumulative + monthly_net);
    rows.push({
      month,
      label: monthLabel(month),
      income: round2(income),
      fixed: round2(fixed),
      variable: round2(variable + planned),
      savings: round2(savings),
      net: monthly_net,
      cumulative_savings: cumulative,
    });
  }

  return {
    base_month: plan.month,
    months_ahead: monthsAhead,
    monthly_savings: savings,
    monthly_net,
    projected_cumulative: cumulative,
    rows,
  };
}
