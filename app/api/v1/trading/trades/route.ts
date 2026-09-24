import { NextRequest, NextResponse } from "next/server";
import { dbError, denyUnlessPrimary } from "@/lib/api/auth";
import { listTrades, type TradeFilters } from "@/lib/trading/service";

export async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const p = req.nextUrl.searchParams;
  const filters: TradeFilters = {
    execution: p.get("execution") || undefined,
    track: p.get("track") || undefined,
    symbol: p.get("symbol") || undefined,
    state: (p.get("state") as TradeFilters["state"]) || "all",
    outcome: (p.get("outcome") as TradeFilters["outcome"]) || undefined,
    limit: p.get("limit") ? Number(p.get("limit")) : undefined,
  };
  try {
    return NextResponse.json(await listTrades(filters));
  } catch {
    return dbError();
  }
}
