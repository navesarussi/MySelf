import { RISK_ENVELOPE } from "../config";
import { openRiskR, type SimPosition } from "../position";
import type { EnvelopeState } from "../risk-envelope";
import { buildTradePlan } from "../sizing";
import type { AssetClass } from "../types";
import type { EnforcedSoftRisk } from "./helpers";
import { parseRiskCertificate, type ParseResult } from "./helpers";
import { debateDefaultAction } from "./invariants";
import type { DebateSynthesis, MarketState, OpportunityTicket, RiskCertificate } from "./types";

export type HardRiskInput = {
  ticket: OpportunityTicket;
  assetClass: AssetClass;
  envelope: EnvelopeState;
  vetoes: string[];
  envelopeBlocks: string[];
  softRisk: EnforcedSoftRisk;
  debate: DebateSynthesis;
  equity: number;
  riskScale: number;
  targetIndex?: number;
  maxNotional?: number;
};

export function resolveMarketState(vetoes: string[]): MarketState {
  if (vetoes.includes("MARKET_CLOSED")) return "CLOSED";
  return "OPEN";
}

/** Code-only hard risk gate — final authority before any execution intent. */
export function issueRiskCertificate(input: HardRiskInput): ParseResult<RiskCertificate> {
  const blocks: string[] = [];
  for (const v of input.vetoes) blocks.push(`VETO:${v}`);
  for (const b of input.envelopeBlocks) blocks.push(b);

  const market_state = resolveMarketState(input.vetoes);
  if (market_state !== "OPEN") blocks.push("MARKET_STATE");

  const debateAction = debateDefaultAction(input.debate);
  if (debateAction === "SKIP") blocks.push("DEBATE_SKIP");
  if (!input.softRisk.allow || input.softRisk.risk_multiplier === 0) blocks.push("SOFT_RISK_DENY");

  const entry = input.ticket.entry;
  let stop = input.ticket.stop;
  if (input.softRisk.stop_policy === "TIGHTEN" && input.softRisk.tightened_stop !== undefined) {
    stop = input.softRisk.tightened_stop;
  }
  const stopDistance = entry - stop;
  if (!(stopDistance > 0)) blocks.push("INVALID_GEOMETRY");

  const menuIdx = input.targetIndex ?? 0;
  const targetItem = input.ticket.target_menu[menuIdx] ?? input.ticket.target_menu[0];
  const target = targetItem.price;

  if (stopDistance > 0) {
    const rr = (target - entry) / stopDistance;
    if (rr + 1e-9 < RISK_ENVELOPE.MIN_RR_RATIO) blocks.push("MIN_RR");
  }

  const effectiveScale = input.riskScale * input.softRisk.risk_multiplier;
  const plan =
    stopDistance > 0
      ? buildTradePlan({
          entry,
          stopDistance,
          equity: input.equity,
          assetClass: input.assetClass,
          riskScale: effectiveScale,
          maxNotional: input.maxNotional,
        })
      : null;
  if (!plan && blocks.every((b) => !b.startsWith("VETO:") && b !== "DEBATE_SKIP" && b !== "SOFT_RISK_DENY")) {
    blocks.push("BUYING_POWER");
  }

  const openHeat = input.envelope.positions.reduce((s, p) => s + p.open_risk_r, 0);
  const maxRisk = RISK_ENVELOPE.MAX_RISK_PER_TRADE[input.assetClass] * input.equity;
  const risk_r = plan && maxRisk > 0 ? plan.risk_amount / maxRisk : 0;
  const portfolio_heat_after = openHeat + (plan ? risk_r : 0);

  const envelopeClear = input.envelopeBlocks.length === 0 && input.vetoes.length === 0;
  const softClear = input.softRisk.allow && input.softRisk.risk_multiplier > 0;
  const debateClear = debateAction === "ENTER";
  const ok = envelopeClear && softClear && debateClear && plan !== null && market_state === "OPEN";

  return parseRiskCertificate({
    ok,
    blocks: [...new Set(blocks)],
    final_qty: plan?.size ?? 0,
    final_entry: entry,
    final_stop: stop,
    final_target: target,
    risk_r: plan ? round(risk_r, 4) : 0,
    portfolio_heat_after: round(portfolio_heat_after, 4),
    market_state,
  });
}

function round(x: number, d: number) {
  return Math.round(x * 10 ** d) / 10 ** d;
}

/** Build envelope state from tick account snapshot. */
export function envelopeFromAccount(input: {
  equity: number;
  peakEquity: number;
  realizedToday: number;
  realizedWeek: number;
  killSwitchActive: boolean;
  entriesPaused: boolean;
  openPositions: { symbol: string; entry_limit: number; remaining_size: number; sim_state: SimPosition }[];
}): EnvelopeState {
  return {
    equity: input.equity,
    peak_equity: input.peakEquity,
    realized_r_today: input.realizedToday,
    realized_r_week: input.realizedWeek,
    kill_switch_active: input.killSwitchActive,
    entries_paused: input.entriesPaused,
    positions: input.openPositions.map((t) => ({
      symbol: t.symbol,
      notional: t.entry_limit * t.remaining_size,
      open_risk_r: openRiskR(t.sim_state),
    })),
  };
}
