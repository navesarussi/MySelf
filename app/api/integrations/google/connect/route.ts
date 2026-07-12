import { NextRequest, NextResponse } from "next/server";

/** Redirects to unified Google login flow */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/api/auth/google/login", req.url));
}
