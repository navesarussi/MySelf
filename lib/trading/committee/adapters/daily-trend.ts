import { iso } from "../../tick-context";
import { round } from "../../round";
import type { DailyCandidate } from "../../strategy/daily-trend";
import { opportunityTicketId } from "../ids";
import { parseOpportunityTicket, type ParseResult } from "../helpers";
import type { OpportunityTicket, TicketAssetClass } from "../types";
import { assetClassToTicket } from "../types";
import { committeeFeaturesFromSeries } from "./feature-build";

function ticketAssetClass(c: DailyCandidate): TicketAssetClass {
  if (c.group === "ETF") return "ETF";
  return assetClassToTicket(c.a.asset_class);
}

function rationaleCodes(c: DailyCandidate): string[] {
  const codes = ["DAILY_BREAKOUT", c.group];
  if (c.rs !== null && c.rs > 0.5) codes.push("RS_STRONG");
  if (c.room !== null && c.room >= 2) codes.push("ROOM_2R");
  if (c.features.squeeze_pct !== null && c.features.squeeze_pct <= 0.5) codes.push("SQUEEZE");
  return codes.slice(0, 24);
}

/** Map `scan-daily-trend` `DailyCandidate` → `OpportunityTicket`. */
export function dailyTrendToOpportunityTicket(input: {
  candidate: DailyCandidate;
  score: number;
}): ParseResult<OpportunityTicket> {
  const { candidate: c, score } = input;
  const risk = c.entry - c.stop;
  if (!(risk > 0)) return { ok: false, error: "INVALID_STOP_DISTANCE" };

  const rr = round((c.target - c.entry) / risk, 2);
  const barTimeIso = iso(c.t);
  const features = committeeFeaturesFromSeries(c.a.d1, c.i, {
    relative_strength: c.rs,
    squeeze_pct: c.features.squeeze_pct,
  });
  const id = opportunityTicketId(c.symbol, "DAILY_TREND", barTimeIso);

  return parseOpportunityTicket({
    id,
    symbol: c.symbol,
    asset_class: ticketAssetClass(c),
    strategy: "DAILY_TREND",
    side: "LONG",
    bar_time: barTimeIso,
    entry: c.entry,
    stop: c.stop,
    target_menu: [{ price: c.target, rr: Math.max(2, rr), kind: c.room !== null ? "STRUCTURAL" : "OPEN" }],
    score,
    features: {
      ...features,
      rsi: c.features.rsi,
      adx: c.features.adx,
      atr_pct: c.features.atr_pct,
      relative_strength: c.rs,
      squeeze_pct: c.features.squeeze_pct,
    },
    regime: {
      reference_margin: c.features.reference_margin,
      days_above_sma200: c.features.days_above_sma200,
      dist_sma200_atr: c.features.dist_sma200_atr,
    },
    rationale_codes: rationaleCodes(c),
  });
}
