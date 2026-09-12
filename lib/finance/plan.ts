import type { FinanceTransaction } from "@/lib/finance/ingest";
import { lineTypeForCategory, type PlanLineType, PLAN_SECTION_ORDER } from "@/lib/finance/expense-type";
import { weekBucketsForMonth, weeklyVariablePace, type WeekBucket, type WeeklyPace } from "@/lib/finance/weekly";

export type { PlanLineType };

export type PlanLineRow = {
  id: string;
  plan_id: string;
  line_type: PlanLineType;
  name: string;
  category: string | null;
  planned_amount: number;
  sort_order: number;
};

export type PlanLineView = PlanLineRow & { actual_amount: number };

export type PlanSectionView = {
  line_type: PlanLineType;
  lines: PlanLineView[];
  planned_total: number;
  actual_total: number;
};

export type MonthPlanView = {
  month: string;
  plan_id: string;
  sections: Record<PlanLineType, PlanSectionView>;
  totals: {
    planned_income: number;
    actual_income: number;
    planned_expense: number;
    actual_expense: number;
    net_planned: number;
    net_actual: number;
    savings_planned: number;
  };
  weeks: WeekBucket[];
  weekly_pace: WeeklyPace | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type SeedGroup = { name: string; category: string | null; line_type: PlanLineType; amount: number };

function groupActuals(txns: FinanceTransaction[], month: string): SeedGroup[] {
  const income = new Map<string, number>();
  const expense = new Map<string, { category: string | null; amount: number }>();

  for (const t of txns) {
    if (!t.txn_date.startsWith(month)) continue;
    if (t.kind === "income") {
      const key = t.category ?? "הכנסות";
      income.set(key, (income.get(key) ?? 0) + t.amount);
    } else if (t.category) {
      const cur = expense.get(t.category) ?? { category: t.category, amount: 0 };
      cur.amount += t.amount;
      expense.set(t.category, cur);
    } else {
      const key = "__other__";
      const cur = expense.get(key) ?? { category: null, amount: 0 };
      cur.amount += t.amount;
      expense.set(key, cur);
    }
  }

  const groups: SeedGroup[] = [];
  for (const [name, amount] of income) {
    groups.push({ name, category: name === "הכנסות" ? null : name, line_type: "income", amount });
  }
  for (const [key, { category, amount }] of expense) {
    const name = category ?? "אחר";
    groups.push({
      name,
      category,
      line_type: lineTypeForCategory(category, "expense"),
      amount,
    });
  }
  return groups;
}

export function defaultPlanTemplate(): Omit<PlanLineRow, "id" | "plan_id">[] {
  const rows: Omit<PlanLineRow, "id" | "plan_id">[] = [
    { line_type: "income", name: "הכנסות", category: null, planned_amount: 0, sort_order: 0 },
    { line_type: "fixed", name: "בית", category: "בית", planned_amount: 0, sort_order: 1 },
    { line_type: "fixed", name: "מנויים", category: "מנויים", planned_amount: 0, sort_order: 2 },
    { line_type: "variable", name: "מזון", category: "מזון", planned_amount: 0, sort_order: 3 },
    { line_type: "variable", name: "תחבורה", category: "תחבורה", planned_amount: 0, sort_order: 4 },
    { line_type: "variable", name: "בילויים", category: "בילויים", planned_amount: 0, sort_order: 5 },
    { line_type: "variable", name: "קניות", category: "קניות", planned_amount: 0, sort_order: 6 },
    { line_type: "variable", name: "בריאות", category: "בריאות", planned_amount: 0, sort_order: 7 },
    { line_type: "variable", name: "אחר", category: "אחר", planned_amount: 0, sort_order: 8 },
    { line_type: "savings", name: "חיסכון", category: null, planned_amount: 0, sort_order: 9 },
  ];
  return rows;
}

function applyActualsToTemplate(
  template: Omit<PlanLineRow, "id" | "plan_id">[],
  groups: SeedGroup[]
): Omit<PlanLineRow, "id" | "plan_id">[] {
  const byKey = new Map(groups.map((g) => [`${g.line_type}:${g.category ?? g.name}`, g]));
  return template.map((line) => {
    const key = `${line.line_type}:${line.category ?? line.name}`;
    const hit = byKey.get(key);
    if (!hit) return line;
    return { ...line, planned_amount: round2(hit.amount) };
  });
}

/** Build default plan lines from previous plan, previous actuals, or current month. */
export function seedPlanLines(
  month: string,
  prevLines: PlanLineRow[] | null,
  prevMonthTxns: FinanceTransaction[],
  currentMonthTxns: FinanceTransaction[] = []
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
  const fromPrev = groupActuals(prevMonthTxns, sourceMonth);
  const fromCurrent = groupActuals(currentMonthTxns, month);
  const groups = fromPrev.length > 0 ? fromPrev : fromCurrent;
  return applyActualsToTemplate(defaultPlanTemplate(), groups);
}

function txnCategoryKey(t: FinanceTransaction, kind: "income" | "expense"): string {
  return t.category ?? (kind === "income" ? "הכנסות" : "אחר");
}

function actualForLine(line: PlanLineRow, txns: FinanceTransaction[], month: string): number {
  if (line.line_type === "savings") return 0;
  const lineKey = line.category ?? line.name;
  let total = 0;
  for (const t of txns) {
    if (!t.txn_date.startsWith(month)) continue;
    if (line.line_type === "income") {
      if (t.kind !== "income") continue;
      if (line.category) {
        if (t.category !== line.category) continue;
      } else if (line.name !== "הכנסות" && txnCategoryKey(t, "income") !== lineKey) {
        continue;
      }
      total += t.amount;
    } else {
      if (t.kind !== "expense") continue;
      if (line.line_type === "planned") {
        if (txnCategoryKey(t, "expense") !== lineKey && line.name !== (t.merchant || t.description)) {
          continue;
        }
      } else {
        if (lineTypeForCategory(t.category, "expense") !== line.line_type) continue;
        if (txnCategoryKey(t, "expense") !== lineKey) continue;
      }
      total += t.amount;
    }
  }
  return round2(total);
}

export function buildMonthPlanView(
  month: string,
  planId: string,
  lines: PlanLineRow[],
  txns: FinanceTransaction[]
): MonthPlanView {
  const sections = {} as Record<PlanLineType, PlanSectionView>;

  for (const type of PLAN_SECTION_ORDER) {
    const typed = lines.filter((l) => l.line_type === type);
    const views: PlanLineView[] = typed.map((l) => ({
      ...l,
      actual_amount: actualForLine(l, txns, month),
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
  const planned_expense =
    sections.fixed.planned_total +
    sections.variable.planned_total +
    sections.planned.planned_total;
  const actual_expense =
    sections.fixed.actual_total +
    sections.variable.actual_total +
    sections.planned.actual_total;
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
