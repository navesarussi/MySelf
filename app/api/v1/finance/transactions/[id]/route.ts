import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  dbError,
  isApiAuthorized,
  notFound,
  optStr,
  readJson,
  str,
  unauthorized,
} from "@/lib/api/auth";
import { isFinanceCategory } from "@/lib/finance/categories";
import {
  loadCategoryHistory,
  suggestCategoryFromHistory,
} from "@/lib/finance/merchant-category";
import {
  findMerchantRule,
  resolveExpenseType,
  upsertMerchantRule,
  type ExpenseType,
} from "@/lib/finance/merchant-rules";
import { getSupabase } from "@/lib/supabase";
import { rowToTxn } from "@/lib/finance/ingest";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;

  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return dbError();
  if (!data) return notFound();

  const txn = rowToTxn(data as Record<string, unknown>);
  const rule = await findMerchantRule(txn.merchant, txn.description);
  const history = await loadCategoryHistory();

  const suggested_category =
    txn.category ??
    rule?.category ??
    (txn.needs_categorization
      ? suggestCategoryFromHistory(txn.merchant, txn.description, history)
      : null);

  const suggested_expense_type =
    txn.expense_type ??
    rule?.expense_type ??
    (suggested_category && txn.kind === "expense"
      ? resolveExpenseType({ category: suggested_category, kind: "expense", rule })
      : null);

  return NextResponse.json({
    ...txn,
    suggested_category,
    suggested_expense_type,
    default_note: rule?.default_note ?? null,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const { data: existing, error: fetchErr } = await getSupabase()
    .from("finance_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return dbError();
  if (!existing) return notFound();

  const current = rowToTxn(existing as Record<string, unknown>);
  const skip = body.skip === true;
  const now = new Date().toISOString();

  if (skip) {
    const { data, error } = await getSupabase()
      .from("finance_transactions")
      .update({ needs_categorization: false, updated_at: now })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return dbError();
    return NextResponse.json(rowToTxn(data as Record<string, unknown>));
  }

  const category = str(body.category) || current.category;
  if (!category) return badRequest("category_required");
  if (!isFinanceCategory(category)) return badRequest("invalid_category");

  const purpose_note = body.purpose_note !== undefined ? optStr(body.purpose_note) : current.purpose_note;
  const rawExpenseType = str(body.expense_type);
  const expense_type: ExpenseType | null =
    rawExpenseType === "fixed" || rawExpenseType === "variable"
      ? rawExpenseType
      : current.kind === "expense"
        ? (current.expense_type ?? (resolveExpenseType({ category, kind: "expense" }) as ExpenseType))
        : null;

  const remember_rule = body.remember_rule === true;
  if (remember_rule) {
    const merchantKey = current.merchant || current.description;
    if (merchantKey) {
      await upsertMerchantRule({
        merchant_key: merchantKey,
        category,
        expense_type,
        kind: current.kind,
        default_note: purpose_note,
      });
    }
  }

  const patch: Record<string, unknown> = {
    category,
    purpose_note,
    expense_type,
    needs_categorization: false,
    categorized_at: current.categorized_at || now,
    updated_at: now,
  };

  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return dbError();
  if (!data) return notFound();
  return NextResponse.json(rowToTxn(data as Record<string, unknown>));
}
