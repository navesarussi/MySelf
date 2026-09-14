import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getDashboard } from "@/lib/trading/service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    return NextResponse.json(await getDashboard());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "dashboard_failed" }, { status: 500 });
  }
}
