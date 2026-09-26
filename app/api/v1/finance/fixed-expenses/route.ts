import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { buildFixedExpenseItems } from "@/lib/finance/fixed-expenses";
import { rowToTxn } from "@/lib/finance/ingest";
import { fetchMerchantRules } from "@/lib/finance/merchant-rules";
import { getRecentMonths } from "@/lib/finance/recurring";
import { fetchTransactionsInRange, monthsBounds } from "@/lib/finance/txn-range";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  try {
    const recentMonths = getRecentMonths(month, 6);
    const [rules, monthRows, historyRows] = await Promise.all([
      fetchMerchantRules(),
      fetchTransactionsInRange(monthsBounds([month])),
      fetchTransactionsInRange(monthsBounds(recentMonths)),
    ]);
    const monthTxns = monthRows.map(rowToTxn);
    const historyTxns = historyRows.map(rowToTxn);
    const items = buildFixedExpenseItems(rules, monthTxns, historyTxns);
    return NextResponse.json({ month, items });
  } catch (err) {
    console.error("[finance/fixed-expenses GET]", err);
    return dbError();
  }
}
