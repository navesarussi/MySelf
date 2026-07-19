import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { getIntegrationToken, getTokenSettings, updateTokenSettings } from "@/lib/integrations/tokens";

type MondaySettings = {
  selected_list_ids?: string[];
  account_name?: string;
  account_slug?: string;
  pull_completed?: string;
};

export async function PATCH(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const body = (await req.json()) as {
    account_key?: string;
    selected_list_ids?: string[];
  };

  const accountKey = body.account_key;
  if (!accountKey) {
    return NextResponse.json({ error: "account_key_required" }, { status: 400 });
  }
  if (!Array.isArray(body.selected_list_ids)) {
    return NextResponse.json({ error: "selected_list_ids_required" }, { status: 400 });
  }

  const token = await getIntegrationToken(MONDAY_PROVIDER, accountKey);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  const current = await getTokenSettings<MondaySettings>(MONDAY_PROVIDER, accountKey);
  await updateTokenSettings(
    MONDAY_PROVIDER,
    { ...current, selected_list_ids: body.selected_list_ids },
    accountKey
  );

  return NextResponse.json({ ok: true });
}
