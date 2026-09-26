import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { buildFinanceForecast } from "@/lib/finance/forecast";
import { getOrCreateMonthPlan } from "@/lib/finance/plan-store";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");
  const monthsAhead = Math.min(12, Math.max(3, Number(req.nextUrl.searchParams.get("months") ?? 6)));

  try {
    const plan = await getOrCreateMonthPlan(month);
    return NextResponse.json(buildFinanceForecast(plan, monthsAhead));
  } catch {
    return dbError();
  }
});
