import { NextRequest, NextResponse } from "next/server";
import { badRequest, readJson, unauthorized } from "@/lib/api/auth";
import { isFinanceIngestAuthorized } from "@/lib/api/finance-auth";
import { ingestFinanceTransactions, type FinanceIngestInput } from "@/lib/finance/ingest";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function parseTxn(raw: unknown): FinanceIngestInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const source = o.source;
  if (
    source !== "leumi" &&
    source !== "apple_pay" &&
    source !== "manual" &&
    source !== "max" &&
    source !== "visa_cal" &&
    source !== "excel"
  ) {
    return null;
  }
  const txn_date = typeof o.txn_date === "string" ? o.txn_date : "";
  const amount = Number(o.amount);
  if (!txn_date || !Number.isFinite(amount)) return null;
  return {
    source,
    txn_date,
    amount,
    kind: o.kind === "income" ? "income" : o.kind === "expense" ? "expense" : undefined,
    currency: typeof o.currency === "string" ? o.currency : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    merchant: typeof o.merchant === "string" ? o.merchant : undefined,
    account_number: typeof o.account_number === "string" ? o.account_number : undefined,
    card_name: typeof o.card_name === "string" ? o.card_name : undefined,
    status: o.status === "pending" ? "pending" : o.status === "completed" ? "completed" : undefined,
    identifier:
      typeof o.identifier === "string" || typeof o.identifier === "number" ? o.identifier : undefined,
    external_key: typeof o.external_key === "string" ? o.external_key : undefined,
    category: typeof o.category === "string" ? o.category : undefined,
    purpose_note: typeof o.purpose_note === "string" ? o.purpose_note : undefined,
    expense_type:
      o.expense_type === "fixed" || o.expense_type === "variable" || o.expense_type === "savings"
        ? o.expense_type
        : undefined,
    txn_time: typeof o.txn_time === "string" ? o.txn_time : undefined,
    is_internal: typeof o.is_internal === "boolean" ? o.is_internal : undefined,
    needs_categorization:
      typeof o.needs_categorization === "boolean" ? o.needs_categorization : undefined,
  };
}

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isFinanceIngestAuthorized(req))) return unauthorized();
  const body = await readJson(req);

  const list: FinanceIngestInput[] = [];
  if (Array.isArray(body.transactions)) {
    for (const item of body.transactions) {
      const txn = parseTxn(item);
      if (txn) list.push(txn);
    }
  } else {
    const single = parseTxn(body);
    if (single) list.push(single);
  }

  if (list.length === 0) return badRequest("no_transactions");

  try {
    const result = await ingestFinanceTransactions(list);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ingest_failed";
    return badRequest(msg);
  }
});
