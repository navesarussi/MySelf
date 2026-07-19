import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, badRequest, dbError, readJson } from "@/lib/api/auth";
import { GITHUB_PROVIDER } from "@/lib/integrations/github-config";
import {
  getIntegrationToken,
  getTokenSettings,
  updateTokenSettings,
} from "@/lib/integrations/tokens";
import { syncTaskSource } from "@/lib/integrations/task-sources/orchestrator";

type GithubSettings = {
  selected_list_ids: string[];
  account_name?: string;
  account_login?: string;
};

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const settings = await getTokenSettings<GithubSettings>(GITHUB_PROVIDER);
    return NextResponse.json({
      selected_list_ids: settings.selected_list_ids ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[github-settings-get]", message);
    return dbError(message);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const body = await readJson(req);
  const selectedListIds = body.selected_list_ids;

  if (!Array.isArray(selectedListIds) || !selectedListIds.every((id) => typeof id === "string")) {
    return badRequest("selected_list_ids must be string[]");
  }

  const token = await getIntegrationToken(GITHUB_PROVIDER);
  if (!token) {
    return badRequest("not_connected");
  }

  try {
    const currentSettings = await getTokenSettings<GithubSettings>(GITHUB_PROVIDER);
    const newSettings: GithubSettings = {
      ...currentSettings,
      selected_list_ids: selectedListIds,
    };

    await updateTokenSettings(GITHUB_PROVIDER, newSettings);

    const syncResult = await syncTaskSource("github");
    if (syncResult.notConnected) {
      return badRequest("not_connected");
    }
    return NextResponse.json({
      success: true,
      settings: newSettings,
      imported: syncResult.imported,
      markedDone: syncResult.markedDone,
      alreadyRunning: syncResult.alreadyRunning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "update_failed";
    console.error("[github-settings-patch]", message);
    return dbError(message);
  }
}
