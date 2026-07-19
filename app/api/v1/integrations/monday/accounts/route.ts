import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { listIntegrationTokens } from "@/lib/integrations/tokens";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const rows = await listIntegrationTokens(MONDAY_PROVIDER);
  const accounts = rows.map((row) => {
    const settings = row.settings ?? {};
    return {
      account_key: row.account_key,
      account_name: (settings.account_name as string) ?? row.account_key,
      account_slug: (settings.account_slug as string) ?? null,
      connected: true,
      last_sync_at: row.last_sync_at,
      sync_status: row.sync_status,
      selected_list_ids: (settings.selected_list_ids as string[]) ?? [],
    };
  });

  return NextResponse.json({ accounts });
}
