import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeMondayCode,
  fetchMondayAccount,
} from "@/lib/integrations/task-sources/monday/client";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import { appendTokenToRedirect } from "@/lib/integrations/mobile-redirect";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "monday_oauth_app_redirect";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext();

  if (error) {
    setFlashCookie(jar, "Monday connection cancelled", "error");
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "Invalid OAuth state — try again", "error");
    return NextResponse.redirect(new URL(next, url.origin));
  }

  try {
    const tokens = await exchangeMondayCode(code);
    const account = await fetchMondayAccount(tokens.access_token);
    const existing = await getIntegrationToken(MONDAY_PROVIDER, account.id);
    const prev = existing?.settings ?? {};

    await saveIntegrationToken({
      provider: MONDAY_PROVIDER,
      account_key: account.id,
      access_token: tokens.access_token,
      refresh_token: null,
      expires_at: null,
      settings: {
        selected_list_ids: (prev.selected_list_ids as string[] | undefined) ?? [],
        pull_completed: prev.pull_completed ?? "none",
        account_name: account.name,
        account_slug: account.slug,
      },
    });

    const appRedirect = jar.get(APP_REDIRECT_COOKIE)?.value;
    jar.delete(APP_REDIRECT_COOKIE);

    if (appRedirect) {
      const secret = process.env.AUTH_SECRET;
      if (!secret) throw new Error("auth_secret_missing");

      const sessionToken = jar.get("session")?.value;
      if (!sessionToken) throw new Error("session_missing");

      return NextResponse.redirect(appendTokenToRedirect(appRedirect, sessionToken));
    }

    setFlashCookie(jar, "Monday connected — select boards to sync");
    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    setFlashCookie(jar, "Monday connection failed", "error");
    return NextResponse.redirect(new URL(next, url.origin));
  }
}
