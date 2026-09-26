import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { summarizeCashflow, type CashflowRow } from "@/lib/finance/cashflow";
import { fetchMerchantRulesMap } from "@/lib/finance/merchant-rules";
import { fetchSplitsByParentIds } from "@/lib/finance/month-net-server";
import { TXN_CASHFLOW_COLUMNS } from "@/lib/finance/txn-columns";
import { fetchTransactionsInRange, monthBounds } from "@/lib/finance/txn-range";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function rowToCashflow(row: Record<string, unknown>): CashflowRow {
  return {
    id: row.id != null ? String(row.id) : undefined,
    txn_date: String(row.txn_date),
    amount: Number(row.amount),
    kind: row.kind as CashflowRow["kind"],
    category: row.category != null ? String(row.category) : null,
    needs_categorization: Boolean(row.needs_categorization),
    is_internal: Boolean(row.is_internal),
    merchant: row.merchant != null ? String(row.merchant) : null,
    description: row.description != null ? String(row.description) : null,
    expense_type:
      row.expense_type === "fixed" || row.expense_type === "variable" || row.expense_type === "savings"
        ? row.expense_type
        : null,
  };
}

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  try {
    const [rows, rulesMap] = await Promise.all([
      fetchTransactionsInRange(monthBounds(month), TXN_CASHFLOW_COLUMNS),
      fetchMerchantRulesMap(),
    ]);
    const cashflowRows = rows.map(rowToCashflow);
    const splitsByParentId = await fetchSplitsByParentIds(
      cashflowRows.map((row) => row.id).filter((id): id is string => Boolean(id))
    );
    return NextResponse.json(summarizeCashflow(cashflowRows, month, rulesMap, splitsByParentId));
  } catch {
    return dbError();
  }
});
