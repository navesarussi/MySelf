import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { linkTxnToFixed, unlinkTxnFromFixed } from "@/lib/finance/fixed-expense-links";
import { reportError } from "@/lib/error-reporting";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const txn_id = str(body.txn_id);
  const merchant_key = str(body.merchant_key);
  const action = str(body.action);
  if (!txn_id || !merchant_key) return badRequest("missing_fields");

  try {
    if (action === "unlink") {
      await unlinkTxnFromFixed(body.rule_id ? String(body.rule_id) : null, merchant_key, txn_id);
    } else {
      await linkTxnToFixed(merchant_key, txn_id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError({ source: "server", error: err, context: { route: "/finance/fixed-expenses/link", integration: "finance" } });
    return badRequest("link_failed");
  }
});
