import { H4, iso } from "../../tick-context";
import { closedIdx } from "../../strategy/series";
import type { Candidate, MarketContext, SymbolFrames } from "../../strategy/candidates";
import { opportunityTicketId } from "../ids";
import { parseOpportunityTicket, type ParseResult } from "../helpers";
import type { OpportunityTicket } from "../types";
import { assetClassToTicket } from "../types";
import { committeeFeaturesFromSeries } from "./feature-build";

function rationaleCodes(c: Candidate): string[] {
  const codes: string[] = [c.setup];
  for (const [k, v] of Object.entries(c.factors)) {
    if (typeof v === "number" && v > 0) codes.push(k.toUpperCase());
  }
  return codes.slice(0, 24);
}

/** Map scan-v2 `Candidate` → `OpportunityTicket` (bar_time matches `trading_triggers` upsert). */
export function v2SwingToOpportunityTicket(input: {
  candidate: Candidate;
  frames: SymbolFrames;
  market: MarketContext;
}): ParseResult<OpportunityTicket> {
  const { candidate: c, frames: f, market } = input;
  const i4 = closedIdx(f.h4, c.t);
  if (i4 < 0) return { ok: false, error: "NO_CLOSED_4H_BAR" };

  const barTimeIso = iso(c.t - H4);
  const features = committeeFeaturesFromSeries(f.h4, i4, {
    relative_strength: market.rs_rank,
    squeeze_pct: typeof c.factors.squeeze_pct === "number" ? c.factors.squeeze_pct : null,
  });
  const id = opportunityTicketId(c.symbol, "V2_SWING", barTimeIso);

  return parseOpportunityTicket({
    id,
    symbol: c.symbol,
    asset_class: assetClassToTicket(c.asset_class),
    strategy: "V2_SWING",
    side: "LONG",
    bar_time: barTimeIso,
    entry: c.entry,
    stop: c.stop,
    target_menu: c.target_menu,
    score: c.score,
    features,
    regime: {
      reference_ok: market.reference_ok,
      rs_rank: market.rs_rank,
      breadth: market.breadth,
    },
    rationale_codes: rationaleCodes(c),
  });
}
