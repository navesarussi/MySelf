import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

function rewriteToSpa(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/spa/index.html";
  return NextResponse.rewrite(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/integrations/google/sync" && req.method === "POST") {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }
  }

  // Static SPA assets + Next internals — never gate
  if (
    pathname.startsWith("/spa") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/integrations/google/callback") ||
    pathname.startsWith("/api/integrations/google-tasks/callback")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  // REST API for the mobile/Expo app: Bearer (or cookie). CORS open for web SPA.
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

  // Other /api/* (server actions helpers, logout, etc.) — continue; handlers enforce auth
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Preserved Next.js website under /legacy — cookie session required
  if (pathname.startsWith("/legacy")) {
    if (pathname.startsWith("/legacy/login")) {
      return NextResponse.next();
    }
    if (secret && (await isValidSessionToken(token, secret))) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/legacy/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Public static files in /public (logo.png, etc.)
  if (pathname.includes(".") && !pathname.endsWith(".html")) {
    return NextResponse.next();
  }

  // Domain root UI → Expo SPA (auth is client-side via Bearer token)
  return rewriteToSpa(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
