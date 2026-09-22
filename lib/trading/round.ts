/**
 * Rounding for stored trading numbers.
 *
 * Six copies of this existed (engine, learning, metrics, service, candidates,
 * account-equity), each with its own default precision. One home, and the
 * precision is named at the call site where it matters.
 */

/** Round to `d` decimals. Non-finite input passes through untouched. */
export function round(x: number, d = 4): number {
  return Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x;
}

/** Money, to the cent. */
export function roundMoney(x: number): number {
  return round(x, 2);
}
