import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/trading/engine";

export const maxDuration = 300;

function isSchedulerAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secrets = [process.env.TRADING_CRON_SECRET, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  return secrets.some((s) => auth === `Bearer ${s}`);
}

/** Trading pipeline tick — called every 15 minutes by .github/workflows/trading-tick.yml. */
async function handle(req: NextRequest) {
  if (!isSchedulerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runTick());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "tick_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
