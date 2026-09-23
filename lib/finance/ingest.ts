import { getSupabase } from "@/lib/supabase";
import { mapWithConcurrency } from "@/lib/concurrency";
import { notifyUser } from "@/lib/push/notify";
import {
  calDuplicateDayAmountKey,
  calDuplicateKeysCompatible,
  isCalOcrGarbageMerchant,
  shouldSkipCalGarbageDuplicate,
  txnRowQualityScore,
} from "@/lib/finance/cal-duplicate";
import { financeExternalKey, type FinanceSource } from "@/lib/finance/external-key";
import { inferTxnKind, inferredCategory, shouldSkipCategorizationPrompt } from "@/lib/finance/classify";
import { loadCategoryHistory, suggestCategoryFromHistory, type MerchantCategoryRow } from "@/lib/finance/merchant-category";
import { fetchMerchantRulesMap, matchMerchantRule, resolveExpenseType, type MerchantRule } from "@/lib/finance/merchant-rules";
import { isBatchSettlementDescription, reconcileMonthTransactions } from "@/lib/finance/reconcile";
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
    expense_type: expType === "fixed" || expType === "variable" || expType === "savings" ? expType : null,
    txn_time: row.txn_time != null ? String(row.txn_time).slice(0, 5) : null,
    installment_index: row.installment_index != null ? Number(row.installment_index) : null,
    installment_total: row.installment_total != null ? Number(row.installment_total) : null,
    installment_label: row.installment_label != null ? String(row.installment_label) : null,
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
  const rawTime = input.txn_time?.trim();
  const txn_time = rawTime && /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : null;

  const description = (input.description ?? input.merchant ?? "").trim() || "תנועה";
  const merchant = input.merchant?.trim() || null;
  const kind = inferTxnKind({ kind: input.kind, description, merchant });
  const isBatch = input.source === "leumi" && isBatchSettlementDescription(description, merchant);
  const autoCat = isBatch ? null : inferredCategory({ description, merchant, kind });
  const hasCategory = Boolean(input.category?.trim() || autoCat);
  const skipPrompt = isBatch || shouldSkipCategorizationPrompt({ description, merchant, kind });
  const needs_categorization = isBatch ? false : (input.needs_categorization ?? !(hasCategory || skipPrompt));
  const card_name = input.card_name?.trim() || null;
  const account_number = input.account_number?.trim() || null;
  const external_key =
    input.external_key?.trim() ||
    financeExternalKey({ source: input.source, account_number, card_name, identifier: input.identifier, txn_date, amount, description, merchant });

  return {
    ...input,
    txn_date,
    amount,
    kind,
    description,
    merchant,
    account_number,
    card_name,
    currency: (input.currency ?? "ILS").trim() || "ILS",
    status: input.status ?? "completed",
    needs_categorization: hasCategory ? false : needs_categorization,
    category: hasCategory ? (input.category?.trim() || autoCat) : null,
    purpose_note: input.purpose_note?.trim() || null,
    expense_type: input.expense_type ?? null,
    txn_time,
    is_internal: Boolean(input.is_internal || isBatch),
    external_key,
  };
}

