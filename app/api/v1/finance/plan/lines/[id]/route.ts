import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, notFound, readJson, unauthorized } from "@/lib/api/auth";
import { deletePlanLine, updatePlanLinePlanned } from "@/lib/finance/plan-store";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);
  const planned = Number(body.planned_amount);
  if (!Number.isFinite(planned) || planned < 0) return badRequest("invalid_planned_amount");

  try {
    return NextResponse.json(await updatePlanLinePlanned(id, planned));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "update_failed";
    if (msg === "not_found") return notFound();
    return dbError();
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    await deletePlanLine(id);
    return NextResponse.json({ ok: true });
  } catch {
    return dbError();
  }
}
