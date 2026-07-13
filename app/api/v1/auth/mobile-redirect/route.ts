import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { makeSessionToken } from "@/lib/auth";

/** Final hop of the mobile Google sign-in flow.
 *
 *  The app opens /api/auth/google/login?next=/api/v1/auth/mobile-redirect in
 *  the system browser. The existing OAuth callback sets the session cookie and
 *  redirects here; we hand the same session token back to the app through its
 *  deep-link scheme so it can call the API with a Bearer header. */
const APP_SCHEME = "myself";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const secret = process.env.AUTH_SECRET;
  if (!secret) return unauthorized();
  const token = await makeSessionToken(secret);
  // ?format=json lets the app's web build (different origin, no deep links)
  // show the token for copy-paste sign-in.
  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ token });
  }
  return NextResponse.redirect(`${APP_SCHEME}://auth?token=${encodeURIComponent(token)}`);
}
