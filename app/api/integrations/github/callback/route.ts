import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeGithubCode,
  fetchGithubUser,
} from "@/lib/integrations/task-sources/github/client";
import { GITHUB_PROVIDER } from "@/lib/integrations/github-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import {
  appendTokenToRedirect,
  isAllowedAppRedirect,
} from "@/lib/integrations/mobile-redirect";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "github_oauth_app_redirect";

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
    setFlashCookie(jar, "GitHub connection cancelled", "error");
    return redirectToAppOrNext(jar, url, next);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "Invalid OAuth state — try again", "error");
    return redirectToAppOrNext(jar, url, next);
  }

  try {
    const tokens = await exchangeGithubCode(code);
    const user = await fetchGithubUser(tokens.access_token);
    const existing = await getIntegrationToken(GITHUB_PROVIDER);

    await saveIntegrationToken({
      provider: GITHUB_PROVIDER,
      access_token: tokens.access_token,
      refresh_token: null,
      expires_at: null,
      settings: {
        ...(existing?.settings ?? {}),
        account_name: user.login,
        account_login: user.login,
      },
    });

    setFlashCookie(jar, "GitHub connected", "success");
    return redirectToAppOrNext(jar, url, next || "/settings");
  } catch (err) {
    console.error("[github-callback]", err);
    setFlashCookie(jar, "GitHub connection failed", "error");
    return redirectToAppOrNext(jar, url, next || "/settings");
  }
}
