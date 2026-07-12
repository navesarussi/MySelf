import { NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/integrations/google-calendar/client";
import { googleConfigured } from "@/lib/integrations/google-config";
import { setOAuthState } from "@/lib/integrations/oauth-state";

export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  const state = crypto.randomUUID();
  await setOAuthState(state);
  return NextResponse.redirect(googleAuthUrl(state));
}
