import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { deleteIntegrationToken, getIntegrationToken } from "@/lib/integrations/tokens";

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const body = (await req.json()) as { account_key?: string };
  const accountKey = body.account_key;
  if (!accountKey) {
    return NextResponse.json({ error: "account_key_required" }, { status: 400 });
  }

  const token = await getIntegrationToken(MONDAY_PROVIDER, accountKey);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  await deleteIntegrationToken(MONDAY_PROVIDER, accountKey);
  return NextResponse.json({ ok: true });
}
