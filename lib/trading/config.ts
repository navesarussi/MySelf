import type { AssetClass, TradingMode, UniverseSymbol } from "./types";

/**
 * RISK ENVELOPE — hard constants. Nothing at runtime (agent, dashboard, chat, DB row)
 * can change these. Changing them means editing this file and deploying — deliberate
 * friction so risk is never raised in a stressed moment.
 */
export const RISK_ENVELOPE = Object.freeze({
  MAX_RISK_PER_TRADE: Object.freeze({ STOCK: 0.005, CRYPTO_MAJOR: 0.01, CRYPTO_ALT: 0.01 } as Record<AssetClass, number>),
  MIN_RR_RATIO: 2.0,
  MAX_CONCURRENT_POSITIONS: 5,
  MAX_TOTAL_OPEN_RISK_R: 5,
  MAX_CORRELATED_POSITIONS: 2,
  /** |ρ| of 60 daily returns above which two symbols count as correlated (cross asset class). */
  CORRELATION_THRESHOLD: 0.7,
  DAILY_LOSS_HALT_R: -3,
  WEEKLY_LOSS_HALT_R: -6,
  /** Drawdown from peak equity that trips the master kill switch. */
  MASTER_KILL_SWITCH_DD: 0.15,
  MAX_ASSET_EXPOSURE: 0.2,
  /** Allowed agent risk multipliers — the agent can only reduce. */
  AGENT_RISK_MULTIPLIERS: Object.freeze([0, 0.5, 0.75, 1] as const),
});

/** Execution constants (also not runtime-tunable). */
export const EXECUTION_RULES = Object.freeze({
  MAX_ENTRY_SLIPPAGE: 0.003,
  MIN_PARTIAL_FILL: 0.7,
  /** Pending limit orders expire after this many entry-timeframe bars. */
  PENDING_EXPIRY_BARS: 1,
  FEE_RATE: Object.freeze({ STOCK: 0.0005, CRYPTO_MAJOR: 0.001, CRYPTO_ALT: 0.001 } as Record<AssetClass, number>),
  /** Assumed slippage (fraction) used by backtests and paper fills. */
  ASSUMED_SLIPPAGE: Object.freeze({ STOCK: 0.0005, CRYPTO_MAJOR: 0.0005, CRYPTO_ALT: 0.001 } as Record<AssetClass, number>),
});

/**
 * Strategy params — tunable only via the quarterly calibration flow (proposal → your approval →
 * locked for 90 days). These are the defaults when no approved param set exists.
 */
export type StrategyParams = {
  version: string;
  rsi_low: number;
  rsi_high: number;
  rsi_confirm: number;
  adx_min: number;
  atr_stop_mult: number;
  swing_buffer_atr: number;
  ema_touch_atr: number;
  swing_lookback: number;
  trail_atr_mult: number;
};

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = Object.freeze({
  version: "default-1",
  rsi_low: 40,
  rsi_high: 50,
  rsi_confirm: 50,
  adx_min: 20,
  atr_stop_mult: 1.5,
  swing_buffer_atr: 0.2,
  ema_touch_atr: 0.5,
  swing_lookback: 10,
  trail_atr_mult: 2,
}) as StrategyParams;

export const MODE_TIMEFRAMES: Record<TradingMode, { entry: "15m" | "4h"; trend: "4h" | "1d" }> = {
  INTRADAY: { entry: "15m", trend: "4h" },
  SWING: { entry: "4h", trend: "1d" },
};

/** Universe screening thresholds (daily). */
export const UNIVERSE_RULES = Object.freeze({
  MIN_AVG_DOLLAR_VOLUME_30D: 50_000_000,
  MAX_SPREAD_OF_STOP: 0.05,
  MIN_ATR_PCT: 0.015,
  MIN_HISTORY_DAYS: 365,
  MIN_STOCK_PRICE: 5,
  TIER_1_DOLLAR_VOLUME: 500_000_000,
  VOL_TIER_LOW_MAX: 0.025,
  VOL_TIER_MID_MAX: 0.05,
});

