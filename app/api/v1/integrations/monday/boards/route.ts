import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";
import { createMondayProvider } from "@/lib/integrations/task-sources/monday/provider";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const accountKey = req.nextUrl.searchParams.get("account_key");
  if (!accountKey) {
    return NextResponse.json({ error: "account_key_required" }, { status: 400 });
  }

  const token = await getIntegrationToken(MONDAY_PROVIDER, accountKey);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const provider = createMondayProvider(accountKey);
    const boards = await provider.listSources();
    return NextResponse.json(boards);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[monday-boards]", message);
    return dbError(message);
  }
}
