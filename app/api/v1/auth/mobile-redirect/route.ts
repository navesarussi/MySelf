import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { makeSessionToken } from "@/lib/auth";
import { appendTokenToRedirect, isAllowedAppRedirect } from "@/lib/integrations/mobile-redirect";

/** Final hop of the mobile Google sign-in flow.
 *
 *  The app opens /api/auth/google/login?next=/api/v1/auth/mobile-redirect&app_redirect=…
 *  in the system browser. The existing OAuth callback sets the session cookie and
 *  redirects here; we hand the session token back to the app through its deep-link
 *  scheme (exp:// in Expo Go, myself:// in production builds). */
const DEFAULT_SCHEME = "myself://auth";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const secret = process.env.AUTH_SECRET;
  if (!secret) return unauthorized();
  const token = await makeSessionToken(secret);

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ token });
  }

  const appRedirect = req.nextUrl.searchParams.get("app_redirect");
  const target =
    appRedirect && isAllowedAppRedirect(appRedirect)
      ? appendTokenToRedirect(appRedirect, token)
      : appendTokenToRedirect(DEFAULT_SCHEME, token);

  return NextResponse.redirect(target);
}
