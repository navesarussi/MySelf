import type { AssetClass } from "../types";

/**
 * The books of a real (demo) trade, computed from what Alpaca actually executed.
 *
 * The simulator steps positions on Binance/IEX bars and books its own fill
 * prices and a flat fee rate. Once a trade is on the broker those numbers are
 * only a forecast: the stop can fill below its price, part of an order can fill
 * at another price, and the fees differ. A trade that was reopened after the
 * broker left fee dust behind was even booked as losing its whole notional
 * (PEPE −54R, 2026-09-23). So every broker trade is settled from its fills.
 *
 * Pure: the caller fetches the fills (FILL activities) and passes the window
 * that belongs to the trade.
 */

export type BrokerFill = { order_id: string; side: "buy" | "sell"; qty: number; price: number; at: number };

/**
 * Alpaca charges crypto sells in USD (CFEE activities) and buys in the asset.
 * Measured on the demo account 2026-09-26 against the matching CFEE rows:
 * 0.18–0.20% of the sell notional (buys: 0.12–0.20% of the quantity).
 * The buy fee needs no rate — it is already the gap between bought and sold.
 */
export const ALPACA_CRYPTO_SELL_FEE_RATE = 0.002;

/** Below this share of the planned risk a fill is measured against the plan (see settleTrade). */
export const PLANNED_RISK_FLOOR = 0.5;

/** Crypto buys lose up to ~0.25% of the quantity to fees; a sale covering this much of the buy is the whole position. */
export const FLAT_COVERAGE = 0.985;

export type Settlement = {
  entry_qty: number;
  entry_price: number;
  exit_qty: number;
  exit_price: number;
  /** Fees in USD: the quantity the buy fee took (valued at the entry) plus the sell fee. */
  fees: number;
  pnl: number;
  /** Risk the R is measured against: fill quantity × (fill − initial stop). */
  risk: number;
  r: number;
  opened_at: number;
  closed_at: number;
};

const vwap = (fills: BrokerFill[]) => {
  const qty = fills.reduce((s, f) => s + f.qty, 0);
  return { qty, price: qty > 0 ? fills.reduce((s, f) => s + f.qty * f.price, 0) / qty : NaN };
};

/**
 * Settle one trade. `fills` holds every fill of the symbol inside the trade's
 * window; the entry is identified by its order id, every sell after the first
 * entry fill is an exit.
 *
 * Returns null while the trade is not flat (no entry fill, or the sells cover
 * less than FLAT_COVERAGE of the buy) — the caller leaves the row alone.
 */
export function settleTrade(input: {
  assetClass: AssetClass;
  entryOrderId: string;
  initialStop: number;
  /** Planned risk in USD, used when the fill made the stop distance degenerate. */
  plannedRisk: number | null;
  fills: BrokerFill[];
}): Settlement | null {
  const entries = input.fills.filter((f) => f.side === "buy" && f.order_id === input.entryOrderId && f.qty > 0 && f.price > 0);
  if (!entries.length) return null;
  const opened_at = Math.min(...entries.map((f) => f.at));
  const entry = vwap(entries);
  // Sells after the entry, oldest first, up to the quantity bought: a close that also dumped a holding the
  // trade never owned (a share bought by hand) must not book that share as the trade's profit.
  const exits: BrokerFill[] = [];
  let left = entry.qty;
  for (const f of input.fills.filter((x) => x.side === "sell" && x.at >= opened_at && x.qty > 0 && x.price > 0).sort((a, b) => a.at - b.at)) {
    if (left <= 0) break;
    const qty = Math.min(f.qty, left);
    exits.push({ ...f, qty });
    left -= qty;
  }
  const exit = vwap(exits);
  if (!(exit.qty >= entry.qty * FLAT_COVERAGE)) return null;

  const crypto = input.assetClass !== "STOCK";
  const sellFee = crypto ? exit.qty * exit.price * ALPACA_CRYPTO_SELL_FEE_RATE : 0;
  // The buy fee is paid in the asset, so it shows up as bought-but-never-sold.
  const buyFee = crypto ? Math.max(0, entry.qty - exit.qty) * entry.price : 0;
  const pnl = exit.qty * exit.price - entry.qty * entry.price - sellFee;

  const fillRisk = entry.qty * (entry.price - input.initialStop);
  const planned = input.plannedRisk ?? 0;
  // R is measured against the risk the fill actually took — except when that is
  // not the trade that was planned: a fill at/through the stop leaves no
  // distance, and a sliver of a partially filled order ($15 on a BCH order
  // sized for ~$900 of risk) read as "+37R" and swamped every average.
  const risk = fillRisk > 0 && !(planned > 0 && fillRisk < planned * PLANNED_RISK_FLOOR) ? fillRisk : planned;

  return {
    entry_qty: entry.qty,
    entry_price: entry.price,
    exit_qty: exit.qty,
    exit_price: exit.price,
    fees: buyFee + sellFee,
    pnl,
    risk,
    r: risk > 0 ? pnl / risk : 0,
    opened_at,
    closed_at: Math.max(...exits.map((f) => f.at)),
  };
}

/** Rounded for storage: money to cents, R to 3 places — the columns the journal reads. */
export function settlementColumns(s: Settlement) {
  return {
    entry_price: s.entry_price,
    exit_price: s.exit_price,
    realized_pnl: Math.round(s.pnl * 100) / 100,
    realized_r: Math.round(s.r * 1000) / 1000,
    fees_paid: Math.round(s.fees * 100) / 100,
    broker_filled_qty: s.entry_qty,
    remaining_size: 0,
  };
}
