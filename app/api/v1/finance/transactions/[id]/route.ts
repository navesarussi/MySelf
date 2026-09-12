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
  suggestCategoryFromHistory,
  type MerchantCategoryRow,
} from "@/lib/finance/merchant-category";
import { getSupabase } from "@/lib/supabase";
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

async function loadCategoryHistory(): Promise<MerchantCategoryRow[]> {
  const { data } = await getSupabase()
    .from("finance_transactions")
    .select("merchant, description, category")
    .eq("needs_categorization", false)
    .not("category", "is", null)
    .order("categorized_at", { ascending: false })
    .limit(500);
  return (data ?? []) as MerchantCategoryRow[];
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
  const history = await loadCategoryHistory();
  const suggested_category = txn.needs_categorization
    ? suggestCategoryFromHistory(txn.merchant, txn.description, history)
    : null;

  return NextResponse.json({ ...txn, suggested_category });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);
  const category = str(body.category);
  const purpose_note = optStr(body.purpose_note);
  const skip = body.skip === true;

  if (!skip && !category) return badRequest("category_required");
  if (category && !isFinanceCategory(category)) return badRequest("invalid_category");

  const now = new Date().toISOString();
  const patch = skip
    ? { needs_categorization: false, updated_at: now }
    : {
        category,
        purpose_note,
        needs_categorization: false,
        categorized_at: now,
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
