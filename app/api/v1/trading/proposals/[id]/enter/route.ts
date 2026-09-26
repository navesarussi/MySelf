import { NextRequest, NextResponse } from "next/server";
import { badRequest, readJson, denyUnlessPrimary } from "@/lib/api/auth";
import { EnterError, enterProposal, type EnterRequest } from "@/lib/trading/trade-finder";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/** "Enter now": open the proposal's trade (optionally with user-edited order type / entry / stop / target) in the paper account. */
export const POST = withRouteHandler(async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await readJson(req)) as Record<string, unknown>;
  const orderType = body.order_type === "MARKET" || body.order_type === "LIMIT" ? body.order_type : undefined;
  if (body.order_type !== undefined && !orderType) return badRequest("invalid_order_type");
  const request: EnterRequest = { option: num(body.option), order_type: orderType, entry: num(body.entry), stop: num(body.stop), target: num(body.target) };
  try {
    return NextResponse.json(await enterProposal(id, request));
  } catch (err) {
    if (err instanceof EnterError) return NextResponse.json({ error: err.code }, { status: 409 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "enter_failed" }, { status: 500 });
  }
});
