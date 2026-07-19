import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, badRequest, dbError, readJson } from "@/lib/api/auth";
import { syncTaskSource } from "@/lib/integrations/task-sources/orchestrator";
import type { TaskSourceId } from "@/lib/integrations/task-sources/types";

const VALID_PROVIDERS: TaskSourceId[] = ["google_tasks", "monday", "github"];

function isTaskSourceId(value: unknown): value is TaskSourceId {
  return typeof value === "string" && VALID_PROVIDERS.includes(value as TaskSourceId);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const body = await readJson(req);
  const provider = body.provider;
  const accountKey = typeof body.account_key === "string" ? body.account_key : undefined;
  const listIds = Array.isArray(body.list_ids)
    ? body.list_ids.filter((id: unknown): id is string => typeof id === "string")
    : undefined;

  if (provider !== undefined && !isTaskSourceId(provider)) {
    return badRequest("invalid provider");
  }

  const targetProvider = isTaskSourceId(provider) ? provider : "google_tasks";

  try {
    const result = await syncTaskSource(targetProvider, {
      accountKey,
      listIds: listIds?.length ? listIds : undefined,
    });
    if (result.notConnected) {
      return badRequest("not_connected");
    }
    return NextResponse.json({
      ok: true,
      provider: targetProvider,
      imported: result.imported,
      markedDone: result.markedDone,
      alreadyRunning: result.alreadyRunning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.error("[task-sources-sync]", message);
    return dbError(message);
  }
}
