import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getOrCreateMonthPlan } from "@/lib/finance/plan-store";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  try {
    const plan = await getOrCreateMonthPlan(month);
    return NextResponse.json(plan);
  } catch {
    return dbError();
  }
}
