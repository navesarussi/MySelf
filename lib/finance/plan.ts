import type { FinanceTransaction } from "@/lib/finance/types";
import { type PlanLineType, PLAN_SECTION_ORDER } from "@/lib/finance/expense-type";
import { weekBucketsForMonth, weeklyVariablePace } from "@/lib/finance/weekly";
import type { MerchantRule } from "@/lib/finance/merchant-rules";
import type { MonthPlanView, PlanLineRow, PlanLineView, PlanSectionView } from "@/lib/finance/plan-types";
import { actualForLine, groupActuals, round2, type SeedGroup } from "@/lib/finance/plan-actuals";

export type { PlanLineType, PlanLineRow, PlanLineView, PlanSectionView, MonthPlanView };
export { actualForLine, groupActuals };

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultPlanTemplate(): Omit<PlanLineRow, "id" | "plan_id">[] {
  const defs: [PlanLineType, string, string | null][] = [
    ["income", "הכנסות", null],
    ["fixed", "בית", "בית"],
    ["fixed", "מנויים", "מנויים"],
    ["variable", "מזון", "מזון"],
    ["variable", "תחבורה", "תחבורה"],
    ["variable", "בילויים", "בילויים"],
    ["variable", "קניות", "קניות"],
    ["variable", "בריאות", "בריאות"],
    ["variable", "אחר", "אחר"],
    ["savings", "חיסכון", null],
  ];
  return defs.map(([line_type, name, category], sort_order) => ({
    line_type,
    name,
    category,
    planned_amount: 0,
    sort_order,
  }));
}

function applyActualsToTemplate(
  template: Omit<PlanLineRow, "id" | "plan_id">[],
  groups: SeedGroup[]
): Omit<PlanLineRow, "id" | "plan_id">[] {
  const byKey = new Map(groups.map((g) => [`${g.line_type}:${g.category ?? g.name}`, g]));
  const matched = new Set<string>();

  const result = template.map((line) => {
    const key = `${line.line_type}:${line.category ?? line.name}`;
    const hit = byKey.get(key);
    if (!hit) return line;
    matched.add(key);
    return { ...line, planned_amount: round2(hit.amount) };
  });

  let order = result.length;
  for (const g of groups) {
    const key = `${g.line_type}:${g.category ?? g.name}`;
    if (!matched.has(key)) {
      result.push({
        line_type: g.line_type,
        name: g.name,
        category: g.category,
        planned_amount: round2(g.amount),
        sort_order: order++,
      });
    }
  }
  return result;
}

export function seedPlanLines(
  month: string,
  prevLines: PlanLineRow[] | null,
  prevMonthTxns: FinanceTransaction[],
  currentMonthTxns: FinanceTransaction[] = [],
  rulesMap?: Map<string, MerchantRule>
): Omit<PlanLineRow, "id" | "plan_id">[] {
  if (prevLines && prevLines.length > 0) {
    return prevLines.map((l, i) => ({
      line_type: l.line_type,
      name: l.name,
      category: l.category,
      planned_amount: l.planned_amount,
      sort_order: i,
    }));
  }
  const sourceMonth = prevMonth(month);
  const fromPrev = groupActuals(prevMonthTxns, sourceMonth, rulesMap);
  const fromCurrent = groupActuals(currentMonthTxns, month, rulesMap);
  const groups = fromPrev.length > 0 ? fromPrev : fromCurrent;
  return applyActualsToTemplate(defaultPlanTemplate(), groups);
}

export function buildMonthPlanView(
  month: string,
  planId: string,
  lines: PlanLineRow[],
  txns: FinanceTransaction[],
  rulesMap?: Map<string, MerchantRule>
): MonthPlanView {
  const sections = {} as Record<PlanLineType, PlanSectionView>;

  for (const type of PLAN_SECTION_ORDER) {
    const typed = lines.filter((l) => l.line_type === type);
    const views: PlanLineView[] = typed.map((l) => ({
      ...l,
      actual_amount: actualForLine(l, txns, month, rulesMap),
    }));
    sections[type] = {
      line_type: type,
      lines: views,
      planned_total: round2(views.reduce((s, l) => s + l.planned_amount, 0)),
      actual_total: round2(views.reduce((s, l) => s + l.actual_amount, 0)),
    };
  }

  const planned_income = sections.income.planned_total;
  const actual_income = sections.income.actual_total;
  const planned_expense = round2(sections.fixed.planned_total + sections.variable.planned_total + sections.planned.planned_total);
  const actual_expense = round2(sections.fixed.actual_total + sections.variable.actual_total + sections.planned.actual_total);
  const savings_planned = sections.savings.planned_total;
  const weeks = weekBucketsForMonth(month, txns);

  return {
    month,
    plan_id: planId,
    sections,
    totals: {
      planned_income,
      actual_income,
      planned_expense,
      actual_expense,
      net_planned: round2(planned_income - planned_expense - savings_planned),
      net_actual: round2(actual_income - actual_expense),
      savings_planned,
    },
    weeks,
    weekly_pace: weeklyVariablePace(weeks, sections.variable.planned_total),
  };
}
