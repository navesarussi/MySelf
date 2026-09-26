import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { summarizeCashflow, type CashflowRow } from "@/lib/finance/cashflow";
import { TXN_CASHFLOW_COLUMNS } from "@/lib/finance/txn-columns";
import { fetchTransactionsInRange, monthBounds } from "@/lib/finance/txn-range";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function rowToCashflow(row: Record<string, unknown>): CashflowRow {
  return {
    txn_date: String(row.txn_date),
    amount: Number(row.amount),
    kind: row.kind as CashflowRow["kind"],
    category: row.category != null ? String(row.category) : null,
    needs_categorization: Boolean(row.needs_categorization),
    is_internal: Boolean(row.is_internal),
  };
}

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  try {
    const rows = await fetchTransactionsInRange(monthBounds(month), TXN_CASHFLOW_COLUMNS);
    return NextResponse.json(summarizeCashflow(rows.map(rowToCashflow), month));
  } catch {
    return dbError();
  }
});
