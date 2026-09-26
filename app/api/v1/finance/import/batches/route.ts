import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { financeImportUserId } from "@/lib/api/finance-import-user";
import { FinanceImportLayerError, listImportBatches } from "@/lib/finance/import/run-import";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
  const userId = await financeImportUserId(req);

  try {
    const batches = await listImportBatches(userId, limit);
    return NextResponse.json({ batches, available: true });
  } catch (err) {
    if (err instanceof FinanceImportLayerError && err.code === "tables_missing") {
      return NextResponse.json({ batches: [], available: false, soft: true });
    }
    return dbError();
  }
});
