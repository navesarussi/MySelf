import { getSupabase } from "@/lib/supabase";
import { notifyUser } from "@/lib/push/notify";
import { financeExternalKey, type FinanceSource } from "@/lib/finance/external-key";
import { inferTxnKind, inferredCategory, shouldSkipCategorizationPrompt } from "@/lib/finance/classify";
import { loadCategoryHistory, suggestCategoryFromHistory, type MerchantCategoryRow } from "@/lib/finance/merchant-category";
import { fetchMerchantRulesMap, matchMerchantRule, resolveExpenseType, type MerchantRule } from "@/lib/finance/merchant-rules";
import type { FinanceIngestInput, FinanceTransaction, FinanceTxnKind, FinanceTxnStatus } from "@/lib/finance/types";

export type { FinanceIngestInput, FinanceTransaction, FinanceTxnKind, FinanceTxnStatus };

export function rowToTxn(row: Record<string, unknown>): FinanceTransaction {
  const expType = row.expense_type;
  return {
    id: String(row.id),
    source: row.source as FinanceSource,
    external_key: String(row.external_key),
    txn_date: String(row.txn_date),
    amount: Number(row.amount),
    kind: row.kind as FinanceTxnKind,
    currency: String(row.currency ?? "ILS"),
    description: String(row.description ?? ""),
    merchant: row.merchant != null ? String(row.merchant) : null,
    account_number: row.account_number != null ? String(row.account_number) : null,
    card_name: row.card_name != null ? String(row.card_name) : null,
    status: row.status as FinanceTxnStatus,
    category: row.category != null ? String(row.category) : null,
    purpose_note: row.purpose_note != null ? String(row.purpose_note) : null,
    expense_type: expType === "fixed" || expType === "variable" ? expType : null,
    is_internal: Boolean(row.is_internal),
    needs_categorization: Boolean(row.needs_categorization),
    categorized_at: row.categorized_at != null ? String(row.categorized_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeInput(input: FinanceIngestInput) {
  const amount = Math.abs(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
  const txn_date = input.txn_date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txn_date)) throw new Error("invalid_txn_date");

  const description = (input.description ?? input.merchant ?? "").trim() || "תנועה";
  const merchant = input.merchant?.trim() || null;
  const kind = inferTxnKind({ kind: input.kind, description, merchant });
  const autoCat = inferredCategory({ description, merchant, kind });
  const hasCategory = Boolean(input.category?.trim() || autoCat);
  const skipPrompt = shouldSkipCategorizationPrompt({ description, merchant, kind });
  const needs_categorization = input.needs_categorization ?? !(hasCategory || skipPrompt);
  const external_key =
    input.external_key?.trim() ||
    financeExternalKey({
      source: input.source,
      account_number: input.account_number,
      identifier: input.identifier,
      txn_date,
      amount,
      description,
      merchant,
    });

  return {
    ...input,
    txn_date,
    amount,
    kind,
    description,
    merchant,
    currency: (input.currency ?? "ILS").trim() || "ILS",
    status: input.status ?? "completed",
    needs_categorization: hasCategory ? false : needs_categorization,
    category: hasCategory ? (input.category?.trim() || autoCat) : null,
    purpose_note: input.purpose_note?.trim() || null,
    expense_type: input.expense_type ?? null,
    is_internal: Boolean(input.is_internal),
    external_key,
  };
}

async function notifyCategorize(txn: FinanceTransaction): Promise<void> {
  if (!txn.needs_categorization) return;
  const label = txn.merchant || txn.description;
  const sign = txn.kind === "income" ? "+" : "−";
  const ask = txn.kind === "income" ? "הכנסה חדשה" : "למה ההוצאה?";
  await notifyUser(
    "finance",
    {
      title: "תנועה חדשה",
      body: `${sign}₪${txn.amount.toFixed(2)} · ${label} — ${ask}`,
      data: { screen: `/finance-categorize?id=${txn.id}` },
    },
    txn.id,
    { bypassQuiet: true }
  );
}

function applyRules(
  item: ReturnType<typeof normalizeInput>,
  rulesMap: Map<string, MerchantRule>,
  history: MerchantCategoryRow[]
) {
  const rule = matchMerchantRule(item.merchant, item.description, rulesMap);
  if (rule) {
    const category = item.category || rule.category || null;
    const kind = item.kind;
    const expense_type =
      kind === "expense"
        ? (resolveExpenseType({ category, kind, explicitExpenseType: item.expense_type, rule }) as "fixed" | "variable")
        : null;
    return {
      ...item,
      category,
      expense_type,
      purpose_note: item.purpose_note || rule.default_note || null,
      needs_categorization: Boolean(category) ? false : item.needs_categorization,
    };
  }

  if (item.category || item.kind !== "expense") return item;
  const suggested = suggestCategoryFromHistory(item.merchant, item.description, history);
  if (!suggested) return item;
  const expense_type = resolveExpenseType({ category: suggested, kind: "expense" }) as "fixed" | "variable";
  return { ...item, category: suggested, expense_type, needs_categorization: false };
}

export type IngestResult = { created: FinanceTransaction[]; skipped: number };

export async function ingestFinanceTransactions(inputs: FinanceIngestInput[]): Promise<IngestResult> {
  const created: FinanceTransaction[] = [];
  let skipped = 0;
  const [history, rulesMap] = await Promise.all([loadCategoryHistory(), fetchMerchantRulesMap()]);

  for (const raw of inputs) {
    const input = applyRules(normalizeInput(raw), rulesMap, history);
    const now = new Date().toISOString();
    const row = {
      source: input.source,
      external_key: input.external_key,
      txn_date: input.txn_date,
      amount: input.amount,
      kind: input.kind,
      currency: input.currency,
      description: input.description,
      merchant: input.merchant,
      account_number: input.account_number ?? null,
      card_name: input.card_name ?? null,
      status: input.status,
      category: input.category,
      purpose_note: input.purpose_note,
      expense_type: input.kind === "expense" ? input.expense_type ?? null : null,
      is_internal: input.is_internal,
      needs_categorization: input.needs_categorization,
      categorized_at: input.category ? now : null,
      updated_at: now,
    };

    if (input.category && !input.needs_categorization) {
      history.unshift({
        merchant: input.merchant ?? null,
        description: input.description ?? "",
        category: input.category,
      });
    }

    const { data, error } = await getSupabase().from("finance_transactions").insert(row).select("*").maybeSingle();
    if (error) {
      if (error.code === "23505") {
        skipped += 1;
        continue;
      }
      throw new Error(error.message);
    }
    if (!data) {
      skipped += 1;
      continue;
    }
    const txn = rowToTxn(data as Record<string, unknown>);
    created.push(txn);
    await notifyCategorize(txn);
  }

  return { created, skipped };
}
