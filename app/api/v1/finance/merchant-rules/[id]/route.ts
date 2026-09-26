import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, notFound, readJson, str, unauthorized } from "@/lib/api/auth";
import { normalizeCategory } from "@/lib/finance/category-list";
import { deleteMerchantRule, updateMerchantRuleById } from "@/lib/finance/merchant-rules";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const PATCH = withRouteHandler(async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const patch: Record<string, unknown> = {};
  if (body.merchant_key !== undefined) patch.merchant_key = str(body.merchant_key);
  if (body.display_name !== undefined) patch.display_name = str(body.display_name) || null;
  if (body.category !== undefined) {
    const cat = body.category === null ? null : normalizeCategory(str(body.category));
    if (body.category !== null && str(body.category) && !cat) return badRequest("invalid_category");
    patch.category = cat;
  }
  if (body.expense_type !== undefined) patch.expense_type = str(body.expense_type) || null;
  if (body.default_note !== undefined) patch.default_note = str(body.default_note) || null;
  if (body.planned_amount !== undefined) {
    const planned = Number(body.planned_amount);
    if (!Number.isFinite(planned) || planned < 0) return badRequest("invalid_planned_amount");
    patch.planned_amount = planned;
  }
  if (body.charge_day !== undefined) {
    if (body.charge_day === null) patch.charge_day = null;
    else {
      const day = Number(body.charge_day);
      if (!Number.isInteger(day) || day < 1 || day > 31) return badRequest("invalid_charge_day");
      patch.charge_day = day;
    }
  }
  if (body.frequency !== undefined) {
    const freq = str(body.frequency);
    if (freq && freq !== "monthly" && freq !== "weekly" && freq !== "yearly") return badRequest("invalid_frequency");
    patch.frequency = freq || null;
  }
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  if (Object.keys(patch).length === 0) return badRequest("nothing_to_update");

  try {
    return NextResponse.json(await updateMerchantRuleById(id, patch));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "update_failed";
    if (msg === "not_found") return notFound();
    if (msg === "invalid_merchant_key") return badRequest(msg);
    console.error("[finance/merchant-rules PATCH]", err);
    return dbError();
  }
});

export const DELETE = withRouteHandler(async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    await deleteMerchantRule(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[finance/merchant-rules DELETE]", err);
    return dbError();
  }
});
