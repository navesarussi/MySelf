import { round } from "./round";

/**
 * Execution quality for a trade: what it cost, how much of the move it kept,
 * and how long it was held.
 *
 * The backtest measures the strategy at roughly +0.02R gross and −0.25R net
 * after fees and slippage — so costs are not a footnote here, they are the
 * whole question. Everything below is expressed in R as well as in dollars,
 * because R is the unit the edge is measured in.
 *
 * Pure, and computed from the columns the trade list already returns, so the
 * journal and the detail screen show the same numbers.
 */

export type QualityInput = {
  entry_price: number | null;
  initial_stop_price: number;
  target_price: number;
  exit_price: number | null;
  position_size: number;
  realized_r: number | null;
  realized_pnl: number | null;
  fees_paid: number;
  entry_slippage_bps: number | null;
  mfe_r: number;
  mae_r: number;
  opened_at: string | null;
  closed_at: string | null;
};

const finite = (x: number | null | undefined): x is number => x !== null && x !== undefined && Number.isFinite(x);

/**
 * What one R is worth in dollars.
 *
 * Derived from the realized figures first, because those are authoritative:
 * `realized_r = cash_flow / (filled_size × stop_distance)`, so their ratio is
 * the real risk even when the broker filled less than the planned size. The
 * planned size × stop distance is the fallback for a trade that has not closed.
 */
export function riskUsd(t: QualityInput): number | null {
  if (finite(t.realized_r) && finite(t.realized_pnl) && Math.abs(t.realized_r) > 1e-9) {
    const risk = t.realized_pnl / t.realized_r;
    if (Number.isFinite(risk) && risk > 0) return round(risk, 4);
  }
  if (!finite(t.entry_price)) return null;
  const stopDistance = t.entry_price - t.initial_stop_price;
  if (!(stopDistance > 0) || !(t.position_size > 0)) return null;
  return round(t.position_size * stopDistance, 4);
}

export type TradeCosts = {
  /** Broker fees as a fraction of the trade's own risk. */
  fee_r: number;
  /** Entry slippage as a fraction of risk; null when the fill price is unknown. */
  slippage_r: number | null;
  total_cost_r: number;
  /** R as booked — already net of fees, and slippage is inside the entry price. */
  net_r: number | null;
  /** What the same trade would have returned with no fees and no slippage. */
  gross_r: number | null;
};

export function tradeCosts(t: QualityInput): TradeCosts | null {
  const risk = riskUsd(t);
  if (risk === null || risk <= 0) return null;

  const fee_r = round(t.fees_paid / risk, 4);
  let slippage_r: number | null = null;
  if (finite(t.entry_slippage_bps) && finite(t.entry_price) && t.position_size > 0) {
    const slippageUsd = t.entry_price * (t.entry_slippage_bps / 10_000) * t.position_size;
    slippage_r = round(slippageUsd / risk, 4);
  }
  const total_cost_r = round(fee_r + (slippage_r ?? 0), 4);
  const net_r = finite(t.realized_r) ? t.realized_r : null;
  return {
    fee_r,
    slippage_r,
    total_cost_r,
    net_r,
    gross_r: net_r === null ? null : round(net_r + total_cost_r, 4),
  };
}

/**
 * The share of the favourable move the exit actually kept: realized R over the
 * best R the trade ever showed.
 *
 * 1.0 means it exited at the high. A low number over many trades means the
 * exits are leaving the move behind; a negative one means a trade that was in
 * profit was allowed to close red. Null when the trade never went favourable —
 * there was nothing to capture, and dividing by that would invent a number.
 */
export function captureEfficiency(t: QualityInput): number | null {
  if (!finite(t.realized_r) || !(t.mfe_r > 0)) return null;
  return round(t.realized_r / t.mfe_r, 4);
}

