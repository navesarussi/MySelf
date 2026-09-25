import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getBrokerStatus } from "@/lib/trading/service";
import { getSettings } from "@/lib/trading/store";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    const settings = await getSettings();
    return NextResponse.json(await getBrokerStatus(settings.execution_venue));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "broker_failed" }, { status: 500 });
  }
}
