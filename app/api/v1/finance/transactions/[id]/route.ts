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
import { loadCategoryHistory, suggestCategoryFromHistory } from "@/lib/finance/merchant-category";
import { findMerchantRule, resolveExpenseType } from "@/lib/finance/merchant-rules";
import { rowToTxn } from "@/lib/finance/ingest";
import { enrichTransactionWithMerchantDisplay } from "@/lib/finance/txn-display";
import { softDeleteTransaction } from "@/lib/finance/split-txn";
import { fetchSplitsForTxn } from "@/lib/finance/split-txn";
import { updateFinanceTransaction } from "@/lib/finance/txn-update";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { reportError } from "@/lib/error-reporting";
import { getSupabase } from "@/lib/supabase";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;

  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return dbError();
  if (!data) return notFound();

  const txn = rowToTxn(data as Record<string, unknown>);
  const rule = await findMerchantRule(txn.merchant, txn.description);
  const history = await loadCategoryHistory();
  const splits = await fetchSplitsForTxn(id).catch(() => []);

  const suggested_category =
    txn.category ??
    rule?.category ??
    (txn.needs_categorization ? suggestCategoryFromHistory(txn.merchant, txn.description, history) : null);

  const suggested_expense_type =
    txn.expense_type ??
    rule?.expense_type ??
    (suggested_category && txn.kind === "expense"
      ? resolveExpenseType({ category: suggested_category, kind: "expense", rule })
      : null);

  const enriched = await enrichTransactionWithMerchantDisplay(txn, rule);
  return NextResponse.json({
    ...enriched,
    suggested_category,
    suggested_expense_type,
    default_note: rule?.default_note ?? null,
    splits,
  });
});

export const PATCH = withRouteHandler(async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);

  try {
    const result = await updateFinanceTransaction(id, {
      category: body.category !== undefined ? (body.category === null ? null : str(body.category)) : undefined,
      purpose_note: body.purpose_note !== undefined ? optStr(body.purpose_note) : undefined,
      expense_type:
        body.expense_type === "fixed" || body.expense_type === "variable" || body.expense_type === "savings"
          ? body.expense_type
          : body.expense_type !== undefined
            ? null
            : undefined,
      item_type: body.item_type as MoneyItemType | undefined,
      kind: body.kind === "income" || body.kind === "expense" ? body.kind : undefined,
      remember_rule: body.remember_rule === true,
      apply_to_all: body.apply_to_all === true,
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      merchant: body.merchant !== undefined ? optStr(body.merchant) : undefined,
      description: body.description !== undefined ? optStr(body.description) : undefined,
      txn_date: body.txn_date !== undefined ? str(body.txn_date) : undefined,
      txn_time: body.txn_time !== undefined ? (body.txn_time === null ? null : str(body.txn_time)) : undefined,
      is_internal: body.is_internal !== undefined ? Boolean(body.is_internal) : undefined,
      skip: body.skip === true,
    });
    return NextResponse.json(await enrichTransactionWithMerchantDisplay(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "update_failed";
    reportError({ source: "server", error: err, context: { route: "/finance/transactions/[id] PATCH", integration: "finance" } });
    if (msg === "not_found") return notFound();
    if (msg === "category_required" || msg.startsWith("invalid_")) return badRequest(msg);
    return dbError();
  }
});

export const DELETE = withRouteHandler(async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    const result = await softDeleteTransaction(id);
    if (!result) return notFound();
    return NextResponse.json({ ok: true, id, deleted_at: result.deleted_at });
  } catch (err) {
    reportError({ source: "server", error: err, context: { route: "/finance/transactions/[id] DELETE", integration: "finance" } });
    return dbError();
  }
});
