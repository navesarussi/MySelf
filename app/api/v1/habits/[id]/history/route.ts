import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, notFound, unauthorized } from "@/lib/api/auth";
import { buildHabitHistoryGrid } from "@/lib/habit-history";
import { loadHabitReports } from "@/lib/habit-reports-store";
import { userDb } from "@/lib/db/user-db";
import type { Habit } from "@/lib/types";
import { withRouteHandler } from "@/lib/api/with-route-handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withRouteHandler(async function GET(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 35), 7), 90);
  const db = await userDb();
  const { data: habit } = await db.from("habits").select("*").eq("id", id).maybeSingle<Habit>();
  if (!habit) return notFound();

  const reports = await loadHabitReports(id, days + 7);
  const grid = buildHabitHistoryGrid(habit, reports, new Date(), days);

  return NextResponse.json({ reports, grid });
});
