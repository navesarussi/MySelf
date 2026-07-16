import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, badRequest, dbError, readJson } from "@/lib/api/auth";
import { GOOGLE_TASKS_PROVIDER } from "@/lib/integrations/google-config";
import {
  getIntegrationToken,
  getTokenSettings,
  updateTokenSettings,
} from "@/lib/integrations/tokens";
import { syncTaskSource } from "@/lib/integrations/task-sources/orchestrator";

type PullCompleted = "none" | "recent" | "all";
const PULL_COMPLETED_VALUES: PullCompleted[] = ["none", "recent", "all"];

type GoogleTasksSettings = {
  selected_list_ids: string[];
  pull_completed?: PullCompleted;
};

function isPullCompleted(value: unknown): value is PullCompleted {
  return typeof value === "string" && PULL_COMPLETED_VALUES.includes(value as PullCompleted);
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const settings = await getTokenSettings<GoogleTasksSettings>(GOOGLE_TASKS_PROVIDER);
    return NextResponse.json({
      selected_list_ids: settings.selected_list_ids ?? [],
      pull_completed: settings.pull_completed ?? "none",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[google-tasks-settings-get]", message);
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

  if (body.pull_completed !== undefined && !isPullCompleted(body.pull_completed)) {
    return badRequest("invalid pull_completed");
  }

  const token = await getIntegrationToken(GOOGLE_TASKS_PROVIDER);
  if (!token) {
    return badRequest("not_connected");
  }

  try {
    const currentSettings = await getTokenSettings<GoogleTasksSettings>(GOOGLE_TASKS_PROVIDER);
    const newSettings: GoogleTasksSettings = {
      selected_list_ids: selectedListIds,
      pull_completed: isPullCompleted(body.pull_completed)
        ? body.pull_completed
        : (currentSettings.pull_completed ?? "none"),
    };

    await updateTokenSettings(GOOGLE_TASKS_PROVIDER, newSettings);

    const syncResult = await syncTaskSource("google_tasks");
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
    console.error("[google-tasks-settings-patch]", message);
    return dbError(message);
  }
}
