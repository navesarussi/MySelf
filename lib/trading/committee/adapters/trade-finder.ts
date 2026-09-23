import { iso } from "../../tick-context";
import type { TfSeries } from "../../strategy/series";
import type { FinderCandidate } from "../../trade-finder";
import { opportunityTicketId } from "../ids";
import { parseOpportunityTicket, type ParseResult } from "../helpers";
import type { OpportunityTicket } from "../types";
import { assetClassToTicket } from "../types";
import { committeeFeaturesFromSeries } from "./feature-build";

function rationaleCodes(c: FinderCandidate): string[] {
  return [c.setup, c.tier, c.asset_class].slice(0, 24);
}

/** Map `trade-finder` `FinderCandidate` → `OpportunityTicket` (MANUAL_FINDER strategy). */
export function tradeFinderToOpportunityTicket(input: {
  candidate: FinderCandidate;
  s15: TfSeries;
}): ParseResult<OpportunityTicket> {
  const { candidate: c, s15 } = input;
  if (c.setup_bar_time === null) return { ok: false, error: "MISSING_SETUP_BAR_TIME" };
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
  // Preserve intraday-specific names where the 15m series lacks them.
  if (c.features.rsi15 !== null) features.rsi = c.features.rsi15;
  if (c.features.atr15_pct !== null) features.atr_pct = c.features.atr15_pct;
  if (c.features.volume_ratio !== null) features.volume_z = null;

  const id = opportunityTicketId(c.symbol, "MANUAL_FINDER", barTimeIso);

  return parseOpportunityTicket({
    id,
    symbol: c.symbol,
    asset_class: assetClassToTicket(c.asset_class),
    strategy: "MANUAL_FINDER",
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
