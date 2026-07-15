import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { parseMinZoom } from "@/lib/timeline-zoom";
import { isEventHidden } from "@/lib/timeline-display";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { TimelineEvent } from "@/lib/types";

function revalidateTimelinePaths() {
  revalidatePath("/timeline");
  revalidatePath("/");
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase()
    .from("timeline_events")
    .select("*")
    .order("event_date", { ascending: false })
    .limit(10000);
  if (error) return dbError();
  const events = ((data as TimelineEvent[]) || []).filter((e) => !isEventHidden(e));
  return NextResponse.json(events);
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
