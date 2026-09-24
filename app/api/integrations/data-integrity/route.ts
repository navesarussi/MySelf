import { NextRequest, NextResponse } from "next/server";
import { runDataIntegrityMaintenance } from "@/lib/db-maintenance";
import { isCronAuthorized as isCronRequest } from "@/lib/api/cron-auth";
import { forEachAccount } from "@/lib/db/accounts";

/** Cron/manual cleanup for duplicate rows (complements migration 0015 constraints). */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Per account: two accounts can legitimately hold the same goal or habit.
  const accounts = await forEachAccount(() => runDataIntegrityMaintenance());
  for (const run of accounts) {
    if (!run.ok) console.error("[data-integrity]", run.email, run.error);
  }
  const ok = accounts.every((run) => run.ok);
  return NextResponse.json({ ok, accounts }, { status: ok ? 200 : 500 });
}
