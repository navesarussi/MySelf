import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { getOrCreateMonthPlan, updateWeeklyBudgetOverride } from "@/lib/finance/plan-store";
import { normalizeWeeklyPace } from "@/lib/finance/weekly";
import type { MonthPlanView } from "@/lib/finance/plan-types";

function normalizePlanResponse(plan: MonthPlanView): MonthPlanView {
  return { ...plan, weekly_pace: normalizeWeeklyPace(plan.weekly_pace) };
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  try {
    const plan = await getOrCreateMonthPlan(month);
    return NextResponse.json(normalizePlanResponse(plan));
  } catch {
    return dbError();
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  const body = await readJson(req);
  if (body.weekly_budget_override === undefined) return badRequest("missing_field");

  const raw = body.weekly_budget_override;
  const weekly_budget_override =
    raw === null || raw === ""
      ? null
      : typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Number(raw);

  if (weekly_budget_override !== null && (!Number.isFinite(weekly_budget_override) || weekly_budget_override < 0)) {
    return badRequest("invalid_weekly_budget");
  }

  try {
    await updateWeeklyBudgetOverride(month, weekly_budget_override);
    const plan = await getOrCreateMonthPlan(month);
    return NextResponse.json(normalizePlanResponse(plan));
  } catch {
    return dbError();
  }
}
