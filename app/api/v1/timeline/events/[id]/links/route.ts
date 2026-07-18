import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, notFound, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { TimelineEventLinkKind } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const LINK_KINDS: TimelineEventLinkKind[] = ["image", "note", "link"];

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const { data, error } = await getSupabase()
    .from("timeline_event_links")
    .select("*")
    .eq("event_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return dbError();
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const body = await readJson(req);
  const kind = str(body.kind) as TimelineEventLinkKind;
  const url = optStr(body.url);
  const content = optStr(body.content);
  if (!LINK_KINDS.includes(kind)) return badRequest("invalid_kind");
  if ((kind === "image" || kind === "link") && !url) return badRequest("url_required");
  if (kind === "note" && !content) return badRequest("content_required");

  const supabase = getSupabase();
  const { data: event } = await supabase
    .from("timeline_events")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!event) return notFound();

  const { data, error } = await supabase
    .from("timeline_event_links")
    .insert({ event_id: id, kind, url, content })
    .select()
    .single();
  if (error) return dbError();
  return NextResponse.json(data, { status: 201 });
}
