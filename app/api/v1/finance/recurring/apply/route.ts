import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { applyRecurringSuggestion } from "@/lib/finance/recurring";

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const body = await readJson(req);
  const merchant_key = str(body.merchant_key);
  if (!merchant_key) return badRequest("merchant_key_required");

  const category = str(body.category) || null;
  const planned_amount =
    body.planned_amount != null && Number.isFinite(Number(body.planned_amount))
      ? Number(body.planned_amount)
      : undefined;

  try {
    const rule = await applyRecurringSuggestion({
      merchant_key,
      category,
      planned_amount,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    if (err instanceof Error && err.message === "variable_toll_not_fixed") {
      return badRequest("variable_toll_not_fixed");
    }
    return dbError();
  }
}
