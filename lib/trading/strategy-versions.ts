/**
 * Strategy version tags, in their own module so the modules split out of
 * engine.ts can share them without importing the tick back.
 */
export const STRATEGY_VERSION = "v2";
/** Intraday (15m/5m) strategy — runs in its own per-minute tick (intraday-engine.ts). */
export const INTRADAY_STRATEGY_VERSION = "intraday";
/** Trades opened from the "search trade" button — managed by the intraday tick like intraday trades. */
export const MANUAL_STRATEGY_VERSION = "manual";
export const DAILY_TREND_STRATEGY_VERSION = "daily_trend";
/** The deterministic multi-strategy book (lib/trading/book) — the strategy family is in `setup`. */
export const BOOK_STRATEGY_VERSION = "book";
export const isBookManaged = (v: string | null | undefined) => v === BOOK_STRATEGY_VERSION;
/** Rows created or closed by broker/journal reconciliation — excluded from strategy metrics. */
export const RECONCILIATION_STRATEGY_VERSION = "reconciliation";

export const isIntradayManaged = (v: string | null | undefined) =>
  v === INTRADAY_STRATEGY_VERSION || v === MANUAL_STRATEGY_VERSION;
