/** Coerce unknown values (stale cache, API gaps) to a finite number. */
export function safeAmount(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function fmtAmount0(value: unknown): string {
  return safeAmount(value).toFixed(0);
}

export function fmtAmount2(value: unknown): string {
  return safeAmount(value).toFixed(2);
}

/** Locale-aware ₪ display with thousands separators (e.g. ₪1,143). */
export function fmtIls0(value: unknown, locale = "he-IL"): string {
  return `₪${Math.round(safeAmount(value)).toLocaleString(locale)}`;
}

export function fmtIls2(value: unknown, locale = "he-IL"): string {
  const n = safeAmount(value);
  return `₪${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
