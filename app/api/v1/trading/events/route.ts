import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getEvents } from "@/lib/trading/service";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 30), 100);
  try {
    return NextResponse.json(await getEvents(limit));
  } catch {
    return dbError();
  }
}
