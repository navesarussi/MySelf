import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { rowToTxn } from "@/lib/finance/ingest";
import { TXN_LIST_COLUMNS } from "@/lib/finance/txn-columns";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month");
  const uncategorized = sp.get("uncategorized") === "1";
  const limit = Math.min(Number(sp.get("limit") ?? 100), 500);

  let query = getSupabase()
    .from("finance_transactions")
    .select(TXN_LIST_COLUMNS)
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

  const { data, error } = await query;
  if (error) return dbError();
  return NextResponse.json((data ?? []).map((r) => rowToTxn(r as Record<string, unknown>)));
}
