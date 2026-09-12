import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { parseMinZoom } from "@/lib/timeline-zoom";
import { isEventHidden } from "@/lib/timeline-display";
import { leanTimelineEventForList } from "@/lib/timeline-preview";
import { buildTimelineCursor, parseTimelineCursor } from "@/lib/timeline-pagination";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { TimelineEvent } from "@/lib/types";

const DEFAULT_PAGE_SIZE = 1500;
const MAX_PAGE_SIZE = 3000;

function revalidateTimelinePaths() {
  revalidatePath("/timeline");
  revalidatePath("/");
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(
    Math.max(Number(sp.get("limit") ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE
  );
  const cursorRaw = sp.get("cursor");
  const cursor = cursorRaw ? parseTimelineCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) return badRequest("invalid_cursor");

  let query = getSupabase()
    .from("timeline_events")
    .select(
      "id, event_date, event_time, title, description, category, min_zoom, source, google_event_id, title_override, description_override, hidden_at, synced_at, created_at"
    )
    .is("hidden_at", null)
    .order("event_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(
      `event_date.lt.${cursor.date},and(event_date.eq.${cursor.date},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) return dbError();
  const events = ((data as TimelineEvent[]) || [])
    .filter((e) => !isEventHidden(e))
    .map(leanTimelineEventForList);
  const last = events[events.length - 1];
  const nextCursor =
    events.length === limit && last ? buildTimelineCursor(last) : null;
  return NextResponse.json({ events, nextCursor });
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const event_date = str(body.event_date);
  const title = str(body.title);
  if (!event_date || !title) return badRequest("date_and_title_required");

  const { data, error } = await getSupabase()
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
}
