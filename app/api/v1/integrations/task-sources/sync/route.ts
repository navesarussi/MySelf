import { NextRequest, NextResponse, after } from "next/server";
import { isApiAuthorized, unauthorized, badRequest, readJson } from "@/lib/api/auth";
import { syncTaskSource } from "@/lib/integrations/task-sources/orchestrator";
import { getIntegrationToken, listIntegrationTokens, tryStartSync, setSyncFailed } from "@/lib/integrations/tokens";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
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
  const syncOpts = {
    accountKey,
    listIds: listIds?.length ? listIds : undefined,
  };

  // Claim the sync lock synchronously: the client starts polling sync_status as
  // soon as it sees `started`, so the token must already read "running" before
  // this response is flushed. after() runs post-response and would race it.
  let claimedKeys: string[] | undefined;

  if (targetProvider === MONDAY_PROVIDER) {
    const accounts = await listIntegrationTokens(MONDAY_PROVIDER);
    const scoped = accountKey
      ? accounts.filter((a) => a.account_key === accountKey)
      : accounts;
    if (!scoped.length) return badRequest("not_connected");

    const claims = await Promise.all(
      scoped.map(async (a) => ((await tryStartSync(MONDAY_PROVIDER, a.account_key)) ? a.account_key : null))
    );
    claimedKeys = claims.filter((k): k is string => k !== null);
    if (!claimedKeys.length) {
      return NextResponse.json({ ok: true, alreadyRunning: true, provider: targetProvider });
    }
  } else {
    const token = await getIntegrationToken(targetProvider, accountKey ?? "");
    if (!token) return badRequest("not_connected");
    if (!(await tryStartSync(targetProvider, accountKey ?? ""))) {
      return NextResponse.json({ ok: true, alreadyRunning: true, provider: targetProvider });
    }
  }

  after(async () => {
    try {
      await syncTaskSource(targetProvider, {
        ...syncOpts,
        accountKeys: claimedKeys,
        preStarted: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync_failed";
      console.error("[task-sources-sync]", message);
      // syncSingleAccount releases the lock itself; this covers a throw before
      // it runs, so a claimed token never stays "running" until the stale timeout.
      const keys = claimedKeys ?? [accountKey ?? ""];
      await Promise.all(keys.map((k) => setSyncFailed(targetProvider, k)));
    }
  });

  return NextResponse.json({ ok: true, started: true, provider: targetProvider });
}
