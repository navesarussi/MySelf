import type { FinanceImportSource } from "@/lib/finance/import/types";

const CAL_HINTS = [/cal-online/i, /\bcal\b/i, /דף חיוב חודשי/, /דף פירוט דיגיטלי/, /ויזה.*לאומי/, /pay\s*box/i, /פייבוקס/i];
const LEUMI_HINTS = [/תעודת הזהות הבנקאית/, /בנק לאומי/, /פרק א-חשבון עובר ושב/, /www\.leumi\.co\.il/i];
const MAX_HINTS = [/\bmax\b/i, /מקס/, /max-it/i];

export function detectImportSource(text: string, filename: string, hint?: string | null): FinanceImportSource {
  if (hint === "leumi" || hint === "cal" || hint === "max" || hint === "excel" || hint === "manual") {
    return hint;
  }

  const lower = `${filename}\n${text.slice(0, 4000)}`.toLowerCase();
  if (LEUMI_HINTS.some((p) => p.test(text) || p.test(lower))) return "leumi";
  if (CAL_HINTS.some((p) => p.test(text) || p.test(lower))) return "cal";
  if (MAX_HINTS.some((p) => p.test(text) || p.test(lower))) return "max";

  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "xlsx" || ext === "xls") return "excel";
  return "manual";
}
