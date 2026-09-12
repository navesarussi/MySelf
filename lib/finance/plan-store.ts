import { getSupabase } from "@/lib/supabase";
import type { FinanceTransaction } from "@/lib/finance/ingest";
import {
  buildMonthPlanView,
  seedPlanLines,
  type MonthPlanView,
  type PlanLineRow,
} from "@/lib/finance/plan";

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start: `${month}-01`, end: next };
}

async function fetchTransactions(month: string): Promise<FinanceTransaction[]> {
  const { start, end } = monthRange(month);
  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("*")
    .gte("txn_date", start)
    .lt("txn_date", end);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTxn);
}

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

function rowToLine(row: Record<string, unknown>): PlanLineRow {
  return {
    id: String(row.id),
    plan_id: String(row.plan_id),
    line_type: row.line_type as PlanLineRow["line_type"],
    name: String(row.name),
    category: row.category != null ? String(row.category) : null,
    planned_amount: Number(row.planned_amount),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function getOrCreateMonthPlan(month: string): Promise<MonthPlanView> {
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("finance_month_plans")
    .select("id")
    .eq("month", month)
    .maybeSingle();

  let planId = existing?.id as string | undefined;

  if (!planId) {
    const prev = prevMonth(month);
    const { data: prevPlan } = await supabase
      .from("finance_month_plans")
      .select("id")
      .eq("month", prev)
      .maybeSingle();

    let prevLines: PlanLineRow[] = [];
    if (prevPlan?.id) {
      const { data: lines } = await supabase
        .from("finance_plan_lines")
        .select("*")
        .eq("plan_id", prevPlan.id)
        .order("sort_order");
      prevLines = (lines ?? []).map((r) => rowToLine(r as Record<string, unknown>));
    }

    const prevTxns = await fetchTransactions(prev);
    const seeds = seedPlanLines(month, prevLines.length ? prevLines : null, prevTxns);

    const { data: created, error } = await supabase
      .from("finance_month_plans")
      .insert({ month })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "plan_create_failed");
    planId = String(created.id);

    if (seeds.length > 0) {
      await supabase.from("finance_plan_lines").insert(
        seeds.map((s) => ({
          plan_id: planId,
          line_type: s.line_type,
          name: s.name,
          category: s.category,
          planned_amount: s.planned_amount,
          sort_order: s.sort_order,
        }))
      );
    }
  }

  const { data: lineRows } = await supabase
    .from("finance_plan_lines")
    .select("*")
    .eq("plan_id", planId)
    .order("sort_order");

  const lines = (lineRows ?? []).map((r) => rowToLine(r as Record<string, unknown>));
  const txns = await fetchTransactions(month);
  return buildMonthPlanView(month, planId!, lines, txns);
}

export async function updatePlanLinePlanned(
  lineId: string,
  planned_amount: number
): Promise<PlanLineRow> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("finance_plan_lines")
    .update({ planned_amount, updated_at: now })
    .eq("id", lineId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");
  return rowToLine(data as Record<string, unknown>);
}
