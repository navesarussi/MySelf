import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleTasksCode } from "@/lib/integrations/task-sources/google-tasks/client";
import { GOOGLE_TASKS_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import {
  appendTokenToRedirect,
  isAllowedAppRedirect,
} from "@/lib/integrations/mobile-redirect";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "google_tasks_oauth_app_redirect";

function redirectToAppOrNext(
  jar: Awaited<ReturnType<typeof cookies>>,
  url: NextRequest["nextUrl"],
  next: string
) {
  const appRedirect = jar.get(APP_REDIRECT_COOKIE)?.value;
  jar.delete(APP_REDIRECT_COOKIE);
  if (appRedirect && isAllowedAppRedirect(appRedirect)) {
    const sessionToken = jar.get("session")?.value;
    const target = sessionToken
      ? appendTokenToRedirect(appRedirect, sessionToken)
      : appRedirect;
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext();

  if (error) {
    setFlashCookie(jar, "Google Tasks connection cancelled", "error");
    return redirectToAppOrNext(jar, url, next);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "Invalid OAuth state — try again", "error");
    return redirectToAppOrNext(jar, url, next);
  }

  try {
    const tokens = await exchangeGoogleTasksCode(code);
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

    setFlashCookie(jar, "Google Tasks connected — select lists to sync");
    return redirectToAppOrNext(jar, url, next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "missing_refresh_token") {
      setFlashCookie(jar, "Connection failed — try again (full approval required)", "error");
    } else if (msg.startsWith("token_exchange_failed")) {
      setFlashCookie(jar, "OAuth error — check Redirect URI in Google Console", "error");
    } else {
      setFlashCookie(jar, "Google Tasks connection failed", "error");
    }
    return redirectToAppOrNext(jar, url, next);
  }
}
