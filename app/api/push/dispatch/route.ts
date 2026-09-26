import { NextRequest, NextResponse } from "next/server";
import {
  dispatchHabits,
  dispatchRelationships,
  dispatchTasks,
  dispatchTimeline,
} from "@/lib/push/dispatch";
import { jerusalemParts } from "@/lib/push/time";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { forEachAccount } from "@/lib/db/accounts";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 60;

/**
 * Push dispatch cron (Hobby: a few daily slots, not hourly).
 * Relationships/tasks/timeline fire at hour === 8 Jerusalem; habits on each run.
 */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { hour, dayKey } = jerusalemParts(now);

  // Each account gets its own digest from its own rows, sent to its own devices.
  const accounts = await forEachAccount(async () => {
    const results: Record<string, unknown> = {};
    // Morning digest slot (08:00 Jerusalem) for relationships / tasks / timeline
    if (hour === 8) {
      results.relationships = await dispatchRelationships(now);
      results.tasks = await dispatchTasks(now);
      results.timeline = await dispatchTimeline(now);
    }
    results.habits = await dispatchHabits(now);
    return results;
  });

  for (const run of accounts) {
    if (!run.ok) console.error("[push-dispatch]", run.email, run.error);
  }
  const ok = accounts.every((run) => run.ok);
  return NextResponse.json({ ok, dayKey, hour, accounts }, { status: ok ? 200 : 500 });
});
