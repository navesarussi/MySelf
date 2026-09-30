import { RISK_ENVELOPE } from "../config";
import { assetRotation, cryptoTrend, momentum, pullback, reversal, type BookEnvelope, type Sleeve, type StrategyDef } from "../strategy/multi";

/**
 * The live book's sleeves and caps — pure, so the model book, the research scripts and the dashboard share them
 * without importing the tick. Evidence: docs/trading/multi-strategy.md.
 *
 * Sleeves and risk come from the 10-year research on the full universe, one edge per horizon: crypto trend
 * (weeks), stock momentum and cross-asset rotation (months, rebalanced monthly), and short-term reversal in
 * momentum leaders (days). 2016-26 together: CAGR 24%, Sharpe 1.22, max DD 21%, ~480 trades a year.
 */
export const BOOK_SLEEVES: Sleeve[] = [
  { def: cryptoTrend(), risk_pct: 0.005, max_positions: 6 },
  { def: momentum(), risk_pct: 0.003, max_positions: 20 },
  { def: assetRotation(), risk_pct: 0.008, max_positions: 5 },
  // Mean reversion needs many small slots: signals cluster in selloffs and 10 big slots fill on the first day.
  { def: reversal(), risk_pct: 0.0025, max_positions: 40 },
];

/** Families no longer entered whose open positions are still managed to their exits. */
export const RETIRED_DEFS: StrategyDef[] = [pullback()];

export const BOOK_LIMITS = Object.freeze({
  max_positions: 75,
  max_notional: 0.2,
  /** Stock gross notional (book positions + queued entries) as a share of equity — research: 1.0 → max DD 21% vs 30% at 1.5. */
  max_gross: 1.0,
  max_risk_per_trade: 0.01,
});

/** The research engine's envelope matching the live limits (model book, risk-budget calibration). */
export const MODEL_ENVELOPE: BookEnvelope = {
  max_positions: BOOK_LIMITS.max_positions,
  max_open_risk: RISK_ENVELOPE.ACCOUNT_MAX_OPEN_RISK_PCT,
  max_notional: BOOK_LIMITS.max_notional,
  max_gross: BOOK_LIMITS.max_gross,
};

/** Sleeves at `scale` × their research risk (trading_settings.risk_scale). */
export function scaledSleeves(scale: number, sleeves: Sleeve[] = BOOK_SLEEVES): Sleeve[] {
  return sleeves.map((s) => ({ ...s, risk_pct: s.risk_pct * scale }));
}

/** Sleeves a pass of `group` scans (crypto pass: crypto sleeves; stock pass: stock and ETF sleeves). */
export function sleevesForGroup(group: "CRYPTO" | "STOCKS", sleeves: Sleeve[]): Sleeve[] {
  return sleeves.filter((s) => s.def.groups.some((g) => (group === "CRYPTO" ? g === "CRYPTO" : g !== "CRYPTO")));
}
