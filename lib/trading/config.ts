import type { AssetClass, UniverseSymbol } from "./types";

/**
 * RISK ENVELOPE — hard constants. Nothing at runtime (agent, dashboard, chat, DB row)
 * can change these. Changing them means editing this file and deploying — deliberate
 * friction so risk is never raised in a stressed moment.
 */
// TESTING PHASE (2026-09-14, paper account only, user-approved "aggressive-controlled"): risk and position
// caps raised, correlation cap effectively off, halts loosened. Previous values in comments — restore before LIVE.
export const RISK_ENVELOPE = Object.freeze({
  MAX_RISK_PER_TRADE: Object.freeze({ STOCK: 0.01, CRYPTO_MAJOR: 0.02, CRYPTO_ALT: 0.02 } as Record<AssetClass, number>), // was 0.005 / 0.01
  MIN_RR_RATIO: 2.0,
  MAX_CONCURRENT_POSITIONS: 10, // was 5
  MAX_TOTAL_OPEN_RISK_R: 10, // was 5
  MAX_CORRELATED_POSITIONS: 10, // was 2
  /** |ρ| of 60 daily returns above which two symbols count as correlated (cross asset class). */
  CORRELATION_THRESHOLD: 0.7,
  DAILY_LOSS_HALT_R: -10, // was -3
  WEEKLY_LOSS_HALT_R: -25, // was -6
  /** Drawdown from peak equity that trips the master kill switch. */
  MASTER_KILL_SWITCH_DD: 0.3, // was 0.15
  /** Max notional per position. Crypto has no leverage at Alpaca, so this caps real risk well below MAX_RISK_PER_TRADE on tight stops. */
  MAX_ASSET_EXPOSURE: 0.25, // was 0.2
  /** Allowed agent risk multipliers — the agent can only reduce. */
  AGENT_RISK_MULTIPLIERS: Object.freeze([0, 0.5, 0.75, 1] as const),
});

/** Execution constants (also not runtime-tunable). */
export const EXECUTION_RULES = Object.freeze({
  MAX_ENTRY_SLIPPAGE: 0.003,
  MIN_PARTIAL_FILL: 0.7,
  /** Smaller orders are noise (Alpaca rejects crypto under $10; fees and rounding dominate below ~$100). */
  MIN_ORDER_NOTIONAL: 100,
  /** Pending limit orders expire after this many entry-timeframe bars. */
  PENDING_EXPIRY_BARS: 1,
  /**
   * Per side. Crypto: measured on the Alpaca demo account 2026-09-26 — 0.12–0.20% of each buy (taken in the
   * asset) and 0.18–0.20% of each sell (CFEE rows); 0.1% had the backtests understating costs by half.
   * Stocks: commission-free, only regulatory sell fees.
   */
  FEE_RATE: Object.freeze({ STOCK: 0.0001, CRYPTO_MAJOR: 0.002, CRYPTO_ALT: 0.002 } as Record<AssetClass, number>),
  /** Assumed slippage (fraction) used by backtests and paper fills. */
  ASSUMED_SLIPPAGE: Object.freeze({ STOCK: 0.0005, CRYPTO_MAJOR: 0.0005, CRYPTO_ALT: 0.001 } as Record<AssetClass, number>),
});

/** Strategy params live with the strategy: see DEFAULT_V2_PARAMS in strategy/candidates.ts. */

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

export { GEMINI_MODEL_ID as AGENT_MODEL_ID } from "@/lib/ai-model";
export const AGENT_PROMPT_VERSION = "trade-analyst-v3-discretion";

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
  { symbol: "SUI", asset_class: "CRYPTO_ALT", provider_symbol: "SUIUSDT" },
  { symbol: "NEAR", asset_class: "CRYPTO_ALT", provider_symbol: "NEARUSDT" },
  { symbol: "TRX", asset_class: "CRYPTO_ALT", provider_symbol: "TRXUSDT" },
  { symbol: "UNI", asset_class: "CRYPTO_ALT", provider_symbol: "UNIUSDT" },
  { symbol: "BCH", asset_class: "CRYPTO_ALT", provider_symbol: "BCHUSDT" },
  { symbol: "ARB", asset_class: "CRYPTO_ALT", provider_symbol: "ARBUSDT" },
  // Extra liquid alts (≥ $5M/day on Binance) — breadth for the intraday strategy's trade frequency.
  ...["DOT", "PEPE", "AAVE", "APT", "INJ", "FIL", "POL", "TON", "ICP", "HBAR"].map(
    (symbol): UniverseSymbol => ({ symbol, asset_class: "CRYPTO_ALT", provider_symbol: `${symbol}USDT` })
  ),
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
  ...["NFLX", "AVGO", "COST", "JPM", "V", "LLY", "XOM", "ORCL", "PLTR", "COIN", "UBER", "CRM", "MU", "WMT", "IWM"].map(
    (symbol): UniverseSymbol => ({ symbol, asset_class: "STOCK", provider_symbol: symbol })
  ),
  // Wider breadth for the daily-trend strategy (docs/trading/research-2026-09.md): more independent symbols
  // is the only legitimate way to raise trade frequency — the entry/exit rules are unchanged from research.
  ...["JNJ", "PG", "HD", "MA", "BAC", "ABBV", "KO", "PEP", "CSCO", "ACN", "MRK", "ADBE", "TXN", "LIN", "PM", "HON", "UNP", "LOW", "SBUX", "INTC", "IBM", "CAT", "DE", "BA", "GS", "MS", "BLK", "SCHW", "NOW", "INTU", "AMAT", "QCOM", "BKNG", "ISRG", "VRTX", "REGN", "GILD", "DIS", "PYPL", "XYZ"].map(
    (symbol): UniverseSymbol => ({ symbol, asset_class: "STOCK", provider_symbol: symbol })
  ),
  // ETFs used in the daily-trend research (bias-free liquidity/diversification check) — see docs/trading/research-2026-09.md.
  ...["GLD", "SLV", "TLT", "IEF", "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "EEM", "EFA", "USO", "DBC", "SMH", "ARKK", "VNQ", "HYG", "DIA"].map(
    (symbol): UniverseSymbol => ({ symbol, asset_class: "STOCK", provider_symbol: symbol })
  ),
];

/** Group classification for the daily-trend strategy (cross-sectional RS ranking + regime reference). */
export function dailyTrendGroup(symbol: string, assetClass: AssetClass): "CRYPTO" | "ETF" | "STOCKS" {
  if (assetClass !== "STOCK") return "CRYPTO";
  const ETF_SYMBOLS = new Set(["SPY", "QQQ", "IWM", "GLD", "SLV", "TLT", "IEF", "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "EEM", "EFA", "USO", "DBC", "SMH", "ARKK", "VNQ", "HYG", "DIA"]);
  return ETF_SYMBOLS.has(symbol) ? "ETF" : "STOCKS";
}

/** Super-market regime reference per asset class. */
export const REGIME_REFERENCE: Record<AssetClass, UniverseSymbol> = {
  STOCK: SEED_UNIVERSE.find((s) => s.symbol === "SPY")!,
  CRYPTO_MAJOR: SEED_UNIVERSE.find((s) => s.symbol === "BTC")!,
  CRYPTO_ALT: SEED_UNIVERSE.find((s) => s.symbol === "BTC")!,
};

export function isCrypto(assetClass: AssetClass) {
  return assetClass !== "STOCK";
}
