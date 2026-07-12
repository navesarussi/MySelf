import { NextRequest, NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/integrations/google-calendar/client";
import { googleAuthConfigured } from "@/lib/integrations/google-config";
import { setOAuthState } from "@/lib/integrations/oauth-state";

export async function GET(req: NextRequest) {
  if (!googleAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const state = crypto.randomUUID();
  await setOAuthState(state, next);
  return NextResponse.redirect(googleAuthUrl(state, "login"));
}
