/** Shared types for the autonomous trading system (lib/trading). */

export type AssetClass = "STOCK" | "CRYPTO_MAJOR" | "CRYPTO_ALT";
export type TradingMode = "INTRADAY" | "SWING";
export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

/** Rollout phases — each is a Go/No-Go gate; LIVE has no broker adapter wired yet. */
export type TradingPhase = "BACKTEST" | "SHADOW" | "PAPER" | "LIVE";

export type Bar = {
  /** Bar open time, epoch ms (UTC). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Volume in base units. */
  v: number;
};

export type AgentDecision = "ENTER" | "SKIP";
export type AgentConfidence = "LOW" | "MEDIUM" | "HIGH";
export type RiskMultiplier = 0 | 0.5 | 0.75 | 1;

/** Track = which decision-maker the trade represents (for shadow comparison). */
export type TradeTrack = "DETERMINISTIC" | "AGENT";
/** Execution = where the trade lives. SHADOW trades are simulated forward on real bars, never sent anywhere. */
export type TradeExecution = "BACKTEST" | "SHADOW" | "PAPER" | "LIVE";

export type PositionState = "PENDING" | "OPEN" | "RISK_FREE" | "CLOSED" | "CANCELLED";
export type ExitReason =
  | "STOP"
  | "TARGET"
  | "BREAKEVEN"
  | "TRAIL"
  | "REGIME_FLIP"
  | "EARNINGS"
  | "MANUAL"
  | "KILL_SWITCH"
  | "TIME_STOP";
/** What happens to the remaining half after the 1R partial exit. */
export type ExitPlan = "TARGET_2R" | "TRAIL_2ATR" | "STRUCTURAL";

export type UniverseSymbol = {
  symbol: string;
  asset_class: AssetClass;
  /** Provider-specific ticker, e.g. BTCUSDT for Binance. */
  provider_symbol: string;
};

export type VolatilityTier = "LOW" | "MID" | "HIGH";
export type LiquidityTier = "TIER_1" | "TIER_2";

export type IndicatorSnapshot = {
  close: number;
  ema20: number;
  ema50: number;
  rsi: number;
  prev_rsi: number;
  atr: number;
  atr_pct: number;
  relative_volume: number;
  swing_low: number | null;
  swing_high: number | null;
  prev_high: number;
  trend_close: number;
  trend_ema200: number;
  trend_ema200_slope: number;
  trend_adx: number;
  market_regime_ok: boolean;
  room_to_resistance_r: number | null;
};

export type TradePlan = {
  entry: number;
  stop: number;
  target: number;
  stop_distance: number;
  size: number;
  risk_amount: number;
  notional: number;
  size_reduced_for_exposure: boolean;
};
