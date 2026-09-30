import type { AssetClass, UniverseSymbol } from "./types";

/**
 * RISK ENVELOPE — hard constants. Nothing at runtime (agent, dashboard, chat, DB row)
 * can change these. Changing them means editing this file and deploying — deliberate
 * friction so risk is never raised in a stressed moment.
 */
// The envelope the daily-trend research was validated under (docs/trading/research-2026-09.md: +0.24R/trade,
// Sharpe 0.86, max DD 7.3%). It was loosened on 2026-09-14 (2%/10 positions/no correlation cap/−10R halts)
// only to measure the intraday strategy on paper; that measurement is done and intraday entries are retired
// (see intraday-engine.ts), so the automatic system runs at the risk its evidence was produced with.
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
  /**
   * Drawdown from peak equity that trips the master kill switch. Risk budget (2026-09-30): the book is sized for
   * a ≤ 15% worst drawdown over 10 years (13.9% in research); 20% leaves room for live being worse than research
   * (survivorship) while still meaning "something is broken", not "a bad month".
   */
  MASTER_KILL_SWITCH_DD: 0.2,
  /** Max notional per position. Crypto has no leverage at Alpaca, so this caps real risk below MAX_RISK_PER_TRADE on tight stops. */
  MAX_ASSET_EXPOSURE: 0.2,
  /** Allowed agent risk multipliers — the agent can only reduce. */
  AGENT_RISK_MULTIPLIERS: Object.freeze([0, 0.5, 0.75, 1] as const),

  // ── The live account (Alpaca demo), in % of equity ────────────────────────
  // The R-count limits above assume every trade risks the same 1R — true inside a single-strategy backtest,
  // false in the book (0.15%–0.5% per trade), where a "+144R week" made of tiny-risk trades showed why.
  // These are what live entries (the book and the search button) are checked against: checkAccountEntry.
  /** Open positions across every strategy and manual trade (book 2026-09-28: 6 crypto + 20 momentum + 5 rotation + 40 reversal slots). */
  ACCOUNT_MAX_POSITIONS: 80,
  /**
   * Sum of initial risk still at stake (stop below entry), as a share of equity. The book's stops are
   * catastrophe stops 4–5 ATR away, so this is a worst-case bound, not the expected loss; real exposure is
   * capped by the book's gross notional (BOOK_LIMITS.max_gross).
   */
  ACCOUNT_MAX_OPEN_RISK_PCT: 0.25,
  /** Realized loss that halts new entries: today / this week (Mon–Sun UTC). Book 2016-26: worst day −3.2% (once), worst week −3.9%. */
  DAILY_LOSS_HALT_PCT: -0.03,
  WEEKLY_LOSS_HALT_PCT: -0.05,
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

/** Paper account starting equity (USD). */
export const PAPER_STARTING_EQUITY = 100_000;

/**
 * R-multiple measurement floor — caps inflated R when the stop sits unrealistically
 * close to entry (tiny stop_distance blows up cash_flow / risk). Used only for strategy
 * metrics and gates; broker P&L and account equity are unchanged.
 */
export const R_MEASUREMENT = Object.freeze({
  /** Minimum per-share stop distance as a fraction of entry (0.5%). */
  MIN_STOP_DISTANCE_PCT: 0.005,
  /** When ATR is available (live open R), also floor at this fraction of ATR(14). */
  MIN_STOP_ATR_FRACTION: 0.25,
});

/**
 * Entry sizing guards — every live entry path (book, IBS close, manual search, scans, committee)
 * reads these before submitting to Alpaca. Prevents penny names, oversize notional, and 403 balance errors.
 */
export const ENTRY_GUARDS = Object.freeze({
  /** Reject stock entries below this USD price. */
  MIN_STOCK_PRICE: 5,
  /** Meme/penny crypto always blocked when listed here (fallback when volume data missing). */
  CRYPTO_DENYLIST: Object.freeze(["GRAM", "PEPE", "SHIB", "FLOKI", "BONK", "WIF", "BOME"] as string[]),
  /** Minimum Binance 24h quote volume (USD) when ticker data is available. */
  CRYPTO_MIN_QUOTE_VOLUME_24H: 5_000_000,
  /** Only use this fraction of broker buying power per entry (Alpaca insufficient-balance guard). */
  BUYING_POWER_BUFFER: 0.95,
  /** Max position notional as a fraction of account equity. */
  MAX_POSITION_NOTIONAL_PCT: 0.1,
  /** Hard USD cap per position regardless of equity. */
  MAX_POSITION_NOTIONAL_USD: 25_000,
  /** Minimum stop distance for sizing — same as R_MEASUREMENT; tight stops cannot inflate qty. */
  MIN_STOP_DISTANCE_PCT: 0.005,
  /** Minimum average daily dollar volume for stock entries (myself.trading_daily_bars). */
  MIN_STOCK_AVG_DOLLAR_VOLUME: 20_000_000,
  /** Lookback sessions for ADTV from stored daily bars. */
  STOCK_ADTV_LOOKBACK_DAYS: 20,
});

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
