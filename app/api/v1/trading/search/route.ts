import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { findBestTrade } from "@/lib/trading/trade-finder";

export const maxDuration = 120;

/** "Search trade": scan the intraday universe now and return the agent-planned best options (a short-lived proposal). */
export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    const result = await findBestTrade();
    // Bars fed to the agent stay server-side (they are stored with the proposal for the journal).
    return NextResponse.json({ ...result, options: result.options.map(({ rating_input: _omit, ...o }) => o) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "search_failed" }, { status: 500 });
  }
}
