import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getDashboardOverview } from "@/lib/trading/service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    return NextResponse.json(await getDashboardOverview());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "dashboard_failed" }, { status: 500 });
  }
}
