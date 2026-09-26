import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { financeImportUserId } from "@/lib/api/finance-import-user";
import { FinanceImportLayerError, listRecentImportTransactions } from "@/lib/finance/import/run-import";
import { rowToTxn } from "@/lib/finance/ingest";
import { enrichTransactionsWithMerchantDisplay } from "@/lib/finance/txn-display";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 30)));
  const userId = await financeImportUserId(req);

  try {
    const rows = await listRecentImportTransactions(userId, limit);
    const txns = rows.map((r) => rowToTxn(r as Record<string, unknown>));
    const transactions = await enrichTransactionsWithMerchantDisplay(txns);
    return NextResponse.json({ transactions, available: true });
  } catch (err) {
    if (err instanceof FinanceImportLayerError && err.code === "tables_missing") {
      return NextResponse.json({ transactions: [], available: false, soft: true });
    }
    return dbError();
  }
});
