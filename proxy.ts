import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/integrations/google/sync" && req.method === "POST") {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }
  }

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/integrations/google/callback") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  // REST API for the mobile app: same session token, sent as a Bearer header
  // (or the regular cookie). Unauthorized calls get JSON 401, not a redirect.
  // CORS is open (Bearer-only; browsers never attach the session cookie
  // cross-origin because responses are non-credentialed) so the app's web
  // build can talk to the API from another origin.
  if (pathname.startsWith("/api/v1")) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    };
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: cors });
    }
    const authHeader = req.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (
      secret &&
      ((await isValidSessionToken(bearer, secret)) || (await isValidSessionToken(token, secret)))
    ) {
      const res = NextResponse.next();
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: cors });
  }

  if (secret && (await isValidSessionToken(token, secret))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
