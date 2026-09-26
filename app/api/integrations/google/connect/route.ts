import { NextRequest, NextResponse } from "next/server";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/** Redirects to unified Google login flow */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/api/auth/google/login", req.url));
});
