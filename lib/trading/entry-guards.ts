import { ENTRY_GUARDS, EXECUTION_RULES } from "./config";
import { dayIso } from "./book/bars";
import { logEvent, symbolsLoggedOn } from "./store";
import type { AssetClass, Bar } from "./types";

/** Why an entry was skipped or sized down — recorded on triggers/trades and in tick summaries. */
export type EntryGuardReason =
  | "MIN_STOCK_PRICE"
  | "CRYPTO_DENYLIST"
  | "CRYPTO_LOW_VOLUME"
  | "MIN_STOCK_LIQUIDITY"
  | "INSUFFICIENT_BUYING_POWER"
  | "MAX_POSITION_NOTIONAL"
  | "MIN_ORDER_NOTIONAL";

export type EntryGuardContext = {
  symbol: string;
  asset_class: AssetClass;
  entry: number;
  stop: number;
  equity: number;
  /** Remaining buying power for this asset class (stock or crypto). */
  buying_power: number | null;
  /** 20-day average dollar volume from trading_daily_bars (stocks). */
  avg_dollar_volume?: number | null;
  /** Binance 24h quote volume USD (crypto), when available. */
  quote_volume_24h?: number | null;
};

export type EntryGuardBlock = { reason: EntryGuardReason; detail: string };

/** Per-share stop distance floored for sizing — same 0.5% minimum as R measurement. */
export function guardStopDistance(entry: number, stop: number): number {
  const raw = entry - stop;
  if (!(raw > 0)) return 0;
  return Math.max(raw, entry * ENTRY_GUARDS.MIN_STOP_DISTANCE_PCT);
}

/** Max notional allowed for one new position after equity %, absolute USD, and buying-power caps. */
export function maxEntryNotional(input: { equity: number; buying_power: number | null }): number {
  const { equity, buying_power } = input;
  let cap = ENTRY_GUARDS.MAX_POSITION_NOTIONAL_PCT * equity;
  cap = Math.min(cap, ENTRY_GUARDS.MAX_POSITION_NOTIONAL_USD);
  if (buying_power !== null && buying_power > 0) {
    const bpCap = buying_power * ENTRY_GUARDS.BUYING_POWER_BUFFER;
    cap = Math.min(cap, bpCap);
  }
  return Math.max(0, cap);
}

/** Average daily dollar volume from stored daily bars. */
export function avgDollarVolumeFromBars(bars: Bar[], lookback = ENTRY_GUARDS.STOCK_ADTV_LOOKBACK_DAYS): number | null {
  if (bars.length < lookback) return null;
  const last = bars.slice(-lookback);
  return last.reduce((s, b) => s + b.c * b.v, 0) / last.length;
}

/** Pre-size checks: price, denylist, liquidity. Pure — no I/O. */
export function checkEntryGuardPre(ctx: EntryGuardContext): EntryGuardBlock | null {
  const { symbol, asset_class, entry } = ctx;
  if (!(entry > 0)) return { reason: "MIN_STOCK_PRICE", detail: "invalid entry price" };

  if (asset_class === "STOCK") {
    if (entry < ENTRY_GUARDS.MIN_STOCK_PRICE) {
      return { reason: "MIN_STOCK_PRICE", detail: `$${entry.toFixed(2)} < min $${ENTRY_GUARDS.MIN_STOCK_PRICE}` };
    }
    const adv = ctx.avg_dollar_volume;
    if (adv != null && adv < ENTRY_GUARDS.MIN_STOCK_AVG_DOLLAR_VOLUME) {
      return {
        reason: "MIN_STOCK_LIQUIDITY",
        detail: `ADTV $${Math.round(adv / 1e6)}M < min $${Math.round(ENTRY_GUARDS.MIN_STOCK_AVG_DOLLAR_VOLUME / 1e6)}M`,
      };
    }
    return null;
  }

  const base = symbol.toUpperCase();
  if (ENTRY_GUARDS.CRYPTO_DENYLIST.includes(base)) {
    return { reason: "CRYPTO_DENYLIST", detail: `${base} on denylist` };
  }
  const qv = ctx.quote_volume_24h;
  if (qv != null && qv < ENTRY_GUARDS.CRYPTO_MIN_QUOTE_VOLUME_24H) {
    return {
      reason: "CRYPTO_LOW_VOLUME",
      detail: `24h vol $${Math.round(qv / 1e6)}M < min $${Math.round(ENTRY_GUARDS.CRYPTO_MIN_QUOTE_VOLUME_24H / 1e6)}M`,
    };
  }
  return null;
}

