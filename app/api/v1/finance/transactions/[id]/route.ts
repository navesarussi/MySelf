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
import { normalizeCategory } from "@/lib/finance/category-list";
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
import { parseTxnTime } from "@/lib/finance/txn-datetime";
import { getSupabase } from "@/lib/supabase";
import { rowToTxn } from "@/lib/finance/ingest";

function parseExpenseType(raw: string, fallback: ExpenseType | null): ExpenseType | null {
  if (raw === "fixed" || raw === "variable" || raw === "savings") return raw;
  return fallback;
}

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

  const hasCategoryField = body.category !== undefined;
  let category = hasCategoryField
    ? body.category === null
      ? null
      : normalizeCategory(str(body.category))
    : current.category;
  if (hasCategoryField && body.category !== null && str(body.category) && !category) {
    return badRequest("invalid_category");
  }

  const isCategorize = current.needs_categorization || hasCategoryField;
  if (isCategorize && !category) return badRequest("category_required");

  const purpose_note =
    body.purpose_note !== undefined ? optStr(body.purpose_note) : current.purpose_note;

  const rawExpenseType = str(body.expense_type);
  const expense_type: ExpenseType | null =
    current.kind === "expense"
      ? parseExpenseType(
          rawExpenseType,
          current.expense_type ??
            (resolveExpenseType({ category, kind: "expense" }) as ExpenseType)
        )
      : null;

  let txn_date = current.txn_date;
  if (body.txn_date !== undefined) {
    const d = str(body.txn_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return badRequest("invalid_txn_date");
    txn_date = d;
  }

  let txn_time = current.txn_time;
  if (body.txn_time !== undefined) {
    if (body.txn_time === null || body.txn_time === "") {
      txn_time = null;
    } else {
      const parsed = parseTxnTime(body.txn_time);
      if (!parsed) return badRequest("invalid_txn_time");
      txn_time = parsed;
    }
  }

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
    txn_date,
    txn_time,
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
