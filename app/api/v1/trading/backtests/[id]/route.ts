import { NextRequest, NextResponse } from "next/server";
import { dbError, notFound, denyUnlessPrimary } from "@/lib/api/auth";
import { getBacktest } from "@/lib/trading/service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const bt = await getBacktest(id);
    return bt ? NextResponse.json(bt) : notFound();
  } catch {
    return dbError();
  }
}