async function notifyCategorize(
  txn: FinanceTransaction,
  opts?: { hasMerchantRule?: boolean }
): Promise<void> {
  if (!txn.needs_categorization || txn.is_internal) return;
  const label = txn.merchant || txn.description;
  const sign = txn.kind === "income" ? "+" : "−";
  const identityHint = opts?.hasMerchantRule ? "לסיווג" : "סוחר חדש · לסיווג";
  const ask = txn.kind === "income" ? "מה ההכנסה?" : "בחר קטגוריה";
  await notifyUser(
    "finance",
    {
      title: `תנועה ${identityHint}`,
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
  if (item.is_internal) return item;
  const rule = matchMerchantRule(item.merchant, item.description, rulesMap);
  if (rule) {
    const category = item.category || rule.category || null;
    const kind = item.kind;
    const expense_type =
      kind === "expense"
        ? (resolveExpenseType({ category, kind, explicitExpenseType: item.expense_type, rule }) as
            | "fixed"
            | "variable"
            | "savings")
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
  const expense_type = resolveExpenseType({ category: suggested, kind: "expense" }) as
    | "fixed"
    | "variable"
    | "savings";
  return { ...item, category: suggested, expense_type, needs_categorization: false };
}

export type IngestResult = { created: FinanceTransaction[]; skipped: number };

/** Rows per upsert statement. Keeps a large first-time bank import well inside
 *  the serverless request budget without building one giant statement. */
const INSERT_CHUNK = 200;

/** Concurrent push sends. Each notification is deduped by its own txn id, so
 *  these are independent — the cap only protects Expo and the DB from a burst. */
const NOTIFY_CONCURRENCY = 5;

/**
 * Ingest a batch of scraped/shortcut transactions.
 *
 * Categorisation stays sequential: a row categorised here is unshifted onto the
 * history so later rows in the same batch can learn from it. That pass is pure
 * in-memory, so only the writes are batched — previously this issued one INSERT
 * and one awaited push per transaction, which meant a few hundred serial round
 * trips for a single bank sync and a request that timed out before finishing.
 */
export type PreparedRow = {
  row: Record<string, unknown>;
  externalKey: string;
  hadRule: boolean;
};

export type PreparedBatch = {
  prepared: PreparedRow[];
  /** Inputs dropped because an earlier row in the same batch had the same key. */
  duplicatesInBatch: number;
};

/**
 * Pure planning pass: normalise, categorise, and collapse within-batch
 * duplicates. Sequential by design — a row categorised here is unshifted onto
 * `history` (mutated in place) so later rows in the same batch can learn from
 * it. Split out from the writes so it can be tested without a database.
 */
export function prepareIngestRows(
  inputs: FinanceIngestInput[],
  rulesMap: Map<string, MerchantRule>,
  history: MerchantCategoryRow[],
  existingCleanKeys: Set<string> = new Set()
): PreparedBatch {
  const prepared: PreparedRow[] = [];
  const seenKeys = new Set<string>();
  const batchCleanKeys = new Set<string>();
  let duplicatesInBatch = 0;

  for (const raw of inputs) {
    const input = applyRules(normalizeInput(raw), rulesMap, history);

    if (
      shouldSkipCalGarbageDuplicate({
        merchant: input.merchant,
        description: input.description,
        txn_date: input.txn_date,
        amount: input.amount,
        source: input.source,
        existingCleanKeys,
        batchCleanKeys,
      })
    ) {
      duplicatesInBatch += 1;
      continue;
    }

    const dayAmountKey = calDuplicateDayAmountKey(input);
    const isGarbage = isCalOcrGarbageMerchant(input.merchant ?? input.description ?? "");
    if (!isGarbage && input.source === "visa_cal") {
      batchCleanKeys.add(dayAmountKey);
    }
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
      txn_time: input.txn_time,
      installment_index: input.installment_index ?? null,
      installment_total: input.installment_total ?? null,
      installment_label: input.installment_label ?? null,
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

    // A repeat of a key already in this batch would be rejected by the same
    // unique constraint one statement later; count it as skipped up front.
    if (seenKeys.has(input.external_key)) {
      duplicatesInBatch += 1;
      continue;
    }
    seenKeys.add(input.external_key);
    prepared.push({
      row,
      externalKey: input.external_key,
      hadRule: Boolean(matchMerchantRule(input.merchant, input.description, rulesMap)?.category),
    });
  }

  return { prepared: collapseCalBatchDuplicates(prepared), duplicatesInBatch };
}

function preparedRowQuality(row: Record<string, unknown>): number {
  return txnRowQualityScore({
    merchant: row.merchant != null ? String(row.merchant) : null,
    description: String(row.description ?? ""),
  });
}

/** Keep the cleanest Cal row per day+amount+merchant core within one ingest batch. */
function collapseCalBatchDuplicates(prepared: PreparedRow[]): PreparedRow[] {
  const passthrough: PreparedRow[] = [];
  const calByDayAmount: PreparedRow[] = [];

  for (const item of prepared) {
    if (item.row.source !== "visa_cal") {
      passthrough.push(item);
      continue;
    }
    calByDayAmount.push(item);
  }

  const kept: PreparedRow[] = [];
  for (const item of calByDayAmount) {
    const key = calDuplicateDayAmountKey({
      txn_date: String(item.row.txn_date),
      amount: Number(item.row.amount),
      source: String(item.row.source),
      merchant: item.row.merchant != null ? String(item.row.merchant) : null,
      description: String(item.row.description ?? ""),
    });
    const existingIdx = kept.findIndex((k) =>
      calDuplicateDayAmountKey({
        txn_date: String(k.row.txn_date),
        amount: Number(k.row.amount),
        source: String(k.row.source),
        merchant: k.row.merchant != null ? String(k.row.merchant) : null,
        description: String(k.row.description ?? ""),
      }).startsWith(key.split("|").slice(0, 3).join("|"))
        ? calDuplicateKeysCompatible(
            calDuplicateDayAmountKey({
              txn_date: String(k.row.txn_date),
              amount: Number(k.row.amount),
              source: String(k.row.source),
              merchant: k.row.merchant != null ? String(k.row.merchant) : null,
              description: String(k.row.description ?? ""),
            }),
            key
          )
        : false
    );
    if (existingIdx < 0) {
      kept.push(item);
      continue;
    }
    if (preparedRowQuality(item.row) > preparedRowQuality(kept[existingIdx].row)) {
      kept[existingIdx] = item;
    }
  }

  return [...passthrough, ...kept];
}

async function loadExistingCalCleanKeys(inputs: FinanceIngestInput[]): Promise<Set<string>> {
  const calDates = [
    ...new Set(
      inputs
        .filter((i) => i.source === "visa_cal")
        .map((i) => i.txn_date?.trim())
        .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    ),
  ];
  if (!calDates.length) return new Set();

  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("txn_date, amount, source, merchant, description")
    .eq("source", "visa_cal")
    .in("txn_date", calDates);
  if (error) throw new Error(error.message);

  const keys = new Set<string>();
  for (const row of data ?? []) {
    const merchant = row.merchant != null ? String(row.merchant) : null;
    const description = String(row.description ?? "");
    if (isCalOcrGarbageMerchant(merchant ?? description)) continue;
    keys.add(
      calDuplicateDayAmountKey({
        txn_date: String(row.txn_date),
        amount: Number(row.amount),
        source: String(row.source),
        merchant,
        description,
      })
    );
  }
  return keys;
}

export async function ingestFinanceTransactions(inputs: FinanceIngestInput[]): Promise<IngestResult> {
  const [history, rulesMap, existingCleanKeys] = await Promise.all([
    loadCategoryHistory(),
    fetchMerchantRulesMap(),
    loadExistingCalCleanKeys(inputs),
  ]);
  const { prepared, duplicatesInBatch } = prepareIngestRows(inputs, rulesMap, history, existingCleanKeys);

  let skipped = duplicatesInBatch;
  const created: FinanceTransaction[] = [];
  for (let i = 0; i < prepared.length; i += INSERT_CHUNK) {
    const chunk = prepared.slice(i, i + INSERT_CHUNK);
    // ignoreDuplicates makes the unique violation a no-op instead of an error,
    // and select() returns only the rows that were actually inserted.
    const { data, error } = await getSupabase()
      .from("finance_transactions")
      .upsert(
        chunk.map((p) => p.row),
        { onConflict: "external_key", ignoreDuplicates: true }
      )
      .select("*");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) created.push(rowToTxn(r));
    skipped += chunk.length - rows.length;
  }

  const ruleByKey = new Map(prepared.map((p) => [p.externalKey, p.hadRule]));
  await mapWithConcurrency(created, NOTIFY_CONCURRENCY, async (txn) => {
    await notifyCategorize(txn, { hasMerchantRule: ruleByKey.get(txn.external_key) ?? false }).catch(
      () => undefined
    );
  });

  if (created.length > 0) {
    const months = Array.from(new Set(created.map((t) => t.txn_date.slice(0, 7))));
    await Promise.all(months.map((m) => reconcileMonthTransactions(m).catch(() => null)));
  }

  return { created, skipped };
}
