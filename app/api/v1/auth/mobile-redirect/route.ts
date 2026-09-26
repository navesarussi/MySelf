import { NextRequest, NextResponse } from "next/server";
import { sessionIdentity, unauthorized } from "@/lib/api/auth";
import { makeSessionToken } from "@/lib/auth";
import { appendTokenToRedirect, isAllowedAppRedirect } from "@/lib/integrations/mobile-redirect";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/** Final hop of the mobile Google sign-in flow.
 *
 *  The app opens /api/auth/google/login?next=/api/v1/auth/mobile-redirect&app_redirect=…
 *  in the system browser. The existing OAuth callback sets the session cookie and
 *  redirects here; we hand the session token back to the app through its deep-link
 *  scheme (exp:// in Expo Go, myself:// in production builds). */
const DEFAULT_SCHEME = "myself://auth";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return unauthorized();
  // The token handed to the app names the account, so this hop needs the
  // identity, not just "some valid session". The Google callback that redirects
  // here has just set an identity-bearing cookie; an anonymous legacy session
  // cannot mint one, and signing in again is the correct answer for it.
  const identity = await sessionIdentity(req);
  if (!identity) return unauthorized();
  const token = await makeSessionToken(secret, identity.sub);

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ token });
  }

  const appRedirect = req.nextUrl.searchParams.get("app_redirect");
  const target =
    appRedirect && isAllowedAppRedirect(appRedirect)
      ? appendTokenToRedirect(appRedirect, token)
      : appendTokenToRedirect(DEFAULT_SCHEME, token);

  return NextResponse.redirect(target);
});
