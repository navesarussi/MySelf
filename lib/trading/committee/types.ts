import { z } from "zod";
import type { AssetClass, RiskMultiplier } from "../types";

/** Committee pipeline strategies — deterministic scanner sources only. */
export const committeeStrategySchema = z.enum(["V2_SWING", "DAILY_TREND", "INTRADAY", "MANUAL_FINDER"]);
export type CommitteeStrategy = z.infer<typeof committeeStrategySchema>;

/** Ticket asset class — extends live AssetClass with ETF for future scanners. */
export const ticketAssetClassSchema = z.enum(["STOCK", "ETF", "CRYPTO_MAJOR", "CRYPTO_ALT"]);
export type TicketAssetClass = z.infer<typeof ticketAssetClassSchema>;

export const targetMenuItemSchema = z.object({
  price: z.number().positive(),
  rr: z.number().min(2),
  kind: z.string().max(64),
});
export type TargetMenuItem = z.infer<typeof targetMenuItemSchema>;

const featureValueSchema = z.union([z.number(), z.null()]);
const regimeValueSchema = z.union([z.number(), z.boolean(), z.null()]);

/** L1 output — normalized deterministic candidate from any scanner. */
export const opportunityTicketSchema = z.object({
  id: z.string().min(8).max(64),
  symbol: z.string().min(1).max(32),
  asset_class: ticketAssetClassSchema,
  strategy: committeeStrategySchema,
  side: z.literal("LONG"),
  bar_time: z.string().datetime(),
  entry: z.number().positive(),
  stop: z.number().positive(),
  target_menu: z.array(targetMenuItemSchema).min(1).max(8),
  score: z.number().min(0).max(100),
  features: z.record(z.string(), featureValueSchema),
  regime: z.record(z.string(), regimeValueSchema),
  rationale_codes: z.array(z.string().max(64)).max(24),
});
export type OpportunityTicket = z.infer<typeof opportunityTicketSchema>;

export const analystRoleSchema = z.enum(["TECHNICAL", "FUNDAMENTAL_NEWS"]);
export type AnalystRole = z.infer<typeof analystRoleSchema>;

export const analystStanceSchema = z.enum(["BULLISH", "NEUTRAL", "BEARISH"]);
export type AnalystStance = z.infer<typeof analystStanceSchema>;

export const analystHorizonSchema = z.enum(["INTRADAY", "SWING", "POSITION"]);
export type AnalystHorizon = z.infer<typeof analystHorizonSchema>;

export const analystEvidenceSchema = z.object({
  source: z.string().max(120),
  ref: z.string().max(240),
});

/** L2 analyst output — interprets provided numbers/text only. */
export const analystReportSchema = z.object({
  role: analystRoleSchema,
  symbol: z.string().min(1).max(32),
  stance: analystStanceSchema,
  confidence: z.number().int().min(1).max(5),
  key_points: z.array(z.string().max(400)).max(6),
  evidence: z.array(analystEvidenceSchema).max(12),
  risks: z.array(z.string().max(400)).max(8),
  horizon: analystHorizonSchema,
  model: z.string().max(120),
  prompt_version: z.string().max(64),
});
export type AnalystReport = z.infer<typeof analystReportSchema>;

export const debateWinnerSchema = z.enum(["BULL", "BEAR", "SPLIT"]);
export type DebateWinner = z.infer<typeof debateWinnerSchema>;

/** L3 debate synthesis — facilitator output; never increases size. */
export const debateSynthesisSchema = z.object({
  winner: debateWinnerSchema,
  conviction: z.number().int().min(1).max(5),
  bull_case: z.array(z.string().max(400)).max(8),
  bear_case: z.array(z.string().max(400)).max(8),
  unresolved: z.array(z.string().max(400)).max(8),
  recommended_action: z.enum(["ENTER", "SKIP"]),
});
export type DebateSynthesis = z.infer<typeof debateSynthesisSchema>;

export const softRiskMultiplierSchema = z.union([
  z.literal(0),
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1),
]);
export type SoftRiskMultiplier = z.infer<typeof softRiskMultiplierSchema>;

export const stopPolicySchema = z.enum(["KEEP", "TIGHTEN"]);
export type StopPolicy = z.infer<typeof stopPolicySchema>;

/** Raw LLM output — multiplier is snapped in `enforceSoftRiskOpinion`. */
export const rawSoftRiskOpinionSchema = z.object({
  allow: z.boolean(),
  risk_multiplier: z.number(),
  stop_policy: stopPolicySchema,
  tightened_stop: z.number().positive().optional(),
  max_hold_hint_hours: z.number().int().positive().max(24 * 90).optional(),
  reasons: z.array(z.string().max(400)).max(10),
  red_flags: z.array(z.string().max(400)).max(10),
});
export type RawSoftRiskOpinion = z.infer<typeof rawSoftRiskOpinionSchema>;

/** L4 soft risk — enforced form with snapped multiplier. */
export const softRiskOpinionSchema = rawSoftRiskOpinionSchema.extend({
  risk_multiplier: softRiskMultiplierSchema,
});
export type SoftRiskOpinion = z.infer<typeof softRiskOpinionSchema>;

export const marketStateSchema = z.enum(["OPEN", "CLOSED", "HALTED", "UNKNOWN"]);
export type MarketState = z.infer<typeof marketStateSchema>;

/** L5 hard risk certificate — code-only, fail-closed; UNKNOWN market blocks. */
export const riskCertificateSchema = z.object({
  ok: z.boolean(),
  blocks: z.array(z.string().max(64)),
  final_qty: z.number().nonnegative(),
  final_entry: z.number().positive(),
  final_stop: z.number().positive(),
  final_target: z.number().positive(),
  risk_r: z.number().nonnegative(),
  portfolio_heat_after: z.number().nonnegative(),
  market_state: marketStateSchema,
});
export type RiskCertificate = z.infer<typeof riskCertificateSchema>;

export const executionBrokerSchema = z.enum(["ALPACA_PAPER", "ALPACA_LIVE"]);
export type ExecutionBroker = z.infer<typeof executionBrokerSchema>;

/** L6 execution intent — built only from an approved RiskCertificate. */
export const executionIntentSchema = z.object({
  ticket_id: z.string().min(8).max(64),
  certificate_id: z.string().min(8).max(64),
  broker: executionBrokerSchema,
  order_type: z.enum(["LIMIT", "MARKET"]),
  qty: z.number().positive(),
  limit_price: z.number().positive().optional(),
  stop: z.number().positive(),
  target: z.number().positive(),
  client_order_id: z.string().min(8).max(128),
  audit_ref: z.string().min(8).max(128),
});
export type ExecutionIntent = z.infer<typeof executionIntentSchema>;

/** Map live AssetClass to ticket asset class (committee adapters use this). */
export function assetClassToTicket(asset: AssetClass): TicketAssetClass {
  return asset;
}

/** RiskMultiplier and SoftRiskMultiplier share the same allowed set. */
export function isSoftRiskMultiplier(x: number): x is SoftRiskMultiplier {
  return x === 0 || x === 0.5 || x === 0.75 || x === 1;
}

export function toRiskMultiplier(x: SoftRiskMultiplier): RiskMultiplier {
  return x;
}
