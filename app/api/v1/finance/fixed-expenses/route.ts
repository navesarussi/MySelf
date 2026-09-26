import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { buildFixedExpenseItems } from "@/lib/finance/fixed-expenses";
import { rowToTxn } from "@/lib/finance/ingest";
import { fetchMerchantRules, fetchMerchantRulesMap } from "@/lib/finance/merchant-rules";
import { withMerchantDisplay } from "@/lib/finance/txn-display";
import { getRecentMonths } from "@/lib/finance/recurring";
import { fetchTransactionsInRange, monthsBounds } from "@/lib/finance/txn-range";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  try {
    const recentMonths = getRecentMonths(month, 6);
    const [rules, rulesMap, monthRows, historyRows] = await Promise.all([
      fetchMerchantRules(),
      fetchMerchantRulesMap(),
      fetchTransactionsInRange(monthsBounds([month])),
      fetchTransactionsInRange(monthsBounds(recentMonths)),
    ]);
    const monthTxns = monthRows.map(rowToTxn).map((t) => withMerchantDisplay(t, rulesMap));
    const historyTxns = historyRows.map(rowToTxn).map((t) => withMerchantDisplay(t, rulesMap));
    const items = await buildFixedExpenseItems(rules, month, monthTxns, historyTxns);
    return NextResponse.json({ month, items });
  } catch (err) {
    console.error("[finance/fixed-expenses GET]", err);
    return dbError();
  }
});
