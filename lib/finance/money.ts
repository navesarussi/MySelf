/**
 * Money arithmetic for the finance system.
 *
 * Shekel amounts are stored and displayed to the agora, and every module that
 * summed them had grown its own `round2` — nine identical copies across
 * cashflow, forecast, history, plan, reconcile, recurring, wealth and weekly.
 * Identical today; nothing kept them that way.
 */

/** Round to the agora. The rounding step for every stored or displayed amount. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum a list of amounts, rounded once at the end rather than per addition. */
export function sumAmounts(amounts: readonly number[]): number {
  return round2(amounts.reduce((total, n) => total + n, 0));
}
