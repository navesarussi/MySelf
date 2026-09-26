import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, notFound, readJson, unauthorized } from "@/lib/api/auth";
import { fetchSplitsForTxn, saveTransactionSplits, type SplitPart } from "@/lib/finance/split-txn";
import { reportError } from "@/lib/error-reporting";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(_req))) return unauthorized();
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ splits: await fetchSplitsForTxn(id) });
  } catch (err) {
    reportError({ source: "server", error: err, context: { route: "/finance/transactions/[id]/split GET", integration: "finance" } });
    return badRequest("load_failed");
  }
});

export const POST = withRouteHandler(async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await ctx.params;
  const body = await readJson(req);
  const parts = Array.isArray(body.parts) ? (body.parts as SplitPart[]) : [];
  if (parts.length < 2) return badRequest("split_requires_two_parts");

  try {
    const splits = await saveTransactionSplits(id, parts);
    return NextResponse.json({ splits });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "split_failed";
    reportError({ source: "server", error: err, context: { route: "/finance/transactions/[id]/split POST", integration: "finance" } });
    if (msg === "not_found") return notFound();
    return badRequest(msg);
  }
});
