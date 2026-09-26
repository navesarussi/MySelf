import { NextRequest, NextResponse } from "next/server";
import { denyUnlessPrimary } from "@/lib/api/auth";
import { findBestTrade } from "@/lib/trading/trade-finder";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 120;

/** "Search trade": scan the intraday universe now and return the agent-planned best options (a short-lived proposal). */
export const POST = withRouteHandler(async function POST(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    const result = await findBestTrade();
    const options = (result.options ?? []).map(({ rating_input: _omit, ...o }) => o);
    // Bars fed to the agent stay server-side (they are stored with the proposal for the journal).
    return NextResponse.json({ ...result, options, errors: result.errors ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "search_failed" }, { status: 500 });
  }
});
