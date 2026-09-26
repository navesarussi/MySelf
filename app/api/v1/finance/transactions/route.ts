import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { rowToTxn } from "@/lib/finance/ingest";
import { loadCategoryHistory } from "@/lib/finance/merchant-category";
import { createManualTransaction } from "@/lib/finance/manual-txn";
import { fetchMerchantRulesMap } from "@/lib/finance/merchant-rules";
import { enrichTransactionWithMerchantDisplay, withMerchantDisplay } from "@/lib/finance/txn-display";
import { suggestForTxn } from "@/lib/finance/suggest-txn";
import { TXN_LIST_COLUMNS } from "@/lib/finance/txn-columns";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { reportError } from "@/lib/error-reporting";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month");
  const uncategorized = sp.get("uncategorized") === "1";
  const includeTotal = sp.get("includeTotal") === "1";
  const limit = Math.min(Number(sp.get("limit") ?? 100), 500);

  let query = getSupabase()
    .from("finance_transactions")
    .select(TXN_LIST_COLUMNS, uncategorized && includeTotal ? { count: "exact" } : undefined)
    .is("deleted_at", null)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    query = query.gte("txn_date", start).lt("txn_date", next);
  }
  if (uncategorized) query = query.eq("needs_categorization", true);

  const { data, error, count } = await query;
  if (error) return dbError();
  const rows = (data ?? []).map((r) => rowToTxn(r as Record<string, unknown>));

  const rulesMap = await fetchMerchantRulesMap();
  const withDisplay = rows.map((txn) => withMerchantDisplay(txn, rulesMap));

  if (!uncategorized) return NextResponse.json(withDisplay);

  const history = await loadCategoryHistory();
  const items = withDisplay.map((txn) => {
    const suggestion = suggestForTxn(txn, rulesMap, history);
    return { ...txn, ...suggestion };
  });
  if (includeTotal) return NextResponse.json({ items, total: count ?? items.length });
  return NextResponse.json(items);
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const item_type = body.item_type as MoneyItemType;
  if (!item_type || !["fixed", "variable", "income", "internal"].includes(item_type)) {
    return badRequest("invalid_item_type");
  }
  try {
    const txn = await createManualTransaction({
      txn_date: String(body.txn_date ?? ""),
      amount: Number(body.amount),
      item_type,
      category: body.category != null ? String(body.category) : null,
      merchant: body.merchant != null ? String(body.merchant) : null,
      description: body.description != null ? String(body.description) : null,
      purpose_note: body.purpose_note != null ? String(body.purpose_note) : null,
      txn_time: body.txn_time != null ? String(body.txn_time) : null,
      remember_rule: body.remember_rule === true,
      recurring: body.recurring === true,
      planned_amount: body.planned_amount != null ? Number(body.planned_amount) : undefined,
      charge_day: body.charge_day != null ? Number(body.charge_day) : null,
      frequency:
        body.frequency === "weekly" || body.frequency === "yearly" ? body.frequency : "monthly",
    });
    return NextResponse.json(await enrichTransactionWithMerchantDisplay(txn));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "create_failed";
    reportError({ source: "server", error: err, context: { route: "/finance/transactions POST", integration: "finance" } });
    return badRequest(msg);
  }
});
