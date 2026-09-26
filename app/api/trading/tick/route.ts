import { NextRequest, NextResponse } from "next/server";
import { isSchedulerAuthorized } from "@/lib/trading/scheduler-auth";
import { runTick } from "@/lib/trading/engine";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 300;

/** Trading pipeline tick — every 15 minutes: Supabase pg_cron job `trading-tick` (GitHub Actions trading-tick.yml as a backup). */
const handle = withRouteHandler(async function handle(req: NextRequest) {
  if (!(await isSchedulerAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runTick());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "tick_failed" }, { status: 500 });
  }
});

export const GET = handle;
export const POST = handle;
