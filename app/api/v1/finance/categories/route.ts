import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { listFinanceCategories } from "@/lib/finance/category-list";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const categories = await listFinanceCategories();
    return NextResponse.json({ categories });
  } catch {
    return dbError();
  }
});
