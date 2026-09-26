import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getRecurringSuggestions } from "@/lib/finance/recurring";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const monthParam = req.nextUrl.searchParams.get("month");
  if (monthParam && !/^\d{4}-\d{2}$/.test(monthParam)) {
    return badRequest("invalid_month");
  }

  try {
    const suggestions = await getRecurringSuggestions(monthParam ?? undefined);
    return NextResponse.json({ suggestions });
  } catch {
    return dbError();
  }
});
