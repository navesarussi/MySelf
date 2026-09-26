import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, dbError, unauthorized } from "@/lib/api/auth";
import { GOOGLE_GMAIL_PROVIDER } from "@/lib/integrations/google-config";
import { userDb } from "@/lib/db/user-db";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const DELETE = withRouteHandler(async function DELETE(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const { error } = await (await userDb())
    .from("integration_tokens")
    .delete()
    .eq("provider", GOOGLE_GMAIL_PROVIDER);

  if (error) return dbError("disconnect_failed");

  return NextResponse.json({ success: true });
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  return DELETE(req);
});
