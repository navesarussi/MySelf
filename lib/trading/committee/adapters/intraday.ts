import { iso } from "../../tick-context";
import type { TfSeries } from "../../strategy/series";
import type { IntradayCandidate } from "../../strategy/intraday";
import type { AssetClass } from "../../types";
import { opportunityTicketId } from "../ids";
import { parseOpportunityTicket, type ParseResult } from "../helpers";
import type { OpportunityTicket } from "../types";
import { assetClassToTicket } from "../types";
import { committeeFeaturesFromSeries } from "./feature-build";

function rationaleCodes(c: IntradayCandidate): string[] {
  return [c.setup, "INTRADAY_CONFIRMED"].slice(0, 24);
}

/**
 * Map intraday tick `IntradayCandidate` → `OpportunityTicket` (INTRADAY strategy).
 * `bar_time` is the ISO open of the closed 15m setup bar — same key as `trading_triggers.bar_time`
 * for mode INTRADAY (`iso(setup_bar_time)` in `intraday-engine.ts`).
 */
export function intradayToOpportunityTicket(input: {
  candidate: IntradayCandidate;
  s15: TfSeries;
  symbol: string;
  assetClass: AssetClass;
}): ParseResult<OpportunityTicket> {
  const { candidate: c, s15, symbol, assetClass } = input;
  const barIndex = s15.bars.findIndex((b) => b.t === c.setup_bar_time);
  if (barIndex < 0) return { ok: false, error: "SETUP_BAR_NOT_FOUND" };
  if (!(c.stop < c.entry) || !(c.target > c.entry) || c.rr < 2) {
    return { ok: false, error: "INVALID_GEOMETRY" };
  }

  const barTimeIso = iso(c.setup_bar_time);
  const features = committeeFeaturesFromSeries(s15, barIndex, {
    relative_strength: null,
    squeeze_pct: null,
  });
  if (c.features.rsi15 !== null) features.rsi = c.features.rsi15;
  if (c.features.atr15_pct !== null) features.atr_pct = c.features.atr15_pct;

  const id = opportunityTicketId(symbol, "INTRADAY", barTimeIso);

  return parseOpportunityTicket({
    id,
    symbol,
    asset_class: assetClassToTicket(assetClass),
    strategy: "INTRADAY",
    side: "LONG",
    bar_time: barTimeIso,
    entry: c.entry,
    stop: c.stop,
    target_menu: [{ price: c.target, rr: c.rr, kind: "STRUCTURAL" }],
    score: c.score,
    features,
    regime: {
      above_ema200_15m: c.features.above_ema200_15m,
      ema50_above_ema200_15m: c.features.ema50_above_ema200_15m,
    },
    rationale_codes: rationaleCodes(c),
  });
}
