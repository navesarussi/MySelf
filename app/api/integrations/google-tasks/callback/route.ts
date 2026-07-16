import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/integrations/task-sources/google-tasks/client";
import { GOOGLE_TASKS_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import { appendTokenToRedirect } from "@/lib/integrations/mobile-redirect";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "google_tasks_oauth_app_redirect";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext();

  if (error) {
    setFlashCookie(jar, "Google Tasks connection cancelled", "error");
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "Invalid OAuth state — try again", "error");
    return NextResponse.redirect(new URL(next, url.origin));
  }

  try {
    const tokens = await exchangeCode(code);
    const existing = await getIntegrationToken(GOOGLE_TASKS_PROVIDER);
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token;

    if (!refreshToken) {
      throw new Error("missing_refresh_token");
    }

    await saveIntegrationToken({
      provider: GOOGLE_TASKS_PROVIDER,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      settings: existing?.settings ?? { selected_list_ids: [], pull_completed: "none" },
    });

    const appRedirect = jar.get(APP_REDIRECT_COOKIE)?.value;
    jar.delete(APP_REDIRECT_COOKIE);

    if (appRedirect) {
      const secret = process.env.AUTH_SECRET;
      if (!secret) throw new Error("auth_secret_missing");

      const sessionToken = jar.get("session")?.value;
      if (!sessionToken) throw new Error("session_missing");

      const redirectWithToken = appendTokenToRedirect(appRedirect, sessionToken);
      return NextResponse.redirect(redirectWithToken);
    }

    setFlashCookie(jar, "Google Tasks connected — select lists to sync");
    return NextResponse.redirect(new URL(next, url.origin));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "missing_refresh_token") {
      setFlashCookie(jar, "Connection failed — try again (full approval required)", "error");
    } else if (msg.startsWith("token_exchange_failed")) {
      setFlashCookie(jar, "OAuth error — check Redirect URI in Google Console", "error");
    } else {
      setFlashCookie(jar, "Google Tasks connection failed", "error");
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }
}
