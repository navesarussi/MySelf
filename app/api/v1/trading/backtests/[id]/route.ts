import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, notFound, unauthorized } from "@/lib/api/auth";
import { getBacktest } from "@/lib/trading/service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    const bt = await getBacktest(id);
    return bt ? NextResponse.json(bt) : notFound();
  } catch {
    return dbError();
  }
}
