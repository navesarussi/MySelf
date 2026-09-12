export const FINANCE_CATEGORIES = [
  "מזון",
  "תחבורה",
  "בילויים",
  "קניות",
  "מנויים",
  "בריאות",
  "בית",
  "אחר",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export function isFinanceCategory(value: string): value is FinanceCategory {
  return (FINANCE_CATEGORIES as readonly string[]).includes(value);
}
