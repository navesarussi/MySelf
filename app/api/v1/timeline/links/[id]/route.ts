import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const { error } = await getSupabase().from("timeline_event_links").delete().eq("id", id);
  if (error) return dbError();
  return NextResponse.json({ ok: true });
}