export type SizedEntry = { size: number; notional: number; risk_usd: number; stop_distance: number; reduced: boolean };

/**
 * Risk-based size with guard stop floor, notional cap, and buying-power cap.
 * Returns null when blocked (below min order notional or zero size).
 */
export function sizeWithEntryGuards(input: {
  entry: number;
  stop: number;
  equity: number;
  asset_class: AssetClass;
  risk_pct: number;
  buying_power: number | null;
}): (SizedEntry & { block?: EntryGuardBlock }) | null {
  const stopDist = guardStopDistance(input.entry, input.stop);
  if (!(stopDist > 0) || !(input.equity > 0)) return null;

  const riskBudget = input.risk_pct * input.equity;
  if (!(riskBudget > 0)) return null;

  let size = riskBudget / stopDist;
  const maxNotional = maxEntryNotional({ equity: input.equity, buying_power: input.buying_power });
  let reduced = false;
  if (size * input.entry > maxNotional) {
    size = maxNotional / input.entry;
    reduced = true;
  }
  size = input.asset_class === "STOCK" ? Math.floor(size) : Math.floor(size * 1e6) / 1e6;
  const notional = size * input.entry;
  if (!(size > 0)) {
    return {
      size: 0,
      notional: 0,
      risk_usd: 0,
      stop_distance: stopDist,
      reduced,
      block: { reason: "INSUFFICIENT_BUYING_POWER", detail: "size rounded to zero" },
    };
  }
  if (notional < EXECUTION_RULES.MIN_ORDER_NOTIONAL) {
    return { size, notional, risk_usd: size * stopDist, stop_distance: stopDist, reduced, block: { reason: "MIN_ORDER_NOTIONAL", detail: `$${Math.round(notional)} < min $${EXECUTION_RULES.MIN_ORDER_NOTIONAL}` } };
  }
  if (reduced && input.buying_power !== null && notional > input.buying_power * ENTRY_GUARDS.BUYING_POWER_BUFFER + 1e-6) {
    return { size, notional, risk_usd: size * stopDist, stop_distance: stopDist, reduced, block: { reason: "INSUFFICIENT_BUYING_POWER", detail: "exceeds buffered buying power" } };
  }
  return { size, notional, risk_usd: size * stopDist, stop_distance: stopDist, reduced };
}

/** Notional-based sizing (IBS close sleeve): cap by guards, reject below min notional. */
export function sizeNotionalWithGuards(input: {
  entry: number;
  stop: number;
  target_notional: number;
  equity: number;
  buying_power: number | null;
}): (SizedEntry & { block?: EntryGuardBlock }) | null {
  const cap = maxEntryNotional({ equity: input.equity, buying_power: input.buying_power });
  const notional = Math.min(input.target_notional, cap);
  const size = Math.floor(notional / input.entry);
  const stopDist = guardStopDistance(input.entry, input.stop);
  if (size < 1 || size * input.entry < EXECUTION_RULES.MIN_ORDER_NOTIONAL) {
    return { size, notional: size * input.entry, risk_usd: size * stopDist, stop_distance: stopDist, reduced: notional < input.target_notional, block: { reason: "MIN_ORDER_NOTIONAL", detail: "below min order notional" } };
  }
  return { size, notional: size * input.entry, risk_usd: size * stopDist, stop_distance: stopDist, reduced: notional < input.target_notional };
}

/** One deduped event per symbol per UTC day — avoids alert spam on every tick. */
export async function logEntryGuardSkip(input: { symbol: string; reason: EntryGuardReason; detail: string; now?: number }) {
  const now = input.now ?? Date.now();
  const day = dayIso(now);
  const logged = await symbolsLoggedOn("ENTRY_GUARD", day);
  if (logged.includes(input.symbol)) return;
  await logEvent({
    kind: "ENTRY_GUARD",
    symbol: input.symbol,
    severity: "info",
    message: `${input.symbol}: entry skipped — ${input.reason} (${input.detail})`.slice(0, 300),
    data: { reason: input.reason, detail: input.detail },
  });
}
