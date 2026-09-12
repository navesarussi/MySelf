import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import type { FinanceTransaction } from "@/lib/finance/ingest";
import { TXN_LIST_COLUMNS } from "@/lib/finance/txn-columns";

function rowToTxn(row: Record<string, unknown>): FinanceTransaction {
  return {
    id: String(row.id),
    source: row.source as FinanceTransaction["source"],
    external_key: String(row.external_key),
    txn_date: String(row.txn_date),
    amount: Number(row.amount),
    kind: row.kind as FinanceTransaction["kind"],
    currency: String(row.currency ?? "ILS"),
    description: String(row.description ?? ""),
    merchant: row.merchant != null ? String(row.merchant) : null,
    account_number: row.account_number != null ? String(row.account_number) : null,
    card_name: row.card_name != null ? String(row.card_name) : null,
    status: row.status as FinanceTransaction["status"],
    category: row.category != null ? String(row.category) : null,
    purpose_note: row.purpose_note != null ? String(row.purpose_note) : null,
    needs_categorization: Boolean(row.needs_categorization),
    categorized_at: row.categorized_at != null ? String(row.categorized_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

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
