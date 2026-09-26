import { NextRequest, NextResponse } from "next/server";
import { isSchedulerAuthorized } from "@/lib/trading/scheduler-auth";
import { runIntradayTick } from "@/lib/trading/intraday-engine";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 120;

/** Intraday (15m setup / 5m entry) tick — pg_cron job `trading-intraday-tick`, 1 minute after every 5m close (1-59/5). */
const handle = withRouteHandler(async function handle(req: NextRequest) {
  if (!(await isSchedulerAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runIntradayTick());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "intraday_tick_failed" }, { status: 500 });
  }
});

export const GET = handle;
export const POST = handle;
