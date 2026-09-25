import { NextRequest, NextResponse } from "next/server";
import { denyUnlessPrimary } from "@/lib/api/auth";
import { getDashboardOverview } from "@/lib/trading/service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getDashboardOverview());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "dashboard_failed" }, { status: 500 });
  }
}
