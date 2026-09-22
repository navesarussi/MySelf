import { NextRequest, NextResponse } from "next/server";
import { isTradingCronAuthorized } from "@/lib/api/cron-auth";
import { runTick } from "@/lib/trading/engine";

export const maxDuration = 300;

/** Trading pipeline tick — called every 15 minutes by .github/workflows/trading-tick.yml. */
async function handle(req: NextRequest) {
  if (!isTradingCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runTick());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "tick_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
