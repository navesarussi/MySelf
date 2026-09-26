import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { addPlanLine } from "@/lib/finance/plan-store";
import type { PlanLineType } from "@/lib/finance/expense-type";
import { withRouteHandler } from "@/lib/api/with-route-handler";

const LINE_TYPES = new Set<PlanLineType>(["income", "fixed", "variable", "planned", "savings"]);

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const month = str(body.month);
  const line_type = str(body.line_type) as PlanLineType;
  const name = str(body.name);
  const planned_amount = Number(body.planned_amount ?? 0);
  const category = str(body.category) || null;

  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");
  if (!LINE_TYPES.has(line_type)) return badRequest("invalid_line_type");
  if (!name) return badRequest("name_required");
  if (!Number.isFinite(planned_amount) || planned_amount < 0) return badRequest("invalid_planned_amount");

  try {
    return NextResponse.json(
      await addPlanLine({ month, line_type, name, category, planned_amount })
    );
  } catch {
    return dbError();
  }
});
