import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getAnalytics } from "@/lib/trading/service";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const p = req.nextUrl.searchParams;
  const days = Number(p.get("days") ?? 0);
  try {
    return NextResponse.json(
      await getAnalytics({
        execution: p.get("execution") || undefined,
        track: p.get("track") || undefined,
        sinceIso: days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
      })
    );
  } catch {
    return dbError();
  }
}