export function holdingHours(t: QualityInput): number | null {
  if (!t.opened_at || !t.closed_at) return null;
  const open = Date.parse(t.opened_at);
  const close = Date.parse(t.closed_at);
  if (!Number.isFinite(open) || !Number.isFinite(close) || close < open) return null;
  return round((close - open) / 3_600_000, 2);
}

export type TradeQuality = {
  risk_usd: number | null;
  net_r: number | null;
  gross_r: number | null;
  fee_r: number | null;
  slippage_r: number | null;
  total_cost_r: number | null;
  capture_efficiency: number | null;
  hold_hours: number | null;
  /** Position value at entry. */
  notional: number | null;
  /** How many R the planned target was worth — the reward the trade was taken for. */
  r_to_target: number | null;
};

export function tradeQuality(t: QualityInput): TradeQuality {
  const costs = tradeCosts(t);
  const stopDistance = finite(t.entry_price) ? t.entry_price - t.initial_stop_price : null;
  return {
    risk_usd: riskUsd(t),
    net_r: costs?.net_r ?? null,
    gross_r: costs?.gross_r ?? null,
    fee_r: costs?.fee_r ?? null,
    slippage_r: costs?.slippage_r ?? null,
    total_cost_r: costs?.total_cost_r ?? null,
    capture_efficiency: captureEfficiency(t),
    hold_hours: holdingHours(t),
    notional: finite(t.entry_price) && t.position_size > 0 ? round(t.entry_price * t.position_size, 2) : null,
    r_to_target: stopDistance && stopDistance > 0 ? round((t.target_price - t.entry_price!) / stopDistance, 3) : null,
  };
}

// ── Aggregate ───────────────────────────────────────────────────────────────

export type QualityReport = {
  trades: number;
  expectancy_r: number;
  /** Expectancy with fees and slippage added back — the strategy before costs. */
  gross_expectancy_r: number;
  total_pnl: number;
  total_fees: number;
  /** Fees over the book, in R. What the broker took out of the edge. */
  total_fees_r: number;
  total_slippage_r: number;
  avg_capture_efficiency: number | null;
  hold_hours_winners: number | null;
  hold_hours_losers: number | null;
  /**
   * How much heat the trades that worked had to take. A stop tighter than
   * `worst_mae_of_winners` would have cut winners out of the book.
   */
  avg_mae_of_winners: number | null;
  worst_mae_of_winners: number | null;
};

const mean = (xs: number[]): number | null => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length, 3) : null);

export function qualityReport(trades: QualityInput[]): QualityReport {
  const closed = trades.filter((t) => finite(t.realized_r));
  const costs = closed.map((t) => ({ t, c: tradeCosts(t) }));
  const winners = closed.filter((t) => (t.realized_r ?? 0) > 0);
  const losers = closed.filter((t) => (t.realized_r ?? 0) <= 0);
  const holds = (list: QualityInput[]) => mean(list.map(holdingHours).filter(finite));

  return {
    trades: closed.length,
    expectancy_r: mean(closed.map((t) => t.realized_r!)) ?? 0,
    gross_expectancy_r: mean(costs.map(({ c }) => c?.gross_r).filter(finite)) ?? 0,
    total_pnl: round(closed.reduce((s, t) => s + (t.realized_pnl ?? 0), 0), 2),
    total_fees: round(closed.reduce((s, t) => s + t.fees_paid, 0), 2),
    total_fees_r: round(costs.reduce((s, { c }) => s + (c?.fee_r ?? 0), 0), 3),
    total_slippage_r: round(costs.reduce((s, { c }) => s + (c?.slippage_r ?? 0), 0), 3),
    avg_capture_efficiency: mean(closed.map(captureEfficiency).filter(finite)),
    hold_hours_winners: holds(winners),
    hold_hours_losers: holds(losers),
    avg_mae_of_winners: mean(winners.map((t) => t.mae_r).filter(finite)),
    worst_mae_of_winners: winners.length ? round(Math.min(...winners.map((t) => t.mae_r)), 3) : null,
  };
}
