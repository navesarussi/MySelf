import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getTriggers } from "@/lib/trading/service";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const p = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await getTriggers({ symbol: p.get("symbol") || undefined, limit: Math.min(Number(p.get("limit") ?? 50), 200) }));
  } catch {
    return dbError();
  }
}
