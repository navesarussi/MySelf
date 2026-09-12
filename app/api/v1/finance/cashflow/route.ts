import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { summarizeCashflow } from "@/lib/finance/cashflow";
import type { FinanceTransaction } from "@/lib/finance/ingest";

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
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return badRequest("invalid_month");

  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("*")
    .gte("txn_date", start)
    .lt("txn_date", next);

  if (error) return dbError();
  const txns = (data ?? []).map((r) => rowToTxn(r as Record<string, unknown>));
  return NextResponse.json(summarizeCashflow(txns, month));
}
