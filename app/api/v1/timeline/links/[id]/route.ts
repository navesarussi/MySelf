import { NextRequest, NextResponse } from "next/server";
import { userDb } from "@/lib/db/user-db";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withRouteHandler(async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const { error } = await (await userDb()).from("timeline_event_links").delete().eq("id", id);
  if (error) return dbError();
  return NextResponse.json({ ok: true });
});
