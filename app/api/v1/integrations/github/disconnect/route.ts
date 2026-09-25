import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, dbError, unauthorized } from "@/lib/api/auth";
import { GITHUB_PROVIDER } from "@/lib/integrations/github-config";
import { userDb } from "@/lib/db/user-db";

export async function DELETE(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const { error } = await (await userDb())
    .from("integration_tokens")
    .delete()
    .eq("provider", GITHUB_PROVIDER)
    .eq("account_key", "");

  if (error) return dbError("disconnect_failed");

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  return DELETE(req);
}
