import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, notFound, unauthorized } from "@/lib/api/auth";
import { restoreTransaction } from "@/lib/finance/split-txn";
import { enrichTransactionWithMerchantDisplay } from "@/lib/finance/txn-display";
import { reportError } from "@/lib/error-reporting";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const POST = withRouteHandler(async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    const txn = await restoreTransaction(id);
    if (!txn) return notFound();
    return NextResponse.json(await enrichTransactionWithMerchantDisplay(txn));
  } catch (err) {
    reportError({ source: "server", error: err, context: { route: "/finance/transactions/[id]/restore", integration: "finance" } });
    return badRequest("restore_failed");
  }
});
