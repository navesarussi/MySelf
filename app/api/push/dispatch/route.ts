import { NextRequest, NextResponse } from "next/server";
import {
  dispatchHabits,
  dispatchRelationships,
  dispatchTasks,
  dispatchTimeline,
} from "@/lib/push/dispatch";
import { jerusalemParts } from "@/lib/push/time";

export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

/**
 * Push dispatch cron (Hobby: a few daily slots, not hourly).
 * Relationships/tasks/timeline fire at hour === 8 Jerusalem; habits on each run.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { hour, dayKey } = jerusalemParts(now);
  const results: Record<string, unknown> = { dayKey, hour };

  try {
    // Morning digest slot (08:00 Jerusalem) for relationships / tasks / timeline
    if (hour === 8) {
      results.relationships = await dispatchRelationships(now);
      results.tasks = await dispatchTasks(now);
      results.timeline = await dispatchTimeline(now);
    }
    results.habits = await dispatchHabits(now);

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const code = err instanceof Error ? err.message : "dispatch_failed";
    console.error("[push-dispatch]", code);
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
