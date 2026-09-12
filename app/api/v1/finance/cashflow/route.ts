import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { summarizeCashflow, type CashflowRow } from "@/lib/finance/cashflow";
import { TXN_CASHFLOW_COLUMNS } from "@/lib/finance/txn-columns";

function rowToCashflow(row: Record<string, unknown>): CashflowRow {
  return {
    txn_date: String(row.txn_date),
    amount: Number(row.amount),
    kind: row.kind as CashflowRow["kind"],
    category: row.category != null ? String(row.category) : null,
    needs_categorization: Boolean(row.needs_categorization),
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
    .select(TXN_CASHFLOW_COLUMNS)
    .gte("txn_date", start)
    .lt("txn_date", next);

  if (error) return dbError();
  const txns = (data ?? []).map((r) => rowToCashflow(r as Record<string, unknown>));
  return NextResponse.json(summarizeCashflow(txns, month));
}
