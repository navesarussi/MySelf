import type { FinanceTransaction } from "@/lib/finance/types";
import type { PlanLineType } from "@/lib/finance/expense-type";
import { resolveExpenseType, type MerchantRule } from "@/lib/finance/merchant-rules";
import type { PlanLineRow } from "@/lib/finance/plan-types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type SeedGroup = { name: string; category: string | null; line_type: PlanLineType; amount: number };

export const txnCategoryKey = (t: FinanceTransaction, kind: "income" | "expense") =>
  t.category ?? (kind === "income" ? "הכנסות" : "אחר");

export function groupActuals(
  txns: FinanceTransaction[],
  month: string,
  rulesMap?: Map<string, MerchantRule>
): SeedGroup[] {
  const income = new Map<string, number>();
  const expense = new Map<string, { category: string | null; line_type: PlanLineType; amount: number }>();

  for (const t of txns) {
    if (t.is_internal || !t.txn_date.startsWith(month)) continue;
    if (t.kind === "income") {
      const key = t.category ?? "הכנסות";
      income.set(key, (income.get(key) ?? 0) + t.amount);
    } else {
      const line_type = resolveExpenseType({
        merchant: t.merchant,
        description: t.description,
        category: t.category,
        kind: "expense",
        explicitExpenseType: t.expense_type,
        rules: rulesMap,
      });
      const name = t.category ?? "אחר";
      const key = `${line_type}:${name}`;
      const cur = expense.get(key) ?? { category: t.category, line_type, amount: 0 };
      cur.amount += t.amount;
      expense.set(key, cur);
    }
  }

  const groups: SeedGroup[] = [];
  for (const [name, amount] of income) {
    groups.push({ name, category: name === "הכנסות" ? null : name, line_type: "income", amount });
  }
  for (const [, { category, line_type, amount }] of expense) {
    groups.push({ name: category ?? "אחר", category, line_type, amount });
  }
  return groups;
}

export function actualForLine(
  line: PlanLineRow,
  txns: FinanceTransaction[],
  month: string,
  rulesMap?: Map<string, MerchantRule>
): number {
  if (line.line_type === "savings") return 0;
  const lineKey = line.category ?? line.name;
  let total = 0;
  for (const t of txns) {
    if (t.is_internal || !t.txn_date.startsWith(month)) continue;
    if (line.line_type === "income") {
      if (t.kind !== "income") continue;
      if (line.category ? t.category !== line.category : line.name !== "הכנסות" && txnCategoryKey(t, "income") !== lineKey) continue;
      total += t.amount;
    } else {
      if (t.kind !== "expense") continue;
      if (line.line_type === "planned") {
        if (txnCategoryKey(t, "expense") !== lineKey && line.name !== (t.merchant || t.description)) continue;
      } else {
        const txnLineType = resolveExpenseType({
          merchant: t.merchant,
          description: t.description,
          category: t.category,
          kind: "expense",
          explicitExpenseType: t.expense_type,
          rules: rulesMap,
        });
        if (txnLineType !== line.line_type || txnCategoryKey(t, "expense") !== lineKey) continue;
      }
      total += t.amount;
    }
  }
  return round2(total);
}
