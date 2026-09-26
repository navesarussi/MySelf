import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { normalizeCategory } from "@/lib/finance/category-list";
import { fetchMerchantRules, upsertMerchantRule, type MerchantRuleInput } from "@/lib/finance/merchant-rules";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function parseRuleBody(body: Record<string, unknown>): MerchantRuleInput {
  const merchant_key = str(body.merchant_key);
  if (!merchant_key) throw new Error("missing_merchant_key");
  const planned = body.planned_amount != null ? Number(body.planned_amount) : undefined;
  if (planned !== undefined && (!Number.isFinite(planned) || planned < 0)) throw new Error("invalid_planned_amount");
  const chargeDay = body.charge_day != null ? Number(body.charge_day) : undefined;
  if (chargeDay !== undefined && (!Number.isInteger(chargeDay) || chargeDay < 1 || chargeDay > 31)) {
    throw new Error("invalid_charge_day");
  }
  const freq = body.frequency != null ? String(body.frequency) : undefined;
  if (freq && freq !== "monthly" && freq !== "weekly" && freq !== "yearly") throw new Error("invalid_frequency");

  return {
    merchant_key,
    display_name: body.display_name != null ? str(body.display_name) || null : undefined,
    category: body.category != null ? normalizeCategory(str(body.category)) : undefined,
    expense_type: body.expense_type != null ? (String(body.expense_type) as MerchantRuleInput["expense_type"]) : "fixed",
    kind: "expense",
    default_note: body.default_note != null ? str(body.default_note) || null : undefined,
    planned_amount: planned,
    charge_day: chargeDay,
    frequency: freq as MerchantRuleInput["frequency"],
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
  };
}

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    const rules = await fetchMerchantRules();
    return NextResponse.json({ rules });
  } catch (err) {
    console.error("[finance/merchant-rules GET]", err);
    return dbError();
  }
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  try {
    const input = parseRuleBody(body);
    const rule = await upsertMerchantRule(input);
    if (!rule) return badRequest("invalid_merchant_key");
    return NextResponse.json(rule);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "create_failed";
    if (msg.startsWith("invalid_") || msg === "missing_merchant_key") return badRequest(msg);
    console.error("[finance/merchant-rules POST]", err);
    return dbError();
  }
});
