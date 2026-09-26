import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { parseMinZoom } from "@/lib/timeline-zoom";
import { leanTimelineEventForList, TIMELINE_LIST_COLUMNS } from "@/lib/timeline-preview";
import { fetchAllRowsParallel } from "@/lib/db/paginate";
import { parseTimelineCursor } from "@/lib/timeline-pagination";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { TimelineEvent } from "@/lib/types";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function revalidateTimelinePaths() {
  revalidatePath("/timeline");
  revalidatePath("/");
}

/**
 * The whole timeline, in one response.
 *
 * This used to return one page of `limit` (1500) rows and a cursor only when a
 * page came back full. PostgREST caps a response at 1000 rows, so no page was
 * ever full: the app got the newest 1000 events and was told there were no
 * more, and everything older (3000 of 4000 events, back to 2002) silently
 * never showed. Now rows are paged here, under the cap, and the app receives
 * all of them. `nextCursor` is always null, which is also correct for app
 * builds that still walk pages; `cursor` is still honored for them.
 */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const cursorRaw = req.nextUrl.searchParams.get("cursor");
  const cursor = cursorRaw ? parseTimelineCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) return badRequest("invalid_cursor");

  const db = await userDb();
  try {
    const rows = await fetchAllRowsParallel<TimelineEvent>(async (from, to, withCount) => {
      let query = db
        .from("timeline_events")
        .select(TIMELINE_LIST_COLUMNS, withCount ? { count: "exact" } : undefined)
        .is("hidden_at", null)
        .order("event_date", { ascending: false })
        .order("id", { ascending: false });
      if (cursor) {
        query = query.or(
          `event_date.lt.${cursor.date},and(event_date.eq.${cursor.date},id.lt.${cursor.id})`
        );
      }
      const { data, error, count } = await query.range(from, to);
      return { data: data as TimelineEvent[] | null, error, count };
    });
    return NextResponse.json({ events: rows.map(leanTimelineEventForList), nextCursor: null });
  } catch {
    return dbError();
  }
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const event_date = str(body.event_date);
  const title = str(body.title);
  if (!event_date || !title) return badRequest("date_and_title_required");

  const { data, error } = await (await userDb())
    .from("timeline_events")
    .insert({
      event_date,
      event_time: optStr(body.event_time),
      title,
      description: optStr(body.description),
      category: optStr(body.category),
      min_zoom: parseMinZoom(str(body.min_zoom)),
      source: "manual",
    })
    .select()
    .single();
  if (error) return dbError();
  revalidateTimelinePaths();
  return NextResponse.json(data, { status: 201 });
});
