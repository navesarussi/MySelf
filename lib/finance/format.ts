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