/** Vetoes before the agent ever sees the setup. */
export const VETO_RULES = Object.freeze({
  EARNINGS_WINDOW_TRADING_DAYS: 3,
  EXTREME_FUNDING_RATE: 0.0005,
  TOKEN_UNLOCK_WINDOW_DAYS: 7,
  SESSION_EDGE_MINUTES: 15,
});

/** Learning layer thresholds. */
export const LEARNING_RULES = Object.freeze({
  DISABLE_MIN_TRADES: 30,
  DISABLE_MAX_EXPECTANCY_R: -0.3,
  DISABLE_BUCKET_GAP_R: 0.3,
  REENABLE_REVIEW_DAYS: 90,
  CALIBRATION_LOCK_DAYS: 90,
});

/** Phase gates (Go/No-Go). */
export const PHASE_GATES = Object.freeze({
  BACKTEST_MIN_TRADES: 100,
  SHADOW_MIN_TRIGGERS: 100,
  SHADOW_MIN_DAYS: 28,
  PAPER_MIN_DAYS: 56,
  PAPER_MAX_EXPECTANCY_DEVIATION_R: 0.4,
});

export const AGENT_MODEL_ID = "gemini-3-flash-preview";
export const AGENT_PROMPT_VERSION = "trade-judge-v1";

/** Paper account starting equity (USD). */
export const PAPER_STARTING_EQUITY = 100_000;

export const SEED_UNIVERSE: UniverseSymbol[] = [
  { symbol: "BTC", asset_class: "CRYPTO_MAJOR", provider_symbol: "BTCUSDT" },
  { symbol: "ETH", asset_class: "CRYPTO_MAJOR", provider_symbol: "ETHUSDT" },
  { symbol: "SOL", asset_class: "CRYPTO_ALT", provider_symbol: "SOLUSDT" },
  { symbol: "BNB", asset_class: "CRYPTO_ALT", provider_symbol: "BNBUSDT" },
  { symbol: "XRP", asset_class: "CRYPTO_ALT", provider_symbol: "XRPUSDT" },
  { symbol: "ADA", asset_class: "CRYPTO_ALT", provider_symbol: "ADAUSDT" },
  { symbol: "AVAX", asset_class: "CRYPTO_ALT", provider_symbol: "AVAXUSDT" },
  { symbol: "LINK", asset_class: "CRYPTO_ALT", provider_symbol: "LINKUSDT" },
  { symbol: "DOGE", asset_class: "CRYPTO_ALT", provider_symbol: "DOGEUSDT" },
  { symbol: "LTC", asset_class: "CRYPTO_ALT", provider_symbol: "LTCUSDT" },
  { symbol: "SPY", asset_class: "STOCK", provider_symbol: "SPY" },
  { symbol: "QQQ", asset_class: "STOCK", provider_symbol: "QQQ" },
  { symbol: "AAPL", asset_class: "STOCK", provider_symbol: "AAPL" },
  { symbol: "MSFT", asset_class: "STOCK", provider_symbol: "MSFT" },
  { symbol: "NVDA", asset_class: "STOCK", provider_symbol: "NVDA" },
  { symbol: "AMZN", asset_class: "STOCK", provider_symbol: "AMZN" },
  { symbol: "META", asset_class: "STOCK", provider_symbol: "META" },
  { symbol: "GOOGL", asset_class: "STOCK", provider_symbol: "GOOGL" },
  { symbol: "TSLA", asset_class: "STOCK", provider_symbol: "TSLA" },
  { symbol: "AMD", asset_class: "STOCK", provider_symbol: "AMD" },
];

/** Super-market regime reference per asset class. */
export const REGIME_REFERENCE: Record<AssetClass, UniverseSymbol> = {
  STOCK: SEED_UNIVERSE.find((s) => s.symbol === "SPY")!,
  CRYPTO_MAJOR: SEED_UNIVERSE.find((s) => s.symbol === "BTC")!,
  CRYPTO_ALT: SEED_UNIVERSE.find((s) => s.symbol === "BTC")!,
};

export function isCrypto(assetClass: AssetClass) {
  return assetClass !== "STOCK";
}
