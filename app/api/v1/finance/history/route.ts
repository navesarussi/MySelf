import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getSupabase } from "@/lib/supabase";
import type { CashflowRow } from "@/lib/finance/cashflow";
import {
  buildFinanceHistory,
  monthKeysEndingAt,
  parseHistoryMonths,
  type HistoryPlanSeed,
} from "@/lib/finance/history";
import { TXN_CASHFLOW_COLUMNS } from "@/lib/finance/txn-columns";

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

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const months = parseHistoryMonths(req.nextUrl.searchParams.get("months"));
  if (months == null) return badRequest("invalid_months");

  const endMonth = req.nextUrl.searchParams.get("month") || currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(endMonth)) return badRequest("invalid_month");

  const keys = monthKeysEndingAt(endMonth, months);
  const startMonth = keys[0]!;
  const start = `${startMonth}-01`;
  const [ey, em] = endMonth.split("-").map(Number);
  const endExclusive =
    em === 12 ? `${ey + 1}-01-01` : `${ey}-${String(em + 1).padStart(2, "0")}-01`;

  const supabase = getSupabase();
  const { data: txnRows, error: txnErr } = await supabase
    .from("finance_transactions")
    .select(TXN_CASHFLOW_COLUMNS)
    .gte("txn_date", start)
    .lt("txn_date", endExclusive);
  if (txnErr) return dbError();

  const { data: planRows, error: planErr } = await supabase
    .from("finance_month_plans")
    .select("id, month")
    .in("month", keys);
  if (planErr) return dbError();

  const planIds = (planRows ?? []).map((p) => String(p.id));
  let lineRows: Record<string, unknown>[] = [];
  if (planIds.length > 0) {
    const { data: lines, error: lineErr } = await supabase
      .from("finance_plan_lines")
      .select("plan_id, line_type, planned_amount")
      .in("plan_id", planIds);
    if (lineErr) return dbError();
    lineRows = (lines ?? []) as Record<string, unknown>[];
  }

  const planIdByMonth = new Map((planRows ?? []).map((p) => [String(p.month), String(p.id)]));
  const seeds: HistoryPlanSeed[] = [];
  for (const [month, planId] of planIdByMonth) {
    const lines = lineRows.filter((l) => String(l.plan_id) === planId);
    const sum = (type: string) =>
      lines
        .filter((l) => String(l.line_type) === type)
        .reduce((s, l) => s + Number(l.planned_amount), 0);
    seeds.push({
      month,
      planned_income: sum("income"),
      planned_fixed: sum("fixed"),
      planned_variable: sum("variable"),
      planned_planned: sum("planned"),
      savings_planned: sum("savings"),
    });
  }

  const history = buildFinanceHistory({
    endMonth,
    months,
    transactions: (txnRows ?? []).map((r) => rowToCashflow(r as Record<string, unknown>)),
    planSeeds: seeds,
  });

  return NextResponse.json(history);
}
