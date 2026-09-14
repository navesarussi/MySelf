import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, notFound, readJson, unauthorized } from "@/lib/api/auth";
import { getTradeDetail, patchTradeJournal } from "@/lib/trading/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    const detail = await getTradeDetail(id);
    return detail ? NextResponse.json(detail) : notFound();
  } catch {
    return dbError();
  }
}

/** Journal fields only — lifecycle/price fields are owned by the engine. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);
  try {
    await patchTradeJournal(id, {
      notes: body.notes === undefined ? undefined : typeof body.notes === "string" ? body.notes : null,
      tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : undefined,
      self_rating: body.self_rating === undefined ? undefined : typeof body.self_rating === "number" ? body.self_rating : null,
    });
    const detail = await getTradeDetail(id);
    return detail ? NextResponse.json(detail) : notFound();
  } catch {
    return dbError();
  }
}
