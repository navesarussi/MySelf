import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { parseMinZoom } from "@/lib/timeline-zoom";
import { badRequest, dbError, isApiAuthorized, notFound, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

function revalidateTimelinePaths() {
  revalidatePath("/timeline");
  revalidatePath("/");
}

/** Same rules as the web: edits to Google-synced events become overrides;
 *  manual events are edited in place. */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const event_date = str(body.event_date);
  const title = str(body.title);
  if (!id || !event_date || !title) return badRequest("date_and_title_required");

  const supabase = getSupabase();
  const { data: existing } = await supabase.from("timeline_events").select("*").eq("id", id).maybeSingle();
  if (!existing) return notFound();

  const event_time = optStr(body.event_time);
  const description = optStr(body.description);
  const min_zoom = parseMinZoom(str(body.min_zoom));

  const patch =
    existing.source === "google_calendar"
      ? {
          event_date,
          event_time,
          min_zoom,
          title_override: title === existing.title ? null : title,
          description_override:
            description === (existing.description || null) ? null : description,
        }
      : {
          event_date,
          event_time,
          title,
          description,
          category: optStr(body.category),
          min_zoom,
        };

  const { data, error } = await supabase
    .from("timeline_events")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidateTimelinePaths();
  return NextResponse.json(data);
}

/** Manual events are deleted; Google-synced events are hidden (like the web). */
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("timeline_events")
    .select("source")
    .eq("id", id)
    .maybeSingle();

  const { error } =
    existing?.source === "google_calendar"
      ? await supabase
          .from("timeline_events")
          .update({ hidden_at: new Date().toISOString() })
          .eq("id", id)
      : await supabase.from("timeline_events").delete().eq("id", id);
  if (error) return dbError();
  revalidateTimelinePaths();
  return NextResponse.json({ ok: true, hidden: existing?.source === "google_calendar" });
}
