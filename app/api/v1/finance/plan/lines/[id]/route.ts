import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, notFound, readJson, unauthorized } from "@/lib/api/auth";
import { deletePlanLine, updatePlanLine } from "@/lib/finance/plan-store";
import type { PlanLineType } from "@/lib/finance/expense-type";

const VALID_LINE_TYPES = new Set<PlanLineType>(["income", "fixed", "variable", "planned", "savings"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const patch: { planned_amount?: number; line_type?: PlanLineType } = {};

  if (body.planned_amount !== undefined) {
    const planned = Number(body.planned_amount);
    if (!Number.isFinite(planned) || planned < 0) return badRequest("invalid_planned_amount");
    patch.planned_amount = planned;
  }

  if (body.line_type !== undefined) {
    const lt = String(body.line_type) as PlanLineType;
    if (!VALID_LINE_TYPES.has(lt)) return badRequest("invalid_line_type");
    patch.line_type = lt;
  }

  if (patch.planned_amount === undefined && patch.line_type === undefined) {
    return badRequest("nothing_to_update");
  }

  try {
    return NextResponse.json(await updatePlanLine(id, patch));
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
