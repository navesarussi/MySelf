import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { bulkEditTransactions } from "@/lib/finance/bulk-edit";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { reportError } from "@/lib/error-reporting";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (ids.length === 0) return badRequest("ids_required");

  const item_type = body.item_type as MoneyItemType | undefined;
  if (item_type && !["fixed", "variable", "income", "internal"].includes(item_type)) {
    return badRequest("invalid_item_type");
  }

  try {
    const result = await bulkEditTransactions({
      ids,
      category: body.category !== undefined ? (body.category === null ? null : String(body.category)) : undefined,
      item_type,
      is_internal: body.is_internal !== undefined ? Boolean(body.is_internal) : undefined,
      delete: body.delete === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    reportError({ source: "server", error: err, context: { route: "/finance/transactions/bulk", integration: "finance" } });
    const msg = err instanceof Error ? err.message : "bulk_failed";
    return badRequest(msg);
  }
});
