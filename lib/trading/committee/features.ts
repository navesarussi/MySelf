/**
 * Expected deterministic feature keys on OpportunityTicket.features (computed in code, never by LLM).
 * Adapters should populate as many as available; null when not computable.
 */
export const COMMITTEE_FEATURE_KEYS = [
  "rsi",
  "macd_hist",
  "macd_signal",
  "ema20",
  "ema50",
  "ema200",
  "atr",
  "atr_pct",
  "adx",
  "volume_z",
  "relative_strength",
  "squeeze_pct",
] as const;

export type CommitteeFeatureKey = (typeof COMMITTEE_FEATURE_KEYS)[number];
