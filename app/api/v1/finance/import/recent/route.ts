import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { financeImportUserId } from "@/lib/api/finance-import-user";
import { FinanceImportLayerError, listRecentImportTransactions } from "@/lib/finance/import/run-import";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 30)));
  const userId = await financeImportUserId(req);

  try {
    const transactions = await listRecentImportTransactions(userId, limit);
    return NextResponse.json({ transactions, available: true });
  } catch (err) {
    if (err instanceof FinanceImportLayerError && err.code === "tables_missing") {
      return NextResponse.json({ transactions: [], available: false, soft: true });
    }
    return dbError();
  }
}
