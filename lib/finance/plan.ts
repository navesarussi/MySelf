import type { FinanceTransaction } from "@/lib/finance/ingest";
import { lineTypeForCategory, type PlanLineType, PLAN_SECTION_ORDER } from "@/lib/finance/expense-type";
import { weekBucketsForMonth, type WeekBucket } from "@/lib/finance/weekly";

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

/** Build default plan lines from previous plan or previous month actuals. */
export function seedPlanLines(
  month: string,
  prevLines: PlanLineRow[] | null,
  prevMonthTxns: FinanceTransaction[],
  savingsDefault = 0
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
  const groups = groupActuals(prevMonthTxns, sourceMonth);
  const lines: Omit<PlanLineRow, "id" | "plan_id">[] = groups.map((g, i) => ({
    line_type: g.line_type,
    name: g.name,
    category: g.category,
    planned_amount: round2(g.amount),
    sort_order: i,
  }));

  if (savingsDefault > 0) {
    lines.push({
      line_type: "savings",
      name: "חיסכון",
      category: null,
      planned_amount: round2(savingsDefault),
      sort_order: lines.length,
    });
  }

  if (lines.length === 0) {
    lines.push({
      line_type: "income",
      name: "הכנסות",
      category: null,
      planned_amount: 0,
      sort_order: 0,
    });
  }

  return lines;
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
    weeks: weekBucketsForMonth(month, txns),
  };
}
