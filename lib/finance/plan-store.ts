import { getSupabase } from "@/lib/supabase";
import { rowToTxn, type FinanceTransaction } from "@/lib/finance/ingest";
import {
  buildMonthPlanView,
  defaultPlanTemplate,
  prevMonth,
  seedPlanLines,
  type MonthPlanView,
  type PlanLineRow,
} from "@/lib/finance/plan";
import type { PlanLineType } from "@/lib/finance/expense-type";
import { inferredCategory, inferTxnKind, shouldSkipCategorizationPrompt } from "@/lib/finance/classify";
import { fetchMerchantRulesMap } from "@/lib/finance/merchant-rules";
import { reconcileMonthTransactions } from "@/lib/finance/reconcile";

function monthRange(month: string) {
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
  return (data ?? []).map((r) => rowToTxn(r as Record<string, unknown>));
}

async function autoClassifyObvious(month: string): Promise<void> {
  const txns = await fetchTransactions(month);
  const now = new Date().toISOString();
  await Promise.all(
    txns.map(async (t) => {
      const kind = inferTxnKind({ description: t.description, merchant: t.merchant });
      const skip = shouldSkipCategorizationPrompt({ description: t.description, merchant: t.merchant, kind });
      const category = inferredCategory({ description: t.description, merchant: t.merchant, kind });
      const markDone = skip && t.needs_categorization;
      const applyCat = Boolean(category) && t.needs_categorization && !t.category;
      if (kind === t.kind && !markDone && !applyCat) return;
      await getSupabase().from("finance_transactions").update({
        kind,
        category: applyCat ? category : t.category,
        needs_categorization: markDone ? false : t.needs_categorization,
        categorized_at: markDone ? now : t.categorized_at,
        updated_at: now,
      }).eq("id", t.id);
    })
  );
}

const rowToLine = (r: Record<string, unknown>): PlanLineRow => ({
  id: String(r.id),
  plan_id: String(r.plan_id),
  line_type: r.line_type as PlanLineRow["line_type"],
  name: String(r.name),
  category: r.category != null ? String(r.category) : null,
  planned_amount: Number(r.planned_amount),
  sort_order: Number(r.sort_order ?? 0),
});

export async function getOrCreateMonthPlan(month: string): Promise<MonthPlanView> {
  await reconcileMonthTransactions(month).catch(() => null);
  await autoClassifyObvious(month);
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("finance_month_plans")
    .select("id, weekly_budget_override")
    .eq("month", month)
    .maybeSingle();

  let planId = existing?.id as string | undefined;
  let weeklyOverride =
    existing?.weekly_budget_override != null ? Number(existing.weekly_budget_override) : null;

  if (!planId) {
    const prev = prevMonth(month);
    const { data: prevPlan } = await supabase.from("finance_month_plans").select("id").eq("month", prev).maybeSingle();

    let prevLines: PlanLineRow[] = [];
    if (prevPlan?.id) {
      const { data: lines } = await supabase.from("finance_plan_lines").select("*").eq("plan_id", prevPlan.id).order("sort_order");
      prevLines = (lines ?? []).map((r) => rowToLine(r as Record<string, unknown>));
    }

    const [prevTxns, currentTxns, rulesMap] = await Promise.all([
      fetchTransactions(prev),
      fetchTransactions(month),
      fetchMerchantRulesMap(),
    ]);
    const seeds = seedPlanLines(month, prevLines.length ? prevLines : null, prevTxns, currentTxns, rulesMap);

    const { data: created, error } = await supabase.from("finance_month_plans").insert({ month }).select("id").single();
    if (error || !created) throw new Error(error?.message ?? "plan_create_failed");
    planId = String(created.id);

    if (seeds.length > 0) {
      await supabase.from("finance_plan_lines").insert(seeds.map((s) => ({ ...s, plan_id: planId })));
    }
  }

  const { data: lineRows } = await supabase.from("finance_plan_lines").select("*").eq("plan_id", planId).order("sort_order");
  let lines = (lineRows ?? []).map((r) => rowToLine(r as Record<string, unknown>));
  lines = await ensureTemplateLines(planId!, lines);

  const [txns, rulesMap] = await Promise.all([fetchTransactions(month), fetchMerchantRulesMap()]);
  return buildMonthPlanView(month, planId!, lines, txns, rulesMap, weeklyOverride);
}

export async function updateWeeklyBudgetOverride(
  month: string,
  weekly_budget_override: number | null
): Promise<number | null> {
  const plan = await getOrCreateMonthPlan(month);
  const value = weekly_budget_override != null ? Math.max(0, weekly_budget_override) : null;
  const { error } = await getSupabase()
    .from("finance_month_plans")
    .update({ weekly_budget_override: value, updated_at: new Date().toISOString() })
    .eq("id", plan.plan_id);
  if (error) throw new Error(error.message);
  return value;
}

async function ensureTemplateLines(planId: string, lines: PlanLineRow[]): Promise<PlanLineRow[]> {
  const template = defaultPlanTemplate();
  const existingKeys = new Set(lines.map((l) => `${l.line_type}:${l.category ?? l.name}`));
  const missing = template.filter((t) => !existingKeys.has(`${t.line_type}:${t.category ?? t.name}`));
  if (missing.length === 0) return lines;

  const start = lines.length;
  const inserts = missing.map((s, i) => ({ ...s, plan_id: planId, sort_order: start + i }));
  const { data, error } = await getSupabase().from("finance_plan_lines").insert(inserts).select("*");
  if (error) return lines;
  return [...lines, ...(data ?? []).map((r) => rowToLine(r as Record<string, unknown>))];
}

export async function updatePlanLine(
  lineId: string,
  patch: { planned_amount?: number; line_type?: PlanLineType; name?: string }
): Promise<PlanLineRow> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.planned_amount !== undefined) payload.planned_amount = patch.planned_amount;
  if (patch.line_type !== undefined) payload.line_type = patch.line_type;
  if (patch.name !== undefined) payload.name = patch.name;

  const { data, error } = await getSupabase().from("finance_plan_lines").update(payload).eq("id", lineId).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");
  return rowToLine(data as Record<string, unknown>);
}

export async function updatePlanLinePlanned(lineId: string, planned_amount: number): Promise<PlanLineRow> {
  return updatePlanLine(lineId, { planned_amount });
}

export async function addPlanLine(input: {
  month: string;
  line_type: PlanLineType;
  name: string;
  category?: string | null;
  planned_amount: number;
}): Promise<PlanLineRow> {
  const plan = await getOrCreateMonthPlan(input.month);
  const { data, error } = await getSupabase().from("finance_plan_lines").insert({
    plan_id: plan.plan_id,
    line_type: input.line_type,
    name: input.name.trim(),
    category: input.category ?? null,
    planned_amount: input.planned_amount,
    sort_order: 99,
    updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  return rowToLine(data as Record<string, unknown>);
}

export async function deletePlanLine(lineId: string): Promise<void> {
  const { error } = await getSupabase().from("finance_plan_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);
}
