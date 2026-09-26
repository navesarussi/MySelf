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
import type { FinanceSource } from "@/lib/finance/external-key";
import { fetchMerchantRulesMap } from "@/lib/finance/merchant-rules";
import { reconcileMonthTransactions } from "@/lib/finance/reconcile";
import { fetchTransactionsInRange, monthBounds } from "@/lib/finance/txn-range";

/** Bank/card sync and import sources — kind is authoritative from the feed. */
export const BANK_CARD_SOURCES = new Set<FinanceSource>([
  "leumi",
  "max",
  "visa_cal",
  "apple_pay",
  "excel",
]);

/** Pure patch planner for autoClassifyObvious — exported for tests. */
export function autoClassifyPatchForTxn(
  t: FinanceTransaction,
  now: string
): Record<string, unknown> | null {
  if (t.categorized_at || !t.needs_categorization) return null;

  const kind = inferTxnKind({
    kind: t.kind,
    description: t.description,
    merchant: t.merchant,
    signedAmount: t.kind === "income" ? t.amount : -t.amount,
  });
  const isBankCard = BANK_CARD_SOURCES.has(t.source);
  const effectiveKind = isBankCard ? t.kind : kind;
  const skip = shouldSkipCategorizationPrompt({
    description: t.description,
    merchant: t.merchant,
    kind: effectiveKind,
  });
  const category = inferredCategory({
    description: t.description,
    merchant: t.merchant,
    kind: effectiveKind,
  });
  const kindChange = !isBankCard && kind !== t.kind;
  const markDone = skip;
  const applyCat = Boolean(category) && !t.category;

  if (!kindChange && !markDone && !applyCat) return null;

  return {
    ...(kindChange ? { kind } : {}),
    ...(applyCat ? { category } : {}),
    ...(markDone ? { needs_categorization: false, categorized_at: now } : {}),
    updated_at: now,
  };
}

async function fetchTransactions(month: string): Promise<FinanceTransaction[]> {
  return (await fetchTransactionsInRange(monthBounds(month))).map(rowToTxn);
}

async function autoClassifyObvious(
  month: string,
  prefetched?: FinanceTransaction[]
): Promise<boolean> {
  const txns = prefetched ?? (await fetchTransactions(month));
  const now = new Date().toISOString();
  let changed = false;
  await Promise.all(
    txns.map(async (t) => {
      const patch = autoClassifyPatchForTxn(t, now);
      if (!patch) return;
      changed = true;
      await getSupabase().from("finance_transactions").update(patch).eq("id", t.id);
    })
  );
  return changed;
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

type PlanMeta = { planId: string; weeklyOverride: number | null };

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

/** Tolerates stale PostgREST schema cache (weekly_budget_override column missing from cache). */
async function fetchPlanMeta(month: string): Promise<PlanMeta | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("finance_month_plans")
    .select("id, weekly_budget_override")
    .eq("month", month)
    .maybeSingle();

  if (!error && data?.id) {
    return {
      planId: String(data.id),
      weeklyOverride: data.weekly_budget_override != null ? Number(data.weekly_budget_override) : null,
    };
  }

  const { data: fallback, error: fbErr } = await supabase
    .from("finance_month_plans")
    .select("id")
    .eq("month", month)
    .maybeSingle();
  if (fbErr) throw new Error(fbErr.message);
  if (!fallback?.id) return null;
  return { planId: String(fallback.id), weeklyOverride: null };
}

export async function getOrCreateMonthPlan(month: string): Promise<MonthPlanView> {
  let txns = await fetchTransactions(month);
  const reconcileResult = await reconcileMonthTransactions(month, txns).catch(() => null);
  if (reconcileResult && reconcileResult.reconciledIds.length > 0) {
    txns = await fetchTransactions(month);
  }
  const classified = await autoClassifyObvious(month, txns).catch(() => false);
  if (classified) txns = await fetchTransactions(month);

  const supabase = getSupabase();
  const existing = await fetchPlanMeta(month);

  let planId = existing?.planId;
  let weeklyOverride = existing?.weeklyOverride ?? null;

  if (!planId) {
    const prev = prevMonth(month);
    const { data: prevPlan } = await supabase.from("finance_month_plans").select("id").eq("month", prev).maybeSingle();

    let prevLines: PlanLineRow[] = [];
    if (prevPlan?.id) {
      const { data: lines } = await supabase.from("finance_plan_lines").select("*").eq("plan_id", prevPlan.id).order("sort_order");
      prevLines = (lines ?? []).map((r) => rowToLine(r as Record<string, unknown>));
    }

    const [prevTxns, rulesMap] = await Promise.all([fetchTransactions(prev), fetchMerchantRulesMap()]);
    const seeds = seedPlanLines(month, prevLines.length ? prevLines : null, prevTxns, txns, rulesMap);

    const { data: created, error } = await supabase.from("finance_month_plans").insert({ month }).select("id").single();
    if (error) {
      if (isUniqueViolation(error)) {
        const again = await fetchPlanMeta(month);
        if (!again) throw new Error(error.message);
        planId = again.planId;
        weeklyOverride = again.weeklyOverride;
      } else {
        throw new Error(error.message);
      }
    } else if (!created) {
      throw new Error("plan_create_failed");
    } else {
      planId = String(created.id);
    }

    if (seeds.length > 0) {
      await supabase.from("finance_plan_lines").insert(seeds.map((s) => ({ ...s, plan_id: planId })));
    }
  }

  const { data: lineRows } = await supabase.from("finance_plan_lines").select("*").eq("plan_id", planId).order("sort_order");
  let lines = (lineRows ?? []).map((r) => rowToLine(r as Record<string, unknown>));
  lines = await ensureTemplateLines(planId!, lines);

  const rulesMap = await fetchMerchantRulesMap();
  return buildMonthPlanView(month, planId!, lines, txns, rulesMap, weeklyOverride);
}

async function ensurePlanRow(month: string): Promise<PlanMeta> {
  const existing = await fetchPlanMeta(month);
  if (existing) return existing;

  const supabase = getSupabase();
  const { data, error } = await supabase.from("finance_month_plans").insert({ month }).select("id").single();
  if (error) {
    if (isUniqueViolation(error)) {
      const again = await fetchPlanMeta(month);
      if (!again) throw new Error(error.message);
      return again;
    }
    throw new Error(error.message);
  }
  if (!data?.id) throw new Error("plan_create_failed");
  return { planId: String(data.id), weeklyOverride: null };
}

export async function updateWeeklyBudgetOverride(
  month: string,
  weekly_budget_override: number | null
): Promise<number | null> {
  const meta = await ensurePlanRow(month);
  const value = weekly_budget_override != null ? Math.max(0, weekly_budget_override) : null;
  const { error } = await getSupabase()
    .from("finance_month_plans")
    .update({ weekly_budget_override: value, updated_at: new Date().toISOString() })
    .eq("id", meta.planId);
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
