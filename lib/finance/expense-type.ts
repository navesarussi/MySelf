import { FINANCE_CATEGORIES } from "@/lib/finance/categories";

export type PlanLineType = "income" | "fixed" | "variable" | "planned" | "savings";

const FIXED_CATEGORIES = new Set(["מנויים", "בית"]);

export function lineTypeForCategory(
  category: string | null | undefined,
  kind: "income" | "expense"
): PlanLineType {
  if (kind === "income") return "income";
  if (category && FIXED_CATEGORIES.has(category)) return "fixed";
  if (category && (FINANCE_CATEGORIES as readonly string[]).includes(category)) return "variable";
  return "variable";
}

export const PLAN_SECTION_ORDER: PlanLineType[] = [
  "income",
  "fixed",
  "variable",
  "planned",
  "savings",
];
