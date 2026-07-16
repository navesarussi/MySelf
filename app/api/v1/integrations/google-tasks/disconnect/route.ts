import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, dbError, unauthorized } from "@/lib/api/auth";
import { GOOGLE_TASKS_PROVIDER } from "@/lib/integrations/google-config";
import { getSupabase } from "@/lib/supabase";

export async function DELETE(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const { error } = await getSupabase()
    .from("integration_tokens")
    .delete()
    .eq("provider", GOOGLE_TASKS_PROVIDER);

  if (error) return dbError("disconnect_failed");

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  return DELETE(req);
}
