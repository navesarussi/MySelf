import { NextResponse } from "next/server";
import type { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { appendTokenToRedirect, isAllowedAppRedirect } from "@/lib/integrations/mobile-redirect";

type Jar = Awaited<ReturnType<typeof cookies>>;

/**
 * Finish an OAuth callback: back into the native app when the flow started
 * there, otherwise to the in-app `next` path.
 *
 * The native app cannot read the httpOnly session cookie, so the deep link has
 * to carry the token itself. Two cases supply it:
 *   - integration connects (GitHub/Monday/Gmail/Google Tasks) — the user is
 *     already signed in, so the token comes off the request cookie;
 *   - Google login — the session is being minted by this very response, so the
 *     caller passes the fresh token in (it is not on the request yet).
 *
 * Reading the cookie under the wrong name silently dropped the token from every
 * deep link, which is why this lives in one place now.
 */
export function redirectToAppOrNext(opts: {
  jar: Jar;
  origin: string;
  next: string;
  appRedirectCookie: string;
  sessionToken?: string;
}): NextResponse {
  const { jar, origin, next, appRedirectCookie, sessionToken } = opts;
  const appRedirect = jar.get(appRedirectCookie)?.value;
  jar.delete(appRedirectCookie);

  if (appRedirect && isAllowedAppRedirect(appRedirect)) {
    const token = sessionToken ?? jar.get(SESSION_COOKIE)?.value;
    return NextResponse.redirect(token ? appendTokenToRedirect(appRedirect, token) : appRedirect);
  }
  return NextResponse.redirect(new URL(next, origin));
}
